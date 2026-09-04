CREATE TABLE `sangat_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`member_id` text NOT NULL,
	`amount` integer NOT NULL,
	`practice_date` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `sangat_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `sangat_members`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_sangat_contributions_group_date` ON `sangat_contributions` (`group_id`,`practice_date`);--> statement-breakpoint
CREATE INDEX `idx_sangat_contributions_member_date` ON `sangat_contributions` (`member_id`,`practice_date`);--> statement-breakpoint
CREATE TABLE `sangat_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`invite_code` text NOT NULL,
	`name` text NOT NULL,
	`daily_goal` integer DEFAULT 50000 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sangat_groups_invite_code` ON `sangat_groups` (`invite_code`);--> statement-breakpoint
CREATE TABLE `sangat_members` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`privacy` text DEFAULT 'exact' NOT NULL,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `sangat_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sangat_members_group_id` ON `sangat_members` (`group_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sangat_members_token_hash` ON `sangat_members` (`token_hash`);