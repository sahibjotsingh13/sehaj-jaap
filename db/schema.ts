import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    passwordSalt: text('password_salt').notNull(),
    passwordIterations: integer('password_iterations').notNull().default(600000),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: integer('locked_until').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('idx_accounts_username').on(table.username)],
);

export const authSessions = sqliteTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_auth_sessions_token_hash').on(table.tokenHash),
    index('idx_auth_sessions_account_id').on(table.accountId),
    index('idx_auth_sessions_expires_at').on(table.expiresAt),
  ],
);

export const sangatGroups = sqliteTable(
  'sangat_groups',
  {
    id: text('id').primaryKey(),
    inviteCode: text('invite_code').notNull(),
    name: text('name').notNull(),
    dailyGoal: integer('daily_goal').notNull().default(50000),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('idx_sangat_groups_invite_code').on(table.inviteCode)],
);

export const sangatMembers = sqliteTable(
  'sangat_members',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => sangatGroups.id, { onDelete: 'cascade' }),
    accountId: text('account_id').references(() => accounts.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(),
    privacy: text('privacy', { enum: ['exact', 'practiced', 'private'] })
      .notNull()
      .default('exact'),
    joinedAt: integer('joined_at').notNull(),
  },
  (table) => [
    index('idx_sangat_members_group_id').on(table.groupId),
    uniqueIndex('idx_sangat_members_group_account').on(
      table.groupId,
      table.accountId,
    ),
    uniqueIndex('idx_sangat_members_token_hash').on(table.tokenHash),
  ],
);

export const sangatContributions = sqliteTable(
  'sangat_contributions',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => sangatGroups.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => sangatMembers.id, { onDelete: 'restrict' }),
    amount: integer('amount').notNull(),
    practiceDate: text('practice_date').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_sangat_contributions_group_date').on(
      table.groupId,
      table.practiceDate,
    ),
    index('idx_sangat_contributions_member_date').on(
      table.memberId,
      table.practiceDate,
    ),
  ],
);
