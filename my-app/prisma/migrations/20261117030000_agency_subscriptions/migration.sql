CREATE TABLE `AgencySubscription` (
  `id` VARCHAR(191) NOT NULL,
  `agencyId` VARCHAR(191) NOT NULL,
  `priceId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `currentPeriodEnd` DATETIME(3) NOT NULL,
  `cancelAtPeriodEnd` BOOLEAN NOT NULL,
  `collectionPaused` BOOLEAN NOT NULL,
  `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AgencySubscription_agencyId_syncedAt_idx` (`agencyId`, `syncedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE `StripeWebhookReceipt` (
  `id` VARCHAR(191) NOT NULL,
  `type` VARCHAR(64) NOT NULL,
  `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

ALTER TABLE `AgencySubscription` ADD CONSTRAINT `AgencySubscription_agencyId_fkey`
FOREIGN KEY (`agencyId`) REFERENCES `Agency`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
