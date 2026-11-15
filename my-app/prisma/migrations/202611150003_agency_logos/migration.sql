-- AlterTable
ALTER TABLE `Agency` ADD COLUMN `logoKey` VARCHAR(191) NULL,
    ADD COLUMN `logoVersion` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `AgencyLogoAsset` (
    `id` VARCHAR(191) NOT NULL,
    `agencyId` VARCHAR(191) NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `fileKey` VARCHAR(191) NULL,
    `url` TEXT NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'RETIRED', 'DELETED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AgencyLogoAsset_fileKey_key`(`fileKey`),
    INDEX `AgencyLogoAsset_agencyId_status_idx`(`agencyId`, `status`),
    INDEX `AgencyLogoAsset_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `AgencyLogoAsset_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateIndex
CREATE UNIQUE INDEX `Agency_logoKey_key` ON `Agency`(`logoKey`);

-- AddForeignKey
ALTER TABLE `AgencyLogoAsset` ADD CONSTRAINT `AgencyLogoAsset_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `Agency`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
