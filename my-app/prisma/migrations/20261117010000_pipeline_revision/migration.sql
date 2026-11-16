ALTER TABLE `Pipeline` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `creationKey` VARCHAR(36) NULL;
CREATE UNIQUE INDEX `Pipeline_subAccountId_creationKey_key` ON `Pipeline`(`subAccountId`, `creationKey`);
