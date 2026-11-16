ALTER TABLE `SubAccount`
  ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `creationKey` VARCHAR(36) NULL;
CREATE UNIQUE INDEX `SubAccount_agencyId_creationKey_key` ON `SubAccount`(`agencyId`, `creationKey`);
