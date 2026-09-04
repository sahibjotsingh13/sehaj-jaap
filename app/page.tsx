'use client';

import type { ReactNode, SyntheticEvent } from 'react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Copy,
  Eye,
  Focus,
  History,
  Link2,
  LogOut,
  Menu,
  MousePointerClick,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  RotateCcw,
  Save,
  Settings2,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Target,
  Trophy,
  UserPlus,
  UserRoundCheck,
  UsersRound,
  Vibrate,
  Volume2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import Image from 'next/image';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type Locale = 'en' | 'pa';
type View = 'jaap' | 'sangat' | 'focus' | 'progress' | 'more' | 'summary';
type FocusMode = 'timer' | 'target' | 'both' | 'paced';
type Privacy = 'exact' | 'practiced' | 'private';

type Account = {
  id: string;
  username: string;
  displayName: string;
};

type Settings = {
  locale: Locale;
  malaSize: number;
  dailyGoal: number;
  streakMinimum: number;
  simpleMode: boolean;
  soundCue: boolean;
  vibrationCue: boolean;
  visualPulse: boolean;
  sidebarOpen: boolean;
};

type DayRecord = {
  jaap: number;
  focusSeconds: number;
  sessions: number;
  goal: number;
};

type SavedSession = {
  id: string;
  endedAt: number;
  durationSeconds: number;
  count: number;
  malaSize: number;
  mode: 'manual' | FocusMode | 'auto';
};

type Summary = SavedSession & {
  todayTotal: number;
};

type Membership = {
  code: string;
  memberId: string;
  memberToken?: string;
  groupName: string;
  memberName: string;
  privacy: Privacy;
};

type GroupEvent = {
  id: string;
  amount: number;
  practiceDate: string;
};

type GroupMember = {
  id: string;
  name: string;
  privacy: Privacy;
  count?: number;
  practiced: boolean;
};

type GroupData = {
  code: string;
  name: string;
  dailyGoal: number;
  total: number;
  activeMembers: number;
  memberCount: number;
  members: GroupMember[];
};

type IncrementAction = {
  amount: number;
  groupCode?: string;
};

type PersistedSnapshot = {
  version: 1;
  onboarded: boolean;
  account?: Account | null;
  settings: Settings;
  records: Record<string, DayRecord>;
  sessions: SavedSession[];
  membership: Membership | null;
  groupQueue: GroupEvent[];
  sessionCount: number;
  sessionStartedAt: number | null;
  incrementStack: IncrementAction[];
};

const DEFAULT_SETTINGS: Settings = {
  locale: 'en',
  malaSize: 108,
  dailyGoal: 1000,
  streakMinimum: 108,
  simpleMode: false,
  soundCue: false,
  vibrationCue: false,
  visualPulse: true,
  sidebarOpen: true,
};

const STORAGE_KEY = 'sehaj-jaap-state-v1';
const LAST_ACCOUNT_KEY = 'sehaj-jaap-last-account';
const LOCAL_ACCOUNTS_KEY = 'sehaj-jaap-local-accounts-v1';
const LOCAL_SESSION_KEY = 'sehaj-jaap-local-session-v1';
const LOCAL_PASSWORD_ITERATIONS = 210_000;
const DB_NAME = 'sehaj-jaap';

async function readApiJson<T extends object>(response: Response): Promise<T> {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error('The service returned an empty response. Please try again.');
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error('The service returned an invalid response. Please try again.');
  }
}
type LocalAccountRecord = Account & {
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
};

function localBytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function localHexToBytes(value: string) {
  const bytes = new Uint8Array(Math.floor(value.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function localPasswordHash(
  password: string,
  saltHex: string,
  iterations = LOCAL_PASSWORD_ITERATIONS,
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
      salt: localHexToBytes(saltHex),
      iterations,
    },
    key,
    256,
  );
  return localBytesToHex(new Uint8Array(bits));
}

function readLocalAccounts(): LocalAccountRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as LocalAccountRecord[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalAccounts(accounts: LocalAccountRecord[]) {
  localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function normalizeLocalUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
}

async function registerLocalAccount(
  usernameInput: string,
  displayNameInput: string,
  password: string,
): Promise<Account> {
  const username = normalizeLocalUsername(usernameInput);
  const displayName = displayNameInput.trim().replace(/\s+/g, ' ').slice(0, 48);

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    throw new Error('Username must be 3–24 letters, numbers, or underscores.');
  }
  if (displayName.length < 2) {
    throw new Error('Please enter your name.');
  }
  if (password.length < 8 || password.length > 128) {
    throw new Error('Password must be 8–128 characters.');
  }

  const accounts = readLocalAccounts();
  if (accounts.some((item) => item.username === username)) {
    throw new Error('That username is already registered on this device.');
  }

  const passwordSalt = localBytesToHex(
    crypto.getRandomValues(new Uint8Array(16)),
  );
  const passwordHash = await localPasswordHash(password, passwordSalt);
  const account: Account = {
    id: crypto.randomUUID(),
    username,
    displayName,
  };

  writeLocalAccounts([
    ...accounts,
    {
      ...account,
      passwordHash,
      passwordSalt,
      passwordIterations: LOCAL_PASSWORD_ITERATIONS,
    },
  ]);
  localStorage.setItem(LOCAL_SESSION_KEY, account.id);
  return account;
}

async function loginLocalAccount(
  usernameInput: string,
  password: string,
): Promise<Account> {
  const username = normalizeLocalUsername(usernameInput);
  const record = readLocalAccounts().find((item) => item.username === username);
  if (!record) {
    throw new Error('Username or password is incorrect.');
  }

  const digest = await localPasswordHash(
    password,
    record.passwordSalt,
    record.passwordIterations,
  );
  if (digest !== record.passwordHash) {
    throw new Error('Username or password is incorrect.');
  }

  const account: Account = {
    id: record.id,
    username: record.username,
    displayName: record.displayName,
  };
  localStorage.setItem(LOCAL_SESSION_KEY, account.id);
  return account;
}

function readLocalSessionAccount(): Account | null {
  try {
    const accountId = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!accountId) return null;
    const record = readLocalAccounts().find((item) => item.id === accountId);
    return record
      ? {
          id: record.id,
          username: record.username,
          displayName: record.displayName,
        }
      : null;
  } catch {
    return null;
  }
}

