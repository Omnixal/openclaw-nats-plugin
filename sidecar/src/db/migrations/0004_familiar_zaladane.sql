CREATE TABLE `cron_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`expr` text NOT NULL,
	`subject` text NOT NULL,
	`payload` text,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cron_jobs_name_unique` ON `cron_jobs` (`name`);--> statement-breakpoint
CREATE INDEX `cron_jobs_name_idx` ON `cron_jobs` (`name`);--> statement-breakpoint
ALTER TABLE `event_routes` ADD `last_delivered_at` integer;--> statement-breakpoint
ALTER TABLE `event_routes` ADD `last_event_subject` text;--> statement-breakpoint
ALTER TABLE `event_routes` ADD `delivery_count` integer DEFAULT 0 NOT NULL;