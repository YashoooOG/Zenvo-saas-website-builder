CREATE TABLE `MediaAsset` (
  `id` VARCHAR(191) NOT NULL,
  `subAccountId` VARCHAR(191) NULL,
  `actorId` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'ACTIVE', 'RETIRED', 'DELETED') NOT NULL DEFAULT 'PENDING',
  `fileKey` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `MediaAsset_fileKey_key` (`fileKey`),
  INDEX `MediaAsset_subAccountId_status_idx` (`subAccountId`, `status`),
  INDEX `MediaAsset_actorId_createdAt_idx` (`actorId`, `createdAt`),
  INDEX `MediaAsset_status_createdAt_idx` (`status`, `createdAt`),
  CONSTRAINT `MediaAsset_subAccountId_fkey` FOREIGN KEY (`subAccountId`) REFERENCES `SubAccount` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
