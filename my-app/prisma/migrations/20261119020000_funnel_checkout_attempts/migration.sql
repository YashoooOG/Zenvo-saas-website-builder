-- CreateTable
CREATE TABLE `FunnelCheckoutAttempt` (
    `id` VARCHAR(36) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(36) NOT NULL,
    `agencyId` VARCHAR(191) NOT NULL,
    `subAccountId` VARCHAR(191) NOT NULL,
    `funnelId` VARCHAR(191) NOT NULL,
    `pageId` VARCHAR(191) NOT NULL,
    `publicationHash` CHAR(64) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `authorizedAt` DATETIME(3) NOT NULL,
    `priceId` VARCHAR(191) NOT NULL,
    `productName` VARCHAR(512) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `amount` INTEGER NOT NULL,
    `feeAmount` INTEGER NOT NULL,
    `feeBasisPoints` INTEGER NOT NULL,
    `taxBehavior` VARCHAR(16) NOT NULL,
    `idempotencyKey` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FunnelCheckoutAttempt_idempotencyKey_key`(`idempotencyKey`),
    INDEX `FunnelCheckoutAttempt_agencyId_createdAt_idx`(`agencyId`, `createdAt`),
    INDEX `FunnelCheckoutAttempt_expiresAt_idx`(`expiresAt`),
    UNIQUE INDEX `FunnelCheckoutAttempt_actorId_requestId_key`(`actorId`, `requestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

