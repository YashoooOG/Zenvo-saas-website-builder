CREATE TABLE `ConnectOAuthAttempt` (
  `id` VARCHAR(36) NOT NULL,
  `agencyId` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `stateHash` CHAR(64) NOT NULL,
  `codeHash` CHAR(64) NULL,
  `clientId` VARCHAR(191) NOT NULL,
  `callbackUrl` VARCHAR(2048) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  `accountId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,
  `completedAt` DATETIME(3) NULL,
  UNIQUE INDEX `ConnectOAuthAttempt_stateHash_key` (`stateHash`),
  UNIQUE INDEX `ConnectOAuthAttempt_codeHash_key` (`codeHash`),
  INDEX `ConnectOAuthAttempt_agencyId_status_expiresAt_idx` (`agencyId`, `status`, `expiresAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ConnectOAuthAttempt_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `Agency`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
