import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as dashboardService from "./dashboard.service.js";
import { validateSummary } from "./dashboard.schemas.js";

// GET /api/v1/dashboard/summary?month=YYYY-MM -> 200 { data }.
// Mese omesso = mese corrente. Tutto vincolato all'utente autenticato.
export const summary = asyncHandler(async (req, res) => {
    const filters = validateSummary(req.query);
    const result = await dashboardService.summary(req.user.id, filters);
    res.json({ data: result });
});
