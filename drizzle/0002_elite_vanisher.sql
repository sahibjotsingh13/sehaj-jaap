ALTER TABLE `accounts` ADD `failed_login_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `locked_until` integer DEFAULT 0 NOT NULL;
