RENAME TABLE `groups` TO `departments`;
--> statement-breakpoint
ALTER TABLE `departments` RENAME INDEX `groups_tenant_name_uq` TO `departments_tenant_name_uq`;
--> statement-breakpoint
ALTER TABLE `departments` RENAME INDEX `groups_tenant_idx` TO `departments_tenant_idx`;
--> statement-breakpoint
ALTER TABLE `departments` DROP FOREIGN KEY `groups_tenant_id_tenants_id_fk`;
--> statement-breakpoint
ALTER TABLE `departments` ADD CONSTRAINT `departments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `users` DROP FOREIGN KEY `users_department_id_groups_id_fk`;
--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_department_id_departments_id_fk` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `knowledge_bases` DROP FOREIGN KEY `knowledge_bases_owner_department_id_groups_id_fk`;
--> statement-breakpoint
ALTER TABLE `knowledge_bases` ADD CONSTRAINT `knowledge_bases_owner_department_id_departments_id_fk` FOREIGN KEY (`owner_department_id`) REFERENCES `departments`(`id`) ON DELETE set null ON UPDATE no action;
