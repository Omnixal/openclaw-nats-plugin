DROP INDEX `event_routes_pattern_unique`;--> statement-breakpoint
ALTER TABLE `event_routes` ADD `name` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `event_routes` SET `name` = `pattern` WHERE `name` = '';--> statement-breakpoint
ALTER TABLE `event_routes` ADD `filter` text;--> statement-breakpoint
ALTER TABLE `event_routes` ADD `filter_drop_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `event_routes_name_idx` ON `event_routes` (`name`);
