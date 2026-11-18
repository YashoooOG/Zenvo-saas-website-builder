ALTER TABLE `Funnel` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `creationKey` VARCHAR(36) NULL;
CREATE UNIQUE INDEX `Funnel_subAccountId_creationKey_key` ON `Funnel` (`subAccountId`, `creationKey`);
