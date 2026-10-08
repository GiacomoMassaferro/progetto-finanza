import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as transactionsService from "./transactions.service.js";
import { validateCreate, validateList, validateUpdate } from "./transactions.schemas.js";

// I controller traducono HTTP <-> service. req.user.id arriva dal
// middleware auth: ogni operazione è vincolata all'utente autenticato.

// GET /api/v1/transactions?filtri -> 200 { data: [], meta }.
export const list = asyncHandler(async (req, res) => {
    const filters = validateList(req.query);
    const { items, meta } = await transactionsService.list(req.user.id, filters);
    res.json({ data: items, meta });
});

// GET /api/v1/transactions/:id -> 200 { data } o 404.
export const getById = asyncHandler(async (req, res) => {
    const item = await transactionsService.getById(req.user.id, req.params.id);
    res.json({ data: item });
});

// POST /api/v1/transactions -> 201 { data }.
export const create = asyncHandler(async (req, res) => {
    const input = validateCreate(req.body);
    const item = await transactionsService.create(req.user.id, input);
    res.status(201).json({ data: item });
});

// PATCH /api/v1/transactions/:id -> 200 { data } o 404.
export const update = asyncHandler(async (req, res) => {
    const input = validateUpdate(req.body);
    const item = await transactionsService.update(req.user.id, req.params.id, input);
    res.json({ data: item });
});

// DELETE /api/v1/transactions/:id -> 200 { data: { id, deletedAt } } (soft).
export const remove = asyncHandler(async (req, res) => {
    const result = await transactionsService.remove(req.user.id, req.params.id);
    res.json({ data: result });
});

// GET /api/v1/transactions/trash?page&limit -> 200 { data: [], meta }.
export const trash = asyncHandler(async (req, res) => {
    const filters = validateList(req.query);
    const { items, meta } = await transactionsService.listTrash(req.user.id, filters);
    res.json({ data: items, meta });
});

// POST /api/v1/transactions/:id/restore -> 200 { data } o 404.
export const restoreItem = asyncHandler(async (req, res) => {
    const item = await transactionsService.restoreItem(req.user.id, req.params.id);
    res.json({ data: item });
});
