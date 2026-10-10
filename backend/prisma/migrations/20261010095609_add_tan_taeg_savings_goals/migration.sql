-- AlterTable
ALTER TABLE `debts` ADD COLUMN `taeg` DECIMAL(5, 2) NULL,
    ADD COLUMN `tan` DECIMAL(5, 2) NULL;

-- CreateTable
CREATE TABLE `savings_goals` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `target_amount` DECIMAL(10, 2) NOT NULL,
    `current_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `status` ENUM('ACTIVE', 'REACHED', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    INDEX `savings_goals_user_id_idx`(`user_id`),
    INDEX `savings_goals_status_idx`(`status`),
    INDEX `savings_goals_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `savings_goals` ADD CONSTRAINT `savings_goals_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
