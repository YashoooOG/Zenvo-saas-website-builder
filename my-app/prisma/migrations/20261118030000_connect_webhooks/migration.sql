CREATE TABLE `ConnectAccountSync` (
  `accountId` VARCHAR(191) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `linkedStartedAt` DATETIME(3) NULL,
  `status` JSON NULL,
  `syncedAt` DATETIME(3) NULL,
  PRIMARY KEY (`accountId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE `ConnectWebhookReceipt` (
  `id` VARCHAR(191) NOT NULL,
  `accountId` VARCHAR(191) NOT NULL,
  `type` VARCHAR(64) NOT NULL,
  `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ConnectWebhookReceipt_accountId_idx` (`accountId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
