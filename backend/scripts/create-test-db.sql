-- Crea i database dedicati ai test di migrazione.
-- Eseguire una sola volta, come amministratore MySQL:
--   mysql -u root -p < scripts/create-test-db.sql
-- Non tocca express_finance / express_finance_shadow.

-- Database "reale" dei test: qui il wrapper scripts/prisma-test.js applica le migration.
CREATE DATABASE IF NOT EXISTS express_finance_test
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Shadow database: Prisma lo svuota a ogni `migrate dev`, quindi resta separato.
CREATE DATABASE IF NOT EXISTS express_finance_test_shadow
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Privilegi per l'utente applicativo (stesso di .env), su entrambi gli host usati in locale.
GRANT ALL PRIVILEGES ON express_finance_test.* TO 'prisma_user'@'localhost';
GRANT ALL PRIVILEGES ON express_finance_test_shadow.* TO 'prisma_user'@'localhost';
GRANT ALL PRIVILEGES ON express_finance_test.* TO 'prisma_user'@'%';
GRANT ALL PRIVILEGES ON express_finance_test_shadow.* TO 'prisma_user'@'%';

FLUSH PRIVILEGES;
