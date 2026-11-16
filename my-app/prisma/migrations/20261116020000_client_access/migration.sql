ALTER TABLE `SubAccountMembership` ADD COLUMN `version` VARCHAR(36) NULL;
UPDATE `SubAccountMembership` SET `version` = UUID();
ALTER TABLE `SubAccountMembership` MODIFY `version` VARCHAR(36) NOT NULL;
CREATE TABLE `SubAccountInvitation` (
  `id` VARCHAR(191) NOT NULL,
  `agencyId` VARCHAR(191) NOT NULL,
  `subAccountId` VARCHAR(191) NOT NULL,
  `email` VARCHAR(320) NOT NULL,
  `role` ENUM('ADMIN', 'MEMBER', 'GUEST') NOT NULL DEFAULT 'GUEST',
  `tokenHash` CHAR(64) NOT NULL,
  `createdBy` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `acceptedAt` DATETIME(3) NULL,
  `acceptedBy` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `SubAccountInvitation_tokenHash_key` (`tokenHash`),
  INDEX `SubAccountInvitation_agencyId_createdAt_idx` (`agencyId`, `createdAt`),
  INDEX `SubAccountInvitation_subAccountId_email_idx` (`subAccountId`, `email`),
  CONSTRAINT `SubAccountInvitation_agencyId_subAccountId_fkey` FOREIGN KEY (`agencyId`, `subAccountId`) REFERENCES `SubAccount` (`agencyId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
