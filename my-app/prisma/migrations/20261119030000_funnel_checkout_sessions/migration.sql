-- AlterTable
ALTER TABLE `FunnelCheckoutAttempt` ADD COLUMN `sessionId` VARCHAR(191) NULL,
    ADD COLUMN `sessionRequest` JSON NULL,
    ADD COLUMN `sessionStatus` VARCHAR(16) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `FunnelCheckoutAttempt_sessionId_key` ON `FunnelCheckoutAttempt`(`sessionId`);

