// Helper centralizzato per il soft delete (`deletedAt`).
//
// Regola: nessun service scrive `deletedAt: null` a mano, usa questi
// helper così il filtro non può essere dimenticato.
//
// - Liste pubbliche (render): `where: withAlive({ userId })`
// - Cestino assistenza: `where: withDeleted({ userId })`
// - Cancellare: `await softDelete(prisma.transaction, { id })`
// - Ripristinare: `await restore(prisma.transaction, { id })`

// Frammento where per i soli record attivi.
export const alive = () => ({ deletedAt: null });

// Frammento where per i soli record cancellati (cestino assistenza).
export const onlyDeleted = () => ({ deletedAt: { not: null } });

// Unisce un filtro esistente con "solo attivi".
export const withAlive = (where = {}) => ({ ...where, ...alive() });

// Unisce un filtro esistente con "solo cancellati".
export const withDeleted = (where = {}) => ({ ...where, ...onlyDeleted() });

// Cancellazione logica: imposta deletedAt invece di eliminare la riga.
// `model` è il delegate Prisma (es. prisma.transaction).
export const softDelete = (model, where) =>
    model.update({
        where,
        data: { deletedAt: new Date() },
    });

// Ripristino da cancellazione logica (solo se cancellato).
export const restore = (model, where) =>
    model.update({
        where: withDeleted(where),
        data: { deletedAt: null },
    });
