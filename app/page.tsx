'use client';

import type { ComponentPropsWithoutRef, ReactNode, SyntheticEvent } from 'react';
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
  UserMinus,
  UserRoundCheck,
  UsersRound,
  Vibrate,
  Volume2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import Image from 'next/image';

import { BrandMark, SehajBrand } from '@/components/brand/sehaj-brand';
import { HeritageExperience } from '@/components/heritage/heritage-experience';

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
type View = 'jaap' | 'sangat' | 'focus' | 'progress' | 'heritage' | 'more' | 'summary';
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
  isYou?: boolean;
  isOrganizer?: boolean;
  canRemove?: boolean;
};

type GroupData = {
  code: string;
  name: string;
  dailyGoal: number;
  total: number;
  activeMembers: number;
  memberCount: number;
  canManage?: boolean;
  members: GroupMember[];
};

function visibleSangatMembers(group: GroupData | null) {
  if (!group) return [];
  return group.members.filter(
    (member) =>
      !/^guest(?:[\s#_-]*\d*)?$/i.test(member.name.trim()),
  );
}

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
const SHARED_ACCOUNT_API = '/api/account';
const SHARED_ACCOUNT_TOKEN_KEY = 'sehaj-jaap-shared-account-token-v1';
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

async function sharedAccountRequest<T extends object>(
  action: string,
  input: Record<string, unknown> = {},
): Promise<{ response: Response; payload: T }> {
  const token =
    typeof window === 'undefined'
      ? ''
      : localStorage.getItem(SHARED_ACCOUNT_TOKEN_KEY) || '';
  const response = await fetch(SHARED_ACCOUNT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token, ...input }),
  });
  const payload = await readApiJson<T>(response);
  return { response, payload };
}

