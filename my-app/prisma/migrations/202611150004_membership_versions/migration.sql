ALTER TABLE `AgencyMembership` ADD COLUMN `version` VARCHAR(36) NULL;
UPDATE `AgencyMembership` SET `version` = UUID();
ALTER TABLE `AgencyMembership` MODIFY `version` VARCHAR(36) NOT NULL;
