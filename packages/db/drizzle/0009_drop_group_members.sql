-- Data backfill before removing the many-to-many membership table.
UPDATE `users` `u`
SET `department_id` = COALESCE(
	(
		SELECT `gm`.`group_id`
		FROM `group_members` `gm`
		WHERE `gm`.`user_id` = `u`.`id` AND `gm`.`group_id` <> 'g-all'
		ORDER BY `gm`.`created_at` DESC
		LIMIT 1
	),
	(
		SELECT `gm`.`group_id`
		FROM `group_members` `gm`
		WHERE `gm`.`user_id` = `u`.`id`
		ORDER BY `gm`.`created_at` ASC
		LIMIT 1
	)
);
--> statement-breakpoint
UPDATE `knowledge_bases` `kb`
SET `owner_id` = (
	SELECT `u`.`id`
	FROM `users` `u`
	WHERE `u`.`tenant_id` = `kb`.`tenant_id` AND `u`.`role` = 'tenant_admin'
	ORDER BY `u`.`created_at` ASC
	LIMIT 1
)
WHERE `kb`.`owner_id` IS NULL;
--> statement-breakpoint
DROP TABLE `group_members`;
