-- AlterTable
ALTER TABLE `Agency` ADD COLUMN `address` VARCHAR(256) NULL,
    ADD COLUMN `businessEmail` VARCHAR(320) NULL,
    ADD COLUMN `city` VARCHAR(100) NULL,
    ADD COLUMN `country` VARCHAR(100) NULL,
    ADD COLUMN `creationKey` VARCHAR(36) NULL,
    ADD COLUMN `phone` VARCHAR(40) NULL,
    ADD COLUMN `postalCode` VARCHAR(32) NULL,
    ADD COLUMN `region` VARCHAR(100) NULL,
    ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `website` VARCHAR(2048) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Agency_ownerId_creationKey_key` ON `Agency`(`ownerId`, `creationKey`);
