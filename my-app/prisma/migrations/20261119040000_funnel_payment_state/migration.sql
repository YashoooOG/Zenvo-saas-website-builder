-- AlterTable
ALTER TABLE `FunnelCheckoutAttempt` ADD COLUMN `paymentConfirmedAt` DATETIME(3) NULL,
    ADD COLUMN `paymentIntentId` VARCHAR(191) NULL,
    ADD COLUMN `paymentStatus` VARCHAR(16) NOT NULL DEFAULT 'pending';

-- CreateIndex
CREATE UNIQUE INDEX `FunnelCheckoutAttempt_paymentIntentId_key` ON `FunnelCheckoutAttempt`(`paymentIntentId`);

