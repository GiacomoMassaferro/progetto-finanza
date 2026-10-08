// Avvolge un handler async Express e inoltra i reject a next().
// Evita try/catch ripetuti nei controller.
export const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
