import { getDb } from '#db';

export const dynamic = 'force-dynamic';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const NAME_LIMIT = 48;
const GROUP_NAME_LIMIT = 64;
const USERNAME_LIMIT = 24;
const SESSION_COOKIE = 'sehaj_session';
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 600_000;

type Privacy = 'exact' | 'practiced' | 'private';

type ContributionInput = {
  id?: unknown;
  amount?: unknown;
  practiceDate?: unknown;
};

type Account = {
  id: string;
  username: string;
  displayName: string;
};

let authSchemaReady: Promise<void> | null = null;

async function ensureAuthSchema() {
  if (!authSchemaReady) {
    authSchemaReady = (async () => {
      const db = getDb();

      await db.batch([
        db.prepare(
          `CREATE TABLE IF NOT EXISTS accounts (
             id text PRIMARY KEY NOT NULL,
             username text NOT NULL,
             display_name text NOT NULL,
             password_hash text NOT NULL,
             password_salt text NOT NULL,
             password_iterations integer DEFAULT 600000 NOT NULL,
             failed_login_attempts integer DEFAULT 0 NOT NULL,
             locked_until integer DEFAULT 0 NOT NULL,
             created_at integer NOT NULL
           )`,
        ),
        db.prepare(
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_username ON accounts (username)',
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS auth_sessions (
             id text PRIMARY KEY NOT NULL,
             account_id text NOT NULL,
             token_hash text NOT NULL,
             expires_at integer NOT NULL,
             created_at integer NOT NULL,
             FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
           )`,
        ),
        db.prepare(
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions (token_hash)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_auth_sessions_account_id ON auth_sessions (account_id)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions (expires_at)',
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS sangat_removed_members (
             group_id text NOT NULL,
             account_id text NOT NULL,
             removed_at integer NOT NULL,
             PRIMARY KEY (group_id, account_id),
             FOREIGN KEY (group_id) REFERENCES sangat_groups(id) ON DELETE CASCADE,
             FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
           )`,
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_sangat_removed_members_account ON sangat_removed_members (account_id)',
        ),
      ]);

      const accountColumns = await db
        .prepare('PRAGMA table_info(accounts)')
        .all<{ name: string }>();
      const accountColumnNames = new Set(
        accountColumns.results.map((column) => column.name),
      );
      const accountMigrations = [];
      if (!accountColumnNames.has('failed_login_attempts')) {
        accountMigrations.push(
          db.prepare(
            'ALTER TABLE accounts ADD failed_login_attempts integer DEFAULT 0 NOT NULL',
          ),
        );
      }
      if (!accountColumnNames.has('locked_until')) {
        accountMigrations.push(
          db.prepare(
            'ALTER TABLE accounts ADD locked_until integer DEFAULT 0 NOT NULL',
          ),
        );
      }
      if (accountMigrations.length > 0) {
        await db.batch(accountMigrations);
      }

      const memberColumns = await db
        .prepare('PRAGMA table_info(sangat_members)')
        .all<{ name: string }>();
      if (memberColumns.results.length > 0) {
        const memberColumnNames = new Set(
          memberColumns.results.map((column) => column.name),
        );
        if (!memberColumnNames.has('account_id')) {
          await db
            .prepare(
              'ALTER TABLE sangat_members ADD account_id text REFERENCES accounts(id)',
            )
            .run();
        }
        await db
          .prepare(
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_sangat_members_group_account ON sangat_members (group_id, account_id)',
          )
          .run();
      }
    })().catch((error) => {
      authSchemaReady = null;
      throw error;
    });
  }

  return authSchemaReady;
}

function json(data: unknown, status = 200, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Type', 'application/json');
  return Response.json(data, {
    status,
    headers,
  });
}

