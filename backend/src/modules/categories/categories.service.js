import { AppError } from "../../common/utils/AppError.js";
import { restore, softDelete, withAlive, withDeleted } from "../../common/utils/softDelete.js";
import { prisma } from "../../config/prisma.js";

// Converte la riga Prisma in oggetto API (BigInt -> string, vedi PLAN I-03).
function toSafeCategory(row) {
    return {
        id: String(row.id),
        name: row.name,
        type: row.type,
        color: row.color,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

// Converte l'id di rotta in BigInt; formati errati -> 404, mai 500.
function toId(id) {
    try {
        return BigInt(id);
    } catch {
        throw new AppError(404, "Categoria non trovata");
    }
}

// Lista paginata delle categorie attive dell'utente (+ filtro per tipo).
export async function list(userId, { page, limit, type }) {
    const where = withAlive({ userId: BigInt(userId), ...(type ? { type } : {}) });
    const [total, rows] = await Promise.all([
        prisma.movementsCategory.count({ where }),
        prisma.movementsCategory.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
    ]);
    return {
        items: rows.map(toSafeCategory),
        meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
}

// Dettaglio categoria, solo se attiva e di proprietà dell'utente.
export async function getById(userId, id) {
    const row = await prisma.movementsCategory.findFirst({
        where: withAlive({ id: toId(id), userId: BigInt(userId) }),
    });
    if (!row) {
        throw new AppError(404, "Categoria non trovata");
    }
    return toSafeCategory(row);
}

// Crea una categoria per l'utente autenticato.
export async function create(userId, data) {
    const row = await prisma.movementsCategory.create({
        data: { ...data, userId: BigInt(userId) },
    });
    return toSafeCategory(row);
}

// Modifica parziale, solo su categoria propria e attiva.
export async function update(userId, id, data) {
    await getById(userId, id); // 404 se altrui o cancellata
    const row = await prisma.movementsCategory.update({
        where: { id: toId(id) },
        data,
    });
    return toSafeCategory(row);
}

// Cancellazione logica (soft delete): la riga resta per l'assistenza.
export async function remove(userId, id) {
    await getById(userId, id); // 404 se altrui o già cancellata
    const row = await softDelete(prisma.movementsCategory, { id: toId(id) });
    return { id: String(row.id), deletedAt: row.deletedAt };
}

// Cestino dell'utente: solo categorie cancellate, paginate.
export async function listTrash(userId, { page, limit }) {
    const where = withDeleted({ userId: BigInt(userId) });
    const [total, rows] = await Promise.all([
        prisma.movementsCategory.count({ where }),
        prisma.movementsCategory.findMany({
            where,
            orderBy: { deletedAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
    ]);
    return {
        items: rows.map(toSafeCategory),
        meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
}

// Ripristina una categoria cancellata (404 se attiva, altrui o inesistente).
export async function restoreItem(userId, id) {
    const row = await prisma.movementsCategory.findFirst({
        where: withDeleted({ id: toId(id), userId: BigInt(userId) }),
    });
    if (!row) {
        throw new AppError(404, "Categoria non trovata nel cestino");
    }
    return toSafeCategory(await restore(prisma.movementsCategory, { id: row.id }));
}
