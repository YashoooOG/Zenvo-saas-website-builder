CREATE TABLE `AgencyCatalog` (
  `agencyId` VARCHAR(191) NOT NULL,
  `syncToken` VARCHAR(36) NOT NULL,
  `accountId` VARCHAR(191) NULL,
  `products` JSON NULL,
  `syncedAt` DATETIME(3) NULL,
  PRIMARY KEY (`agencyId`),
  CONSTRAINT `AgencyCatalog_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `Agency` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
