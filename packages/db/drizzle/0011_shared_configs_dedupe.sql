DELETE FROM `model_configs`
WHERE `id` IN (
  SELECT `id` FROM (
    SELECT `id`, ROW_NUMBER() OVER (
      PARTITION BY `tenant_id`, `kind`, `provider`, `model_id`
      ORDER BY `is_default` DESC, `updated_at` DESC, `created_at` DESC, `id`
    ) AS `rn`
    FROM `model_configs`
  ) AS `ranked`
  WHERE `rn` > 1
);
--> statement-breakpoint
UPDATE `model_configs` AS `mc`
JOIN (
  SELECT `tenant_id`, `kind`, `id` FROM (
    SELECT `tenant_id`, `kind`, `id`, ROW_NUMBER() OVER (
      PARTITION BY `tenant_id`, `kind`
      ORDER BY `is_default` DESC, `updated_at` DESC, `created_at` DESC, `id`
    ) AS `rn`
    FROM `model_configs`
  ) AS `ranked`
  WHERE `rn` = 1
) AS `pick` ON `pick`.`tenant_id` = `mc`.`tenant_id` AND `pick`.`kind` = `mc`.`kind`
SET `mc`.`is_default` = (`mc`.`id` = `pick`.`id`);
--> statement-breakpoint
UPDATE `search_configs` AS `sc`
JOIN (
  SELECT `tenant_id`, `id` FROM (
    SELECT `tenant_id`, `id`, ROW_NUMBER() OVER (
      PARTITION BY `tenant_id`
      ORDER BY `is_default` DESC, `updated_at` DESC, `created_at` DESC, `id`
    ) AS `rn`
    FROM `search_configs`
  ) AS `ranked`
  WHERE `rn` = 1
) AS `pick` ON `pick`.`tenant_id` = `sc`.`tenant_id`
SET `sc`.`is_default` = (`sc`.`id` = `pick`.`id`);
