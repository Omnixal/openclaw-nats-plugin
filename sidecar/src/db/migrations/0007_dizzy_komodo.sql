CREATE TABLE `timer_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`subject` text NOT NULL,
	`payload` text,
	`delay_ms` integer NOT NULL,
	`fire_at` integer NOT NULL,
	`fired` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timer_jobs_name_unique` ON `timer_jobs` (`name`);--> statement-breakpoint
CREATE INDEX `timer_jobs_name_idx` ON `timer_jobs` (`name`);--> statement-breakpoint
CREATE INDEX `timer_jobs_fire_at_idx` ON `timer_jobs` (`fire_at`);