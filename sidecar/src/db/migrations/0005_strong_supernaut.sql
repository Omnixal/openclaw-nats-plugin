CREATE TABLE `execution_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`subject` text NOT NULL,
	`detail` text,
	`success` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `execution_logs_entity_idx` ON `execution_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `execution_logs_created_at_idx` ON `execution_logs` (`created_at`);