const STORE_NAME = 'state';
let openDatabasePromise: Promise<IDBDatabase> | null = null;

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function shiftDate(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatNumber(value: number) {
  return Math.max(0, value).toLocaleString('en-IN');
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

function openDatabase() {
  if (openDatabasePromise) return openDatabasePromise;
  openDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return openDatabasePromise;
}

async function readStoredState(slot = 'app') {
  const database = await openDatabase();
  return new Promise<PersistedSnapshot | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(slot);
    request.onsuccess = () => resolve((request.result as PersistedSnapshot | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function writeStoredState(snapshot: PersistedSnapshot, slot = 'app') {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(snapshot, slot);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function softCue() {
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = 396;
  gain.gain.setValueAtTime(0.035, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.11);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.12);
  oscillator.addEventListener('ended', () => void context.close());
}

function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'panel-surface rounded-[28px] border border-[color:var(--line)] bg-card shadow-[0_18px_55px_rgba(23,50,77,.06)]',
        className,
      )}
    >
      {children}
    </section>
  );
}

function SettingRow({
  icon,
  label,
  description,
  children,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row flex min-h-[74px] items-center gap-4 border-b border-[color:var(--line)] py-4 last:border-b-0">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{label}</p>
        <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

function HeritageCard({
  src,
  alt,
  eyebrow,
  title,
  description,
  credit,
  sourceUrl,
  className,
  imageClassName,
  priority = false,
}: {
  src: string;
  alt: string;
  eyebrow: string;
  title: string;
  description: string;
  credit: string;
  sourceUrl: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
}) {
  return (
    <article
      className={cn(
        'heritage-card group relative isolate min-h-[260px] overflow-hidden rounded-[28px] border border-white/20 bg-primary text-white shadow-[0_22px_60px_rgba(16,40,46,.16)]',
        className,
      )}
    >
      <Image
        alt={alt}
        className={cn('heritage-card-image object-cover', imageClassName)}
        fill
        priority={priority}
        sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 420px"
        src={src}
      />
      <div aria-hidden="true" className="heritage-card-overlay absolute inset-0" />
      <div className="relative z-10 flex min-h-[inherit] flex-col justify-end p-5 sm:p-6">
        <span className="mb-auto grid size-10 place-items-center rounded-full border border-white/25 bg-[#143b44]/45 font-gurmukhi text-lg text-[color:var(--gold-light)] backdrop-blur-md">
          ੴ
        </span>
        <p className="text-[11px] font-semibold tracking-[.15em] text-white/70 uppercase">
          {eyebrow}
        </p>
        <h3 className="mt-1 font-heading text-xl font-semibold tracking-[-.02em] sm:text-2xl">
          {title}
        </h3>
        <p className="sr-only">
          {description}
        </p>
        <a
          className="heritage-credit mt-4 w-fit text-[11px] text-white/62 underline decoration-white/30 underline-offset-4 hover:text-white focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          href={sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          {credit}
        </a>
      </div>
    </article>
  );
}

export default function Home() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [records, setRecords] = useState<Record<string, DayRecord>>({});
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [groupQueue, setGroupQueue] = useState<GroupEvent[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [incrementStack, setIncrementStack] = useState<IncrementAction[]>([]);
  const [onboarded, setOnboarded] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);

  const [account, setAccount] = useState<Account | null>(null);
  const [accountChecked, setAccountChecked] = useState(false);
  const [accountMode, setAccountMode] = useState<'login' | 'register'>('login');
  const [accountUsername, setAccountUsername] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountDisplayName, setAccountDisplayName] = useState('');
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [stateOwnerId, setStateOwnerId] = useState<string | null>(null);
  const [claimLocalPractice, setClaimLocalPractice] = useState(true);

  const [activeView, setActiveView] = useState<View>('jaap');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  );
  const [tapPulse, setTapPulse] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState(25);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [focusMode, setFocusMode] = useState<FocusMode>('timer');
  const [focusMinutes, setFocusMinutes] = useState(10);
  const [focusTarget, setFocusTarget] = useState(108);
  const [focusPace, setFocusPace] = useState(2);
  const [pacedAuto, setPacedAuto] = useState(false);
  const [activeFocus, setActiveFocus] = useState(false);
  const [focusRunStartedAt, setFocusRunStartedAt] = useState<number | null>(null);
  const [focusElapsedBase, setFocusElapsedBase] = useState(0);
  const [now, setNow] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);

  const [groupData, setGroupData] = useState<GroupData | null>(null);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupError, setGroupError] = useState('');
  const [groupMode, setGroupMode] = useState<'join' | 'create'>('join');
  const [groupName, setGroupName] = useState('Family Sangat');
  const [inviteInput, setInviteInput] = useState('');
  const [groupGoal, setGroupGoal] = useState(50000);
  const [privacy, setPrivacy] = useState<Privacy>('exact');
  const [shareFeedback, setShareFeedback] = useState('');
  const [syncing, setSyncing] = useState(false);

  const pulseTimer = useRef<number | null>(null);
  const finishingFocus = useRef(false);
  const membershipRef = useRef<Membership | null>(null);
  const groupQueueRef = useRef<GroupEvent[]>([]);

  const today = localDateKey();
  const locale = settings.locale;
  const tr = useCallback(
    (english: string, punjabi: string) => (locale === 'pa' ? punjabi : english),
    [locale],
  );

  const todayRecord = records[today] ?? {
    jaap: 0,
    focusSeconds: 0,
    sessions: 0,
    goal: settings.dailyGoal,
  };
  const todayCount = todayRecord.jaap;
  const malas = Math.floor(todayCount / settings.malaSize);
  const remainder = todayCount % settings.malaSize;
  const progress = Math.min(
    100,
    Math.round((todayCount / Math.max(1, settings.dailyGoal)) * 100),
  );
  const progressStyle = {
    '--progress': String(progress * 3.6) + 'deg',
  } as React.CSSProperties;

  function applyPersonalSnapshot(
    saved: PersistedSnapshot | null,
    ownerId: string,
    serverMembership: Membership | null,
  ) {
    if (saved?.version === 1) {
      setSettings({ ...DEFAULT_SETTINGS, ...saved.settings });
      setRecords(saved.records ?? {});
      setSessions(saved.sessions ?? []);
      setGroupQueue(saved.groupQueue ?? []);
      setSessionCount(saved.sessionCount ?? 0);
      setSessionStartedAt(saved.sessionStartedAt ?? null);
      setIncrementStack(saved.incrementStack ?? []);
      setOnboarded(true);
    } else {
      setRecords({});
      setSessions([]);
      setGroupQueue([]);
      setSessionCount(0);
      setSessionStartedAt(null);
      setIncrementStack([]);
      setOnboarded(true);
    }
    setMembership(serverMembership);
    setStateOwnerId(ownerId);
  }

  async function readAccountSnapshot(accountId: string) {
    const slot = 'account:' + accountId;
    try {
      const stored = await readStoredState(slot);
      if (stored) return stored;
    } catch {
      setStorageWarning(true);
    }
    try {
      const fallback = localStorage.getItem(STORAGE_KEY + ':' + accountId);
      return fallback ? (JSON.parse(fallback) as PersistedSnapshot) : null;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      let saved: PersistedSnapshot | null = null;
      try {
        saved = await readStoredState();
      } catch {
        setStorageWarning(true);
      }

      if (!saved) {
        try {
          const fallback = localStorage.getItem(STORAGE_KEY);
          saved = fallback ? (JSON.parse(fallback) as PersistedSnapshot) : null;
        } catch {
          saved = null;
        }
      }
      if (!active) return;

      let lastAccount: Account | null = null;
      try {
        const rawAccount = localStorage.getItem(LAST_ACCOUNT_KEY);
        lastAccount = rawAccount ? (JSON.parse(rawAccount) as Account) : null;
      } catch {
        lastAccount = null;
      }

      if (saved?.version === 1) {
        setSettings({ ...DEFAULT_SETTINGS, ...saved.settings });
        setRecords(saved.records ?? {});
        setSessions(saved.sessions ?? []);
        setAccount(saved.account ?? lastAccount);
        setStateOwnerId(saved.account?.id ?? null);
        setMembership(saved.account ? (saved.membership ?? null) : null);
        setGroupQueue(saved.groupQueue ?? []);
        setSessionCount(saved.sessionCount ?? 0);
        setSessionStartedAt(saved.sessionStartedAt ?? null);
        setIncrementStack(saved.incrementStack ?? []);
        setOnboarded(Boolean(saved.onboarded));
      } else {
        const legacyCount = Number(localStorage.getItem('sehaj-jaap-count') || 0);
        if (Number.isFinite(legacyCount) && legacyCount > 0) {
          setRecords({
            [localDateKey()]: {
              jaap: legacyCount,
              focusSeconds: 0,
              sessions: 0,
              goal: DEFAULT_SETTINGS.dailyGoal,
            },
          });
        }
      }

      const invite = new URLSearchParams(window.location.search)
        .get('join')
        ?.toUpperCase()
        .replace(/[^A-Z2-9]/g, '')
        .slice(0, 12);
      if (invite) {
        setInviteInput(invite);
        setActiveView('sangat');
        setGroupMode('join');
      }
      setHydrated(true);
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !account || stateOwnerId !== account.id) return;
    const snapshot: PersistedSnapshot = {
      version: 1,
      onboarded,
      account,
      settings,
      records,
      sessions,
      membership,
      groupQueue,
      sessionCount,
      sessionStartedAt,
      incrementStack,
    };
    const slot = 'account:' + account.id;
    localStorage.setItem(STORAGE_KEY + ':' + account.id, JSON.stringify(snapshot));
    localStorage.setItem(LAST_ACCOUNT_KEY, JSON.stringify(account));
    const timeout = window.setTimeout(() => {
      void writeStoredState(snapshot, slot).catch(() => setStorageWarning(true));
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [
    account,
    groupQueue,
    hydrated,
    incrementStack,
    membership,
    onboarded,
    records,
    sessionCount,
    sessionStartedAt,
    sessions,
    stateOwnerId,
    settings,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    let active = true;

    const restoreLocalAccount = async () => {
      const localAccount = readLocalSessionAccount();
      if (!active) return;

      if (localAccount) {
        if (stateOwnerId !== localAccount.id) {
          const saved = await readAccountSnapshot(localAccount.id);
          if (!active) return;
          applyPersonalSnapshot(saved, localAccount.id, saved?.membership ?? null);
        }
        setAccount((current) =>
          current?.id === localAccount.id &&
          current.username === localAccount.username &&
          current.displayName === localAccount.displayName
            ? current
            : localAccount,
        );
        localStorage.setItem(LAST_ACCOUNT_KEY, JSON.stringify(localAccount));
        return;
      }

      setAccount(null);
      setMembership(null);
      setGroupQueue([]);
      setStateOwnerId(null);
      localStorage.removeItem(LAST_ACCOUNT_KEY);
    };

    void fetch('/api/sangat?account=1', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await readApiJson<{
          account?: Account;
          membership?: Membership | null;
        }>(response);
        if (!active) return;

        if (response.ok && payload.account) {
          const verifiedAccount = payload.account;
          if (stateOwnerId !== verifiedAccount.id) {
            const saved = await readAccountSnapshot(verifiedAccount.id);
            if (!active) return;
            applyPersonalSnapshot(
              saved,
              verifiedAccount.id,
              payload.membership ?? null,
            );
          } else {
            setMembership(payload.membership ?? null);
          }
          setAccount((current) =>
            current?.id === verifiedAccount.id &&
            current.username === verifiedAccount.username &&
            current.displayName === verifiedAccount.displayName
              ? current
              : verifiedAccount,
          );
          localStorage.setItem(LAST_ACCOUNT_KEY, JSON.stringify(verifiedAccount));
        } else {
          await restoreLocalAccount();
        }
      })
      .catch(restoreLocalAccount)
      .finally(() => {
        if (active) setAccountChecked(true);
      });

    return () => {
      active = false;
    };
  }, [hydrated, stateOwnerId]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    membershipRef.current = membership;
  }, [membership]);

  useEffect(() => {
    groupQueueRef.current = groupQueue;
  }, [groupQueue]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!activeFocus) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [activeFocus]);

  const playFeedback = useCallback(() => {
    if (settings.soundCue) softCue();
    if (settings.vibrationCue && 'vibrate' in navigator) {
      navigator.vibrate(14);
    }
    if (settings.visualPulse) {
      setTapPulse(false);
      window.requestAnimationFrame(() => setTapPulse(true));
      if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
      pulseTimer.current = window.setTimeout(() => setTapPulse(false), 220);
    }
  }, [settings.soundCue, settings.vibrationCue, settings.visualPulse]);

  const increment = useCallback(
    (amount: number) => {
      const safeAmount = Math.min(10000, Math.max(1, Math.floor(amount)));
      if (paused) {
        setNotice(tr('Session is paused', 'ਸੈਸ਼ਨ ਰੁਕਿਆ ਹੋਇਆ ਹੈ'));
        return;
      }
      if (!sessionStartedAt) setSessionStartedAt(Date.now());
      setSessionCount((value) => value + safeAmount);
      setRecords((current) => {
        const day = current[today] ?? {
          jaap: 0,
          focusSeconds: 0,
          sessions: 0,
          goal: settings.dailyGoal,
        };
        return {
          ...current,
          [today]: { ...day, jaap: day.jaap + safeAmount },
        };
      });
      setIncrementStack((items) => [
        ...items.slice(-99),
        { amount: safeAmount, groupCode: membership?.code },
      ]);
      if (membership) {
        setGroupQueue((items) => [
          ...items,
          {
            id: crypto.randomUUID(),
            amount: safeAmount,
            practiceDate: today,
          },
        ]);
      }
      playFeedback();
    },
    [
      membership,
      paused,
      playFeedback,
      sessionStartedAt,
      settings.dailyGoal,
      today,
      tr,
    ],
  );

  function undo() {
    const last = incrementStack.at(-1);
    if (!last) return;
    setSessionCount((value) => Math.max(0, value - last.amount));
    setRecords((current) => {
      const day = current[today] ?? {
        jaap: 0,
        focusSeconds: 0,
        sessions: 0,
        goal: settings.dailyGoal,
      };
      return {
        ...current,
        [today]: { ...day, jaap: Math.max(0, day.jaap - last.amount) },
      };
    });
    setIncrementStack((items) => items.slice(0, -1));
    if (membership && last.groupCode === membership.code) {
      setGroupQueue((items) => [
        ...items,
        {
          id: crypto.randomUUID(),
          amount: -last.amount,
          practiceDate: today,
        },
      ]);
    }
  }

  const refreshGroup = useCallback(
    async (code: string) => {
      const response = await fetch(
        '/api/sangat?code=' +
          encodeURIComponent(code) +
          '&date=' +
          encodeURIComponent(today),
        { cache: 'no-store' },
      );
      const payload = await readApiJson<{
        group?: GroupData;
        error?: string;
      }>(response);
      if (!response.ok || !payload.group) {
        throw new Error(payload.error || 'Could not load this Sangat.');
      }
      setGroupData(payload.group);
      return payload.group;
    },
    [today],
  );

  const flushGroup = useCallback(async () => {
    const currentMembership = membershipRef.current;
    const queue = groupQueueRef.current.slice(0, 100);
    if (!currentMembership || queue.length === 0 || !navigator.onLine) return;
    setSyncing(true);
    try {
      const response = await fetch('/api/sangat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'contribute',
          code: currentMembership.code,
          memberId: currentMembership.memberId,
          memberToken: currentMembership.memberToken,
          events: queue,
        }),
        keepalive: true,
      });
      const payload = await readApiJson<{
        acceptedIds?: string[];
        group?: GroupData;
        error?: string;
      }>(response);
      if (!response.ok || !payload.acceptedIds) {
        throw new Error(payload.error || 'Sync paused');
      }
      const accepted = new Set(payload.acceptedIds);
      setGroupQueue((items) => items.filter((item) => !accepted.has(item.id)));
      if (payload.group) setGroupData(payload.group);
    } catch {
      setOnline(navigator.onLine);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (!membership) return;
    const initialRefresh = window.setTimeout(() => {
      void refreshGroup(membership.code).catch(() => undefined);
    }, 0);
    const refreshTimer = window.setInterval(() => {
      void refreshGroup(membership.code).catch(() => undefined);
    }, 10000);
    const syncTimer = window.setInterval(() => void flushGroup(), 5000);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flushGroup();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(refreshTimer);
      window.clearInterval(syncTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flushGroup, membership, refreshGroup]);

  useEffect(() => {
    if (inviteInput.length !== 12 || membership?.code === inviteInput) return;
    const previewTimer = window.setTimeout(() => {
      setGroupLoading(true);
      setGroupError('');
      void refreshGroup(inviteInput)
        .catch((error: unknown) =>
          setGroupError(
            error instanceof Error
              ? error.message
              : tr('This invite could not be opened.', 'ਇਹ ਸੱਦਾ ਨਹੀਂ ਖੁੱਲ੍ਹ ਸਕਿਆ।'),
          ),
        )
        .finally(() => setGroupLoading(false));
    }, 0);
    return () => window.clearTimeout(previewTimer);
  }, [inviteInput, membership?.code, refreshGroup, tr]);

  useEffect(() => {
    if (!activeFocus || focusMode !== 'paced' || !pacedAuto || paused) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') increment(1);
    }, Math.max(1, focusPace) * 1000);
    return () => window.clearInterval(timer);
  }, [activeFocus, focusMode, focusPace, increment, pacedAuto, paused]);

  const focusElapsed =
    focusElapsedBase +
    (activeFocus && focusRunStartedAt && !paused
      ? Math.floor((now - focusRunStartedAt) / 1000)
      : 0);
  const timedFocus = focusMode === 'timer' || focusMode === 'both';
  const targetedFocus = focusMode === 'target' || focusMode === 'both';
  const focusRemaining = timedFocus
    ? Math.max(0, focusMinutes * 60 - focusElapsed)
    : focusElapsed;
  const focusProgress = targetedFocus
    ? Math.min(100, Math.round((sessionCount / Math.max(1, focusTarget)) * 100))
    : timedFocus
      ? Math.min(100, Math.round((focusElapsed / Math.max(1, focusMinutes * 60)) * 100))
      : 0;

  const appendSession = useCallback((
    count: number,
    durationSeconds: number,
    mode: SavedSession['mode'],
    showSummary: boolean,
  ) => {
    if (count <= 0) {
      setNotice(tr('Make at least one count first', 'ਪਹਿਲਾਂ ਘੱਟੋ-ਘੱਟ ਇੱਕ ਗਿਣਤੀ ਕਰੋ'));
      return false;
    }
    const saved: SavedSession = {
      id: crypto.randomUUID(),
      endedAt: Date.now(),
      durationSeconds: Math.max(1, durationSeconds),
      count,
      malaSize: settings.malaSize,
      mode,
    };
    setSessions((items) => [saved, ...items].slice(0, 180));
    setRecords((current) => {
      const day = current[today] ?? {
        jaap: todayCount,
        focusSeconds: 0,
        sessions: 0,
        goal: settings.dailyGoal,
      };
      return {
        ...current,
        [today]: {
          ...day,
          sessions: day.sessions + 1,
          focusSeconds:
            day.focusSeconds + (mode === 'manual' ? 0 : saved.durationSeconds),
        },
      };
    });
    if (showSummary) {
      setSummary({ ...saved, todayTotal: todayCount });
      setActiveView('summary');
    } else {
      setNotice(tr('Session saved', 'ਸੈਸ਼ਨ ਸੰਭਾਲਿਆ ਗਿਆ'));
    }
    setSessionCount(0);
    setSessionStartedAt(null);
    setIncrementStack([]);
    setPaused(false);
    void flushGroup();
    return true;
  }, [
    flushGroup,
    settings.dailyGoal,
    settings.malaSize,
    today,
    todayCount,
    tr,
  ]);

  function saveManual(showSummary: boolean) {
    const duration = sessionStartedAt
      ? Math.floor((Date.now() - sessionStartedAt) / 1000)
      : 0;
    appendSession(sessionCount, duration, 'manual', showSummary);
  }

  function startFocus() {
    if (sessionCount > 0 && sessionStartedAt) {
      const priorDuration = Math.floor((Date.now() - sessionStartedAt) / 1000);
      appendSession(sessionCount, priorDuration, 'manual', false);
    }
    const started = Date.now();
    setSessionCount(0);
    setIncrementStack([]);
    setSessionStartedAt(started);
    setFocusElapsedBase(0);
    setFocusRunStartedAt(started);
    setNow(started);
    setPaused(false);
    setSummary(null);
    finishingFocus.current = false;
    setActiveFocus(true);
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  const completeFocus = useCallback(() => {
    if (finishingFocus.current) return;
    finishingFocus.current = true;
    const mode: SavedSession['mode'] =
      focusMode === 'paced' && pacedAuto ? 'auto' : focusMode;
    const completed = appendSession(
      sessionCount,
      Math.max(1, focusElapsed),
      mode,
      true,
    );
    if (!completed) {
      setActiveView('focus');
    }
    setActiveFocus(false);
    setFocusRunStartedAt(null);
    void document.exitFullscreen?.().catch(() => undefined);
  }, [appendSession, focusElapsed, focusMode, pacedAuto, sessionCount]);

  useEffect(() => {
    if (!activeFocus || paused) return;
    const reachedTime = timedFocus && focusElapsed >= focusMinutes * 60;
    const reachedTarget = targetedFocus && sessionCount >= focusTarget;
    if (reachedTime || reachedTarget) {
      const completionTimer = window.setTimeout(completeFocus, 0);
      return () => window.clearTimeout(completionTimer);
    }
  }, [
    activeFocus,
    completeFocus,
    focusElapsed,
    focusMinutes,
    focusTarget,
    paused,
    sessionCount,
    targetedFocus,
    timedFocus,
  ]);

  function toggleFocusPause() {
    if (paused) {
      setPaused(false);
      setFocusRunStartedAt(Date.now());
      setNow(Date.now());
    } else {
      const extra = focusRunStartedAt
        ? Math.floor((Date.now() - focusRunStartedAt) / 1000)
        : 0;
      setFocusElapsedBase((value) => value + extra);
      setFocusRunStartedAt(null);
      setPaused(true);
    }
  }

  async function submitAccount(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccountLoading(true);
    setAccountError('');

    try {
      let resolvedAccount: Account | null = null;
      let resolvedMembership: Membership | null = null;
      let localFallback = false;

      try {
        const response = await fetch('/api/sangat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: accountMode,
            username: accountUsername,
            password: accountPassword,
            displayName: accountDisplayName,
          }),
        });
        const payload = await readApiJson<{
          account?: Account;
          membership?: Membership | null;
          error?: string;
        }>(response);

        if (response.ok && payload.account) {
          resolvedAccount = payload.account;
          resolvedMembership = payload.membership ?? null;
          localStorage.removeItem(LOCAL_SESSION_KEY);
        } else {
          const legacyOrUnavailable =
            payload.error === 'Unknown Sangat action.' ||
            Boolean(payload.error?.includes('valid Sangat code and date')) ||
            response.status === 503;

          if (!legacyOrUnavailable) {
            throw new Error(payload.error || 'Could not open your account.');
          }
          localFallback = true;
        }
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes('already taken') ||
            error.message.includes('incorrect') ||
            error.message.includes('Too many attempts') ||
            error.message.includes('Password must') ||
            error.message.includes('Username must'))
        ) {
          throw error;
        }
        localFallback = true;
      }

      if (localFallback) {
        resolvedAccount =
          accountMode === 'register'
            ? await registerLocalAccount(
                accountUsername,
                accountDisplayName,
                accountPassword,
              )
            : await loginLocalAccount(accountUsername, accountPassword);
        resolvedMembership = null;
      }

      if (!resolvedAccount) {
        throw new Error('Could not open your account.');
      }

      if (accountMode === 'login') {
        const saved = await readAccountSnapshot(resolvedAccount.id);
        applyPersonalSnapshot(saved, resolvedAccount.id, resolvedMembership);
      } else if (claimLocalPractice) {
        setMembership(null);
        setGroupQueue([]);
        setStateOwnerId(resolvedAccount.id);
      } else {
        applyPersonalSnapshot(null, resolvedAccount.id, null);
      }

      setAccount(resolvedAccount);
      localStorage.setItem(LAST_ACCOUNT_KEY, JSON.stringify(resolvedAccount));
      setAccountPassword('');
      setOnboarded(true);

      if (inviteInput.length === 12) {
        setActiveView('sangat');
        setGroupMode('join');
      }

      setNotice(
        accountMode === 'register'
          ? tr('Your free account is ready', 'ਤੁਹਾਡਾ ਮੁਫ਼ਤ ਖਾਤਾ ਤਿਆਰ ਹੈ')
          : tr('Welcome back', 'ਜੀ ਆਇਆਂ ਨੂੰ'),
      );
    } catch (error) {
      setAccountError(
        error instanceof Error
          ? error.message
          : tr('Please try again.', 'ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।'),
      );
    } finally {
      setAccountLoading(false);
    }
  }

  async function signOut() {
    try {
      await fetch('/api/sangat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
    } finally {
      localStorage.removeItem(LOCAL_SESSION_KEY);
      setAccount(null);
      setMembership(null);
      setGroupData(null);
      setGroupQueue([]);
      setRecords({});
      setSessions([]);
      setSessionCount(0);
      setSessionStartedAt(null);
      setIncrementStack([]);
      setStateOwnerId(null);
      setAccountPassword('');
      setActiveView('jaap');
      localStorage.removeItem(LAST_ACCOUNT_KEY);
    }
  }

  async function submitSangat(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setGroupLoading(true);
    setGroupError('');
    try {
      const action = groupMode;
      const response = await fetch('/api/sangat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          code: inviteInput,
          groupName,
          memberName: account?.displayName || accountDisplayName || 'Member',
          dailyGoal: groupGoal,
          privacy,
        }),
      });
      const payload = await readApiJson<{
        membership?: Membership;
        error?: string;
      }>(response);
      if (!response.ok || !payload.membership) {
        throw new Error(payload.error || 'Could not join this Sangat.');
      }
      setMembership(payload.membership);
      setInviteInput(payload.membership.code);
      await refreshGroup(payload.membership.code);
      window.history.replaceState({}, '', window.location.pathname);
      setNotice(
        action === 'create'
          ? tr('Your Sangat is ready to share', 'ਤੁਹਾਡੀ ਸੰਗਤ ਸਾਂਝੀ ਕਰਨ ਲਈ ਤਿਆਰ ਹੈ')
          : tr('You joined the Sangat', 'ਤੁਸੀਂ ਸੰਗਤ ਵਿੱਚ ਸ਼ਾਮਲ ਹੋ ਗਏ'),
      );
    } catch (error) {
      setGroupError(
        error instanceof Error
          ? error.message
          : tr('Please try again.', 'ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।'),
      );
    } finally {
      setGroupLoading(false);
    }
  }

  async function shareInvite(copyOnly = false) {
    if (!membership) return;
    const url =
      window.location.origin +
      window.location.pathname +
      '?join=' +
      encodeURIComponent(membership.code);
    try {
      if (!copyOnly && navigator.share) {
        await navigator.share({
          title: membership.groupName,
          text: tr(
            'Join my Sangat and add your Jaap to our shared goal.',
            'ਮੇਰੀ ਸੰਗਤ ਵਿੱਚ ਸ਼ਾਮਲ ਹੋਵੋ ਅਤੇ ਸਾਡੇ ਸਾਂਝੇ ਟੀਚੇ ਵਿੱਚ ਆਪਣਾ ਜਾਪ ਜੋੜੋ।',
          ),
          url,
        });
        setShareFeedback(tr('Invite shared', 'ਸੱਦਾ ਸਾਂਝਾ ਕੀਤਾ'));
      } else {
        await navigator.clipboard.writeText(url);
        setShareFeedback(tr('Invite link copied', 'ਸੱਦਾ ਲਿੰਕ ਕਾਪੀ ਹੋ ਗਿਆ'));
      }
    } catch {
      setShareFeedback(tr('Share cancelled', 'ਸਾਂਝਾ ਕਰਨਾ ਰੱਦ ਹੋਇਆ'));
    }
    window.setTimeout(() => setShareFeedback(''), 2400);
  }

  const recentDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = shiftDate(new Date(), index - 6);
        const key = localDateKey(date);
        return {
          key,
          label: new Intl.DateTimeFormat(locale === 'pa' ? 'pa-IN' : 'en-IN', {
            weekday: 'short',
          }).format(date),
          record: records[key] ?? {
            jaap: 0,
            focusSeconds: 0,
            sessions: 0,
            goal: settings.dailyGoal,
          },
        };
      }),
    [locale, records, settings.dailyGoal],
  );
  const weekTotal = recentDays.reduce((sum, day) => sum + day.record.jaap, 0);
  const weekMaximum = Math.max(settings.dailyGoal, ...recentDays.map((day) => day.record.jaap));

  const calendarDays = useMemo(
    () =>
      Array.from({ length: 35 }, (_, index) => {
        const date = shiftDate(new Date(), index - 34);
        const key = localDateKey(date);
        return { key, date, record: records[key] };
      }),
    [records],
  );

  const currentStreak = useMemo(() => {
    let cursor = new Date();
    if ((records[localDateKey(cursor)]?.jaap ?? 0) < settings.streakMinimum) {
      cursor = shiftDate(cursor, -1);
    }
    let streak = 0;
    for (let day = 0; day < 3660; day += 1) {
      if ((records[localDateKey(cursor)]?.jaap ?? 0) < settings.streakMinimum) break;
      streak += 1;
      cursor = shiftDate(cursor, -1);
    }
    return streak;
  }, [records, settings.streakMinimum]);

  const longestStreak = useMemo(() => {
    const dates = Object.keys(records)
      .filter((key) => records[key].jaap >= settings.streakMinimum)
      .sort();
    let longest = 0;
    let running = 0;
    let previous: Date | null = null;
    for (const key of dates) {
      const current = new Date(key + 'T12:00:00');
      const consecutive =
        previous &&
        Math.round((current.getTime() - previous.getTime()) / 86400000) === 1;
      running = consecutive ? running + 1 : 1;
      longest = Math.max(longest, running);
      previous = current;
    }
    return longest;
  }, [records, settings.streakMinimum]);

  const navItems = [
    {
      id: 'jaap' as const,
      label: tr('Jaap', 'ਜਾਪ'),
      icon: MousePointerClick,
    },
    {
      id: 'sangat' as const,
      label: tr('Sangat', 'ਸੰਗਤ'),
      icon: UsersRound,
    },
    {
      id: 'focus' as const,
      label: tr('Focus', 'ਧਿਆਨ'),
      icon: Focus,
    },
    {
      id: 'progress' as const,
      label: tr('Progress', 'ਪ੍ਰਗਤੀ'),
      icon: BarChart3,
    },
    {
      id: 'more' as const,
      label: tr('More', 'ਹੋਰ'),
      icon: Settings2,
    },
  ];

  const incrementRef = useRef(increment);
  const progressRef = useRef({
    todayCount,
    goal: settings.dailyGoal,
    malaSize: settings.malaSize,
  });
  useEffect(() => {
    incrementRef.current = increment;
    progressRef.current = {
      todayCount,
      goal: settings.dailyGoal,
      malaSize: settings.malaSize,
    };
  }, [increment, settings.dailyGoal, settings.malaSize, todayCount]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const report = () => undefined;
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'add_jaap',
            title: 'Add Jaap',
            description:
              'Add a positive number of repetitions to today’s visible Jaap counter.',
            inputSchema: {
              type: 'object',
              properties: {
                amount: { type: 'integer', minimum: 1, maximum: 10000 },
              },
              required: ['amount'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute(input: unknown) {
              const amount = Number(
                (input as { amount?: unknown } | null)?.amount,
              );
              if (!Number.isInteger(amount) || amount < 1 || amount > 10000) {
                throw new Error('Amount must be an integer from 1 to 10,000.');
              }
              incrementRef.current(amount);
              return { added: amount };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(report);
      void Promise.resolve(
        context.registerTool(
          {
            name: 'read_jaap_progress',
            title: 'Read Jaap progress',
            description:
              'Read today’s Jaap total, Mala breakdown, and daily goal without changing anything.',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: false },
            execute() {
              const value = progressRef.current;
              return {
                jaap: value.todayCount,
                mala: Math.floor(value.todayCount / value.malaSize),
                remainingInMala: value.todayCount % value.malaSize,
                goal: value.goal,
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(report);
    } catch {
      return;
    }
    return () => lifecycle.abort();
  }, []);

  if (!hydrated || !accountChecked) {
    return (
      <main className="auth-shell grid min-h-dvh place-items-center px-5 py-10 text-foreground">
        <div className="text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-primary text-3xl text-primary-foreground shadow-[0_18px_45px_rgba(28,53,58,.2)]">
            🪯
          </span>
          <p className="mt-5 font-gurmukhi text-3xl font-semibold text-primary">ਵਾਹਿਗੁਰੂ</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {tr('Preparing your peaceful space…', 'ਤੁਹਾਡੀ ਸ਼ਾਂਤ ਥਾਂ ਤਿਆਰ ਹੋ ਰਹੀ ਹੈ…')}
          </p>
        </div>
      </main>
    );
  }

  if (!account) {
    return (
      <main className="auth-shell min-h-dvh px-4 py-4 text-foreground sm:px-7 sm:py-7 lg:grid lg:place-items-center">
        <div className="mx-auto grid w-full max-w-[1160px] overflow-hidden rounded-[32px] border border-white/55 bg-card shadow-[0_28px_90px_rgba(48,42,24,.14)] lg:min-h-[720px] lg:grid-cols-[1.08fr_.92fr]">
          <section className="auth-visual relative isolate min-h-[290px] overflow-hidden bg-primary text-white sm:min-h-[360px] lg:min-h-full">
            <Image
              alt="Sri Harmandir Sahib reflected in the sarovar"
              className="object-cover"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 55vw"
              src="/golden-temple.jpg"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#122f35]/95 via-[#173942]/45 to-[#9a7330]/10" />
            <div className="relative z-10 flex min-h-[inherit] flex-col p-6 sm:p-9 lg:min-h-full lg:p-12">
              <div className="flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-full border border-white/25 bg-white/10 text-2xl backdrop-blur-md">🪯</span>
                <div>
                  <p className="font-heading text-xl font-semibold">Sehaj Jaap</p>
                  <p className="font-gurmukhi text-sm text-white/65">ਸਹਿਜ ਜਾਪ</p>
                </div>
              </div>
              <div className="mt-auto max-w-lg pt-14">
                <p className="font-gurmukhi text-4xl font-semibold text-[color:var(--gold-light)] sm:text-5xl">ਵਾਹਿਗੁਰੂ</p>
              </div>
            </div>
          </section>

          <section className="flex flex-col justify-center p-6 sm:p-10 lg:p-12">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <p className="eyebrow">{tr('Free for everyone', 'ਸਭ ਲਈ ਮੁਫ਼ਤ')}</p>
                <h2 className="font-heading text-3xl font-semibold tracking-[-.035em]">
                  {accountMode === 'login'
                    ? tr('Welcome back', 'ਜੀ ਆਇਆਂ ਨੂੰ')
                    : tr('Create your account', 'ਆਪਣਾ ਖਾਤਾ ਬਣਾਓ')}
                </h2>
              </div>
              <div className="flex rounded-full border border-[color:var(--line)] bg-secondary/70 p-1 text-xs">
                <button
                  className={cn('rounded-full px-3 py-2', locale === 'en' && 'bg-card shadow-sm')}
                  onClick={() => setSettings((value) => ({ ...value, locale: 'en' }))}
                  type="button"
                >
                  EN
                </button>
                <button
                  className={cn('rounded-full px-3 py-2', locale === 'pa' && 'bg-card shadow-sm')}
                  onClick={() => setSettings((value) => ({ ...value, locale: 'pa' }))}
                  type="button"
                >
                  ਪੰ
                </button>
              </div>
            </div>

            <div className="mb-7 grid grid-cols-2 rounded-2xl bg-secondary p-1">
              <button
                className={cn('rounded-xl px-3 py-3 text-sm font-semibold', accountMode === 'login' && 'bg-card shadow-sm')}
                onClick={() => {
                  setAccountMode('login');
                  setAccountError('');
                }}
                type="button"
              >
                {tr('Sign in', 'ਸਾਈਨ ਇਨ')}
              </button>
              <button
                className={cn('rounded-xl px-3 py-3 text-sm font-semibold', accountMode === 'register' && 'bg-card shadow-sm')}
                onClick={() => {
                  setAccountMode('register');
                  setAccountError('');
                }}
                type="button"
              >
                {tr('Create account', 'ਖਾਤਾ ਬਣਾਓ')}
              </button>
            </div>

            <form className="grid gap-5" onSubmit={submitAccount}>
              {accountMode === 'register' && (
                <label className="grid gap-2">
                  <span className="field-label">{tr('Your name', 'ਤੁਹਾਡਾ ਨਾਮ')}</span>
                  <input
                    autoComplete="name"
                    className="text-input"
                    maxLength={48}
                    onChange={(event) => setAccountDisplayName(event.target.value)}
                    placeholder={tr('e.g. Gurpreet Singh', 'ਜਿਵੇਂ ਗੁਰਪ੍ਰੀਤ ਸਿੰਘ')}
                    required
                    value={accountDisplayName}
                  />
                </label>
              )}
              <label className="grid gap-2">
                <span className="field-label">{tr('Username', 'ਯੂਜ਼ਰਨੇਮ')}</span>
                <input
                  autoCapitalize="none"
                  autoComplete="username"
                  className="text-input"
                  maxLength={24}
                  minLength={3}
                  onChange={(event) =>
                    setAccountUsername(
                      event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                    )
                  }
                  pattern="[a-z0-9_]{3,24}"
                  placeholder="gurpreet_ji"
                  required
                  spellCheck={false}
                  value={accountUsername}
                />
              </label>
              <label className="grid gap-2">
                <span className="field-label">{tr('Password', 'ਪਾਸਵਰਡ')}</span>
                <input
                  autoComplete={accountMode === 'login' ? 'current-password' : 'new-password'}
                  className="text-input"
                  maxLength={128}
                  minLength={accountMode === 'register' ? 8 : undefined}
                  onChange={(event) => setAccountPassword(event.target.value)}
                  placeholder={accountMode === 'register' ? tr('8 or more characters', '8 ਜਾਂ ਵੱਧ ਅੱਖਰ') : '••••••••'}
                  required
                  type="password"
                  value={accountPassword}
                />
              </label>

              {accountMode === 'register' && (
                <label className="flex items-start gap-3 rounded-2xl bg-secondary/65 p-4 text-sm leading-5">
                  <input
                    checked={claimLocalPractice}
                    className="mt-0.5 size-4 accent-[color:var(--saffron)]"
                    onChange={(event) => setClaimLocalPractice(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    {tr(
                      'Keep Jaap already counted on this device.',
                      'ਇਸ ਡਿਵਾਈਸ ਉੱਤੇ ਪਹਿਲਾਂ ਕੀਤਾ ਜਾਪ ਰੱਖੋ।',
                    )}
                  </span>
                </label>
              )}

              {accountError && (
                <p className="rounded-2xl bg-[#f8e8e3] px-4 py-3 text-sm text-[#804735]" role="alert">
                  {accountError}
                </p>
              )}

              <button
                className="primary-action w-full"
                disabled={
                  accountLoading ||
                  accountUsername.length < 3 ||
                  !accountPassword ||
                  (accountMode === 'register' && accountDisplayName.trim().length < 2)
                }
                type="submit"
              >
                <UserRoundCheck aria-hidden="true" />
                {accountLoading
                  ? tr('Please wait…', 'ਕਿਰਪਾ ਕਰਕੇ ਉਡੀਕੋ…')
                  : accountMode === 'login'
                    ? tr('Sign in securely', 'ਸੁਰੱਖਿਅਤ ਸਾਈਨ ਇਨ')
                    : tr('Create my free account', 'ਮੇਰਾ ਮੁਫ਼ਤ ਖਾਤਾ ਬਣਾਓ')}
              </button>
            </form>

            <p className="mt-5 text-center text-xs font-medium text-muted-foreground">
              {tr(
                'Always free · No subscription · Account works on this device even if the account server is unavailable',
                'ਹਮੇਸ਼ਾ ਮੁਫ਼ਤ · ਕੋਈ ਸਬਸਕ੍ਰਿਪਸ਼ਨ ਨਹੀਂ · ਖਾਤਾ ਸਰਵਰ ਉਪਲਬਧ ਨਾ ਹੋਵੇ ਤਾਂ ਵੀ ਇਸ ਡਿਵਾਈਸ ਉੱਤੇ ਖਾਤਾ ਕੰਮ ਕਰਦਾ ਹੈ',
              )}
            </p>
          </section>
        </div>
      </main>
    );
  }

  if (activeFocus) {
    return (
      <main
        className={cn(
          'focus-screen min-h-dvh overflow-hidden bg-primary text-primary-foreground',
          focusMode === 'paced' && settings.visualPulse && !paused && 'paced-active',
        )}
        style={{ '--pace': String(focusPace) + 's' } as React.CSSProperties}
      >
        <div className="focus-orbit" aria-hidden="true" />
        <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-10">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full border border-white/15 bg-white/10 text-2xl">
              🪯
            </span>
            <div>
              <p className="font-semibold">Sehaj Jaap</p>
              <p className="text-xs text-white/55">
                {pacedAuto
                  ? tr('Auto count active', 'ਆਟੋ ਗਿਣਤੀ ਚਾਲੂ ਹੈ')
                  : tr('Focus session', 'ਧਿਆਨ ਸੈਸ਼ਨ')}
              </p>
            </div>
          </div>
          <button
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/75 hover:bg-white/10"
            onClick={completeFocus}
            type="button"
          >
            {tr('End', 'ਸਮਾਪਤ')}
          </button>
        </header>

        <section className="relative z-10 mx-auto flex min-h-[calc(100dvh-96px)] w-full max-w-3xl flex-col items-center justify-center px-5 pb-10 text-center">
          <p className="font-gurmukhi text-[clamp(2.6rem,8vw,5.2rem)] font-semibold text-[color:var(--gold-light)]">
            ਵਾਹਿਗੁਰੂ
          </p>
          <p className="mt-5 text-sm font-medium tracking-[.16em] text-white/50 uppercase">
            {timedFocus
              ? tr('Time remaining', 'ਬਾਕੀ ਸਮਾਂ')
              : tr('Time in Simran', 'ਸਿਮਰਨ ਦਾ ਸਮਾਂ')}
          </p>
          <p className="mt-2 text-[clamp(2.4rem,7vw,4.8rem)] font-light tabular-nums">
            {formatClock(focusRemaining)}
          </p>

          <button
            aria-label={tr('Tap to count', 'ਗਿਣਤੀ ਲਈ ਟੈਪ ਕਰੋ')}
            className={cn(
              'focus-count my-8 grid aspect-square w-[min(68vw,330px)] place-items-center rounded-full',
              tapPulse && 'tap-pulse',
            )}
            disabled={paused || pacedAuto}
            onClick={() => increment(1)}
            type="button"
          >
            <span>
              <span className="block text-[clamp(4.8rem,15vw,8.8rem)] font-semibold leading-none tracking-[-.07em] tabular-nums">
                {formatNumber(sessionCount)}
              </span>
              <span className="mt-3 block text-xs font-semibold tracking-[.18em] text-white/55 uppercase">
                {pacedAuto
                  ? tr('Auto count', 'ਆਟੋ ਗਿਣਤੀ')
                  : tr('Tap to count', 'ਗਿਣਤੀ ਲਈ ਟੈਪ ਕਰੋ')}
              </span>
            </span>
          </button>

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-base text-white/75">
            <span>
              {Math.floor(sessionCount / settings.malaSize)} {tr('Mala', 'ਮਾਲਾ')}
            </span>
            <span className="text-[color:var(--gold-light)]">ੴ</span>
            <span>
              {sessionCount % settings.malaSize} {tr('Jaap', 'ਜਾਪ')}
            </span>
            {targetedFocus && (
              <>
                <span className="text-[color:var(--gold-light)]">ੴ</span>
                <span>
                  {formatNumber(sessionCount)} / {formatNumber(focusTarget)}
                </span>
              </>
            )}
          </div>
          {(targetedFocus || timedFocus) && (
            <div className="mt-6 h-2.5 w-full max-w-md overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[color:var(--gold-light)] transition-[width] duration-300"
                style={{ width: String(focusProgress) + '%' }}
              />
            </div>
          )}

          <div className="mt-9 grid w-full max-w-md grid-cols-2 gap-3">
            <button
              className="focus-control"
              onClick={toggleFocusPause}
              type="button"
            >
              {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
              {paused ? tr('Resume', 'ਜਾਰੀ ਰੱਖੋ') : tr('Pause', 'ਠਹਿਰਾਓ')}
            </button>
            <button className="focus-control" onClick={completeFocus} type="button">
              <Square aria-hidden="true" />
              {tr('End session', 'ਸੈਸ਼ਨ ਸਮਾਪਤ ਕਰੋ')}
            </button>
          </div>
        </section>
      </main>
    );
  }

  const pageTitle =
    activeView === 'jaap'
      ? tr('A quiet moment for Simran', 'ਸਿਮਰਨ ਲਈ ਇੱਕ ਸ਼ਾਂਤ ਪਲ')
      : activeView === 'sangat'
        ? tr('Practice together, gently', 'ਮਿਲ ਕੇ ਸਹਿਜ ਨਾਲ ਅਭਿਆਸ ਕਰੋ')
        : activeView === 'focus'
          ? tr('Create a focused session', 'ਧਿਆਨ ਵਾਲਾ ਸੈਸ਼ਨ ਬਣਾਓ')
          : activeView === 'progress'
            ? tr('Your practice, over time', 'ਸਮੇਂ ਦੇ ਨਾਲ ਤੁਹਾਡਾ ਅਭਿਆਸ')
            : activeView === 'summary'
              ? tr('Session complete', 'ਸੈਸ਼ਨ ਪੂਰਾ ਹੋਇਆ')
              : tr('Settings & comfort', 'ਸੈਟਿੰਗਾਂ ਅਤੇ ਸਹੂਲਤ');

  const navigationContent = (mobile = false) => (
    <>
      <button
        className="flex items-center gap-3 rounded-2xl px-2 pr-10 text-left"
        onClick={() => {
          setActiveView('jaap');
          if (mobile) setMobileMenuOpen(false);
        }}
        type="button"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-2xl text-primary-foreground shadow-[0_8px_24px_rgba(23,50,77,.18)]">
          🪯
        </span>
        <span>
          <span className="block font-heading text-[1.12rem] font-semibold tracking-[-.02em]">
            Sehaj Jaap
          </span>
          <span className="block text-xs text-muted-foreground">ਸਹਿਜ ਜਾਪ</span>
        </span>
      </button>

      <nav aria-label={mobile ? 'Mobile menu' : 'Primary'} className="mt-12 grid gap-2">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={cn(
              'flex min-h-12 items-center gap-3 rounded-2xl px-4 text-left text-[.94rem] font-medium transition',
              activeView === id || (activeView === 'summary' && id === 'jaap')
                ? 'bg-primary text-primary-foreground shadow-[0_10px_24px_rgba(23,50,77,.12)]'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
            onClick={() => {
              setActiveView(id);
              if (mobile) setMobileMenuOpen(false);
            }}
            type="button"
          >
            <Icon aria-hidden="true" className="size-[19px]" strokeWidth={1.8} />
            {label}
          </button>
        ))}
      </nav>

      <Panel className="mt-auto rounded-[22px] p-4 shadow-none">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true" className="text-lg">🪯</span>
          {tr(
            String(currentStreak) + ' day practice streak',
            String(currentStreak) + ' ਦਿਨਾਂ ਦੀ ਲਗਾਤਾਰ ਸਾਧਨਾ',
          )}
        </div>
        <div className="grid grid-cols-7 gap-1.5" aria-label="Seven day practice">
          {recentDays.map((day) => (
            <span
              key={day.key}
              className={cn(
                'grid aspect-square place-items-center rounded-full text-[10px]',
                day.record.jaap >= settings.streakMinimum
                  ? 'bg-[color:var(--mist)] text-primary'
                  : 'bg-secondary text-muted-foreground',
              )}
            >
              {day.record.jaap >= settings.streakMinimum ? 'ੴ' : '·'}
            </span>
          ))}
        </div>
      </Panel>
    </>
  );

  return (
    <main
      className={cn(
        'heritage-shell min-h-dvh text-foreground',
        settings.simpleMode && 'simple-mode',
      )}
    >
      <aside
        id="desktop-navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-[color:var(--line)] bg-[color:var(--sidebar)]/95 px-5 py-7 shadow-[12px_0_40px_rgba(23,50,77,.04)] backdrop-blur-xl transition-transform duration-300 md:flex',
          settings.sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {navigationContent()}
      </aside>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent
          className="w-[min(88vw,330px)] max-w-none border-[color:var(--line)] bg-[color:var(--sidebar)] px-5 py-7"
          side="left"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{tr('Sehaj Jaap menu', 'ਸਹਿਜ ਜਾਪ ਮੀਨੂ')}</SheetTitle>
            <SheetDescription>
              {tr('Choose a section of the app.', 'ਐਪ ਦਾ ਭਾਗ ਚੁਣੋ।')}
            </SheetDescription>
          </SheetHeader>
          {navigationContent(true)}
        </SheetContent>
      </Sheet>

      <section
        className={cn(
          'min-h-dvh transition-[padding] duration-300',
          settings.sidebarOpen ? 'md:pl-[248px]' : 'md:pl-0',
        )}
      >
        <header className="site-header sticky top-0 z-20 flex min-h-[74px] items-center justify-between gap-3 border-b border-transparent px-4 py-3 sm:px-8 lg:px-12">
          <button
            aria-label={tr('Open navigation', 'ਨੇਵੀਗੇਸ਼ਨ ਖੋਲ੍ਹੋ')}
            className="header-icon-button md:hidden"
            onClick={() => setMobileMenuOpen(true)}
            type="button"
          >
            <Menu aria-hidden="true" className="size-5" />
          </button>
          <button
            className="flex min-w-0 items-center gap-2 md:hidden"
            onClick={() => setActiveView('jaap')}
            type="button"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-lg text-primary-foreground">
              🪯
            </span>
            <span className="mobile-brand-label truncate font-heading font-semibold">Sehaj Jaap</span>
          </button>
          <div className="hidden items-center gap-4 md:flex">
            <button
              aria-controls="desktop-navigation"
              aria-expanded={settings.sidebarOpen}
              aria-label={
                settings.sidebarOpen
                  ? tr('Close sidebar', 'ਸਾਈਡਬਾਰ ਬੰਦ ਕਰੋ')
                  : tr('Open sidebar', 'ਸਾਈਡਬਾਰ ਖੋਲ੍ਹੋ')
              }
              className="header-icon-button"
              onClick={() =>
                setSettings((value) => ({
                  ...value,
                  sidebarOpen: !value.sidebarOpen,
                }))
              }
              type="button"
            >
              {settings.sidebarOpen ? (
                <PanelLeftClose aria-hidden="true" className="size-5" />
              ) : (
                <PanelLeftOpen aria-hidden="true" className="size-5" />
              )}
            </button>
            <p className="text-sm text-muted-foreground">{pageTitle}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span
              className={cn(
                'hidden items-center gap-1.5 rounded-full px-3 py-2 text-xs sm:flex',
                online
                  ? 'bg-[color:var(--mist)] text-primary'
                  : 'bg-secondary text-muted-foreground',
              )}
            >
              {online ? (
                <Wifi aria-hidden="true" className="size-3.5" />
              ) : (
                <WifiOff aria-hidden="true" className="size-3.5" />
              )}
              {online
                ? syncing
                  ? tr('Syncing', 'ਸਿੰਕ ਹੋ ਰਿਹਾ')
                  : tr('Online', 'ਆਨਲਾਈਨ')
                : tr('Counting offline', 'ਆਫਲਾਈਨ ਗਿਣਤੀ')}
            </span>
            <div
              className="flex rounded-full border border-[color:var(--line)] bg-card p-1 text-sm"
              aria-label={tr('Language', 'ਭਾਸ਼ਾ')}
            >
              <button
                onClick={() =>
                  setSettings((value) => ({ ...value, locale: 'en' }))
                }
                className={cn(
                  'rounded-full px-3 py-1.5',
                  locale === 'en'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground',
                )}
                type="button"
              >
                EN
              </button>
              <button
                onClick={() =>
                  setSettings((value) => ({ ...value, locale: 'pa' }))
                }
                className={cn(
                  'rounded-full px-3 py-1.5',
                  locale === 'pa'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground',
                )}
                type="button"
              >
                ਪੰ
              </button>
            </div>
            <button
              aria-label={tr('Profile and settings', 'ਪ੍ਰੋਫ਼ਾਈਲ ਅਤੇ ਸੈਟਿੰਗਾਂ')}
              className="grid size-10 place-items-center rounded-full border border-[color:var(--line)] bg-card text-muted-foreground"
              onClick={() => setActiveView('more')}
              type="button"
            >
              <CircleUserRound aria-hidden="true" className="size-5" strokeWidth={1.7} />
            </button>
          </div>
        </header>

        {activeView === 'jaap' && (
          <div className="mx-auto grid w-full max-w-[1180px] gap-7 px-4 pb-28 pt-2 sm:px-8 md:pb-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:px-12 lg:pt-5">
            <Panel className="counter-panel relative isolate flex min-h-[calc(100dvh-108px)] flex-col items-center overflow-hidden px-5 pb-7 pt-8 sm:min-h-[690px] sm:px-9 sm:pt-10 lg:min-h-[730px]">
              <div aria-hidden="true" className="halo" />
              <div className="relative z-10 text-center">
                <p className="font-gurmukhi text-[clamp(2.4rem,7vw,4.6rem)] font-semibold leading-none tracking-[-.03em] text-primary">
                  ਵਾਹਿਗੁਰੂ
                </p>
                <p className="mt-3 text-sm font-medium tracking-[.12em] text-muted-foreground uppercase">
                  {tr("Today's Jaap", 'ਅੱਜ ਦਾ ਜਾਪ')}
                </p>
              </div>

              <button
                aria-label={
                  tr('Tap to count', 'ਗਿਣਤੀ ਲਈ ਟੈਪ ਕਰੋ') +
                  '. ' +
                  tr('Current count', 'ਮੌਜੂਦਾ ਗਿਣਤੀ') +
                  ' ' +
                  String(todayCount)
                }
                className={cn(
                  'count-button relative z-10 my-auto grid aspect-square w-[min(75vw,370px)] place-items-center rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--gold)]/45 active:scale-[.985]',
                  tapPulse && 'tap-pulse',
                )}
                disabled={paused}
                onClick={() => increment(1)}
                type="button"
              >
                <span className="absolute inset-3 rounded-full border border-white/70" />
                <span className="flex flex-col items-center">
                  <span aria-live="polite" className="count-number tabular-nums">
                    {formatNumber(todayCount)}
                  </span>
                  <span className="mt-2 text-sm font-semibold tracking-[.16em] text-primary/65 uppercase">
                    {paused
                      ? tr('Paused', 'ਰੁਕਿਆ ਹੋਇਆ')
                      : tr('Tap to count', 'ਗਿਣਤੀ ਲਈ ਟੈਪ ਕਰੋ')}
                  </span>
                </span>
              </button>

              <div className="relative z-10 w-full max-w-[570px]">
                <div className="mb-4 flex items-center justify-center gap-3 text-[clamp(1rem,2vw,1.15rem)] font-medium text-primary">
                  <span>
                    {malas} {tr('Mala', 'ਮਾਲਾ')}
                  </span>
                  <span className="text-[color:var(--gold)]">ੴ</span>
                  <span>
                    {remainder} {tr('Jaap', 'ਜਾਪ')}
                  </span>
                </div>
                {!settings.simpleMode && (
                  <>
                    <div className="counter-shortcuts grid gap-2">
                      {[1, 5, 10].map((amount) => (
                        <button
                          key={amount}
                          onClick={() => increment(amount)}
                          className="secondary-control"
                          disabled={paused}
                          type="button"
                        >
                          +{amount}
                        </button>
                      ))}
                      <button
                        onClick={() => setCustomOpen(true)}
                        className="secondary-control"
                        disabled={paused}
                        type="button"
                      >
                        {tr('Custom', 'ਆਪਣੀ')}
                      </button>
                      <button
                        onClick={undo}
                        disabled={!incrementStack.length || paused}
                        className="secondary-control disabled:opacity-40"
                        type="button"
                        aria-label={tr('Undo last count', 'ਪਿਛਲੀ ਗਿਣਤੀ ਵਾਪਸ ਲਵੋ')}
                      >
                        <RotateCcw aria-hidden="true" className="size-4" />
                      </button>
                    </div>
                    <div className="counter-actions mt-3 grid grid-cols-3 gap-2">
                      <button
                        className="secondary-control gap-2"
                        onClick={() => setPaused((value) => !value)}
                        type="button"
                      >
                        {paused ? (
                          <Play aria-hidden="true" className="size-4" />
                        ) : (
                          <Pause aria-hidden="true" className="size-4" />
                        )}
                        {paused
                          ? tr('Resume', 'ਜਾਰੀ ਰੱਖੋ')
                          : tr('Pause', 'ਠਹਿਰਾਓ')}
                      </button>
                      <button
                        className="secondary-control gap-2"
                        onClick={() => saveManual(false)}
                        type="button"
                      >
                        <Save aria-hidden="true" className="size-4" />
                        {tr('Save', 'ਸੰਭਾਲੋ')}
                      </button>
                      <button
                        className="secondary-control gap-2"
                        onClick={() => saveManual(true)}
                        type="button"
                      >
                        <Square aria-hidden="true" className="size-4" />
                        {tr('End', 'ਸਮਾਪਤ')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </Panel>

            <aside className="grid content-start gap-5 lg:pt-5">
              <Panel className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {tr('Daily goal', 'ਰੋਜ਼ਾਨਾ ਟੀਚਾ')}
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-[-.03em]">
                      {formatNumber(todayCount)}{' '}
                      <span className="text-base font-normal text-muted-foreground">
                        / {formatNumber(settings.dailyGoal)}
                      </span>
                    </p>
                  </div>
                  <div className="progress-ring" style={progressStyle}>
                    <span>{progress}%</span>
                  </div>
                </div>
                <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-[color:var(--saffron)] transition-[width] duration-300"
                    style={{ width: String(progress) + '%' }}
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {formatNumber(Math.max(0, settings.dailyGoal - todayCount))}{' '}
                  {tr('remaining', 'ਬਾਕੀ')}
                </p>
              </Panel>

              <button
                aria-label={tr('Open focus setup', 'ਧਿਆਨ ਸੈਟਅੱਪ ਖੋਲ੍ਹੋ')}
                className="group flex min-h-24 items-center justify-between rounded-[26px] bg-primary px-6 text-left text-primary-foreground shadow-[0_18px_38px_rgba(23,50,77,.16)] transition hover:-translate-y-0.5"
                onClick={() => setActiveView('focus')}
                type="button"
              >
                <span>
                  <span className="block text-xs tracking-[.14em] text-white/60 uppercase">
                    {tr('Focus mode', 'ਧਿਆਨ ਮੋਡ')}
                  </span>
                  <span className="mt-1 block text-lg font-semibold">
                    {tr('Begin a session', 'ਸੈਸ਼ਨ ਸ਼ੁਰੂ ਕਰੋ')}
                  </span>
                </span>
                <span className="grid size-11 place-items-center rounded-full bg-white/10 transition group-hover:bg-white/15">
                  <span aria-hidden="true" className="text-xl">ੴ</span>
                </span>
              </button>

              <Panel className="media-panel group overflow-hidden">
                <div className="relative h-36">
                  <Image
                    alt="Golden Temple reflected in the sarovar"
                    className="heritage-card-image object-cover"
                    fill
                    sizes="(max-width: 1024px) 100vw, 300px"
                    src="/golden-temple.jpg"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#12333b]/75 via-[#12333b]/10 to-transparent" />
                  <p className="absolute bottom-4 left-5 text-sm font-semibold text-white">
                    {membership
                      ? membership.groupName
                      : tr('Create your family Sangat', 'ਆਪਣੀ ਪਰਿਵਾਰਕ ਸੰਗਤ ਬਣਾਓ')}
                  </p>
                </div>
                <button
                  className="flex min-h-14 w-full items-center justify-between px-5 text-left text-sm font-semibold"
                  onClick={() => setActiveView('sangat')}
                  type="button"
                >
                  {tr('Practice together online', 'ਆਨਲਾਈਨ ਮਿਲ ਕੇ ਅਭਿਆਸ ਕਰੋ')}
                  <ChevronRight aria-hidden="true" className="size-4" />
                </button>
              </Panel>
            </aside>
          </div>
        )}

        {activeView === 'focus' && (
          <div className="mx-auto grid w-full max-w-[1120px] gap-6 px-4 pb-28 pt-3 sm:px-8 md:pb-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-12">
            <Panel className="p-6 sm:p-8 lg:p-10">
              <div className="mb-8">
                <p className="eyebrow">{tr('Focus mode', 'ਧਿਆਨ ਮੋਡ')}</p>
                <h1 className="page-heading">
                  {tr('Choose how you want to practise', 'ਆਪਣਾ ਅਭਿਆਸ ਚੁਣੋ')}
                </h1>
                <p className="mt-3 max-w-xl text-muted-foreground">
                  {tr(
                    'Navigation disappears during the session so only your Jaap, time, and progress remain.',
                    'ਸੈਸ਼ਨ ਦੌਰਾਨ ਨੇਵੀਗੇਸ਼ਨ ਲੁਕ ਜਾਂਦੀ ਹੈ ਤਾਂ ਜੋ ਸਿਰਫ਼ ਜਾਪ, ਸਮਾਂ ਅਤੇ ਪ੍ਰਗਤੀ ਰਹੇ।',
                  )}
                </p>
              </div>

              <Tabs
                value={focusMode}
                onValueChange={(value) => setFocusMode(value as FocusMode)}
              >
                <TabsList className="focus-tabs h-auto w-full gap-2 bg-transparent p-0">
                  <TabsTrigger value="timer">{tr('Timer', 'ਟਾਈਮਰ')}</TabsTrigger>
                  <TabsTrigger value="target">{tr('Count goal', 'ਗਿਣਤੀ ਟੀਚਾ')}</TabsTrigger>
                  <TabsTrigger value="both">{tr('Timer + goal', 'ਟਾਈਮਰ + ਟੀਚਾ')}</TabsTrigger>
                  <TabsTrigger value="paced">{tr('Paced Jaap', 'ਰਫ਼ਤਾਰ ਵਾਲਾ ਜਾਪ')}</TabsTrigger>
                </TabsList>
              </Tabs>

              {(focusMode === 'timer' || focusMode === 'both') && (
                <div className="mt-8">
                  <p className="field-label">{tr('Session length', 'ਸੈਸ਼ਨ ਦਾ ਸਮਾਂ')}</p>
                  <div className="choice-grid">
                    {[5, 10, 15, 20, 30, 45, 60].map((minutes) => (
                      <button
                        key={minutes}
                        className={cn('choice-chip', focusMinutes === minutes && 'selected')}
                        onClick={() => setFocusMinutes(minutes)}
                        type="button"
                      >
                        {minutes} {tr('min', 'ਮਿੰਟ')}
                      </button>
                    ))}
                  </div>
                  <label className="mt-3 flex items-center justify-between gap-4 rounded-2xl bg-secondary/60 px-4 py-3">
                    <span className="text-sm font-medium">
                      {tr('Custom minutes', 'ਆਪਣੇ ਮਿੰਟ')}
                    </span>
                    <input
                      aria-label={tr('Custom focus minutes', 'ਆਪਣੇ ਧਿਆਨ ਦੇ ਮਿੰਟ')}
                      className="setting-number"
                      max={240}
                      min={1}
                      onChange={(event) =>
                        setFocusMinutes(
                          Math.min(240, Math.max(1, Number(event.target.value))),
                        )
                      }
                      type="number"
                      value={focusMinutes}
                    />
                  </label>
                </div>
              )}

              {(focusMode === 'target' || focusMode === 'both') && (
                <div className="mt-8">
                  <p className="field-label">{tr('Jaap target', 'ਜਾਪ ਟੀਚਾ')}</p>
                  <div className="choice-grid">
                    {[108, 216, 500, 1000, 2500].map((target) => (
                      <button
                        key={target}
                        className={cn('choice-chip', focusTarget === target && 'selected')}
                        onClick={() => setFocusTarget(target)}
                        type="button"
                      >
                        {formatNumber(target)}
                      </button>
                    ))}
                  </div>
                  <label className="mt-3 flex items-center justify-between gap-4 rounded-2xl bg-secondary/60 px-4 py-3">
                    <span className="text-sm font-medium">
                      {tr('Custom target', 'ਆਪਣਾ ਟੀਚਾ')}
                    </span>
                    <input
                      aria-label={tr('Custom Jaap target', 'ਆਪਣਾ ਜਾਪ ਟੀਚਾ')}
                      className="setting-number"
                      max={10000000}
                      min={1}
                      onChange={(event) =>
                        setFocusTarget(
                          Math.min(
                            10000000,
                            Math.max(1, Number(event.target.value)),
                          ),
                        )
                      }
                      type="number"
                      value={focusTarget}
                    />
                  </label>
                </div>
              )}

              {focusMode === 'paced' && (
                <>
                  <div className="mt-8">
                    <p className="field-label">{tr('One Jaap every', 'ਹਰ ਜਾਪ ਲਈ')}</p>
                    <div className="choice-grid">
                      {[1, 2, 3, 5].map((pace) => (
                        <button
                          key={pace}
                          className={cn('choice-chip', focusPace === pace && 'selected')}
                          onClick={() => setFocusPace(pace)}
                          type="button"
                        >
                          {pace} {tr('sec', 'ਸਕਿੰਟ')}
                        </button>
                      ))}
                    </div>
                    <label className="mt-3 flex items-center justify-between gap-4 rounded-2xl bg-secondary/60 px-4 py-3">
                      <span className="text-sm font-medium">
                        {tr('Custom seconds', 'ਆਪਣੇ ਸਕਿੰਟ')}
                      </span>
                      <input
                        aria-label={tr('Custom pace seconds', 'ਆਪਣੀ ਰਫ਼ਤਾਰ ਦੇ ਸਕਿੰਟ')}
                        className="setting-number"
                        max={60}
                        min={1}
                        onChange={(event) =>
                          setFocusPace(
                            Math.min(60, Math.max(1, Number(event.target.value))),
                          )
                        }
                        type="number"
                        value={focusPace}
                      />
                    </label>
                  </div>
                  <div className="mt-8 grid gap-3 sm:grid-cols-2">
                    <button
                      className={cn('mode-card', !pacedAuto && 'selected')}
                      onClick={() => setPacedAuto(false)}
                      type="button"
                    >
                      <MousePointerClick aria-hidden="true" />
                      <span>
                        <strong>{tr('Guided mode', 'ਗਾਈਡਡ ਮੋਡ')}</strong>
                        <small>
                          {tr('A gentle pulse; you tap', 'ਹੌਲੀ ਧੜਕਣ; ਤੁਸੀਂ ਟੈਪ ਕਰੋ')}
                        </small>
                      </span>
                    </button>
                    <button
                      className={cn('mode-card', pacedAuto && 'selected')}
                      onClick={() => setPacedAuto(true)}
                      type="button"
                    >
                      <Clock3 aria-hidden="true" />
                      <span>
                        <strong>{tr('Auto count', 'ਆਟੋ ਗਿਣਤੀ')}</strong>
                        <small>
                          {tr('Counts at your chosen pace', 'ਚੁਣੀ ਰਫ਼ਤਾਰ ਨਾਲ ਗਿਣਦਾ ਹੈ')}
                        </small>
                      </span>
                    </button>
                  </div>
                </>
              )}

              <button
                className="primary-action mt-10 w-full sm:w-auto"
                onClick={startFocus}
                type="button"
              >
                <Play aria-hidden="true" className="size-5" />
                {tr('Start focus session', 'ਧਿਆਨ ਸੈਸ਼ਨ ਸ਼ੁਰੂ ਕਰੋ')}
              </button>
            </Panel>

            <Panel className="media-panel group overflow-hidden">
              <div className="relative min-h-[430px]">
                <Image
                  alt="Historic painting of Guru Nanak"
                  className="heritage-card-image object-cover object-top"
                  fill
                  sizes="(max-width: 1024px) 100vw, 340px"
                  src="/guru-nanak-historic.jpg"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#102f38] via-[#102f38]/25 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-7 text-white">
                  <span className="mb-3 block text-2xl text-[color:var(--gold-light)]">ੴ</span>
                  <p className="font-gurmukhi text-3xl font-semibold">ਵਾਹਿਗੁਰੂ</p>
                  <p className="mt-2 text-sm leading-6 text-white/72">
                    {tr(
                      'Let the pace support attention, never rush it.',
                      'ਰਫ਼ਤਾਰ ਧਿਆਨ ਨੂੰ ਸਹਾਰਾ ਦੇਵੇ, ਕਦੇ ਜਲਦੀ ਨਾ ਕਰੇ।',
                    )}
                  </p>
                </div>
              </div>
              <p className="px-5 py-3 text-[11px] leading-4 text-muted-foreground">
                {tr(
                  'Historic Guru Nanak artwork, unknown artist, c. 1800–1840. ',
                  'ਗੁਰੂ ਨਾਨਕ ਜੀ ਦੀ ਇਤਿਹਾਸਕ ਕਲਾ, ਅਣਜਾਣ ਕਲਾਕਾਰ, ਲਗਭਗ 1800–1840। ',
                )}
                <a
                  className="underline decoration-current/30 underline-offset-2 hover:text-foreground"
                  href="https://commons.wikimedia.org/wiki/File:Guru_Nanak_(the_first_Sikh_Guru),_from_a_series_of_painting_of_the_first_nine_Sikh_gurus,_circa_1800%E2%80%931840.jpg"
                  rel="noreferrer"
                  target="_blank"
                >
                  {tr('Public domain source.', 'ਪਬਲਿਕ ਡੋਮੇਨ ਸਰੋਤ।')}
                </a>
              </p>
            </Panel>
          </div>
        )}

        {activeView === 'sangat' && (
          <div className="mx-auto w-full max-w-[1120px] px-4 pb-28 pt-3 sm:px-8 md:pb-12 lg:px-12">
            {!membership ? (
              <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
                <Panel className="media-panel group overflow-hidden">
                  <div className="relative min-h-[310px] lg:min-h-[620px]">
                    <Image
                      alt="Golden Temple and sarovar"
                      className="heritage-card-image object-cover"
                      fill
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      src="/golden-temple.jpg"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0e3039]/90 via-[#0e3039]/30 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-7 text-white sm:p-9">
                      <span className="text-3xl" aria-hidden="true">🪯</span>
                      <h1 className="mt-4 font-heading text-3xl font-semibold sm:text-4xl">
                        {tr('Jaap grows in Sangat', 'ਸੰਗਤ ਵਿੱਚ ਜਾਪ ਵਧਦਾ ਹੈ')}
                      </h1>
                      <p className="mt-3 max-w-md leading-7 text-white/75">
                        {tr(
                          'Create a private group, share one invite link, and let family or friends add to a peaceful collective goal from anywhere.',
                          'ਇੱਕ ਨਿੱਜੀ ਗਰੁੱਪ ਬਣਾਓ, ਇੱਕ ਸੱਦਾ ਲਿੰਕ ਸਾਂਝਾ ਕਰੋ ਅਤੇ ਪਰਿਵਾਰ ਜਾਂ ਦੋਸਤਾਂ ਨੂੰ ਕਿਤੇ ਤੋਂ ਵੀ ਸਾਂਝੇ ਟੀਚੇ ਵਿੱਚ ਜੋੜੋ।',
                        )}
                      </p>
                    </div>
                  </div>
                  <p className="px-5 py-3 text-[11px] text-muted-foreground">
                    {tr('Golden Temple image: ', 'ਸ੍ਰੀ ਹਰਿਮੰਦਰ ਸਾਹਿਬ ਤਸਵੀਰ: ')}
                    <a
                      className="underline decoration-current/30 underline-offset-2 hover:text-foreground"
                      href="https://commons.wikimedia.org/wiki/File:Golden_Temple_.jpg"
                      rel="noreferrer"
                      target="_blank"
                    >
                      Jasdeep Singh / Wikimedia Commons, CC0
                    </a>
                    .
                  </p>
                </Panel>

                <Panel className="p-6 sm:p-8 lg:p-10">
                  <p className="eyebrow">{tr('Online Sangat', 'ਆਨਲਾਈਨ ਸੰਗਤ')}</p>
                  <h2 className="page-heading">
                    {groupData && groupMode === 'join'
                      ? tr('Join ', 'ਸ਼ਾਮਲ ਹੋਵੋ: ') + groupData.name
                      : tr('Begin together', 'ਮਿਲ ਕੇ ਸ਼ੁਰੂ ਕਰੋ')}
                  </h2>
                  <p className="mt-3 text-muted-foreground">
                    {tr(
                      'Signed in as @' + account.username + '. Every Sangat member joins with their own free account.',
                      '@' + account.username + ' ਵਜੋਂ ਸਾਈਨ ਇਨ ਹੈ। ਹਰ ਸੰਗਤ ਮੈਂਬਰ ਆਪਣੇ ਮੁਫ਼ਤ ਖਾਤੇ ਨਾਲ ਜੁੜਦਾ ਹੈ।',
                    )}
                  </p>

                  <Tabs
                    className="mt-7"
                    value={groupMode}
                    onValueChange={(value) => setGroupMode(value as 'join' | 'create')}
                  >
                    <TabsList className="h-11 w-full rounded-2xl bg-secondary p-1">
                      <TabsTrigger className="rounded-xl" value="join">
                        <Link2 aria-hidden="true" />
                        {tr('Join with link', 'ਲਿੰਕ ਨਾਲ ਜੁੜੋ')}
                      </TabsTrigger>
                      <TabsTrigger className="rounded-xl" value="create">
                        <UsersRound aria-hidden="true" />
                        {tr('Create Sangat', 'ਸੰਗਤ ਬਣਾਓ')}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <form className="mt-7 grid gap-5" onSubmit={submitSangat}>
                    {groupMode === 'create' ? (
                      <>
                        <label className="grid gap-2">
                          <span className="field-label">{tr('Sangat name', 'ਸੰਗਤ ਦਾ ਨਾਮ')}</span>
                          <input
                            className="text-input"
                            maxLength={64}
                            onChange={(event) => setGroupName(event.target.value)}
                            placeholder="Family Sangat"
                            required
                            value={groupName}
                          />
                        </label>
                        <label className="grid gap-2">
                          <span className="field-label">{tr('Daily collective goal', 'ਰੋਜ਼ਾਨਾ ਸਾਂਝਾ ਟੀਚਾ')}</span>
                          <input
                            className="text-input"
                            list="sangat-goal-options"
                            max={10000000}
                            min={108}
                            onChange={(event) => setGroupGoal(Number(event.target.value))}
                            type="number"
                            value={groupGoal}
                          />
                          <datalist id="sangat-goal-options">
                            {[1000, 5000, 10000, 50000, 100000].map((goal) => (
                              <option key={goal} value={goal}>{goal}</option>
                            ))}
                          </datalist>
                        </label>
                      </>
                    ) : (
                      <label className="grid gap-2">
                        <span className="field-label">{tr('Invite code', 'ਸੱਦਾ ਕੋਡ')}</span>
                        <input
                          className="text-input tracking-[.12em] uppercase"
                          maxLength={12}
                          onChange={(event) =>
                            setInviteInput(
                              event.target.value
                                .toUpperCase()
                                .replace(/[^A-Z2-9]/g, '')
                                .slice(0, 12),
                            )
                          }
                          placeholder="ABCD2345EFGH"
                          required
                          value={inviteInput}
                        />
                      </label>
                    )}

                    <label className="grid gap-2">
                      <span className="field-label">{tr('Activity privacy', 'ਸਰਗਰਮੀ ਦੀ ਨਿੱਜਤਾ')}</span>
                      <NativeSelect
                        className="w-full"
                        value={privacy}
                        onChange={(event) => setPrivacy(event.target.value as Privacy)}
                      >
                        <NativeSelectOption value="exact">
                          {tr('Show my exact count', 'ਮੇਰੀ ਪੂਰੀ ਗਿਣਤੀ ਦਿਖਾਓ')}
                        </NativeSelectOption>
                        <NativeSelectOption value="practiced">
                          {tr('Show only that I practised', 'ਸਿਰਫ਼ ਅਭਿਆਸ ਕੀਤਾ ਦਿਖਾਓ')}
                        </NativeSelectOption>
                        <NativeSelectOption value="private">
                          {tr('Keep my activity private', 'ਮੇਰੀ ਸਰਗਰਮੀ ਨਿੱਜੀ ਰੱਖੋ')}
                        </NativeSelectOption>
                      </NativeSelect>
                    </label>

                    {groupError && (
                      <p className="rounded-2xl bg-[#f8e8e3] px-4 py-3 text-sm text-[#804735]" role="alert">
                        {groupError}
                      </p>
                    )}
                    <button
                      className="primary-action w-full"
                      disabled={
                        groupLoading ||
                        (groupMode === 'join' && inviteInput.length !== 12)
                      }
                      type="submit"
                    >
                      {groupMode === 'join' ? (
                        <UserPlus aria-hidden="true" />
                      ) : (
                        <UsersRound aria-hidden="true" />
                      )}
                      {groupLoading
                        ? tr('Please wait…', 'ਕਿਰਪਾ ਕਰਕੇ ਉਡੀਕੋ…')
                        : groupMode === 'join'
                          ? tr('Join Sangat', 'ਸੰਗਤ ਵਿੱਚ ਜੁੜੋ')
                          : tr('Create and get link', 'ਬਣਾਓ ਅਤੇ ਲਿੰਕ ਲਵੋ')}
                    </button>
                  </form>
                </Panel>
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_360px]">
                <div className="grid gap-6">
                  <Panel className="media-panel group overflow-hidden">
                    <div className="relative min-h-[300px]">
                      <Image
                        alt="Golden Temple and sarovar"
                        className="heritage-card-image object-cover"
                        fill
                        sizes="(max-width: 1024px) 100vw, 65vw"
                        src="/golden-temple.jpg"
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-[#102f38]/95 via-[#102f38]/75 to-[#102f38]/15" />
                      <div className="relative z-10 flex min-h-[300px] max-w-lg flex-col justify-center p-7 text-white sm:p-10">
                        <span className="text-3xl" aria-hidden="true">🪯</span>
                        <p className="mt-5 text-sm tracking-[.14em] text-white/55 uppercase">
                          {tr("Today's Sangat Jaap", 'ਅੱਜ ਦਾ ਸੰਗਤ ਜਾਪ')}
                        </p>
                        <h1 className="mt-2 text-[clamp(3rem,8vw,5.2rem)] font-semibold leading-none tracking-[-.06em] tabular-nums">
                          {formatNumber(groupData?.total ?? 0)}
                        </h1>
                        <p className="mt-5 text-sm text-white/70">
                          {groupData?.activeMembers ?? 0}{' '}
                          {tr('members practised today', 'ਮੈਂਬਰਾਂ ਨੇ ਅੱਜ ਅਭਿਆਸ ਕੀਤਾ')}
                        </p>
                      </div>
                    </div>
                  </Panel>

                  <Panel className="p-6 sm:p-8">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                      <div>
                        <p className="eyebrow">{tr('Collective goal', 'ਸਾਂਝਾ ਟੀਚਾ')}</p>
                        <h2 className="text-2xl font-semibold">{membership.groupName}</h2>
                      </div>
                      <p className="text-lg font-semibold">
                        {formatNumber(groupData?.total ?? 0)}
                        <span className="text-sm font-normal text-muted-foreground">
                          {' '}/ {formatNumber(groupData?.dailyGoal ?? 0)}
                        </span>
                      </p>
                    </div>
                    <div className="mt-5 h-3 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-[color:var(--saffron)] transition-[width] duration-500"
                        style={{
                          width:
                            String(
                              Math.min(
                                100,
                                ((groupData?.total ?? 0) /
                                  Math.max(1, groupData?.dailyGoal ?? 1)) *
                                  100,
                              ),
                            ) + '%',
                        }}
                      />
                    </div>
                    <div className="mt-7 grid gap-3 sm:grid-cols-2">
                      <button className="primary-action" onClick={() => void shareInvite()} type="button">
                        <Share2 aria-hidden="true" />
                        {tr('Share invite link', 'ਸੱਦਾ ਲਿੰਕ ਸਾਂਝਾ ਕਰੋ')}
                      </button>
                      <button className="outline-action" onClick={() => void shareInvite(true)} type="button">
                        {shareFeedback.includes('copied') || shareFeedback.includes('ਕਾਪੀ') ? (
                          <Check aria-hidden="true" />
                        ) : (
                          <Copy aria-hidden="true" />
                        )}
                        {tr('Copy link', 'ਲਿੰਕ ਕਾਪੀ ਕਰੋ')}
                      </button>
                    </div>
                    {shareFeedback && (
                      <output className="mt-3 block text-sm text-muted-foreground">
                        {shareFeedback}
                      </output>
                    )}
                    <p className="mt-5 rounded-2xl bg-secondary px-4 py-3 font-mono text-sm tracking-[.13em] text-primary">
                      {membership.code}
                    </p>
                  </Panel>
                </div>

                <div className="grid content-start gap-6">
                  <Panel className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="eyebrow">{tr('Live Sangat', 'ਲਾਈਵ ਸੰਗਤ')}</p>
                        <h2 className="text-xl font-semibold">
                          {groupData?.memberCount ?? 1} {tr('members', 'ਮੈਂਬਰ')}
                        </h2>
                      </div>
                      <span className="flex items-center gap-2 rounded-full bg-[color:var(--mist)] px-3 py-2 text-xs text-primary">
                        <span className="size-2 rounded-full bg-[#5f9e79]" />
                        {tr('Live', 'ਲਾਈਵ')}
                      </span>
                    </div>
                    <div className="mt-6 grid gap-2">
                      {(groupData?.members ?? []).map((member) => (
                        <div
                          key={member.id}
                          className="flex min-h-14 items-center gap-3 rounded-2xl bg-secondary/70 px-4"
                        >
                          <span className="grid size-9 place-items-center rounded-full bg-card text-sm font-semibold text-primary">
                            {member.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {member.name}
                          </span>
                          {member.privacy === 'exact' ? (
                            <span className="text-sm font-semibold tabular-nums">
                              {formatNumber(member.count ?? 0)}
                            </span>
                          ) : member.practiced ? (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <UserRoundCheck aria-hidden="true" className="size-4" />
                              {tr('Practised', 'ਅਭਿਆਸ ਕੀਤਾ')}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      ))}
                      {!groupData?.members.length && (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                          {tr('Share the link to welcome your first member.', 'ਪਹਿਲੇ ਮੈਂਬਰ ਨੂੰ ਸੱਦਾ ਦੇਣ ਲਈ ਲਿੰਕ ਸਾਂਝਾ ਕਰੋ।')}
                        </p>
                      )}
                    </div>
                  </Panel>

                  <Panel className="p-6">
                    <div className="flex items-start gap-3">
                      <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 text-[color:var(--saffron)]" />
                      <div>
                        <p className="font-semibold">{tr('Your privacy', 'ਤੁਹਾਡੀ ਨਿੱਜਤਾ')}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {membership.privacy === 'exact'
                            ? tr('Your exact count is visible to this Sangat.', 'ਤੁਹਾਡੀ ਪੂਰੀ ਗਿਣਤੀ ਇਸ ਸੰਗਤ ਨੂੰ ਦਿਖਾਈ ਦਿੰਦੀ ਹੈ।')
                            : membership.privacy === 'practiced'
                              ? tr('Members only see that you practised.', 'ਮੈਂਬਰ ਸਿਰਫ਼ ਇਹ ਦੇਖਦੇ ਹਨ ਕਿ ਤੁਸੀਂ ਅਭਿਆਸ ਕੀਤਾ।')
                              : tr('Your personal activity stays hidden.', 'ਤੁਹਾਡੀ ਨਿੱਜੀ ਸਰਗਰਮੀ ਲੁਕੀ ਰਹਿੰਦੀ ਹੈ।')}
                        </p>
                      </div>
                    </div>
                  </Panel>
                </div>
              </div>
            )}
          </div>
        )}

        {activeView === 'progress' && (
          <div className="mx-auto w-full max-w-[1120px] px-4 pb-28 pt-3 sm:px-8 md:pb-12 lg:px-12">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">{tr('Progress', 'ਪ੍ਰਗਤੀ')}</p>
                <h1 className="page-heading">{tr('Your steady rhythm', 'ਤੁਹਾਡੀ ਸਹਿਜ ਲੈਅ')}</h1>
              </div>
              <Tabs defaultValue="7days">
                <TabsList className="h-10 rounded-2xl bg-secondary p-1">
                  <TabsTrigger value="today">{tr('Today', 'ਅੱਜ')}</TabsTrigger>
                  <TabsTrigger value="7days">{tr('7 days', '੭ ਦਿਨ')}</TabsTrigger>
                  <TabsTrigger value="month">{tr('Month', 'ਮਹੀਨਾ')}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: tr('7 day Jaap', '੭ ਦਿਨਾਂ ਦਾ ਜਾਪ'), value: formatNumber(weekTotal), icon: MousePointerClick },
                { label: tr('Mala', 'ਮਾਲਾ'), value: formatNumber(Math.floor(weekTotal / settings.malaSize)), icon: Target },
                { label: tr('Current streak', 'ਮੌਜੂਦਾ ਲੜੀ'), value: String(currentStreak) + ' ' + tr('days', 'ਦਿਨ'), icon: CalendarDays },
                { label: tr('Longest streak', 'ਸਭ ਤੋਂ ਲੰਮੀ ਲੜੀ'), value: String(longestStreak) + ' ' + tr('days', 'ਦਿਨ'), icon: Trophy },
              ].map(({ label, value, icon: Icon }) => (
                <Panel key={label} className="p-5">
                  <Icon aria-hidden="true" className="size-5 text-[color:var(--saffron)]" />
                  <p className="mt-5 text-2xl font-semibold tracking-[-.03em]">{value}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{label}</p>
                </Panel>
              ))}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
              <Panel className="p-6 sm:p-8">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="eyebrow">{tr('Last 7 days', 'ਪਿਛਲੇ ੭ ਦਿਨ')}</p>
                    <h2 className="text-xl font-semibold">{tr('Daily Jaap', 'ਰੋਜ਼ਾਨਾ ਜਾਪ')}</h2>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {tr('Goal', 'ਟੀਚਾ')} {formatNumber(settings.dailyGoal)}
                  </span>
                </div>
                <div className="mt-8 flex h-[250px] items-end gap-3 sm:gap-5">
                  {recentDays.map((day) => {
                    const height = Math.max(
                      day.record.jaap > 0 ? 8 : 2,
                      (day.record.jaap / weekMaximum) * 100,
                    );
                    return (
                      <button
                        key={day.key}
                        className="group flex h-full flex-1 flex-col items-center justify-end gap-3"
                        onClick={() => setSelectedDay(day.key)}
                        type="button"
                      >
                        <span className="text-xs font-semibold tabular-nums opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                          {formatNumber(day.record.jaap)}
                        </span>
                        <span className="flex h-[190px] w-full max-w-10 items-end overflow-hidden rounded-full bg-secondary">
                          <span
                            className={cn(
                              'block w-full rounded-full transition-[height] duration-500',
                              day.key === today
                                ? 'bg-[color:var(--saffron)]'
                                : 'bg-[color:var(--sage)]',
                            )}
                            style={{ height: String(height) + '%' }}
                          />
                        </span>
                        <span className="text-xs text-muted-foreground">{day.label}</span>
                      </button>
                    );
                  })}
                </div>
              </Panel>

              <Panel className="p-6 sm:p-8">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="eyebrow">{tr('Practice calendar', 'ਅਭਿਆਸ ਕੈਲੰਡਰ')}</p>
                    <h2 className="text-xl font-semibold">
                      {new Intl.DateTimeFormat(locale === 'pa' ? 'pa-IN' : 'en-IN', {
                        month: 'long',
                      }).format(new Date())}
                    </h2>
                  </div>
                  <span aria-hidden="true" className="text-2xl">🪯</span>
                </div>
                <div className="mt-7 grid grid-cols-7 gap-2">
                  {calendarDays.map(({ key, date, record }) => {
                    const complete = (record?.jaap ?? 0) >= settings.streakMinimum;
                    return (
                      <button
                        key={key}
                        className={cn(
                          'grid aspect-square place-items-center rounded-full text-xs transition',
                          complete
                            ? 'bg-[color:var(--mist)] font-semibold text-primary'
                            : 'bg-secondary/65 text-muted-foreground',
                          key === today && 'ring-2 ring-[color:var(--saffron)] ring-offset-2 ring-offset-card',
                        )}
                        onClick={() => setSelectedDay(key)}
                        type="button"
                      >
                        {complete ? 'ੴ' : date.getDate()}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-6 text-sm leading-6 text-muted-foreground">
                  {tr(
                    'A day becomes part of your streak after ',
                    'ਇੱਕ ਦਿਨ ਤੁਹਾਡੀ ਲੜੀ ਦਾ ਹਿੱਸਾ ਬਣਦਾ ਹੈ ਜਦੋਂ ',
                  )}
                  {formatNumber(settings.streakMinimum)} {tr('Jaap.', 'ਜਾਪ ਪੂਰੇ ਹੋਣ।')}
                </p>
              </Panel>
            </div>

            <Panel className="mt-6 p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <History aria-hidden="true" className="size-5 text-[color:var(--saffron)]" />
                <h2 className="text-xl font-semibold">{tr('Recent sessions', 'ਹਾਲੀਆ ਸੈਸ਼ਨ')}</h2>
              </div>
              <div className="mt-5 grid gap-2">
                {sessions.slice(0, 6).map((session) => (
                  <div key={session.id} className="grid min-h-16 grid-cols-[1fr_auto_auto] items-center gap-4 rounded-2xl bg-secondary/60 px-4">
                    <div>
                      <p className="text-sm font-semibold">
                        {new Intl.DateTimeFormat(locale === 'pa' ? 'pa-IN' : 'en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        }).format(session.endedAt)}
                      </p>
                      <p className="mt-0.5 text-xs capitalize text-muted-foreground">{session.mode}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatNumber(session.count)} {tr('Jaap', 'ਜਾਪ')}
                    </span>
                    <span className="hidden text-sm text-muted-foreground sm:block">
                      {formatClock(session.durationSeconds)}
                    </span>
                  </div>
                ))}
                {!sessions.length && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    {tr('Your saved sessions will appear here.', 'ਤੁਹਾਡੇ ਸੰਭਾਲੇ ਸੈਸ਼ਨ ਇੱਥੇ ਦਿਖਾਈ ਦੇਣਗੇ।')}
                  </p>
                )}
              </div>
            </Panel>
          </div>
        )}

        {activeView === 'more' && (
          <div className="mx-auto grid w-full max-w-[1000px] gap-6 px-4 pb-28 pt-3 sm:px-8 md:pb-12 lg:grid-cols-[minmax(0,1fr)_300px] lg:px-12">
            <Panel className="p-6 sm:p-8">
              <p className="eyebrow">{tr('Settings', 'ਸੈਟਿੰਗਾਂ')}</p>
              <h1 className="page-heading">{tr('Make Jaap comfortable', 'ਜਾਪ ਨੂੰ ਸਹਿਜ ਬਣਾਓ')}</h1>
              <div className="mt-7">
                <SettingRow
                  icon={<SlidersHorizontal aria-hidden="true" className="size-5" />}
                  label={tr('Jaap per Mala', 'ਹਰ ਮਾਲਾ ਵਿੱਚ ਜਾਪ')}
                  description={tr('Used for every Mala calculation.', 'ਹਰ ਮਾਲਾ ਦੀ ਗਿਣਤੀ ਲਈ ਵਰਤਿਆ ਜਾਂਦਾ ਹੈ।')}
                >
                  <input
                    aria-label={tr('Jaap per Mala', 'ਹਰ ਮਾਲਾ ਵਿੱਚ ਜਾਪ')}
                    className="setting-number"
                    list="mala-size-options"
                    max={10000}
                    min={1}
                    onChange={(event) =>
                      setSettings((value) => ({
                        ...value,
                        malaSize: Math.min(
                          10000,
                          Math.max(1, Number(event.target.value)),
                        ),
                      }))
                    }
                    type="number"
                    value={settings.malaSize}
                  />
                </SettingRow>
                <SettingRow
                  icon={<Target aria-hidden="true" className="size-5" />}
                  label={tr('Daily goal', 'ਰੋਜ਼ਾਨਾ ਟੀਚਾ')}
                  description={tr('Your private daily intention.', 'ਤੁਹਾਡਾ ਨਿੱਜੀ ਰੋਜ਼ਾਨਾ ਸੰਕਲਪ।')}
                >
                  <input
                    aria-label={tr('Daily Jaap goal', 'ਰੋਜ਼ਾਨਾ ਜਾਪ ਟੀਚਾ')}
                    className="setting-number"
                    list="daily-goal-options"
                    max={10000000}
                    min={1}
                    onChange={(event) =>
                      setSettings((value) => ({
                        ...value,
                        dailyGoal: Math.min(
                          10000000,
                          Math.max(1, Number(event.target.value)),
                        ),
                      }))
                    }
                    type="number"
                    value={settings.dailyGoal}
                  />
                </SettingRow>
                <SettingRow
                  icon={<span aria-hidden="true" className="text-lg">ੴ</span>}
                  label={tr('Mala goal', 'ਮਾਲਾ ਟੀਚਾ')}
                  description={tr('Choose a Mala goal; Jaap updates automatically.', 'ਮਾਲਾ ਟੀਚਾ ਚੁਣੋ; ਜਾਪ ਆਪਣੇ ਆਪ ਬਦਲਦਾ ਹੈ।')}
                >
                  <NativeSelect
                    aria-label={tr('Mala goal', 'ਮਾਲਾ ਟੀਚਾ')}
                    value={
                      settings.dailyGoal % settings.malaSize === 0 &&
                      [1, 2, 5, 11, 21].includes(
                        settings.dailyGoal / settings.malaSize,
                      )
                        ? String(settings.dailyGoal / settings.malaSize)
                        : ''
                    }
                    onChange={(event) => {
                      const malaGoal = Number(event.target.value);
                      if (malaGoal) {
                        setSettings((value) => ({
                          ...value,
                          dailyGoal: malaGoal * value.malaSize,
                        }));
                      }
                    }}
                  >
                    <NativeSelectOption value="">
                      {tr('Choose', 'ਚੁਣੋ')}
                    </NativeSelectOption>
                    {[1, 2, 5, 11, 21].map((value) => (
                      <NativeSelectOption key={value} value={value}>
                        {value} {tr(value === 1 ? 'Mala' : 'Mala', 'ਮਾਲਾ')}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </SettingRow>
                <SettingRow
                  icon={<CalendarDays aria-hidden="true" className="size-5" />}
                  label={tr('Streak minimum', 'ਲੜੀ ਲਈ ਘੱਟੋ-ਘੱਟ')}
                  description={tr('Jaap needed for a practice day.', 'ਅਭਿਆਸ ਵਾਲੇ ਦਿਨ ਲਈ ਲੋੜੀਂਦਾ ਜਾਪ।')}
                >
                  <input
                    aria-label={tr('Streak minimum Jaap', 'ਲੜੀ ਲਈ ਘੱਟੋ-ਘੱਟ ਜਾਪ')}
                    className="setting-number"
                    list="streak-options"
                    max={10000000}
                    min={1}
                    onChange={(event) =>
                      setSettings((value) => ({
                        ...value,
                        streakMinimum: Math.min(
                          10000000,
                          Math.max(1, Number(event.target.value)),
                        ),
                      }))
                    }
                    type="number"
                    value={settings.streakMinimum}
                  />
                </SettingRow>
                <SettingRow
                  icon={<Eye aria-hidden="true" className="size-5" />}
                  label={tr('Simple mode', 'ਸਰਲ ਮੋਡ')}
                  description={tr('Larger type and fewer controls.', 'ਵੱਡੀ ਲਿਖਤ ਅਤੇ ਘੱਟ ਕੰਟਰੋਲ।')}
                >
                  <Switch
                    aria-label={tr('Toggle simple mode', 'ਸਰਲ ਮੋਡ ਬਦਲੋ')}
                    checked={settings.simpleMode}
                    onCheckedChange={(checked) =>
                      setSettings((value) => ({ ...value, simpleMode: checked }))
                    }
                  />
                </SettingRow>
                <SettingRow
                  icon={<Volume2 aria-hidden="true" className="size-5" />}
                  label={tr('Soft sound cue', 'ਹੌਲੀ ਆਵਾਜ਼ ਸੰਕੇਤ')}
                  description={tr('A brief tone after each tap.', 'ਹਰ ਟੈਪ ਤੋਂ ਬਾਅਦ ਛੋਟੀ ਧੁਨ।')}
                >
                  <Switch
                    aria-label={tr('Toggle sound cue', 'ਆਵਾਜ਼ ਸੰਕੇਤ ਬਦਲੋ')}
                    checked={settings.soundCue}
                    onCheckedChange={(checked) =>
                      setSettings((value) => ({ ...value, soundCue: checked }))
                    }
                  />
                </SettingRow>
                <SettingRow
                  icon={<Vibrate aria-hidden="true" className="size-5" />}
                  label={tr('Vibration cue', 'ਕੰਪਨ ਸੰਕੇਤ')}
                  description={tr('When supported by your browser.', 'ਜੇ ਤੁਹਾਡਾ ਬਰਾਊਜ਼ਰ ਸਹਾਇਤਾ ਕਰਦਾ ਹੈ।')}
                >
                  <Switch
                    aria-label={tr('Toggle vibration', 'ਕੰਪਨ ਬਦਲੋ')}
                    checked={settings.vibrationCue}
                    onCheckedChange={(checked) =>
                      setSettings((value) => ({
                        ...value,
                        vibrationCue: checked,
                      }))
                    }
                  />
                </SettingRow>
              </div>
              <datalist id="mala-size-options">
                <option value="27">27</option>
                <option value="54">54</option>
                <option value="108">108</option>
              </datalist>
              <datalist id="daily-goal-options">
                {[108, 216, 500, 1000, 2500, 5000, 10000].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </datalist>
              <datalist id="streak-options">
                {[27, 54, 108, 216, 500].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </datalist>
            </Panel>

            <div className="grid content-start gap-6">
              <Panel className="p-6">
                <span className="grid size-12 place-items-center rounded-full bg-primary text-2xl text-primary-foreground">
                  🪯
                </span>
                <h2 className="mt-5 text-xl font-semibold">{account.displayName}</h2>
                <p className="mt-1 text-sm font-medium text-[color:var(--saffron)]">
                  @{account.username}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {tr(
                    'Your private Jaap history is separated from other accounts on this device and remains available offline.',
                    'ਤੁਹਾਡਾ ਨਿੱਜੀ ਜਾਪ ਇਤਿਹਾਸ ਇਸ ਡਿਵਾਈਸ ਉੱਤੇ ਹੋਰ ਖਾਤਿਆਂ ਤੋਂ ਵੱਖਰਾ ਹੈ ਅਤੇ ਆਫਲਾਈਨ ਵੀ ਉਪਲਬਧ ਰਹਿੰਦਾ ਹੈ।',
                  )}
                </p>
                <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck aria-hidden="true" className="size-4" />
                  {tr('Private by default', 'ਮੂਲ ਰੂਪ ਵਿੱਚ ਨਿੱਜੀ')}
                </div>
                <button className="outline-action mt-5 w-full" onClick={signOut} type="button">
                  <LogOut aria-hidden="true" />
                  {tr('Sign out', 'ਸਾਈਨ ਆਉਟ')}
                </button>
              </Panel>

              {membership && (
                <Panel className="p-6">
                  <p className="eyebrow">{tr('Current Sangat', 'ਮੌਜੂਦਾ ਸੰਗਤ')}</p>
                  <h2 className="text-xl font-semibold">{membership.groupName}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{membership.memberName}</p>
                  <button
                    className="outline-action mt-5 w-full"
                    onClick={() => setActiveView('sangat')}
                    type="button"
                  >
                    <UsersRound aria-hidden="true" />
                    {tr('Open my Sangat', 'ਮੇਰੀ ਸੰਗਤ ਖੋਲ੍ਹੋ')}
                  </button>
                </Panel>
              )}
            </div>

            <section className="heritage-gallery lg:col-span-2">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="eyebrow">{tr('Sikh heritage', 'ਸਿੱਖ ਵਿਰਾਸਤ')}</p>
                  <h2 className="page-heading">
                    {tr('Sacred places, held with care', 'ਪਵਿੱਤਰ ਅਸਥਾਨ, ਸਤਿਕਾਰ ਨਾਲ')}
                  </h2>
                </div>
                <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                  {tr(
                    'A quiet visual journey through historic Takhts, Gurdwaras, and freely shared puratan art.',
                    'ਇਤਿਹਾਸਕ ਤਖ਼ਤਾਂ, ਗੁਰਦੁਆਰਾ ਸਾਹਿਬਾਨ ਅਤੇ ਮੁਫ਼ਤ ਸਾਂਝੀ ਪੁਰਾਤਨ ਕਲਾ ਦੀ ਸ਼ਾਂਤ ਝਲਕ।',
                  )}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
                <HeritageCard
                  alt="Sri Harmandir Sahib reflected in the sarovar at Amritsar"
                  className="lg:col-span-7 lg:min-h-[360px]"
                  credit="Jasdeep Singh / Wikimedia Commons, CC0"
                  description={tr(
                    'Darbar Sahib, Amritsar — a place of seva, kirtan, and welcome.',
                    'ਦਰਬਾਰ ਸਾਹਿਬ, ਅੰਮ੍ਰਿਤਸਰ — ਸੇਵਾ, ਕੀਰਤਨ ਅਤੇ ਸਾਂਝੀਵਾਲਤਾ ਦਾ ਅਸਥਾਨ।',
                  )}
                  eyebrow={tr('Amritsar', 'ਅੰਮ੍ਰਿਤਸਰ')}
                  priority
                  sourceUrl="https://commons.wikimedia.org/wiki/File:Golden_Temple_.jpg"
                  src="/golden-temple.jpg"
                  title={tr('Sri Harmandir Sahib', 'ਸ੍ਰੀ ਹਰਿਮੰਦਰ ਸਾਹਿਬ')}
                />
                <HeritageCard
                  alt="Takht Sri Hazur Sahib complex in Nanded"
                  className="lg:col-span-5 lg:min-h-[360px]"
                  credit="PriyanshuD6 / Wikimedia Commons, CC BY-SA 4.0 · cropped"
                  description={tr(
                    'Takht Sachkhand Sri Hazur Abchal Nagar Sahib in Nanded.',
                    'ਨੰਦੇੜ ਵਿਖੇ ਤਖ਼ਤ ਸੱਚਖੰਡ ਸ੍ਰੀ ਹਜ਼ੂਰ ਅਬਚਲ ਨਗਰ ਸਾਹਿਬ।',
                  )}
                  eyebrow={tr('Nanded', 'ਨੰਦੇੜ')}
                  sourceUrl="https://commons.wikimedia.org/wiki/File:Sri_Hazur_Sahib,_Nanded.jpg"
                  src="/hazur-sahib.jpg"
                  title={tr('Takht Sri Hazur Sahib', 'ਤਖ਼ਤ ਸ੍ਰੀ ਹਜ਼ੂਰ ਸਾਹਿਬ')}
                />
                <HeritageCard
                  alt="Sri Hemkund Sahib beside the mountain lake"
                  className="lg:col-span-5"
                  credit="Sai Kiran / Wikimedia Commons, CC BY-SA 4.0 · cropped"
                  description={tr(
                    'A high-altitude place of remembrance amid still water and mountains.',
                    'ਸ਼ਾਂਤ ਸਰੋਵਰ ਅਤੇ ਪਹਾੜਾਂ ਵਿਚਕਾਰ ਉੱਚਾਈ ਉੱਤੇ ਸਿਮਰਨ ਦਾ ਅਸਥਾਨ।',
                  )}
                  eyebrow={tr('Uttarakhand', 'ਉੱਤਰਾਖੰਡ')}
                  sourceUrl="https://commons.wikimedia.org/wiki/File:Hemkund_sahib.jpg"
                  src="/hemkund-sahib.jpg"
                  title={tr('Sri Hemkund Sahib', 'ਸ੍ਰੀ ਹੇਮਕੁੰਟ ਸਾਹਿਬ')}
                />
                <HeritageCard
                  alt="Takht Sri Kesgarh Sahib at Anandpur Sahib"
                  className="lg:col-span-7"
                  credit="Historiansimar / Wikimedia Commons, CC BY-SA 4.0 · cropped"
                  description={tr(
                    'The historic Takht at Anandpur Sahib, central to the Khalsa story.',
                    'ਅਨੰਦਪੁਰ ਸਾਹਿਬ ਦਾ ਇਤਿਹਾਸਕ ਤਖ਼ਤ, ਖ਼ਾਲਸਾ ਇਤਿਹਾਸ ਦਾ ਕੇਂਦਰੀ ਅਸਥਾਨ।',
                  )}
                  eyebrow={tr('Anandpur Sahib', 'ਅਨੰਦਪੁਰ ਸਾਹਿਬ')}
                  sourceUrl="https://commons.wikimedia.org/wiki/File:Takhat_Shri_Kesgarh_Sahib.jpg"
                  src="/kesgarh-sahib.jpg"
                  title={tr('Takht Sri Kesgarh Sahib', 'ਤਖ਼ਤ ਸ੍ਰੀ ਕੇਸਗੜ੍ਹ ਸਾਹਿਬ')}
                />
                <HeritageCard
                  alt="Gurdwara Bangla Sahib and sarovar in Delhi"
                  className="lg:col-span-4"
                  credit="Vrlobo888 / Wikimedia Commons, public domain"
                  description={tr(
                    'A luminous Delhi Gurdwara known for seva and healing remembrance.',
                    'ਦਿੱਲੀ ਦਾ ਪ੍ਰਕਾਸ਼ਮਾਨ ਗੁਰਦੁਆਰਾ, ਸੇਵਾ ਅਤੇ ਯਾਦ ਨਾਲ ਜੁੜਿਆ ਅਸਥਾਨ।',
                  )}
                  eyebrow={tr('Delhi', 'ਦਿੱਲੀ')}
                  sourceUrl="https://commons.wikimedia.org/wiki/File:Gurdwara_Bangla_Sahib.jpg"
                  src="/bangla-sahib.jpg"
                  title={tr('Gurdwara Bangla Sahib', 'ਗੁਰਦੁਆਰਾ ਬੰਗਲਾ ਸਾਹਿਬ')}
                />
                <HeritageCard
                  alt="A 1726 hukamnama of Mata Sahib Devan Ji"
                  className="lg:col-span-4"
                  credit="1726 hukamnama / Wikimedia Commons, public domain"
                  description={tr(
                    'An original 1726 hukamnama connected with Mata Sahib Devan Ji, preserved as history.',
                    'ਮਾਤਾ ਸਾਹਿਬ ਦੇਵਾਂ ਜੀ ਨਾਲ ਸੰਬੰਧਿਤ 1726 ਦਾ ਅਸਲ ਹੁਕਮਨਾਮਾ, ਇਤਿਹਾਸ ਵਜੋਂ ਸੰਭਾਲਿਆ।',
                  )}
                  eyebrow={tr('Mata Sahib Devan Ji', 'ਮਾਤਾ ਸਾਹਿਬ ਦੇਵਾਂ ਜੀ')}
                  imageClassName="object-top"
                  sourceUrl="https://commons.wikimedia.org/wiki/File:Hukamnama_(edict)_of_Mata_Sahib_Devan_(Mata_Sahib_Kaur)_dated_to_10_September_1726_addressed_to_Bhai_Alam_Singh.jpg"
                  src="/mata-sahib-deva-hukamnama.jpg"
                  title={tr('A living written legacy', 'ਲਿਖਤੀ ਵਿਰਾਸਤ ਦੀ ਝਲਕ')}
                />
                <HeritageCard
                  alt="Late nineteenth-century puratan painting of the Sikh Gurus with Bhai Bala and Bhai Mardana"
                  className="lg:col-span-4"
                  credit="Unknown artist / Wikimedia Commons, public domain"
                  description={tr(
                    'A late nineteenth-century puratan work, presented respectfully and without alteration.',
                    'ਉੱਨੀਵੀਂ ਸਦੀ ਦੇ ਅਖੀਰ ਦੀ ਪੁਰਾਤਨ ਕਲਾ, ਸਤਿਕਾਰ ਨਾਲ ਬਿਨਾਂ ਤਬਦੀਲੀ ਪੇਸ਼ ਕੀਤੀ।',
                  )}
                  eyebrow={tr('Puratan art', 'ਪੁਰਾਤਨ ਕਲਾ')}
                  imageClassName="object-top"
                  sourceUrl="https://commons.wikimedia.org/wiki/File:Sikh_Gurus_with_Bhai_Bala_and_Bhai_Mardana.jpg"
                  src="/ten-gurus-puratan.jpg"
                  title={tr('Sikh Gurus in sangat', 'ਸੰਗਤ ਵਿੱਚ ਗੁਰੂ ਸਾਹਿਬਾਨ')}
                />
              </div>
            </section>
          </div>
        )}

        {activeView === 'summary' && summary && (
          <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-8 sm:px-8 md:pb-12">
            <Panel className="overflow-hidden text-center">
              <div className="summary-top px-6 py-10 text-primary-foreground sm:py-14">
                <span className="text-4xl" aria-hidden="true">🪯</span>
                <p className="mt-5 text-sm font-medium tracking-[.15em] text-white/55 uppercase">
                  {tr('Session complete', 'ਸੈਸ਼ਨ ਪੂਰਾ ਹੋਇਆ')}
                </p>
                <h1 className="mt-2 font-gurmukhi text-4xl font-semibold text-[color:var(--gold-light)] sm:text-5xl">
                  ਵਾਹਿਗੁਰੂ
                </h1>
              </div>
              <div className="grid grid-cols-2 gap-px bg-[color:var(--line)] sm:grid-cols-4">
                {[
                  { label: tr('Time', 'ਸਮਾਂ'), value: formatClock(summary.durationSeconds) },
                  { label: tr('Jaap', 'ਜਾਪ'), value: formatNumber(summary.count) },
                  { label: tr('Mala', 'ਮਾਲਾ'), value: formatNumber(Math.floor(summary.count / summary.malaSize)) },
                  {
                    label: tr('Average', 'ਔਸਤ'),
                    value:
                      (summary.count / Math.max(1, summary.durationSeconds / 60)).toFixed(1) +
                      tr('/min', '/ਮਿੰਟ'),
                  },
                ].map((item) => (
                  <div key={item.label} className="bg-card px-4 py-7">
                    <p className="text-2xl font-semibold tabular-nums">{item.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
              <div className="p-6 sm:p-8">
                <div className="mx-auto max-w-md">
                  <div className="flex items-center justify-between text-sm">
                    <span>{tr("Today's total", 'ਅੱਜ ਦਾ ਕੁੱਲ')}</span>
                    <strong>
                      {formatNumber(summary.todayTotal)} / {formatNumber(settings.dailyGoal)}
                    </strong>
                  </div>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-[color:var(--saffron)]"
                      style={{
                        width:
                          String(
                            Math.min(100, (summary.todayTotal / settings.dailyGoal) * 100),
                          ) + '%',
                      }}
                    />
                  </div>
                </div>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <button className="primary-action" onClick={() => setActiveView('jaap')} type="button">
                    <MousePointerClick aria-hidden="true" />
                    {tr('Continue Jaap', 'ਜਾਪ ਜਾਰੀ ਰੱਖੋ')}
                  </button>
                  <button className="outline-action" onClick={() => setActiveView('focus')} type="button">
                    <Focus aria-hidden="true" />
                    {tr('Another focus session', 'ਇੱਕ ਹੋਰ ਧਿਆਨ ਸੈਸ਼ਨ')}
                  </button>
                </div>
              </div>
            </Panel>
          </div>
        )}
      </section>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-40 grid grid-cols-5 rounded-[24px] border border-white/70 bg-[rgba(251,248,239,.94)] p-2 shadow-[0_15px_45px_rgba(23,50,77,.15)] backdrop-blur-xl md:hidden"
      >
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={cn(
              'flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-medium',
              activeView === id || (activeView === 'summary' && id === 'jaap')
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground',
            )}
            onClick={() => setActiveView(id)}
            type="button"
          >
            <Icon aria-hidden="true" className="size-[19px]" strokeWidth={1.8} />
            <span className="max-w-full truncate">{label}</span>
          </button>
        ))}
      </nav>

      {notice && (
        <output
          className="fixed left-1/2 top-5 z-[80] -translate-x-1/2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-xl"
        >
          {notice}
        </output>
      )}

      {storageWarning && (
        <output className="fixed bottom-24 right-5 z-50 max-w-xs rounded-2xl bg-[#704b3f] px-4 py-3 text-sm text-white md:bottom-5">
          {tr(
            'Private browser storage is limited. Keep this tab open during your session.',
            'ਨਿੱਜੀ ਬਰਾਊਜ਼ਰ ਸਟੋਰੇਜ ਸੀਮਿਤ ਹੈ। ਸੈਸ਼ਨ ਦੌਰਾਨ ਇਹ ਟੈਬ ਖੁੱਲ੍ਹੀ ਰੱਖੋ।',
          )}
        </output>
      )}

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="rounded-[26px] border-[color:var(--line)] bg-card p-6 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">{tr('Custom increment', 'ਆਪਣੀ ਗਿਣਤੀ')}</DialogTitle>
            <DialogDescription>
              {tr('Add several Jaap at once.', 'ਇੱਕ ਵਾਰ ਵਿੱਚ ਕਈ ਜਾਪ ਜੋੜੋ।')}
            </DialogDescription>
          </DialogHeader>
          <label className="mt-2 grid gap-2">
            <span className="field-label">{tr('Amount', 'ਗਿਣਤੀ')}</span>
            <input
              className="text-input text-xl"
              max={10000}
              min={1}
              onChange={(event) => setCustomAmount(Number(event.target.value))}
              type="number"
              value={customAmount}
            />
          </label>
          <DialogFooter className="mt-3 border-0 bg-transparent p-0">
            <button
              className="primary-action w-full"
              onClick={() => {
                increment(customAmount);
                setCustomOpen(false);
              }}
              type="button"
            >
              {tr('Add Jaap', 'ਜਾਪ ਜੋੜੋ')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedDay)} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="rounded-[26px] border-[color:var(--line)] bg-card p-6 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {selectedDay
                ? new Intl.DateTimeFormat(locale === 'pa' ? 'pa-IN' : 'en-IN', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  }).format(new Date(selectedDay + 'T12:00:00'))
                : ''}
            </DialogTitle>
            <DialogDescription>{tr('Practice details', 'ਅਭਿਆਸ ਵੇਰਵਾ')}</DialogDescription>
          </DialogHeader>
          {selectedDay && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              {[
                { label: tr('Jaap', 'ਜਾਪ'), value: formatNumber(records[selectedDay]?.jaap ?? 0) },
                {
                  label: tr('Mala', 'ਮਾਲਾ'),
                  value: formatNumber(
                    Math.floor((records[selectedDay]?.jaap ?? 0) / settings.malaSize),
                  ),
                },
                {
                  label: tr('Focus time', 'ਧਿਆਨ ਸਮਾਂ'),
                  value: formatClock(records[selectedDay]?.focusSeconds ?? 0),
                },
                {
                  label: tr('Sessions', 'ਸੈਸ਼ਨ'),
                  value: formatNumber(records[selectedDay]?.sessions ?? 0),
                },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl bg-secondary p-4">
                  <p className="text-xl font-semibold">{item.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

    </main>
  );
}
