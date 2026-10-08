import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as categoriesService from "./categories.service.js";
import { validateCreate, validateList, validateUpdate } from "./categories.schemas.js";

// I controller traducono HTTP <-> service. req.user.id arriva dal
// middleware auth: ogni operazione è vincolata all'utente autenticato.

// GET /api/v1/categories?page&limit&type -> 200 { data: [], meta }.
export const list = asyncHandler(async (req, res) => {
    const filters = validateList(req.query);
    const { items, meta } = await categoriesService.list(req.user.id, filters);
    res.json({ data: items, meta });
});

// GET /api/v1/categories/:id -> 200 { data } o 404.
export const getById = asyncHandler(async (req, res) => {
    const item = await categoriesService.getById(req.user.id, req.params.id);
    res.json({ data: item });
});

// POST /api/v1/categories -> 201 { data }.
export const create = asyncHandler(async (req, res) => {
    const input = validateCreate(req.body);
    const item = await categoriesService.create(req.user.id, input);
    res.status(201).json({ data: item });
});

// PATCH /api/v1/categories/:id -> 200 { data } o 404.
export const update = asyncHandler(async (req, res) => {
    const input = validateUpdate(req.body);
    const item = await categoriesService.update(req.user.id, req.params.id, input);
    res.json({ data: item });
});

// DELETE /api/v1/categories/:id -> 200 { data: { id, deletedAt } } (soft).
export const remove = asyncHandler(async (req, res) => {
    const result = await categoriesService.remove(req.user.id, req.params.id);
    res.json({ data: result });
});

// GET /api/v1/categories/trash?page&limit -> 200 { data: [], meta }.
export const trash = asyncHandler(async (req, res) => {
    const filters = validateList(req.query);
    const { items, meta } = await categoriesService.listTrash(req.user.id, filters);
    res.json({ data: items, meta });
});

// POST /api/v1/categories/:id/restore -> 200 { data } o 404.
export const restoreItem = asyncHandler(async (req, res) => {
    const item = await categoriesService.restoreItem(req.user.id, req.params.id);
    res.json({ data: item });
});
