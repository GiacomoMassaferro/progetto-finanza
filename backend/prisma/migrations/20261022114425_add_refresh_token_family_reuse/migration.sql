-- Refresh token: famiglia di sessione, consumo (rotazione) e revoca.
-- La colonna family_id nasce NULL per poter riempire le righe esistenti:
-- ogni token già presente diventa una famiglia a sé (SHA2 del token_hash).
ALTER TABLE `refresh_tokens` ADD COLUMN `family_id` VARCHAR(191) NULL,
    ADD COLUMN `revoked_at` DATETIME(3) NULL,
    ADD COLUMN `used_at` DATETIME(3) NULL;

-- Backfill: le sessioni preesistenti non hanno una catena di rotazione,
-- quindi ogni token storico è la radice di una famiglia propria.
UPDATE `refresh_tokens` SET `family_id` = SHA2(`token_hash`, 256) WHERE `family_id` IS NULL;

-- Da qui la colonna è obbligatoria (stato del modello Prisma).
ALTER TABLE `refresh_tokens` MODIFY COLUMN `family_id` VARCHAR(191) NOT NULL;

-- Indice sulla famiglia: serve a revocare l'intera catena in una query.
CREATE INDEX `refresh_tokens_family_id_idx` ON `refresh_tokens`(`family_id`);
