import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as savingsService from "./savings.service.js";
import { validateDeposit, validateGoalCreate, validateGoalList, validateGoalUpdate } from "./savings.schemas.js";

// I controller traducono HTTP <-> service. req.user.id arriva dal
// middleware auth: ogni operazione è vincolata all'utente autenticato.

// GET /api/v1/goals?filtri -> 200 { data: [], meta }.
export const list = asyncHandler(async (req, res) => {
    const filters = validateGoalList(req.query);
    const { items, meta } = await savingsService.list(req.user.id, filters);
    res.json({ data: items, meta });
});

// GET /api/v1/goals/:id -> 200 { data } o 404.
export const getById = asyncHandler(async (req, res) => {
    const item = await savingsService.getById(req.user.id, req.params.id);
    res.json({ data: item });
});

// POST /api/v1/goals -> 201 { data }.
export const create = asyncHandler(async (req, res) => {
    const input = validateGoalCreate(req.body);
    const item = await savingsService.create(req.user.id, input);
    res.status(201).json({ data: item });
});

// PATCH /api/v1/goals/:id -> 200 { data } o 404.
export const update = asyncHandler(async (req, res) => {
    const input = validateGoalUpdate(req.body);
    const item = await savingsService.update(req.user.id, req.params.id, input);
    res.json({ data: item });
});

// POST /api/v1/goals/:id/deposit -> 200 { data } (somma e auto-REACHED).
export const deposit = asyncHandler(async (req, res) => {
    const input = validateDeposit(req.body);
    const item = await savingsService.deposit(req.user.id, req.params.id, input.amount);
    res.json({ data: item });
});

// DELETE /api/v1/goals/:id -> 200 { data: { id, deletedAt } } (soft).
export const remove = asyncHandler(async (req, res) => {
    const result = await savingsService.remove(req.user.id, req.params.id);
    res.json({ data: result });
});

// GET /api/v1/goals/trash?page&limit -> 200 { data: [], meta }.
export const trash = asyncHandler(async (req, res) => {
    const filters = validateGoalList(req.query);
    const { items, meta } = await savingsService.listTrash(req.user.id, filters);
    res.json({ data: items, meta });
});

// POST /api/v1/goals/:id/restore -> 200 { data } o 404.
export const restoreItem = asyncHandler(async (req, res) => {
    const item = await savingsService.restoreItem(req.user.id, req.params.id);
    res.json({ data: item });
});
