import { AppError } from "../../common/utils/AppError.js";
import { toMoneyString } from "../../common/utils/money.js";
import { restore, softDelete, withAlive, withDeleted } from "../../common/utils/softDelete.js";
import { prisma } from "../../config/prisma.js";

// Converte la riga Prisma in oggetto API + percentuale di avanzamento.
function toSafeGoal(row) {
    const target = Number(row.targetAmount);
    const current = Number(row.currentAmount);
    return {
        id: String(row.id),
        name: row.name,
        targetAmount: toMoneyString(row.targetAmount),
        currentAmount: toMoneyString(row.currentAmount),
        status: row.status,
        progressPct: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

// Converte l'id di rotta in BigInt; formati errati -> 404, mai 500.
function toId(id) {
    try {
        return BigInt(id);
    } catch {
        throw new AppError(404, "Obiettivo non trovato");
    }
}

// Obiettivo attivo di proprietà dell'utente.
async function findGoal(userId, id) {
    const row = await prisma.savingsGoal.findFirst({
        where: withAlive({ id: toId(id), userId: BigInt(userId) }),
    });
    if (!row) {
        throw new AppError(404, "Obiettivo non trovato");
    }
    return row;
}

// Lista paginata degli obiettivi attivi (+ filtro stato).
export async function list(userId, { page, limit, status }) {
    const where = withAlive({ userId: BigInt(userId), ...(status ? { status } : {}) });
    const [total, rows] = await Promise.all([
        prisma.savingsGoal.count({ where }),
        prisma.savingsGoal.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
    ]);
    return {
        items: rows.map(toSafeGoal),
        meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
}

// Dettaglio obiettivo proprio e attivo.
export async function getById(userId, id) {
    return toSafeGoal(await findGoal(userId, id));
}

// Crea un obiettivo (accantonato parte da zero se omesso).
export async function create(userId, data) {
    const row = await prisma.savingsGoal.create({
        data: {
            userId: BigInt(userId),
            name: data.name,
            targetAmount: data.targetAmount,
            currentAmount: data.currentAmount ?? "0.00",
            status: data.status ?? "ACTIVE",
        },
    });
    return toSafeGoal(row);
}

// Modifica parziale, solo su obiettivo proprio e attivo.
export async function update(userId, id, data) {
    await findGoal(userId, id); // 404 se altrui o cancellato
    const row = await prisma.savingsGoal.update({ where: { id: toId(id) }, data });
    return toSafeGoal(row);
}

// Versa una somma: si somma all'accantonato; al raggiungimento
// dell'obiettivo lo stato passa da solo a REACHED.
export async function deposit(userId, id, amount) {
    const goal = await findGoal(userId, id);
    const current = Math.round(Number(goal.currentAmount) * 100) + Math.round(Number(amount) * 100);
    const target = Math.round(Number(goal.targetAmount) * 100);
    const row = await prisma.savingsGoal.update({
        where: { id: goal.id },
        data: {
            currentAmount: (current / 100).toFixed(2),
            ...(current >= target ? { status: "REACHED" } : {}),
        },
    });
    return toSafeGoal(row);
}

// Cancellazione logica (soft delete): la riga resta per l'assistenza.
export async function remove(userId, id) {
    await findGoal(userId, id); // 404 se altrui o già cancellato
    const row = await softDelete(prisma.savingsGoal, { id: toId(id) });
    return { id: String(row.id), deletedAt: row.deletedAt };
}

// Cestino dell'utente: solo obiettivi cancellati, paginati.
export async function listTrash(userId, { page, limit }) {
    const where = withDeleted({ userId: BigInt(userId) });
    const [total, rows] = await Promise.all([
        prisma.savingsGoal.count({ where }),
        prisma.savingsGoal.findMany({
            where,
            orderBy: { deletedAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
    ]);
    return {
        items: rows.map(toSafeGoal),
        meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
}

// Ripristina un obiettivo cancellato (404 se attivo, altrui o inesistente).
export async function restoreItem(userId, id) {
    const row = await prisma.savingsGoal.findFirst({
        where: withDeleted({ id: toId(id), userId: BigInt(userId) }),
    });
    if (!row) {
        throw new AppError(404, "Obiettivo non trovato nel cestino");
    }
    return toSafeGoal(await restore(prisma.savingsGoal, { id: row.id }));
}
