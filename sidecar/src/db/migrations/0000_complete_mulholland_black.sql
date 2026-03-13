CREATE TABLE `dedup_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`seen_at` integer NOT NULL
);
