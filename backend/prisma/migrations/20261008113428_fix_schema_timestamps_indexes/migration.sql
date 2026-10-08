-- AlterTable
ALTER TABLE `debt_payments` ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `debts` ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `movements_categories` ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `transactions` ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `users` MODIFY `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateIndex
CREATE INDEX `debt_payments_status_idx` ON `debt_payments`(`status`);

-- CreateIndex
CREATE INDEX `debts_status_idx` ON `debts`(`status`);

-- CreateIndex
CREATE INDEX `transactions_transaction_date_idx` ON `transactions`(`transaction_date`);

-- RenameIndex
ALTER TABLE `debt_payments` RENAME INDEX `debt_payments_debt_id_fkey` TO `debt_payments_debt_id_idx`;

-- RenameIndex
ALTER TABLE `debts` RENAME INDEX `debts_user_id_fkey` TO `debts_user_id_idx`;

-- RenameIndex
ALTER TABLE `movements_categories` RENAME INDEX `movements_categories_user_id_fkey` TO `movements_categories_user_id_idx`;

-- RenameIndex
ALTER TABLE `transactions` RENAME INDEX `transactions_debt_payment_id_fkey` TO `transactions_debt_payment_id_idx`;

-- RenameIndex
ALTER TABLE `transactions` RENAME INDEX `transactions_movements_category_id_fkey` TO `transactions_movements_category_id_idx`;

-- RenameIndex
ALTER TABLE `transactions` RENAME INDEX `transactions_user_id_fkey` TO `transactions_user_id_idx`;
