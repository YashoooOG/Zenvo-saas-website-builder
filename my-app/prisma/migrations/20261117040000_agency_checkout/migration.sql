CREATE TABLE `AgencyCheckout` (
  `agencyId` VARCHAR(191) NOT NULL,
  `customerKey` VARCHAR(36) NOT NULL,
  `customerStartedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `attemptKey` VARCHAR(36) NULL,
  `attemptStartedAt` DATETIME(3) NULL,
  `priceId` VARCHAR(191) NULL,
  `origin` VARCHAR(2048) NULL,
  `expiresAt` INTEGER NULL,
  `sessionId` VARCHAR(191) NULL,
  UNIQUE INDEX `AgencyCheckout_sessionId_key` (`sessionId`),
  PRIMARY KEY (`agencyId`),
  CONSTRAINT `AgencyCheckout_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `Agency`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
