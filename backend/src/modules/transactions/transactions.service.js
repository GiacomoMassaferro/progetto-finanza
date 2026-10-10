import { AppError } from "../../common/utils/AppError.js";
import { toMoneyString } from "../../common/utils/money.js";
import { restore, softDelete, withAlive, withDeleted } from "../../common/utils/softDelete.js";
import { prisma } from "../../config/prisma.js";

// Categoria inclusa nelle risposte: al render serve il nome senza altre chiamate.
const CATEGORY_SELECT = { select: { id: true, name: true, type: true, color: true } };

// Converte la riga Prisma in oggetto API (BigInt -> string, soldi -> "0.00").
function toSafeTransaction(row) {
    return {
        id: String(row.id),
        amount: toMoneyString(row.amount),
        type: row.type,
        description: row.description,
        transactionDate: row.transactionDate,
        debtPaymentId: row.debtPaymentId ? String(row.debtPaymentId) : null,
        category: row.movementsCategory
            ? {
                  id: String(row.movementsCategory.id),
                  name: row.movementsCategory.name,
                  type: row.movementsCategory.type,
                  color: row.movementsCategory.color,
              }
            : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

// Converte l'id di rotta in BigInt; formati errati -> 404, mai 500.
function toId(id) {
    try {
        return BigInt(id);
    } catch {
        throw new AppError(404, "Transazione non trovata");
    }
}

// La categoria deve esistere, essere attiva e dell'utente (404 unica per
// non rivelare categorie altrui). Restituisce l'id convertito.
async function checkCategory(userId, categoryId) {
    let id;
    try {
        id = BigInt(categoryId);
    } catch {
        throw new AppError(404, "Categoria non trovata");
    }
    const category = await prisma.movementsCategory.findFirst({
        where: withAlive({ id, userId: BigInt(userId) }),
    });
    if (!category) {
        throw new AppError(404, "Categoria non trovata");
    }
    return id;
}

// La rata collegata (se indicata) deve appartenere a un debito dell'utente.
// Accetta null per scollegarla; restituisce l'id convertito o null.
async function checkDebtPayment(userId, debtPaymentId) {
    if (debtPaymentId === null || debtPaymentId === undefined) {
        return null;
    }
    let id;
    try {
        id = BigInt(debtPaymentId);
    } catch {
        throw new AppError(404, "Rata non trovata");
    }
    const payment = await prisma.debtPayment.findFirst({
        where: withAlive({ id, debt: withAlive({ userId: BigInt(userId) }) }),
    });
    if (!payment) {
        throw new AppError(404, "Rata non trovata");
    }
    return id;
}

// Lista paginata delle transazioni attive dell'utente (+ filtri).
export async function list(userId, { page, limit, type, categoryId, from, to }) {
    const where = withAlive({
        userId: BigInt(userId),
        ...(type ? { type } : {}),
        ...(categoryId ? { movementsCategoryId: toId(categoryId) } : {}),
        ...((from || to)
            ? { transactionDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
            : {}),
    });
    const [total, rows] = await Promise.all([
        prisma.transaction.count({ where }),
        prisma.transaction.findMany({
            where,
            include: { movementsCategory: CATEGORY_SELECT },
            orderBy: { transactionDate: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
    ]);
    return {
        items: rows.map(toSafeTransaction),
        meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
}

// Dettaglio transazione, solo se attiva e di proprietà dell'utente.
export async function getById(userId, id) {
    const row = await prisma.transaction.findFirst({
        where: withAlive({ id: toId(id), userId: BigInt(userId) }),
        include: { movementsCategory: CATEGORY_SELECT },
    });
    if (!row) {
        throw new AppError(404, "Transazione non trovata");
    }
    return toSafeTransaction(row);
}

// Crea una transazione verificando categoria (propria) ed eventuale rata.
export async function create(userId, data) {
    const movementsCategoryId = await checkCategory(userId, data.movementsCategoryId);
    const debtPaymentId = await checkDebtPayment(userId, data.debtPaymentId);
    const row = await prisma.transaction.create({
        data: {
            userId: BigInt(userId),
            movementsCategoryId,
            debtPaymentId,
            amount: data.amount,
            type: data.type,
            description: data.description ?? null,
            transactionDate: data.transactionDate,
        },
        include: { movementsCategory: CATEGORY_SELECT },
    });
    return toSafeTransaction(row);
}

// Modifica parziale, solo su transazione propria e attiva.
// Ogni campo fornito viene ricontrollato (categoria e rata comprese).
export async function update(userId, id, data) {
    await getById(userId, id); // 404 se altrui o cancellata
    const patch = {};
    if (data.amount !== undefined) {
        patch.amount = data.amount;
    }
    if (data.type !== undefined) {
        patch.type = data.type;
    }
    if (data.description !== undefined) {
        patch.description = data.description;
    }
    if (data.transactionDate !== undefined) {
        patch.transactionDate = data.transactionDate;
    }
    if (data.movementsCategoryId !== undefined) {
        patch.movementsCategoryId = await checkCategory(userId, data.movementsCategoryId);
    }
    // debtPaymentId null scollega la rata; valore fornito la ricontrolla.
    if (data.debtPaymentId !== undefined) {
        patch.debtPaymentId = await checkDebtPayment(userId, data.debtPaymentId);
    }
    const row = await prisma.transaction.update({
        where: { id: toId(id) },
        data: patch,
        include: { movementsCategory: CATEGORY_SELECT },
    });
    return toSafeTransaction(row);
}

// Cancellazione logica (soft delete): la riga resta per l'assistenza.
export async function remove(userId, id) {
    await getById(userId, id); // 404 se altrui o già cancellata
    const row = await softDelete(prisma.transaction, { id: toId(id) });
    return { id: String(row.id), deletedAt: row.deletedAt };
}

// Cestino dell'utente: solo transazioni cancellate, paginate.
export async function listTrash(userId, { page, limit }) {
    const where = withDeleted({ userId: BigInt(userId) });
    const [total, rows] = await Promise.all([
        prisma.transaction.count({ where }),
        prisma.transaction.findMany({
            where,
            include: { movementsCategory: CATEGORY_SELECT },
            orderBy: { deletedAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
    ]);
    return {
        items: rows.map(toSafeTransaction),
        meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
}

// Ripristina una transazione cancellata (404 se attiva, altrui o inesistente).
export async function restoreItem(userId, id) {
    const row = await prisma.transaction.findFirst({
        where: withDeleted({ id: toId(id), userId: BigInt(userId) }),
        include: { movementsCategory: CATEGORY_SELECT },
    });
    if (!row) {
        throw new AppError(404, "Transazione non trovata nel cestino");
    }
    const restored = await restore(prisma.transaction, { id: row.id });
    return toSafeTransaction({ ...restored, movementsCategory: row.movementsCategory });
}
