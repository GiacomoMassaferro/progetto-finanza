-- AlterTable
ALTER TABLE `debt_payments` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `debts` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `movements_categories` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `transactions` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `debt_payments_deleted_at_idx` ON `debt_payments`(`deleted_at`);

-- CreateIndex
CREATE INDEX `debts_deleted_at_idx` ON `debts`(`deleted_at`);

-- CreateIndex
CREATE INDEX `movements_categories_deleted_at_idx` ON `movements_categories`(`deleted_at`);

-- CreateIndex
CREATE INDEX `transactions_deleted_at_idx` ON `transactions`(`deleted_at`);

-- CreateIndex
CREATE INDEX `users_deleted_at_idx` ON `users`(`deleted_at`);
