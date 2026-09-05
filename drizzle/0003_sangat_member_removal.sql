CREATE TABLE IF NOT EXISTS `sangat_removed_members` (
  `group_id` text NOT NULL,
  `account_id` text NOT NULL,
  `removed_at` integer NOT NULL,
  PRIMARY KEY (`group_id`, `account_id`),
  FOREIGN KEY (`group_id`) REFERENCES `sangat_groups`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sangat_removed_members_account`
ON `sangat_removed_members` (`account_id`);