function sanitizeLegacyGuests(payload: unknown) {
  if (!payload || typeof payload !== 'object') return payload;

  const root = payload as {
    group?: {
      members?: Array<{
        name?: unknown;
        count?: unknown;
        practiced?: unknown;
      }>;
      memberCount?: unknown;
      activeMembers?: unknown;
      total?: unknown;
    };
  };

  const group = root.group;
  if (!group || !Array.isArray(group.members)) return payload;

  const guestPattern = /^guest(?:[\s#_-]*\d*)?$/i;
  const guests = group.members.filter(
    (member) =>
      typeof member?.name === 'string' &&
      guestPattern.test(member.name.trim()),
  );
  if (!guests.length) return payload;

  const members = group.members.filter(
    (member) =>
      !(
        typeof member?.name === 'string' &&
        guestPattern.test(member.name.trim())
      ),
  );

  const guestActive = guests.filter((member) => Boolean(member.practiced)).length;
  const knownGuestTotal = guests.reduce((sum, member) => {
    const value =
      typeof member.count === 'number'
        ? member.count
        : Number(member.count);
    return Number.isFinite(value) && value > 0 ? sum + value : sum;
  }, 0);

  group.members = members;
  group.memberCount = members.length;

  if (typeof group.activeMembers === 'number') {
    group.activeMembers = Math.max(0, group.activeMembers - guestActive);
  }

  if (typeof group.total === 'number' && knownGuestTotal > 0) {
    group.total = Math.max(0, group.total - knownGuestTotal);
  }

  return payload;
}

async function proxySangat(request: Request) {
  const upstreamOrigin = process.env.SANGAT_UPSTREAM_ORIGIN?.trim();
  const upstreamToken = process.env.SANGAT_UPSTREAM_TOKEN?.trim();

  if (!upstreamOrigin || !upstreamToken) {
    return process.env.VERCEL
      ? json(
          {
            error:
              'Online Sangat is being connected. Personal Jaap counting still works on this device.',
          },
          503,
        )
      : null;
  }

  let target: URL;
  try {
    const incoming = new URL(request.url);
    const origin = new URL(upstreamOrigin);
    if (origin.protocol !== 'https:' || origin.origin === incoming.origin) {
      throw new Error('Invalid Sangat upstream');
    }
    target = new URL('/api/sangat', origin);
    target.search = incoming.search;
  } catch {
    return json({ error: 'Online Sangat is temporarily unavailable.' }, 503);
  }

  const headers = new Headers({
    Accept: 'application/json',
    'OAI-Sites-Authorization': `Bearer ${upstreamToken}`,
  });
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  const session = cookieValue(request, SESSION_COOKIE);
  if (session) {
    headers.set('Cookie', `${SESSION_COOKIE}=${encodeURIComponent(session)}`);
  }

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? await request.text() : undefined,
      cache: 'no-store',
      redirect: 'manual',
    });

    const responseHeaders = new Headers({
      'Cache-Control': 'no-store',
      'Content-Type': response.headers.get('content-type') || 'application/json',
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) responseHeaders.set('Set-Cookie', setCookie);

    const responseText = await response.text();
    const responseType = response.headers.get('content-type') || '';
    if (responseType.includes('application/json')) {
      try {
        const parsed = JSON.parse(responseText);
        const sanitized = sanitizeLegacyGuests(parsed);
        return new Response(JSON.stringify(sanitized), {
          status: response.status,
          headers: responseHeaders,
        });
      } catch {
        // Preserve the upstream response if it was not valid JSON.
      }
    }

    return new Response(responseText, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch {
    return json({ error: 'Online Sangat could not be reached. Please try again.' }, 503);
  }
}

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

function cleanUsername(value: unknown) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, USERNAME_LIMIT)
    : '';
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

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: string) {
  const bytes = new Uint8Array(Math.floor(value.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function passwordHash(
  password: string,
  saltHex: string,
  iterations = PASSWORD_ITERATIONS,
) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: hexToBytes(saltHex),
      iterations,
    },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (first: BufferSource, second: BufferSource) => boolean;
  };
  if (subtle.timingSafeEqual) {
    return subtle.timingSafeEqual(hexToBytes(left), hexToBytes(right));
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function randomSecret(bytes = 32) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get('cookie') || '';
  for (const part of cookies.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return '';
}

function sessionCookie(request: Request, token: string, maxAge = SESSION_LIFETIME_SECONDS) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function validPostOrigin(request: Request) {
  if (request.headers.has('oai-sites-authorization')) return true;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function authenticatedAccount(request: Request): Promise<Account | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  await ensureAuthSchema();
  const tokenHash = await hashToken(token);
  const account = await getDb()
    .prepare(
      `SELECT a.id, a.username, a.display_name AS displayName
       FROM auth_sessions AS s
       JOIN accounts AS a ON a.id = s.account_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(tokenHash, Date.now())
    .first<Account>();
  return account || null;
}

async function membershipForAccount(accountId: string) {
  return getDb()
    .prepare(
      `SELECT g.invite_code AS code, m.id AS memberId, g.name AS groupName,
              m.name AS memberName, m.privacy
       FROM sangat_members AS m
       JOIN sangat_groups AS g ON g.id = m.group_id
       WHERE m.account_id = ?
       ORDER BY m.joined_at DESC
       LIMIT 1`,
    )
    .bind(accountId)
    .first<{
      code: string;
      memberId: string;
      groupName: string;
      memberName: string;
      privacy: Privacy;
    }>();
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed)) return false;
  const distance = Math.abs(Date.now() - parsed);
  return distance < 1000 * 60 * 60 * 24 * 3;
}

async function readGroup(code: string, practiceDate: string, viewerAccountId: string) {
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

  const organizer = await db
    .prepare(
      `SELECT account_id AS accountId
       FROM sangat_members
       WHERE group_id = ? AND account_id IS NOT NULL
       ORDER BY joined_at ASC
       LIMIT 1`,
    )
    .bind(group.id)
    .first<{ accountId: string }>();
  const organizerAccountId = organizer?.accountId || '';
  const canManage = organizerAccountId === viewerAccountId;

  // Legacy versions of Sehaj Jaap allowed anonymous/guest Sangat members.
  // The current product is account-based, so when the organizer opens a
  // Sangat we permanently remove those legacy guest rows while preserving
  // every registered account member.
  if (canManage) {
    await db.batch([
      db
        .prepare(
          `DELETE FROM sangat_contributions
           WHERE group_id = ?
             AND member_id IN (
               SELECT id
               FROM sangat_members
               WHERE group_id = ? AND account_id IS NULL
             )`,
        )
        .bind(group.id, group.id),
      db
        .prepare(
          'DELETE FROM sangat_members WHERE group_id = ? AND account_id IS NULL',
        )
        .bind(group.id),
    ]);
  }

  const summary = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN memberTotal > 0 THEN memberTotal ELSE 0 END), 0) AS total,
         COALESCE(SUM(CASE WHEN memberTotal > 0 THEN 1 ELSE 0 END), 0) AS activeMembers
       FROM (
         SELECT c.member_id, SUM(c.amount) AS memberTotal
         FROM sangat_contributions AS c
         JOIN sangat_members AS m ON m.id = c.member_id
         WHERE c.group_id = ? AND c.practice_date = ? AND m.account_id IS NOT NULL
         GROUP BY c.member_id
       )`,
    )
    .bind(group.id, practiceDate)
    .first<{ total: number; activeMembers: number }>();

  const members = await db
    .prepare(
      `SELECT m.id, m.name, m.privacy, m.account_id AS accountId,
              MAX(0, COALESCE(SUM(c.amount), 0)) AS count
       FROM sangat_members AS m
       LEFT JOIN sangat_contributions AS c
         ON c.member_id = m.id AND c.practice_date = ?
       WHERE m.group_id = ? AND m.account_id IS NOT NULL
       GROUP BY m.id, m.name, m.privacy, m.account_id, m.joined_at
       ORDER BY count DESC, m.joined_at ASC
       LIMIT 100`,
    )
    .bind(practiceDate, group.id)
    .all<{
      id: string;
      name: string;
      privacy: Privacy;
      accountId: string;
      count: number;
    }>();

  return {
    code,
    name: group.name,
    dailyGoal: Number(group.dailyGoal),
    total: Number(summary?.total || 0),
    activeMembers: Number(summary?.activeMembers || 0),
    memberCount: members.results.length,
    canManage,
    members: members.results
      .filter((member) => canManage || member.privacy !== 'private')
      .map((member) => ({
        id: member.id,
        name: member.name,
        privacy: member.privacy,
        count: member.privacy === 'exact' ? Number(member.count) : undefined,
        practiced: Number(member.count) > 0,
        isYou: member.accountId === viewerAccountId,
        isOrganizer: member.accountId === organizerAccountId,
        canRemove:
          canManage &&
          member.accountId !== viewerAccountId &&
          member.accountId !== organizerAccountId,
      })),
  };
}

export async function GET(request: Request) {
  const proxied = await proxySangat(request);
  if (proxied) return proxied;

  const url = new URL(request.url);
  if (url.searchParams.get('account') === '1') {
    const account = await authenticatedAccount(request);
    if (!account) return json({ error: 'Please sign in to continue.' }, 401);
    const membership = await membershipForAccount(account.id);
    return json({ account, membership: membership || null });
  }

  const account = await authenticatedAccount(request);
  if (!account) return json({ error: 'Please sign in to open this Sangat.' }, 401);

  const code = cleanCode(url.searchParams.get('code'));
  const practiceDate = url.searchParams.get('date');

  if (code.length !== 12 || !validDate(practiceDate)) {
    return json({ error: 'A valid Sangat code and date are required.' }, 400);
  }

  const membership = await getDb()
    .prepare(
      `SELECT 1
       FROM sangat_members AS m
       JOIN sangat_groups AS g ON g.id = m.group_id
       WHERE m.account_id = ? AND g.invite_code = ?`,
    )
    .bind(account.id, code)
    .first();
  if (!membership) {
    const preview = await getDb()
      .prepare(
        `SELECT id, name, daily_goal AS dailyGoal
         FROM sangat_groups
         WHERE invite_code = ?`,
      )
      .bind(code)
      .first<{ id: string; name: string; dailyGoal: number }>();
    if (!preview) return json({ error: 'This invite link is not active.' }, 404);

    const removed = await getDb()
      .prepare(
        'SELECT 1 FROM sangat_removed_members WHERE group_id = ? AND account_id = ?',
      )
      .bind(preview.id, account.id)
      .first();
    if (removed) {
      return json(
        { error: 'You are no longer a member of this Sangat.', removed: true },
        403,
      );
    }

    return json({
      group: {
        code,
        name: preview.name,
        dailyGoal: Number(preview.dailyGoal),
        total: 0,
        activeMembers: 0,
        memberCount: 0,
        canManage: false,
        members: [],
      },
    });
  }

  const group = await readGroup(code, practiceDate, account.id);
  return group ? json({ group }) : json({ error: 'This invite link is not active.' }, 404);
}

export async function POST(request: Request) {
  if (!validPostOrigin(request)) {
    return json({ error: 'This request could not be verified.' }, 403);
  }
  const proxied = await proxySangat(request);
  if (proxied) return proxied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Please send a valid request.' }, 400);
  }

  const db = getDb();
  const action = body.action;

  await ensureAuthSchema();

  if (action === 'register') {
    const username = cleanUsername(body.username);
    const displayName = cleanText(body.displayName, NAME_LIMIT);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return json(
        { error: 'Username must be 3–24 letters, numbers, or underscores.' },
        400,
      );
    }
    if (displayName.length < 2) {
      return json({ error: 'Please enter your name.' }, 400);
    }
    if (password.length < 8 || password.length > 128) {
      return json({ error: 'Password must be 8–128 characters.' }, 400);
    }

    const existing = await db
      .prepare('SELECT 1 FROM accounts WHERE username = ?')
      .bind(username)
      .first();
    if (existing) return json({ error: 'That username is already taken.' }, 409);

    const accountId = crypto.randomUUID();
    const salt = randomSecret(16);
    const digest = await passwordHash(password, salt);
    const token = randomSecret();
    const tokenHash = await hashToken(token);
    const now = Date.now();
    const expiresAt = now + SESSION_LIFETIME_SECONDS * 1000;

    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO accounts
               (id, username, display_name, password_hash, password_salt,
                password_iterations, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            accountId,
            username,
            displayName,
            digest,
            salt,
            PASSWORD_ITERATIONS,
            now,
          ),
        db
          .prepare(
            `INSERT INTO auth_sessions
               (id, account_id, token_hash, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(crypto.randomUUID(), accountId, tokenHash, expiresAt, now),
      ]);
    } catch {
      return json({ error: 'That username is already taken.' }, 409);
    }

    return json(
      { account: { id: accountId, username, displayName }, membership: null },
      201,
      { 'Set-Cookie': sessionCookie(request, token) },
    );
  }

  if (action === 'login') {
    const username = cleanUsername(body.username);
    const password = typeof body.password === 'string' ? body.password : '';
    const row = await db
      .prepare(
        `SELECT id, username, display_name AS displayName,
                password_hash AS passwordHash, password_salt AS passwordSalt,
                password_iterations AS passwordIterations,
                failed_login_attempts AS failedLoginAttempts,
                locked_until AS lockedUntil
         FROM accounts
         WHERE username = ?`,
      )
      .bind(username)
      .first<
        Account & {
          passwordHash: string;
          passwordSalt: string;
          passwordIterations: number;
          failedLoginAttempts: number;
          lockedUntil: number;
        }
      >();

    const digest = await passwordHash(
      password,
      row?.passwordSalt || '00000000000000000000000000000000',
      row?.passwordIterations || PASSWORD_ITERATIONS,
    );
    const now = Date.now();
    if (row && row.lockedUntil > now) {
      return json({ error: 'Too many attempts. Please try again in 15 minutes.' }, 429);
    }
    if (!row || !constantTimeEqual(digest, row.passwordHash)) {
      if (row) {
        const nextAttempts = row.failedLoginAttempts + 1;
        await db
          .prepare(
            `UPDATE accounts
             SET failed_login_attempts = ?, locked_until = ?
             WHERE id = ?`,
          )
          .bind(
            nextAttempts >= 5 ? 0 : nextAttempts,
            nextAttempts >= 5 ? now + 15 * 60 * 1000 : 0,
            row.id,
          )
          .run();
      }
      return json({ error: 'Username or password is incorrect.' }, 401);
    }

    const token = randomSecret();
    const tokenHash = await hashToken(token);
    await db.batch([
      db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').bind(now),
      db
        .prepare(
          'UPDATE accounts SET failed_login_attempts = 0, locked_until = 0 WHERE id = ?',
        )
        .bind(row.id),
      db
        .prepare(
          `INSERT INTO auth_sessions
             (id, account_id, token_hash, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          row.id,
          tokenHash,
          now + SESSION_LIFETIME_SECONDS * 1000,
          now,
        ),
    ]);
    const membership = await membershipForAccount(row.id);
    return json(
      {
        account: { id: row.id, username: row.username, displayName: row.displayName },
        membership: membership || null,
      },
      200,
      { 'Set-Cookie': sessionCookie(request, token) },
    );
  }

  if (action === 'logout') {
    const token = cookieValue(request, SESSION_COOKIE);
    if (token) {
      await db
        .prepare('DELETE FROM auth_sessions WHERE token_hash = ?')
        .bind(await hashToken(token))
        .run();
    }
    return json(
      { ok: true },
      200,
      { 'Set-Cookie': sessionCookie(request, '', 0) },
    );
  }

  const account = await authenticatedAccount(request);
  if (!account) return json({ error: 'Please sign in to continue.' }, 401);

  if (action === 'create') {
    const groupName = cleanText(body.groupName, GROUP_NAME_LIMIT);
    const memberName = account.displayName;
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
          `INSERT INTO sangat_members
             (id, group_id, account_id, name, token_hash, privacy, joined_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(memberId, groupId, account.id, memberName, tokenHash, privacy, now),
    ]);

    return json({
      membership: { code, memberId, groupName, memberName, privacy },
    });
  }

  if (action === 'join') {
    const code = cleanCode(body.code);
    const memberName = account.displayName;
    const privacy = cleanPrivacy(body.privacy);

    if (code.length !== 12 || memberName.length < 2) {
      return json({ error: 'Please enter a valid invite code and your name.' }, 400);
    }

    const group = await db
      .prepare('SELECT id, name FROM sangat_groups WHERE invite_code = ?')
      .bind(code)
      .first<{ id: string; name: string }>();
    if (!group) return json({ error: 'This invite link is not active.' }, 404);

    const removedMembership = await db
      .prepare(
        'SELECT 1 FROM sangat_removed_members WHERE group_id = ? AND account_id = ?',
      )
      .bind(group.id, account.id)
      .first();
    if (removedMembership) {
      return json(
        { error: 'The Sangat organiser removed this account from the group.' },
        403,
      );
    }

    const existingMembership = await db
      .prepare(
        `SELECT m.id AS memberId, m.name AS memberName, m.privacy
         FROM sangat_members AS m
         WHERE m.group_id = ? AND m.account_id = ?`,
      )
      .bind(group.id, account.id)
      .first<{ memberId: string; memberName: string; privacy: Privacy }>();
    if (existingMembership) {
      return json({
        membership: {
          code,
          memberId: existingMembership.memberId,
          groupName: group.name,
          memberName: existingMembership.memberName,
          privacy: existingMembership.privacy,
        },
      });
    }

    const memberId = crypto.randomUUID();
    const memberToken = crypto.randomUUID();
    const tokenHash = await hashToken(memberToken);
    await db
      .prepare(
        `INSERT INTO sangat_members
           (id, group_id, account_id, name, token_hash, privacy, joined_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(memberId, group.id, account.id, memberName, tokenHash, privacy, Date.now())
      .run();

    return json({
      membership: {
        code,
        memberId,
        groupName: group.name,
        memberName,
        privacy,
      },
    });
  }

  if (action === 'remove_member') {
    const code = cleanCode(body.code);
    const memberId = cleanText(body.memberId, 80);

    if (code.length !== 12 || !memberId) {
      return json({ error: 'A valid Sangat and member are required.' }, 400);
    }

    const group = await db
      .prepare('SELECT id FROM sangat_groups WHERE invite_code = ?')
      .bind(code)
      .first<{ id: string }>();
    if (!group) return json({ error: 'This Sangat is not active.' }, 404);

    const organizer = await db
      .prepare(
        `SELECT account_id AS accountId
         FROM sangat_members
         WHERE group_id = ? AND account_id IS NOT NULL
         ORDER BY joined_at ASC
         LIMIT 1`,
      )
      .bind(group.id)
      .first<{ accountId: string }>();
    if (!organizer || organizer.accountId !== account.id) {
      return json({ error: 'Only the Sangat organiser can remove members.' }, 403);
    }

    const target = await db
      .prepare(
        `SELECT id, account_id AS accountId
         FROM sangat_members
         WHERE id = ? AND group_id = ? AND account_id IS NOT NULL`,
      )
      .bind(memberId, group.id)
      .first<{ id: string; accountId: string }>();
    if (!target) return json({ error: 'This member is no longer in the Sangat.' }, 404);
    if (target.accountId === organizer.accountId) {
      return json({ error: 'The Sangat organiser cannot be removed.' }, 400);
    }

    await db.batch([
      db
        .prepare(
          `INSERT OR REPLACE INTO sangat_removed_members
             (group_id, account_id, removed_at)
           VALUES (?, ?, ?)`,
        )
        .bind(group.id, target.accountId, Date.now()),
      db
        .prepare(
          'UPDATE sangat_members SET account_id = NULL WHERE id = ? AND group_id = ?',
        )
        .bind(target.id, group.id),
    ]);

    const practiceDate = validDate(body.practiceDate)
      ? body.practiceDate
      : new Date().toISOString().slice(0, 10);
    const updatedGroup = await readGroup(code, practiceDate, account.id);
    return json({ removed: true, group: updatedGroup });
  }

  if (action === 'contribute') {
    const code = cleanCode(body.code);
    const rawEvents = Array.isArray(body.events) ? (body.events as ContributionInput[]) : [];

    if (code.length !== 12 || rawEvents.length === 0 || rawEvents.length > 100) {
      return json({ error: 'This contribution batch is not valid.' }, 400);
    }

    const member = await db
      .prepare(
        `SELECT m.id, m.group_id AS groupId
         FROM sangat_members AS m
         JOIN sangat_groups AS g ON g.id = m.group_id
         WHERE m.account_id = ? AND g.invite_code = ?`,
      )
      .bind(account.id, code)
      .first<{ id: string; groupId: string }>();
    if (!member) return json({ error: 'Please sign in and rejoin this Sangat.' }, 401);

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

    const group = await readGroup(
      code,
      events.at(-1)?.practiceDate || '',
      account.id,
    );
    return json({ acceptedIds: events.map((event) => event.id), group });
  }

  return json({ error: 'Unknown Sangat action.' }, 400);
}
