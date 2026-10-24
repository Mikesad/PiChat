CREATE TABLE `search_configs` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`provider` varchar(40) NOT NULL,
	`name` varchar(120) NOT NULL,
	`remark` varchar(500),
	`encrypted_api_key` text,
	`proxy` varchar(512),
	`enabled` boolean NOT NULL DEFAULT true,
	`is_default` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `search_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `model_configs` DROP INDEX `model_configs_tenant_user_model_uq`;--> statement-breakpoint
ALTER TABLE `model_configs` ADD `kind` varchar(20) DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE `model_configs` ADD CONSTRAINT `model_configs_tenant_user_model_uq` UNIQUE(`tenant_id`,`user_id`,`kind`,`provider`,`model_id`);--> statement-breakpoint
ALTER TABLE `search_configs` ADD CONSTRAINT `search_configs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `search_configs` ADD CONSTRAINT `search_configs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `search_configs_user_idx` ON `search_configs` (`tenant_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `search_configs_default_idx` ON `search_configs` (`tenant_id`,`user_id`,`is_default`);