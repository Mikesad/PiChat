CREATE TABLE `auth_sessions` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`last_used_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_sessions_token_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_base_acls` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`knowledge_base_id` varchar(36) NOT NULL,
	`subject_type` enum('user','group') NOT NULL,
	`subject_id` varchar(36) NOT NULL,
	`permission` enum('read','deny') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `knowledge_base_acls_id` PRIMARY KEY(`id`),
	CONSTRAINT `knowledge_base_acls_uq` UNIQUE(`knowledge_base_id`,`subject_type`,`subject_id`)
);
--> statement-breakpoint
ALTER TABLE `model_configs` DROP INDEX `model_configs_tenant_model_uq`;--> statement-breakpoint
ALTER TABLE `knowledge_bases` ADD `acl_version` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `model_configs` ADD `user_id` varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `model_configs` ADD CONSTRAINT `model_configs_tenant_user_model_uq` UNIQUE(`tenant_id`,`user_id`,`provider`,`model_id`);--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledge_base_acls` ADD CONSTRAINT `knowledge_base_acls_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledge_base_acls` ADD CONSTRAINT `knowledge_base_acls_knowledge_base_id_knowledge_bases_id_fk` FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_bases`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `auth_sessions_user_idx` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_expires_idx` ON `auth_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `knowledge_base_acls_tenant_idx` ON `knowledge_base_acls` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `knowledge_base_acls_subject_idx` ON `knowledge_base_acls` (`subject_type`,`subject_id`);--> statement-breakpoint
ALTER TABLE `model_configs` ADD CONSTRAINT `model_configs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `model_configs_user_idx` ON `model_configs` (`tenant_id`,`user_id`);