ALTER TABLE `model_configs` DROP FOREIGN KEY `model_configs_user_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `search_configs` DROP FOREIGN KEY `search_configs_user_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `model_configs` MODIFY COLUMN `user_id` varchar(36);--> statement-breakpoint
ALTER TABLE `search_configs` MODIFY COLUMN `user_id` varchar(36);--> statement-breakpoint
ALTER TABLE `model_configs` ADD CONSTRAINT `model_configs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `search_configs` ADD CONSTRAINT `search_configs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;