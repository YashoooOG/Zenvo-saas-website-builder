CREATE TABLE `AgencyInvitation` (
  `id` VARCHAR(191) NOT NULL,
  `agencyId` VARCHAR(191) NOT NULL,
  `email` VARCHAR(320) NOT NULL,
  `role` ENUM('ADMIN', 'MEMBER', 'CLIENT') NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `createdBy` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `acceptedAt` DATETIME(3) NULL,
  `acceptedBy` VARCHAR(191) NULL,
  UNIQUE INDEX `AgencyInvitation_tokenHash_key` (`tokenHash`),
  INDEX `AgencyInvitation_agencyId_createdAt_idx` (`agencyId`, `createdAt`),
  INDEX `AgencyInvitation_agencyId_email_idx` (`agencyId`, `email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
ALTER TABLE `AgencyInvitation` ADD CONSTRAINT `AgencyInvitation_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `Agency`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
