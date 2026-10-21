ALTER TABLE `documents` ADD `size_bytes` bigint unsigned;--> statement-breakpoint
ALTER TABLE `documents` ADD `mime_type` varchar(120);--> statement-breakpoint
ALTER TABLE `documents` ADD `error_message` varchar(512);--> statement-breakpoint
ALTER TABLE `model_configs` ADD `is_default` boolean DEFAULT false NOT NULL;