function removeLocalDuplicateAccount(username: string) {
  const normalized = normalizeLocalUsername(username);
  const remaining = readLocalAccounts().filter(
    (item) => item.username !== normalized,
  );
  writeLocalAccounts(remaining);
  localStorage.removeItem(LOCAL_SESSION_KEY);
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
  ...props
}: ComponentPropsWithoutRef<'section'> & {
  children: ReactNode;
}) {
  return (
    <section
      {...props}
      className={cn(
        'panel-surface spatial-section',
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
      <div className="setting-control shrink-0">{children}</div>
    </div>
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
  const [showAccountForm, setShowAccountForm] = useState(false);
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
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

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

  function goToView(next: View) {
    const update = () => {
      setActiveView(next);
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    };

    if (typeof document !== 'undefined') {
      const transitionDocument = document as Document & {
        startViewTransition?: (callback: () => void) => unknown;
      };
      if (transitionDocument.startViewTransition) {
        transitionDocument.startViewTransition(update);
        return;
      }
    }

    update();
  }

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
        goToView('sangat');
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
      if (localStorage.getItem(SHARED_ACCOUNT_TOKEN_KEY)) {
        void sharedAccountRequest<{ ok?: boolean }>('save_state', { snapshot }).catch(
          () => undefined,
        );
      }
    }, 350);
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

    void (async () => {
      const token = localStorage.getItem(SHARED_ACCOUNT_TOKEN_KEY);
      if (!token) {
        if (active) {
          setAccount(null);
          setMembership(null);
          setGroupQueue([]);
          setStateOwnerId(null);
          localStorage.removeItem(LAST_ACCOUNT_KEY);
          setAccountChecked(true);
        }
        return;
      }

      try {
        const { response, payload } = await sharedAccountRequest<{
          account?: Account;
          error?: string;
        }>('session');

        if (!active) return;
        if (!response.ok || !payload.account) {
          localStorage.removeItem(SHARED_ACCOUNT_TOKEN_KEY);
          setAccount(null);
          setMembership(null);
          setGroupQueue([]);
          setStateOwnerId(null);
          localStorage.removeItem(LAST_ACCOUNT_KEY);
          return;
        }

        const verifiedAccount = payload.account;
        const stateResult = await sharedAccountRequest<{
          snapshot?: PersistedSnapshot | null;
        }>('load_state');

        if (!active) return;
        let saved = stateResult.payload.snapshot ?? null;
        if (!saved) {
          saved = await readAccountSnapshot(verifiedAccount.id);
        }

        applyPersonalSnapshot(
          saved,
          verifiedAccount.id,
          saved?.membership ?? null,
        );
        setAccount(verifiedAccount);
        localStorage.setItem(LAST_ACCOUNT_KEY, JSON.stringify(verifiedAccount));
        removeLocalDuplicateAccount(verifiedAccount.username);
      } catch {
        if (active) {
          const lastAccountRaw = localStorage.getItem(LAST_ACCOUNT_KEY);
          if (lastAccountRaw) {
            try {
              const lastAccount = JSON.parse(lastAccountRaw) as Account;
              const saved = await readAccountSnapshot(lastAccount.id);
              if (active && saved) {
                applyPersonalSnapshot(
                  saved,
                  lastAccount.id,
                  saved.membership ?? null,
                );
                setAccount(lastAccount);
              }
            } catch {
              // Keep the sign-in screen if local recovery is unavailable.
            }
          }
        }
      } finally {
        if (active) setAccountChecked(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [hydrated]);

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
        removed?: boolean;
      }>(response);
      if (!response.ok || !payload.group) {
        if (payload.removed) {
          setMembership(null);
          setGroupData(null);
          setGroupQueue([]);
        }
        throw new Error(payload.error || 'Could not load this Sangat.');
      }
      setGroupData(payload.group);
      return payload.group;
    },
    [today],
  );

  const removeSangatMember = useCallback(
    async (member: GroupMember) => {
      const currentMembership = membershipRef.current;
      if (!currentMembership || !member.canRemove || removingMemberId) return;

      const confirmed = window.confirm(
        tr(
          `Remove ${member.name} from this Sangat? They will no longer be able to rejoin with the current invite.`,
          `${member.name} ਨੂੰ ਇਸ ਸੰਗਤ ਤੋਂ ਹਟਾਉਣਾ ਹੈ? ਉਹ ਮੌਜੂਦਾ ਸੱਦੇ ਨਾਲ ਮੁੜ ਸ਼ਾਮਲ ਨਹੀਂ ਹੋ ਸਕਣਗੇ।`,
        ),
      );
      if (!confirmed) return;

      setRemovingMemberId(member.id);
      setGroupError('');
      try {
        const response = await fetch('/api/sangat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'remove_member',
            code: currentMembership.code,
            memberId: member.id,
            practiceDate: today,
          }),
        });
        const payload = await readApiJson<{
          removed?: boolean;
          group?: GroupData;
          error?: string;
        }>(response);
        if (!response.ok || !payload.removed) {
          throw new Error(payload.error || 'Could not remove this member.');
        }
        if (payload.group) setGroupData(payload.group);
        setNotice(
          tr(
            `${member.name} was removed from the Sangat.`,
            `${member.name} ਨੂੰ ਸੰਗਤ ਤੋਂ ਹਟਾ ਦਿੱਤਾ ਗਿਆ ਹੈ।`,
          ),
        );
      } catch (error) {
        setGroupError(
          error instanceof Error ? error.message : 'Could not remove this member.',
        );
      } finally {
        setRemovingMemberId(null);
      }
    },
    [removingMemberId, today, tr],
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
      goToView('summary');
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
      goToView('focus');
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
      let token = '';
      let remoteSnapshot: PersistedSnapshot | null = null;

      const authenticate = async (
        action: 'login' | 'register',
        displayName = accountDisplayName,
      ) => {
        const { response, payload } = await sharedAccountRequest<{
          account?: Account;
          token?: string;
          error?: string;
        }>(action, {
          username: accountUsername,
          password: accountPassword,
          displayName,
        });
        return { response, payload };
      };

      let result = await authenticate(accountMode);

      if (
        accountMode === 'login' &&
        result.response.status === 401 &&
        result.payload.error === 'Username or password is incorrect.'
      ) {
        // Migrate a pre-Supabase local account into the single shared account.
        try {
          const localAccount = await loginLocalAccount(
            accountUsername,
            accountPassword,
          );
          result = await authenticate('register', localAccount.displayName);
        } catch {
          // No matching legacy account on this device; keep the cloud error.
        }
      }

      if (!result.response.ok || !result.payload.account || !result.payload.token) {
        throw new Error(result.payload.error || 'Could not open your account.');
      }

      resolvedAccount = result.payload.account;
      token = result.payload.token;
      localStorage.setItem(SHARED_ACCOUNT_TOKEN_KEY, token);

      const stateResult = await sharedAccountRequest<{
        snapshot?: PersistedSnapshot | null;
      }>('load_state');
      if (stateResult.response.ok) {
        remoteSnapshot = stateResult.payload.snapshot ?? null;
      }

      if (accountMode === 'login' || remoteSnapshot) {
        const saved =
          remoteSnapshot ?? (await readAccountSnapshot(resolvedAccount.id));
        applyPersonalSnapshot(
          saved,
          resolvedAccount.id,
          saved?.membership ?? null,
        );
      } else if (claimLocalPractice) {
        setMembership(null);
        setGroupQueue([]);
        setStateOwnerId(resolvedAccount.id);
      } else {
        applyPersonalSnapshot(null, resolvedAccount.id, null);
      }

      setAccount(resolvedAccount);
      localStorage.setItem(LAST_ACCOUNT_KEY, JSON.stringify(resolvedAccount));
      removeLocalDuplicateAccount(resolvedAccount.username);
      setAccountPassword('');
      setOnboarded(true);

      if (inviteInput.length === 12) {
        goToView('sangat');
        setGroupMode('join');
      }

      setNotice(
        accountMode === 'register'
          ? tr('Your shared free account is ready', 'ਤੁਹਾਡਾ ਸਾਂਝਾ ਮੁਫ਼ਤ ਖਾਤਾ ਤਿਆਰ ਹੈ')
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
      if (localStorage.getItem(SHARED_ACCOUNT_TOKEN_KEY)) {
        await sharedAccountRequest<{ ok?: boolean }>('logout').catch(() => undefined);
      }
    } finally {
      localStorage.removeItem(SHARED_ACCOUNT_TOKEN_KEY);
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
      goToView('jaap');
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
      id: 'heritage' as const,
      label: tr('Heritage', 'ਵਿਰਾਸਤ'),
      icon: History,
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
        <output className="block text-center">
          <span aria-hidden="true" className="loading-mark mx-auto block" />
          <p className="mt-5 font-heading text-xl font-semibold text-primary">Sehaj Jaap</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {tr('Preparing your peaceful space…', 'ਤੁਹਾਡੀ ਸ਼ਾਂਤ ਥਾਂ ਤਿਆਰ ਹੋ ਰਹੀ ਹੈ…')}
          </p>
        </output>
      </main>
    );
  }

  if (!account && !showAccountForm) {
    return (
      <main className="public-account-landing min-h-dvh overflow-hidden bg-background text-foreground">
        <section className="relative isolate min-h-dvh overflow-hidden">
          <Image
            alt="Sri Harmandir Sahib and the sarovar"
            className="object-cover"
            fill
            priority
            sizes="100vw"
            src="/media/sangat/harmandir-sarovar.jpg"
            style={{ objectPosition: 'center center' }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,30,33,.86)_0%,rgba(9,30,33,.58)_48%,rgba(9,30,33,.28)_100%)]" />
          <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1180px] flex-col px-5 py-6 sm:px-8 lg:px-12">
            <div className="flex items-center justify-between gap-4">
              <SehajBrand inverse />
              <div className="flex rounded-full border border-white/15 bg-black/10 p-1 text-xs text-white backdrop-blur-sm">
                <button
                  className={cn('rounded-full px-3 py-2', locale === 'en' && 'bg-white/14')}
                  aria-label="Use English"
                  aria-pressed={locale === 'en'}
                  onClick={() => setSettings((value) => ({ ...value, locale: 'en' }))}
                  type="button"
                >
                  EN
                </button>
                <button
                  className={cn('rounded-full px-3 py-2', locale === 'pa' && 'bg-white/14')}
                  aria-label="ਪੰਜਾਬੀ ਵਰਤੋ"
                  aria-pressed={locale === 'pa'}
                  onClick={() => setSettings((value) => ({ ...value, locale: 'pa' }))}
                  type="button"
                >
                  ਪੰ
                </button>
              </div>
            </div>

            <div className="my-auto max-w-2xl py-20 text-white">
              <p className="eyebrow text-white/65">
                {tr('Sehaj Jaap', 'ਸਹਿਜ ਜਾਪ')}
              </p>
              <h1 className="mt-4 font-heading text-[clamp(3.2rem,8vw,6.6rem)] font-semibold leading-[.94] tracking-[-.055em] text-white">
                {tr(
                  'A peaceful place for Naam Simran.',
                  'ਨਾਮ ਸਿਮਰਨ ਲਈ ਇੱਕ ਸ਼ਾਂਤ ਥਾਂ।',
                )}
              </h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-white/78 sm:text-lg">
                {tr(
                  'Create your own Sehaj Jaap account to keep your Jaap, sessions, progress and Sangat membership connected across your devices.',
                  'ਆਪਣਾ ਸਹਿਜ ਜਾਪ ਖਾਤਾ ਬਣਾਓ ਤਾਂ ਜੋ ਤੁਹਾਡਾ ਜਾਪ, ਸੈਸ਼ਨ, ਤਰੱਕੀ ਅਤੇ ਸੰਗਤ ਮੈਂਬਰਸ਼ਿਪ ਤੁਹਾਡੇ ਡਿਵਾਈਸਾਂ ਨਾਲ ਜੁੜੀ ਰਹੇ।',
                )}
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button
                  className="primary-action min-w-[180px]"
                  onClick={() => {
                    setAccountMode('login');
                    setAccountError('');
                    setShowAccountForm(true);
                  }}
                  type="button"
                >
                  <UserRoundCheck aria-hidden="true" />
                  {tr('Sign in', 'ਸਾਈਨ ਇਨ')}
                </button>
                <button
                  className="outline-action min-w-[180px] border-white/25 bg-white/8 text-white hover:bg-white/14"
                  onClick={() => {
                    setAccountMode('register');
                    setAccountError('');
                    setShowAccountForm(true);
                  }}
                  type="button"
                >
                  <UserPlus aria-hidden="true" />
                  {tr('Create account', 'ਖਾਤਾ ਬਣਾਓ')}
                </button>
              </div>

              <div className="mt-8 max-w-xl rounded-2xl border border-white/12 bg-black/14 p-4 text-sm leading-6 text-white/72 backdrop-blur-sm">
                <div className="flex items-start gap-3">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                  <p>
                    {tr(
                      'Your account is only for Sehaj Jaap. We do not ask for card details, payments or phone numbers. Use a password that you do not reuse on other websites.',
                      'ਤੁਹਾਡਾ ਖਾਤਾ ਸਿਰਫ਼ ਸਹਿਜ ਜਾਪ ਲਈ ਹੈ। ਅਸੀਂ ਕਾਰਡ ਵੇਰਵੇ, ਭੁਗਤਾਨ ਜਾਂ ਫ਼ੋਨ ਨੰਬਰ ਨਹੀਂ ਮੰਗਦੇ। ਉਹ ਪਾਸਵਰਡ ਵਰਤੋ ਜੋ ਤੁਸੀਂ ਹੋਰ ਵੈੱਬਸਾਈਟਾਂ ਉੱਤੇ ਦੁਬਾਰਾ ਨਹੀਂ ਵਰਤਦੇ।',
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-white/62">
                <a className="underline-offset-4 hover:underline" href="/privacy">
                  {tr('Privacy', 'ਪਰਦੇਦਾਰੀ')}
                </a>
                <a className="underline-offset-4 hover:underline" href="/security">
                  {tr('Security', 'ਸੁਰੱਖਿਆ')}
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!account) {
    return (
      <main className="auth-shell spatial-auth-shell min-h-dvh px-3 py-3 text-foreground sm:px-7 sm:py-7 lg:grid lg:place-items-center">
        <div aria-hidden="true" className="ambient-depth ambient-depth-a" />
        <div aria-hidden="true" className="ambient-depth ambient-depth-b" />
        <div className="auth-card auth-3d-stage mx-auto grid w-full max-w-[1200px] overflow-hidden rounded-[38px] lg:min-h-[720px] lg:grid-cols-[1.08fr_.92fr]">
          <section className="auth-visual auth-visual-depth relative isolate min-h-[270px] overflow-hidden bg-primary text-white sm:min-h-[360px] lg:min-h-full">
            <Image
              alt="Gurdwara Dukh Nivaran Sahib reflected in the sarovar at dusk"
              className="object-cover"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 650px"
              src="/media/sangat/dukh-nivaran-sahib.jpg"
              style={{ objectPosition: '64% center' }}
            />
            <div className="auth-visual-overlay absolute inset-0" />
            <div className="relative z-10 flex min-h-[inherit] flex-col p-6 sm:p-9 lg:min-h-full lg:p-12">
              <SehajBrand inverse />
              <div className="mt-auto max-w-lg pt-14">
                <h1 className="font-heading text-[clamp(2.35rem,5vw,4rem)] font-semibold leading-[1.06] tracking-[-.04em] text-white">
                  {tr('A peaceful space for Naam Simran.', 'ਨਾਮ ਸਿਮਰਨ ਲਈ ਇੱਕ ਸ਼ਾਂਤ ਥਾਂ।')}
                </h1>
                <p className="mt-4 max-w-md text-[15px] leading-7 text-white/72">
                  {tr(
                    'Count, focus and practise together — without distraction.',
                    'ਗਿਣੋ, ਧਿਆਨ ਲਗਾਓ ਅਤੇ ਮਿਲ ਕੇ ਅਭਿਆਸ ਕਰੋ — ਬਿਨਾਂ ਭਟਕਾਵੇ।',
                  )}
                </p>
              </div>
            </div>
          </section>

          <section className="flex flex-col justify-center p-6 sm:p-10 lg:p-12">
            <button
              className="mb-6 inline-flex w-fit items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
              onClick={() => {
                setAccountError('');
                setAccountPassword('');
                setShowAccountForm(false);
              }}
              type="button"
            >
              ← {tr('Back to Sehaj Jaap', 'ਸਹਿਜ ਜਾਪ ਵੱਲ ਵਾਪਸ')}
            </button>
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-heading text-3xl font-semibold tracking-[-.035em]">
                  {accountMode === 'login'
                    ? tr('Welcome back', 'ਜੀ ਆਇਆਂ ਨੂੰ')
                    : tr('Create your account', 'ਆਪਣਾ ਖਾਤਾ ਬਣਾਓ')}
                </h2>
              </div>
              <div className="flex rounded-full border border-[color:var(--line)] bg-secondary/70 p-1 text-xs">
                <button
                  className={cn('rounded-full px-3 py-2', locale === 'en' && 'bg-card shadow-sm')}
                  aria-label="Use English"
                  aria-pressed={locale === 'en'}
                  onClick={() => setSettings((value) => ({ ...value, locale: 'en' }))}
                  type="button"
                >
                  EN
                </button>
                <button
                  className={cn('rounded-full px-3 py-2', locale === 'pa' && 'bg-card shadow-sm')}
                  aria-label="ਪੰਜਾਬੀ ਵਰਤੋ"
                  aria-pressed={locale === 'pa'}
                  onClick={() => setSettings((value) => ({ ...value, locale: 'pa' }))}
                  type="button"
                >
                  ਪੰ
                </button>
              </div>
            </div>

            <div className="auth-mode-tabs mb-7 grid grid-cols-2">
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

            <div className="mb-5 rounded-2xl border border-[color:var(--line)] bg-secondary/55 p-4 text-sm leading-6 text-muted-foreground">
              <div className="flex items-start gap-3">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                <p>
                  {tr(
                    'Sign in only to your Sehaj Jaap account. We never ask for banking, card or payment information. For safety, use a password unique to this site.',
                    'ਸਿਰਫ਼ ਆਪਣੇ ਸਹਿਜ ਜਾਪ ਖਾਤੇ ਵਿੱਚ ਸਾਈਨ ਇਨ ਕਰੋ। ਅਸੀਂ ਕਦੇ ਵੀ ਬੈਂਕ, ਕਾਰਡ ਜਾਂ ਭੁਗਤਾਨ ਦੀ ਜਾਣਕਾਰੀ ਨਹੀਂ ਮੰਗਦੇ। ਸੁਰੱਖਿਆ ਲਈ ਇਸ ਸਾਈਟ ਲਈ ਵੱਖਰਾ ਪਾਸਵਰਡ ਵਰਤੋ।',
                  )}
                </p>
              </div>
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
                <span className="field-label">{tr('Unique username', 'ਵੱਖਰਾ ਯੂਜ਼ਰਨੇਮ')}</span>
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
                <label className="auth-claim-row flex items-start gap-3 p-4 text-sm leading-5">
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
                    ? tr('Sign in', 'ਸਾਈਨ ਇਨ')
                    : tr('Create account', 'ਖਾਤਾ ਬਣਾਓ')}
              </button>
            </form>
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
          <div>
            <p className="text-sm font-semibold">{tr('Focus', 'ਧਿਆਨ')}</p>
            <p className="mt-0.5 text-xs text-white/55">
              {pacedAuto
                ? tr('Auto count active', 'ਆਟੋ ਗਿਣਤੀ ਚਾਲੂ ਹੈ')
                : paused
                  ? tr('Paused', 'ਰੁਕਿਆ ਹੋਇਆ')
                  : tr('Session active', 'ਸੈਸ਼ਨ ਚਾਲੂ ਹੈ')}
            </p>
          </div>
          <span className="h-px w-14 bg-[color:var(--gold-light)]/45" aria-hidden="true" />
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
            <span className="size-1 rounded-full bg-white/35" aria-hidden="true" />
            <span>
              {sessionCount % settings.malaSize} {tr('Jaap', 'ਜਾਪ')}
            </span>
            {targetedFocus && (
              <>
                <span className="size-1 rounded-full bg-white/35" aria-hidden="true" />
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
      ? tr('Jaap', 'ਜਾਪ')
      : activeView === 'sangat'
        ? tr('Sangat', 'ਸੰਗਤ')
        : activeView === 'focus'
          ? tr('Focus', 'ਧਿਆਨ')
          : activeView === 'progress'
            ? tr('Progress', 'ਪ੍ਰਗਤੀ')
            : activeView === 'heritage'
              ? tr('Heritage', 'ਵਿਰਾਸਤ')
              : activeView === 'summary'
                ? tr('Summary', 'ਸਾਰ')
                : tr('More', 'ਹੋਰ');

  const navigationContent = (mobile = false) => (
    <>
      <button
        className="flex items-center gap-3 rounded-2xl px-2 pr-10 text-left"
        onClick={() => {
          goToView('jaap');
          if (mobile) setMobileMenuOpen(false);
        }}
        type="button"
      >
        <SehajBrand />
      </button>

      <nav aria-label={mobile ? 'Mobile menu' : 'Primary'} className="mt-12 grid gap-2">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-current={
              activeView === id || (activeView === 'summary' && id === 'jaap')
                ? 'page'
                : undefined
            }
            className={cn(
              'flex min-h-12 items-center gap-3 rounded-2xl px-4 text-left text-[.94rem] font-medium transition',
              activeView === id || (activeView === 'summary' && id === 'jaap')
                ? 'bg-primary text-primary-foreground shadow-[0_10px_24px_rgba(23,50,77,.12)]'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
            onClick={() => {
              goToView(id);
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
          <Trophy aria-hidden="true" className="size-4 text-[color:var(--saffron)]" />
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
              {day.label.slice(0, 1)}
            </span>
          ))}
        </div>
      </Panel>
    </>
  );

  return (
    <main
      className={cn(
        'heritage-shell spatial-shell min-h-dvh text-foreground',
        settings.simpleMode && 'simple-mode',
      )}
    >
      <div aria-hidden="true" className="ambient-depth ambient-depth-a" />
      <div aria-hidden="true" className="ambient-depth ambient-depth-b" />
      <aside
        aria-hidden={!settings.sidebarOpen}
        id="desktop-navigation"
        inert={!settings.sidebarOpen}
        className={cn(
          'spatial-sidebar fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col px-5 py-7 transition-[transform,visibility] duration-500',
          settings.sidebarOpen
            ? 'visible translate-x-0'
            : 'invisible -translate-x-full pointer-events-none',
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

      <section className="min-h-dvh">
        <header className="site-header spatial-header sticky top-0 z-20 flex min-h-[74px] items-center justify-between gap-3 px-4 py-3 sm:px-8 lg:px-12">
          <button
            aria-label={tr('Open navigation', 'ਨੇਵੀਗੇਸ਼ਨ ਖੋਲ੍ਹੋ')}
            className="header-icon-button xl:hidden"
            onClick={() => setMobileMenuOpen(true)}
            type="button"
          >
            <Menu aria-hidden="true" className="size-5" />
          </button>
          <h1 className="min-w-0 truncate font-heading text-lg font-semibold xl:hidden">
            {pageTitle}
          </h1>
          <div className="hidden min-w-0 items-center gap-8 xl:flex">
            <button
              className="brand-wordmark flex items-center gap-3 text-left"
              onClick={() => goToView('jaap')}
              type="button"
            >
              <SehajBrand />
            </button>
            <nav className="desktop-scroll-nav flex items-center gap-1" aria-label="Primary">
              {navItems.map(({ id, label }) => (
                <button
                  key={id}
                  aria-current={
                    activeView === id || (activeView === 'summary' && id === 'jaap')
                      ? 'page'
                      : undefined
                  }
                  className="desktop-nav-link"
                  onClick={() => {
                    goToView(id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </nav>
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
                aria-label="Use English"
                aria-pressed={locale === 'en'}
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
                aria-label="ਪੰਜਾਬੀ ਵਰਤੋ"
                aria-pressed={locale === 'pa'}
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
              onClick={() => goToView('more')}
              type="button"
            >
              <CircleUserRound aria-hidden="true" className="size-5" strokeWidth={1.7} />
            </button>
          </div>
        </header>

        {activeView === 'jaap' && (
          <div className="view-stage scroll-story mx-auto w-full max-w-[1180px] px-4 pb-28 pt-2 sm:px-8 lg:px-12 lg:pt-5 xl:pb-16">
            <Panel data-reveal className="counter-panel counter-3d-stage relative isolate flex min-h-[calc(100dvh-108px)] flex-col items-center overflow-hidden px-5 pb-7 pt-8 sm:min-h-[690px] sm:px-9 sm:pt-10 lg:min-h-[730px]">
              <div aria-hidden="true" className="counter-cinematic-media">
                <Image
                  alt=""
                  className="counter-cinematic-photo object-cover"
                  fill
                  priority
                  quality={94}
                  sizes="(max-width: 1180px) 100vw, 1180px"
                  src="/media/sangat/hazur-sahib-courtyard.jpg"
                  style={{ objectPosition: 'center 50%' }}
                />
                <span className="counter-cinematic-wash" />
              </div>
              <div aria-hidden="true" className="halo" />
              <div className="relative z-10 text-center">
                <p className="eyebrow">{tr('Today', 'ਅੱਜ')}</p>
                <p className="font-gurmukhi text-[clamp(2.4rem,7vw,4.6rem)] font-semibold leading-none tracking-[-.03em] text-primary">
                  ਵਾਹਿਗੁਰੂ
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
                  'count-button count-orb-3d relative z-10 my-auto grid aspect-square w-[min(75vw,370px)] place-items-center rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--gold)]/45 active:scale-[.985]',
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
                  <span className="size-1 rounded-full bg-[color:var(--gold)]" aria-hidden="true" />
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

            <aside data-reveal className="floating-rail story-rail grid content-start gap-5 lg:grid-cols-3">
              <Panel className="goal-orbit-panel story-media-card p-6">
                <Image
                  alt=""
                  className="story-card-media object-cover"
                  fill
                  quality={90}
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  src="/media/sangat/hazur-night-dome.jpeg"
                  style={{ objectPosition: 'center 44%' }}
                />
                <span aria-hidden="true" className="story-card-scrim" />
                <div className="relative z-10 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {tr('Goal', 'ਟੀਚਾ')}
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-[-.03em]">
                      {formatNumber(settings.dailyGoal)}
                    </p>
                  </div>
                  <div className="progress-ring" style={progressStyle}>
                    <span>{progress}%</span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {formatNumber(Math.max(0, settings.dailyGoal - todayCount))}{' '}
                  {tr('remaining', 'ਬਾਕੀ')}
                </p>
              </Panel>

              <button
                aria-label={tr('Open focus setup', 'ਧਿਆਨ ਸੈਟਅੱਪ ਖੋਲ੍ਹੋ')}
                className="depth-action depth-action-primary story-media-card group flex min-h-24 items-center justify-between px-6 text-left text-primary-foreground"
                onClick={() => goToView('focus')}
                type="button"
              >
                <Image
                  alt=""
                  className="story-card-media object-cover"
                  fill
                  quality={90}
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  src="/hemkund-sahib.jpg"
                  style={{ objectPosition: 'center 48%' }}
                />
                <span aria-hidden="true" className="story-card-scrim story-card-scrim-dark" />
                <span className="relative z-10">
                  <span className="block text-lg font-semibold">{tr('Focus', 'ਧਿਆਨ')}</span>
                  <span className="mt-1 block text-xs text-white/60">
                    {tr('Begin a session', 'ਸੈਸ਼ਨ ਸ਼ੁਰੂ ਕਰੋ')}
                  </span>
                </span>
                <span className="relative z-10 grid size-11 place-items-center rounded-full bg-white/10 transition group-hover:bg-white/15">
                  <Focus aria-hidden="true" className="size-5" />
                </span>
              </button>

              <button
                className="practice-link-card depth-action story-media-card group flex min-h-32 w-full items-center gap-4 p-5 text-left"
                onClick={() => goToView('sangat')}
                type="button"
              >
                <Image
                  alt=""
                  className="story-card-media object-cover"
                  fill
                  quality={90}
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  src="/media/sangat/hazur-night-sangat.jpeg"
                  style={{ objectPosition: 'center 50%' }}
                />
                <span aria-hidden="true" className="story-card-scrim" />
                <span className="relative z-10 grid size-12 shrink-0 place-items-center rounded-2xl bg-white/70 text-primary backdrop-blur-md">
                  <UsersRound aria-hidden="true" className="size-5" />
                </span>
                <span className="relative z-10 min-w-0 flex-1">
                  <span className="block truncate font-semibold text-white">
                    {membership ? membership.groupName : tr('Sangat', 'ਸੰਗਤ')}
                  </span>
                  <span className="mt-1 block text-sm text-white/72">
                    {tr('Practice together online', 'ਆਨਲਾਈਨ ਮਿਲ ਕੇ ਅਭਿਆਸ ਕਰੋ')}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="relative z-10 size-4 text-white/75 transition-transform group-hover:translate-x-0.5" />
              </button>
            </aside>

            <section className="home-scroll-journey" data-reveal>
              <div className="home-scroll-copy">
                <p className="eyebrow">{tr('Your practice, over time', 'ਸਮੇਂ ਨਾਲ ਤੁਹਾਡਾ ਅਭਿਆਸ')}</p>
                <h2>
                  {tr(
                    'One quiet repetition becomes a journey.',
                    'ਇੱਕ ਸ਼ਾਂਤ ਜਾਪ ਇੱਕ ਯਾਤਰਾ ਬਣ ਜਾਂਦਾ ਹੈ।',
                  )}
                </h2>
                <p>
                  {tr(
                    'The interface opens up as you scroll: practice first, then reflection, Sangat and heritage. Nothing competes with the counter.',
                    'ਸਕ੍ਰੋਲ ਨਾਲ ਇੰਟਰਫੇਸ ਹੌਲੀ-ਹੌਲੀ ਖੁਲ੍ਹਦਾ ਹੈ: ਪਹਿਲਾਂ ਅਭਿਆਸ, ਫਿਰ ਮਨਨ, ਸੰਗਤ ਅਤੇ ਵਿਰਾਸਤ। ਕਾਊਂਟਰ ਨਾਲ ਕੁਝ ਵੀ ਮੁਕਾਬਲਾ ਨਹੀਂ ਕਰਦਾ।',
                  )}
                </p>
              </div>

              <div className="home-journey-metrics" data-reveal aria-label={tr('Practice overview', 'ਅਭਿਆਸ ਦੀ ਝਲਕ')}>
                <div>
                  <strong>{formatNumber(weekTotal)}</strong>
                  <span>{tr('This week', 'ਇਸ ਹਫ਼ਤੇ')}</span>
                </div>
                <div>
                  <strong>{currentStreak}</strong>
                  <span>{tr('Day streak', 'ਦਿਨਾਂ ਦੀ ਲੜੀ')}</span>
                </div>
                <div>
                  <strong>{formatNumber(Math.floor(weekTotal / settings.malaSize))}</strong>
                  <span>{tr('Mala this week', 'ਇਸ ਹਫ਼ਤੇ ਮਾਲਾ')}</span>
                </div>
              </div>

              <button
                className="home-film-link"
                data-reveal
                onClick={() => goToView('heritage')}
                type="button"
              >
                <Image
                  alt=""
                  className="home-film-link-image object-cover"
                  fill
                  quality={94}
                  sizes="(max-width: 1180px) 100vw, 1180px"
                  src="/media/sangat/hazur-golden-evening.jpeg"
                  style={{ objectPosition: 'center 60%' }}
                />
                <span className="home-film-link-scrim" aria-hidden="true" />
                <span className="home-film-link-copy">
                  <span className="eyebrow text-white/65">{tr('Heritage', 'ਵਿਰਾਸਤ')}</span>
                  <strong>{tr('Continue into living history', 'ਜੀਵੰਤ ਇਤਿਹਾਸ ਵੱਲ ਅੱਗੇ ਵਧੋ')}</strong>
                  <span>{tr('Explore the visual story', 'ਦ੍ਰਿਸ਼ ਕਹਾਣੀ ਵੇਖੋ')} →</span>
                </span>
              </button>

              <div className="home-journey-actions" data-reveal>
                <button onClick={() => goToView('progress')} type="button">
                  <span>{tr('See your journey', 'ਆਪਣੀ ਯਾਤਰਾ ਵੇਖੋ')}</span>
                  <ChevronRight aria-hidden="true" />
                </button>
                <button onClick={() => goToView('sangat')} type="button">
                  <span>{tr('Practice with Sangat', 'ਸੰਗਤ ਨਾਲ ਅਭਿਆਸ ਕਰੋ')}</span>
                  <ChevronRight aria-hidden="true" />
                </button>
              </div>
            </section>
          </div>
        )}

        {activeView === 'focus' && (
          <div className="view-stage focus-setup-story mx-auto w-full max-w-[1120px] px-4 pb-28 pt-3 sm:px-8 lg:px-12 xl:pb-16">
            <section className="focus-setup-hero" data-reveal>
              <div className="focus-setup-hero-media" aria-hidden="true">
                <Image
                  alt=""
                  className="object-cover"
                  fill
                  priority
                  quality={94}
                  sizes="(max-width: 1120px) 100vw, 1120px"
                  src="/media/sangat/gurbani-pages.jpg"
                  style={{ objectPosition: 'center 43%' }}
                />
                <span className="focus-setup-hero-wash" />
              </div>
              <div className="focus-setup-hero-copy">
                <p className="eyebrow">{tr('Focus', 'ਧਿਆਨ')}</p>
                <h1>{tr('Make space for one intention.', 'ਇੱਕ ਸੰਕਲਪ ਲਈ ਥਾਂ ਬਣਾਓ।')}</h1>
                <p>
                  {tr(
                    'Choose time, target or pace. The controls stay secondary so the session itself remains the centre of attention.',
                    'ਸਮਾਂ, ਟੀਚਾ ਜਾਂ ਰਫ਼ਤਾਰ ਚੁਣੋ। ਕੰਟਰੋਲ ਦੂਜੇ ਪੱਧਰ ਤੇ ਰਹਿੰਦੇ ਹਨ ਤਾਂ ਜੋ ਸੈਸ਼ਨ ਖੁਦ ਧਿਆਨ ਦਾ ਕੇਂਦਰ ਰਹੇ।',
                  )}
                </p>
              </div>
            </section>
            <Panel data-reveal className="focus-setup-panel p-6 sm:p-8 lg:p-10">
              <div className="mb-8">
                <p className="max-w-xl text-[15px] leading-6 text-muted-foreground">
                  {tr(
                    'Create a distraction-free practice session.',
                    'ਬਿਨਾਂ ਭਟਕਾਵੇ ਦੇ ਅਭਿਆਸ ਲਈ ਸੈਸ਼ਨ ਬਣਾਓ।',
                  )}
                </p>
              </div>

              <Tabs
                value={focusMode}
                onValueChange={(value) => setFocusMode(value as FocusMode)}
              >
                <TabsList className="focus-tabs h-auto w-full gap-2 bg-transparent p-0">
                  <TabsTrigger value="timer">{tr('Timer', 'ਟਾਈਮਰ')}</TabsTrigger>
                  <TabsTrigger value="target">{tr('Target', 'ਟੀਚਾ')}</TabsTrigger>
                  <TabsTrigger value="both">{tr('Timer + target', 'ਟਾਈਮਰ + ਟੀਚਾ')}</TabsTrigger>
                  <TabsTrigger value="paced">{tr('Paced', 'ਰਫ਼ਤਾਰ')}</TabsTrigger>
                </TabsList>
              </Tabs>

              {(focusMode === 'timer' || focusMode === 'both') && (
                <div className="mt-8">
                  <p className="field-label">{tr('Session length', 'ਸੈਸ਼ਨ ਦਾ ਸਮਾਂ')}</p>
                  <div className="choice-grid">
                    {[5, 10, 15, 20, 30, 45, 60].map((minutes) => (
                      <button
                          key={minutes}
                          aria-pressed={focusMinutes === minutes}
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
                  <p className="field-label">{tr('Target', 'ਟੀਚਾ')}</p>
                  <div className="choice-grid">
                    {[108, 216, 500, 1000, 2500].map((target) => (
                      <button
                          key={target}
                          aria-pressed={focusTarget === target}
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
                    <p className="field-label">{tr('Pace', 'ਰਫ਼ਤਾਰ')}</p>
                    <div className="choice-grid">
                      {[1, 2, 3, 5].map((pace) => (
                        <button
                          key={pace}
                          aria-pressed={focusPace === pace}
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
                      aria-pressed={!pacedAuto}
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
                      aria-pressed={pacedAuto}
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
                {tr('Start session', 'ਸੈਸ਼ਨ ਸ਼ੁਰੂ ਕਰੋ')}
              </button>
            </Panel>
          </div>
        )}

        {activeView === 'sangat' && (
          <div className="view-stage sangat-experience mx-auto w-full max-w-[1180px] px-4 pb-28 pt-3 sm:px-8 lg:px-12 xl:pb-16">
            <section className="sangat-hero-scroll" data-reveal>
              <Image
                alt=""
                className="sangat-hero-image object-cover"
                fill
                priority
                quality={94}
                sizes="(max-width: 1180px) 100vw, 1180px"
                src="/media/sangat/hazur-evening-arrival.jpeg"
                style={{ objectPosition: 'center 60%' }}
              />
              <span className="sangat-hero-scrim" aria-hidden="true" />
              <div className="sangat-hero-copy">
                <p className="eyebrow text-white/65">{tr('Sangat', 'ਸੰਗਤ')}</p>
                <h1>{tr('Practice feels different together.', 'ਮਿਲ ਕੇ ਅਭਿਆਸ ਦਾ ਅਨੁਭਵ ਵੱਖਰਾ ਹੁੰਦਾ ਹੈ।')}</h1>
                <p>
                  {tr(
                    'A private shared intention, designed with less interface and more room for presence.',
                    'ਇੱਕ ਨਿੱਜੀ ਸਾਂਝਾ ਸੰਕਲਪ — ਘੱਟ ਇੰਟਰਫੇਸ ਅਤੇ ਹਾਜ਼ਰੀ ਲਈ ਵੱਧ ਥਾਂ ਨਾਲ।',
                  )}
                </p>
              </div>
            </section>
            {!membership ? (
              <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
                <Panel className="sangat-intro flex min-h-[300px] flex-col justify-end overflow-hidden p-7 text-primary-foreground sm:p-9 lg:min-h-[560px]">
                  <span className="grid size-12 place-items-center rounded-2xl bg-white/10" aria-hidden="true">
                    <UsersRound className="size-6" />
                  </span>
                  <h1 className="mt-6 font-heading text-3xl font-semibold tracking-[-.035em] sm:text-4xl">
                    {tr('Practice together.', 'ਮਿਲ ਕੇ ਅਭਿਆਸ ਕਰੋ।')}
                  </h1>
                  <p className="mt-3 max-w-md text-[15px] leading-7 text-white/68">
                    {tr(
                      'Create or join a private group and share one daily intention.',
                      'ਇੱਕ ਨਿੱਜੀ ਗਰੁੱਪ ਬਣਾਓ ਜਾਂ ਜੁੜੋ ਅਤੇ ਇੱਕ ਰੋਜ਼ਾਨਾ ਸੰਕਲਪ ਸਾਂਝਾ ਕਰੋ।',
                    )}
                  </p>
                </Panel>

                <Panel className="p-6 sm:p-8 lg:p-10">
                  <h2 className="page-heading">
                    {groupData && groupMode === 'join'
                      ? tr('Join ', 'ਸ਼ਾਮਲ ਹੋਵੋ: ') + groupData.name
                      : tr('Create or join', 'ਬਣਾਓ ਜਾਂ ਜੁੜੋ')}
                  </h2>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {tr('Signed in as @', '@ ਵਜੋਂ ਸਾਈਨ ਇਨ: ')}{account.username}
                  </p>

                  <Tabs
                    className="mt-7"
                    value={groupMode}
                    onValueChange={(value) => setGroupMode(value as 'join' | 'create')}
                  >
                    <TabsList className="h-11 w-full rounded-2xl bg-secondary p-1">
                      <TabsTrigger className="rounded-xl" value="join">
                        <Link2 aria-hidden="true" />
                        {tr('Join', 'ਜੁੜੋ')}
                      </TabsTrigger>
                      <TabsTrigger className="rounded-xl" value="create">
                        <UsersRound aria-hidden="true" />
                        {tr('Create', 'ਬਣਾਓ')}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <form className="mt-7 grid gap-5" onSubmit={submitSangat}>
                    {groupMode === 'create' ? (
                      <>
                        <label className="grid gap-2">
                          <span className="field-label">{tr('Group name', 'ਗਰੁੱਪ ਦਾ ਨਾਮ')}</span>
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
                          ? tr('Join', 'ਜੁੜੋ')
                          : tr('Create', 'ਬਣਾਓ')}
                    </button>
                  </form>
                </Panel>
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_360px]">
                <div className="grid gap-6">
                  <Panel className="sangat-summary overflow-hidden p-7 text-primary-foreground sm:p-10">
                    <p className="text-xs font-semibold tracking-[.15em] text-white/55 uppercase">
                      {tr('Today', 'ਅੱਜ')}
                    </p>
                    <h1 className="mt-3 text-[clamp(3.5rem,9vw,6rem)] font-semibold leading-none tracking-[-.07em] tabular-nums">
                      {formatNumber(groupData?.total ?? 0)}
                    </h1>
                    <p className="mt-6 text-sm text-white/68">
                      {groupData?.activeMembers ?? 0}{' '}
                      {tr('members practised', 'ਮੈਂਬਰਾਂ ਨੇ ਅਭਿਆਸ ਕੀਤਾ')}
                    </p>
                  </Panel>

                  <Panel className="p-6 sm:p-8">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-semibold">{membership.groupName}</h2>
                      </div>
                      <p className="text-right text-sm text-muted-foreground">
                        {tr('Goal', 'ਟੀਚਾ')}{' '}
                        <strong className="block text-lg text-foreground">
                          {formatNumber(groupData?.dailyGoal ?? 0)}
                        </strong>
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

                <div className="profile-strip grid content-start gap-6 lg:grid-cols-2">
                  <Panel className="p-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-semibold">{tr('Members', 'ਮੈਂਬਰ')}</h2>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {groupData ? visibleSangatMembers(groupData).length : 1}
                      </span>
                    </div>
                    {groupData?.canManage && (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        {tr(
                          'You created this Sangat. You can remove other members from the group.',
                          'ਤੁਸੀਂ ਇਹ ਸੰਗਤ ਬਣਾਈ ਹੈ। ਤੁਸੀਂ ਹੋਰ ਮੈਂਬਰਾਂ ਨੂੰ ਸੰਗਤ ਤੋਂ ਹਟਾ ਸਕਦੇ ਹੋ।',
                        )}
                      </p>
                    )}
                    <div className="mt-6 grid gap-2">
                      {visibleSangatMembers(groupData).map((member) => (
                        <div
                          key={member.id}
                          className="sangat-member-row flex min-h-16 items-center gap-3 rounded-2xl bg-secondary/70 px-4"
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card text-sm font-semibold text-primary">
                            {member.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-sm font-medium">
                                {member.name}
                              </span>
                              {member.isOrganizer && (
                                <span className="sangat-role-badge">
                                  {tr('Organizer', 'ਪ੍ਰਬੰਧਕ')}
                                </span>
                              )}
                              {member.isYou && !member.isOrganizer && (
                                <span className="sangat-role-badge">
                                  {tr('You', 'ਤੁਸੀਂ')}
                                </span>
                              )}
                            </span>
                          </span>
                          <span className="shrink-0">
                            {member.privacy === 'private' ? (
                              <span className="text-xs text-muted-foreground">
                                {tr('Private', 'ਨਿੱਜੀ')}
                              </span>
                            ) : member.privacy === 'exact' ? (
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
                          </span>
                          {member.canRemove && (
                            <button
                              aria-label={tr(
                                `Remove ${member.name}`,
                                `${member.name} ਨੂੰ ਹਟਾਓ`,
                              )}
                              className="sangat-remove-button"
                              disabled={Boolean(removingMemberId)}
                              onClick={() => void removeSangatMember(member)}
                              title={tr('Remove member', 'ਮੈਂਬਰ ਹਟਾਓ')}
                              type="button"
                            >
                              <UserMinus aria-hidden="true" className="size-4" />
                              <span className="hidden sm:inline">
                                {removingMemberId === member.id
                                  ? tr('Removing…', 'ਹਟਾਇਆ ਜਾ ਰਿਹਾ…')
                                  : tr('Remove', 'ਹਟਾਓ')}
                              </span>
                            </button>
                          )}
                        </div>
                      ))}
                      {!visibleSangatMembers(groupData).length && (
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
          <div className="view-stage progress-story mx-auto w-full max-w-[1180px] px-4 pb-28 pt-3 sm:px-8 lg:px-12 xl:pb-16">
            <section className="progress-story-hero" data-reveal>
              <div>
                <p className="eyebrow">{tr('Your journey', 'ਤੁਹਾਡੀ ਯਾਤਰਾ')}</p>
                <h1>{tr('Consistency, made visible.', 'ਨਿਰੰਤਰਤਾ, ਹੁਣ ਦਿੱਖ ਵਿੱਚ।')}</h1>
                <p>
                  {tr(
                    'Progress is presented as a timeline and rhythm rather than a dashboard of isolated numbers.',
                    'ਪ੍ਰਗਤੀ ਨੂੰ ਵੱਖ-ਵੱਖ ਅੰਕਾਂ ਵਾਲੇ ਡੈਸ਼ਬੋਰਡ ਦੀ ਥਾਂ ਇੱਕ ਟਾਈਮਲਾਈਨ ਅਤੇ ਲਯ ਵਜੋਂ ਪੇਸ਼ ਕੀਤਾ ਗਿਆ ਹੈ।',
                  )}
                </p>
              </div>
              <div className="progress-story-number">
                <strong>{formatNumber(weekTotal)}</strong>
                <span>{tr('Jaap this week', 'ਇਸ ਹਫ਼ਤੇ ਜਾਪ')}</span>
              </div>
            </section>

            <div className="progress-week-timeline" data-reveal>
              {recentDays.map((day) => (
                <button
                  key={day.key}
                  className={cn(
                    'progress-day',
                    day.key === today && 'progress-day-today',
                    day.record.jaap >= settings.streakMinimum && 'progress-day-complete',
                  )}
                  onClick={() => setSelectedDay(day.key)}
                  type="button"
                >
                  <span>{day.label}</span>
                  <strong>{formatNumber(day.record.jaap)}</strong>
                  <i aria-hidden="true" />
                </button>
              ))}
            </div>

            <div className="metric-ribbon grid gap-0 sm:grid-cols-2 lg:grid-cols-4" data-reveal>
              {[
                { label: tr('This week', 'ਇਸ ਹਫ਼ਤੇ'), value: formatNumber(weekTotal), icon: MousePointerClick },
                { label: tr('Malas', 'ਮਾਲਾ'), value: formatNumber(Math.floor(weekTotal / settings.malaSize)), icon: Target },
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
                  <h2 className="text-xl font-semibold">{tr('This week', 'ਇਸ ਹਫ਼ਤੇ')}</h2>
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

              <Panel className="calendar-panel p-4 sm:p-8">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="eyebrow">{tr('Calendar', 'ਕੈਲੰਡਰ')}</p>
                    <h2 className="text-xl font-semibold">
                      {new Intl.DateTimeFormat(locale === 'pa' ? 'pa-IN' : 'en-IN', {
                        month: 'long',
                      }).format(new Date())}
                    </h2>
                  </div>
                </div>
                <div className="calendar-grid mt-7 grid grid-cols-7 gap-1.5">
                  {calendarDays.map(({ key, date, record }) => {
                    const complete = (record?.jaap ?? 0) >= settings.streakMinimum;
                    return (
                      <button
                        key={key}
                        aria-label={
                          new Intl.DateTimeFormat(locale === 'pa' ? 'pa-IN' : 'en-IN', {
                            day: 'numeric',
                            month: 'long',
                          }).format(date) +
                          ': ' +
                          formatNumber(record?.jaap ?? 0) +
                          ' ' +
                          tr('Jaap', 'ਜਾਪ')
                        }
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
                        {date.getDate()}
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
          <div className="view-stage editorial-flow mx-auto w-full max-w-[1120px] px-4 pb-28 pt-3 sm:px-8 lg:px-12 xl:pb-16">
            <Panel className="p-6 sm:p-8">
              <div>
                <h2 className="settings-section-label">{tr('Practice', 'ਅਭਿਆਸ')}</h2>
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
                  icon={<BarChart3 aria-hidden="true" className="size-5" />}
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
                <h2 className="settings-section-label mt-7">{tr('Experience', 'ਅਨੁਭਵ')}</h2>
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
                <span className="grid size-12 place-items-center rounded-2xl bg-[color:var(--mist)] text-primary">
                  <CircleUserRound aria-hidden="true" className="size-6" />
                </span>
                <h2 className="mt-5 text-xl font-semibold">{account.displayName}</h2>
                <p className="mt-1 text-sm font-medium text-[color:var(--saffron)]">
                  @{account.username}
                </p>
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
                    onClick={() => goToView('sangat')}
                    type="button"
                  >
                    <UsersRound aria-hidden="true" />
                    {tr('Open my Sangat', 'ਮੇਰੀ ਸੰਗਤ ਖੋਲ੍ਹੋ')}
                  </button>
                </Panel>
              )}
            </div>

          </div>
        )}

        {activeView === 'heritage' && (
          <HeritageExperience locale={locale} />
        )}

        {activeView === 'summary' && summary && (
          <div className="view-stage summary-experience mx-auto w-full max-w-[980px] px-4 pb-28 pt-8 sm:px-8 xl:pb-16">
            <Panel data-reveal className="summary-cinematic overflow-hidden text-center">
              <div className="summary-cinematic-media" aria-hidden="true">
                <Image
                  alt=""
                  className="object-cover"
                  fill
                  quality={92}
                  sizes="(max-width: 980px) 100vw, 980px"
                  src="/bangla-sahib.jpg"
                  style={{ objectPosition: 'center 50%' }}
                />
                <span />
              </div>
              <div className="summary-top px-6 py-10 text-primary-foreground sm:py-14">
                <span className="mx-auto grid size-12 place-items-center rounded-full border border-white/15 bg-white/10" aria-hidden="true">
                  <Check className="size-5 text-[color:var(--gold-light)]" />
                </span>
                <h1 className="mt-5 font-heading text-3xl font-semibold text-white sm:text-4xl">
                  {tr('Session complete', 'ਸੈਸ਼ਨ ਪੂਰਾ ਹੋਇਆ')}
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
                  <button className="primary-action" onClick={() => goToView('jaap')} type="button">
                    <MousePointerClick aria-hidden="true" />
                    {tr('Continue', 'ਜਾਰੀ ਰੱਖੋ')}
                  </button>
                  <button className="outline-action" onClick={() => goToView('focus')} type="button">
                    <Focus aria-hidden="true" />
                    {tr('Another session', 'ਇੱਕ ਹੋਰ ਸੈਸ਼ਨ')}
                  </button>
                </div>
              </div>
            </Panel>
          </div>
        )}
      </section>

      <nav
        aria-label="Mobile navigation"
        className="mobile-navigation spatial-dock fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-40 grid grid-cols-5 p-2 backdrop-blur-xl xl:hidden"
      >
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-current={
              activeView === id || (activeView === 'summary' && id === 'jaap')
                ? 'page'
                : undefined
            }
            className={cn(
              'flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-medium',
              activeView === id || (activeView === 'summary' && id === 'jaap')
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground',
            )}
            onClick={() => goToView(id)}
            type="button"
          >
            <Icon aria-hidden="true" className="size-[19px]" strokeWidth={1.8} />
            <span className="max-w-full truncate">{label}</span>
          </button>
        ))}
      </nav>

      {notice && (
        <output
          aria-live="polite"
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
            <DialogTitle className="text-xl">{tr('Custom amount', 'ਆਪਣੀ ਗਿਣਤੀ')}</DialogTitle>
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
              {tr('Add', 'ਜੋੜੋ')}
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
