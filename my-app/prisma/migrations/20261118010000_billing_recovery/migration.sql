CREATE TABLE `BillingRecoveryReceipt` (
  `id` VARCHAR(36) NOT NULL,
  `agencyId` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(16) NOT NULL,
  `objectId` VARCHAR(191) NOT NULL,
  `fingerprint` CHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `BillingRecoveryReceipt_agencyId_createdAt_idx` (`agencyId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `BillingRecoveryReceipt_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `Agency`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
