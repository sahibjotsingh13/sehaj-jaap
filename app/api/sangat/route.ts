import { getDb } from '@/db';

export const dynamic = 'force-dynamic';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const NAME_LIMIT = 48;
const GROUP_NAME_LIMIT = 64;

type Privacy = 'exact' | 'practiced' | 'private';

type ContributionInput = {
  id?: unknown;
  amount?: unknown;
  practiceDate?: unknown;
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

function cleanCode(value: unknown) {
  return typeof value === 'string'
    ? value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 12)
    : '';
}

function cleanPrivacy(value: unknown): Privacy {
  return value === 'practiced' || value === 'private' ? value : 'exact';
}

function inviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join('');
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed)) return false;
  const distance = Math.abs(Date.now() - parsed);
  return distance < 1000 * 60 * 60 * 24 * 3;
}

async function readGroup(code: string, practiceDate: string) {
  const db = getDb();
  const group = await db
    .prepare(
      `SELECT id, name, daily_goal AS dailyGoal, created_at AS createdAt
       FROM sangat_groups
       WHERE invite_code = ?`,
    )
    .bind(code)
    .first<{ id: string; name: string; dailyGoal: number; createdAt: number }>();

  if (!group) return null;

  const summary = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN memberTotal > 0 THEN memberTotal ELSE 0 END), 0) AS total,
         COALESCE(SUM(CASE WHEN memberTotal > 0 THEN 1 ELSE 0 END), 0) AS activeMembers
       FROM (
         SELECT member_id, SUM(amount) AS memberTotal
         FROM sangat_contributions
         WHERE group_id = ? AND practice_date = ?
         GROUP BY member_id
       )`,
    )
    .bind(group.id, practiceDate)
    .first<{ total: number; activeMembers: number }>();

  const members = await db
    .prepare(
      `SELECT m.id, m.name, m.privacy,
              MAX(0, COALESCE(SUM(c.amount), 0)) AS count
       FROM sangat_members AS m
       LEFT JOIN sangat_contributions AS c
         ON c.member_id = m.id AND c.practice_date = ?
       WHERE m.group_id = ?
       GROUP BY m.id, m.name, m.privacy, m.joined_at
       ORDER BY count DESC, m.joined_at ASC
       LIMIT 100`,
    )
    .bind(practiceDate, group.id)
    .all<{ id: string; name: string; privacy: Privacy; count: number }>();

  return {
    code,
    name: group.name,
    dailyGoal: Number(group.dailyGoal),
    total: Number(summary?.total || 0),
    activeMembers: Number(summary?.activeMembers || 0),
    memberCount: members.results.length,
    members: members.results
      .filter((member) => member.privacy !== 'private')
      .map((member) => ({
        id: member.id,
        name: member.name,
        privacy: member.privacy,
        count: member.privacy === 'exact' ? Number(member.count) : undefined,
        practiced: Number(member.count) > 0,
      })),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = cleanCode(url.searchParams.get('code'));
  const practiceDate = url.searchParams.get('date');

  if (code.length !== 12 || !validDate(practiceDate)) {
    return json({ error: 'A valid Sangat code and date are required.' }, 400);
  }

  const group = await readGroup(code, practiceDate);
  return group ? json({ group }) : json({ error: 'This invite link is not active.' }, 404);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Please send a valid request.' }, 400);
  }

  const db = getDb();
  const action = body.action;

  if (action === 'create') {
    const groupName = cleanText(body.groupName, GROUP_NAME_LIMIT);
    const memberName = cleanText(body.memberName, NAME_LIMIT);
    const privacy = cleanPrivacy(body.privacy);
    const requestedGoal = Number(body.dailyGoal);
    const dailyGoal = Number.isInteger(requestedGoal)
      ? Math.min(10_000_000, Math.max(108, requestedGoal))
      : 50_000;

    if (groupName.length < 2 || memberName.length < 2) {
      return json({ error: 'Please enter a Sangat name and your name.' }, 400);
    }

    const groupId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const memberToken = crypto.randomUUID();
    const tokenHash = await hashToken(memberToken);
    const now = Date.now();
    let code = '';

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const candidate = inviteCode();
      const exists = await db
        .prepare('SELECT 1 FROM sangat_groups WHERE invite_code = ?')
        .bind(candidate)
        .first();
      if (!exists) {
        code = candidate;
        break;
      }
    }

    if (!code) return json({ error: 'Could not create an invite. Please try again.' }, 503);

    await db.batch([
      db
        .prepare(
          `INSERT INTO sangat_groups (id, invite_code, name, daily_goal, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(groupId, code, groupName, dailyGoal, now),
      db
        .prepare(
          `INSERT INTO sangat_members (id, group_id, name, token_hash, privacy, joined_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(memberId, groupId, memberName, tokenHash, privacy, now),
    ]);

    return json({
      membership: { code, memberId, memberToken, groupName, memberName, privacy },
    });
  }

  if (action === 'join') {
    const code = cleanCode(body.code);
    const memberName = cleanText(body.memberName, NAME_LIMIT);
    const privacy = cleanPrivacy(body.privacy);

    if (code.length !== 12 || memberName.length < 2) {
      return json({ error: 'Please enter a valid invite code and your name.' }, 400);
    }

    const group = await db
      .prepare('SELECT id, name FROM sangat_groups WHERE invite_code = ?')
      .bind(code)
      .first<{ id: string; name: string }>();
    if (!group) return json({ error: 'This invite link is not active.' }, 404);

    const memberId = crypto.randomUUID();
    const memberToken = crypto.randomUUID();
    const tokenHash = await hashToken(memberToken);
    await db
      .prepare(
        `INSERT INTO sangat_members (id, group_id, name, token_hash, privacy, joined_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(memberId, group.id, memberName, tokenHash, privacy, Date.now())
      .run();

    return json({
      membership: {
        code,
        memberId,
        memberToken,
        groupName: group.name,
        memberName,
        privacy,
      },
    });
  }

  if (action === 'contribute') {
    const code = cleanCode(body.code);
    const memberId = cleanText(body.memberId, 64);
    const memberToken = cleanText(body.memberToken, 80);
    const rawEvents = Array.isArray(body.events) ? (body.events as ContributionInput[]) : [];

    if (code.length !== 12 || !memberId || !memberToken || rawEvents.length === 0 || rawEvents.length > 100) {
      return json({ error: 'This contribution batch is not valid.' }, 400);
    }

    const tokenHash = await hashToken(memberToken);
    const member = await db
      .prepare(
        `SELECT m.id, m.group_id AS groupId
         FROM sangat_members AS m
         JOIN sangat_groups AS g ON g.id = m.group_id
         WHERE m.id = ? AND m.token_hash = ? AND g.invite_code = ?`,
      )
      .bind(memberId, tokenHash, code)
      .first<{ id: string; groupId: string }>();
    if (!member) return json({ error: 'Please rejoin this Sangat to continue.' }, 401);

    const events = rawEvents.flatMap((event) => {
      const id = cleanText(event.id, 80);
      const amount = Number(event.amount);
      const practiceDate = event.practiceDate;
      if (
        !id ||
        !Number.isInteger(amount) ||
        amount === 0 ||
        Math.abs(amount) > 10_000 ||
        !validDate(practiceDate)
      )
        return [];
      return [{ id, amount, practiceDate }];
    });

    if (events.length !== rawEvents.length) {
      return json({ error: 'One or more contribution entries are not valid.' }, 400);
    }

    const now = Date.now();
    const statements = events.map((event) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO sangat_contributions
             (id, group_id, member_id, amount, practice_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(event.id, member.groupId, member.id, event.amount, event.practiceDate, now),
    );
    await db.batch(statements);

    const group = await readGroup(code, events.at(-1)?.practiceDate || '');
    return json({ acceptedIds: events.map((event) => event.id), group });
  }

  return json({ error: 'Unknown Sangat action.' }, 400);
}
