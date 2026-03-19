CREATE TABLE `event_routes` (
	`id` text PRIMARY KEY NOT NULL,
	`pattern` text NOT NULL,
	`target` text DEFAULT 'main' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 5 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_routes_pattern_unique` ON `event_routes` (`pattern`);--> statement-breakpoint
CREATE INDEX `event_routes_pattern_idx` ON `event_routes` (`pattern`);--> statement-breakpoint
CREATE INDEX `event_routes_target_idx` ON `event_routes` (`target`);