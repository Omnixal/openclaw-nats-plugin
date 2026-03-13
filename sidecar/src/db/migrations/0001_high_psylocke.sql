CREATE TABLE `pending_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_key` text NOT NULL,
	`subject` text NOT NULL,
	`payload` text,
	`priority` integer DEFAULT 5 NOT NULL,
	`created_at` integer NOT NULL,
	`delivered_at` integer
);
