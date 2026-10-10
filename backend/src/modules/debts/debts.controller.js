import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as debtsService from "./debts.service.js";
import {
    validateDebtCreate,
    validateDebtList,
    validateDebtUpdate,
    validateDebtWithInstallments,
    validatePay,
    validatePaymentCreate,
    validatePaymentUpdate,
} from "./debts.schemas.js";

// I controller traducono HTTP <-> service. req.user.id arriva dal
// middleware auth: ogni operazione è vincolata all'utente autenticato.

// GET /api/v1/debts?filtri -> 200 { data: [], meta }.
export const list = asyncHandler(async (req, res) => {
    const filters = validateDebtList(req.query);
    const { items, meta } = await debtsService.list(req.user.id, filters);
    res.json({ data: items, meta });
});

// GET /api/v1/debts/:id -> 200 { data } o 404.
export const getById = asyncHandler(async (req, res) => {
    const item = await debtsService.getById(req.user.id, req.params.id);
    res.json({ data: item });
});

// POST /api/v1/debts -> 201 { data }.
export const create = asyncHandler(async (req, res) => {
    const input = validateDebtCreate(req.body);
    const item = await debtsService.create(req.user.id, input);
    res.status(201).json({ data: item });
});

// POST /api/v1/debts/with-installments -> 201 { data } (debito + N rate).
export const createWithInstallments = asyncHandler(async (req, res) => {
    const input = validateDebtWithInstallments(req.body);
    const item = await debtsService.createWithInstallments(req.user.id, input);
    res.status(201).json({ data: item });
});

// PATCH /api/v1/debts/:id -> 200 { data } o 404.
export const update = asyncHandler(async (req, res) => {
    const input = validateDebtUpdate(req.body);
    const item = await debtsService.update(req.user.id, req.params.id, input);
    res.json({ data: item });
});

// DELETE /api/v1/debts/:id -> 200 { data: { id, deletedAt } } (soft, con rate).
export const remove = asyncHandler(async (req, res) => {
    const result = await debtsService.remove(req.user.id, req.params.id);
    res.json({ data: result });
});

// GET /api/v1/debts/trash?page&limit -> 200 { data: [], meta }.
export const trash = asyncHandler(async (req, res) => {
    const filters = validateDebtList(req.query);
    const { items, meta } = await debtsService.listTrash(req.user.id, filters);
    res.json({ data: items, meta });
});

// POST /api/v1/debts/:id/restore -> 200 { data } o 404 (ripristina anche le rate).
export const restoreItem = asyncHandler(async (req, res) => {
    const item = await debtsService.restoreItem(req.user.id, req.params.id);
    res.json({ data: item });
});

// GET /api/v1/debts/:id/payments -> 200 { data: [] }.
export const listPayments = asyncHandler(async (req, res) => {
    const items = await debtsService.listPayments(req.user.id, req.params.id);
    res.json({ data: items });
});

// POST /api/v1/debts/:id/payments -> 201 { data }.
export const createPayment = asyncHandler(async (req, res) => {
    const input = validatePaymentCreate(req.body);
    const item = await debtsService.createPayment(req.user.id, req.params.id, input);
    res.status(201).json({ data: item });
});

// PATCH /api/v1/debts/:id/payments/:paymentId -> 200 { data } o 404.
export const updatePayment = asyncHandler(async (req, res) => {
    const input = validatePaymentUpdate(req.body);
    const item = await debtsService.updatePayment(req.user.id, req.params.id, req.params.paymentId, input);
    res.json({ data: item });
});

// POST /api/v1/debts/:id/payments/:paymentId/pay -> 200 { data: { payment, transaction, debt } }.
export const pay = asyncHandler(async (req, res) => {
    const input = validatePay(req.body);
    const result = await debtsService.pay(req.user.id, req.params.id, req.params.paymentId, input);
    res.json({ data: result });
});
