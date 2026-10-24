ALTER TABLE `documents` ADD `acl_mode` enum('inherit','restricted') DEFAULT 'inherit' NOT NULL;--> statement-breakpoint
ALTER TABLE `knowledge_bases` ADD `owner_id` varchar(36);--> statement-breakpoint
ALTER TABLE `users` ADD `department_id` varchar(36);--> statement-breakpoint
ALTER TABLE `knowledge_bases` ADD CONSTRAINT `knowledge_bases_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_department_id_groups_id_fk` FOREIGN KEY (`department_id`) REFERENCES `groups`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `knowledge_bases_owner_idx` ON `knowledge_bases` (`owner_id`);--> statement-breakpoint
CREATE INDEX `users_department_idx` ON `users` (`department_id`);