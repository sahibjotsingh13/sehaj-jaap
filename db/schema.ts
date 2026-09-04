import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(),
    privacy: text('privacy', { enum: ['exact', 'practiced', 'private'] })
      .notNull()
      .default('exact'),
    joinedAt: integer('joined_at').notNull(),
  },
  (table) => [
    index('idx_sangat_members_group_id').on(table.groupId),
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
