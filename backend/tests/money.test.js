import { describe, expect, test } from "vitest";
import { parseAmountInput, parseAmountToCents } from "../src/common/utils/money.js";
import { validateDebtCreate, validatePay } from "../src/modules/debts/debts.schemas.js";
import { validateDeposit, validateGoalCreate } from "../src/modules/savings/savings.schemas.js";
import { validateCreate } from "../src/modules/transactions/transactions.schemas.js";

// Importi con decimali: prima il confronto float per esattezza rifiutava
// 19.99 (19.99 * 100 = 1998.9999999999998) con un 400 ingiusto.
// Qui il criterio e' la tolleranza sull'errore binario, non l'uguaglianza.

// Body valido per la creazione debito (i campi che il validatore richiede).
const debtBody = (overrides = {}) => ({
    creditorName: "Test",
    debtType: "BNPL",
    totalAmount: "100.00",
    monthlyPayment: "10.00",
    startDate: "2026-01-01",
    ...overrides,
});

describe("validazione importi (C1)", () => {
    test("accetta importi con due decimali in tutti i moduli", () => {
        expect(validateDebtCreate(debtBody({ totalAmount: "19.99" })).totalAmount).toBe("19.99");
        expect(validateGoalCreate({ name: "Obiettivo", targetAmount: "2.55" }).targetAmount).toBe("2.55");
        expect(validateDeposit({ amount: "0.29" }).amount).toBe("0.29");
        expect(
            validateCreate({
                amount: "19.99",
                type: "EXPENSE",
                transactionDate: "2026-10-08",
                movementsCategoryId: "1",
            }).amount,
        ).toBe("19.99");
    });

    test("accetta numeri JS e stringhe con virgola o formato italiano", () => {
        expect(validateDebtCreate(debtBody({ totalAmount: 19.99 })).totalAmount).toBe("19.99");
        expect(validateDebtCreate(debtBody({ totalAmount: "19,99" })).totalAmount).toBe("19.99");
        expect(validateDebtCreate(debtBody({ totalAmount: "1.234,56" })).totalAmount).toBe("1234.56");
        expect(validateDeposit({ amount: 0.29 }).amount).toBe("0.29");
    });

    test("rifiuta piu' di due decimali e valori non numerici", () => {
        expect(() => validateDeposit({ amount: "19.999" })).toThrow();
        expect(() => validateDeposit({ amount: "abc" })).toThrow();
        expect(() => validateDeposit({ amount: "0" })).toThrow(); // > 0 richiesto
        expect(() => validateDeposit({ amount: "-5" })).toThrow();
    });

    test("accetta zero solo dove consentito (importo non negativo)", () => {
        expect(validateGoalCreate({ name: "Obiettivo", targetAmount: "10.00", currentAmount: "0.00" }).currentAmount).toBe("0.00");
        // Nel pagamento lo zero non e' un importo valido.
        expect(() => validatePay({ movementsCategoryId: "1", amount: "0.00" })).toThrow();
    });
});

describe("parsing importi (unit)", () => {
    test("parseAmountInput distingue formato e decimali", () => {
        expect(parseAmountInput("19.99")).toEqual({ ok: true, value: 19.99 });
        expect(parseAmountInput("19,99")).toEqual({ ok: true, value: 19.99 });
        expect(parseAmountInput("1.234,56")).toEqual({ ok: true, value: 1234.56 });
        expect(parseAmountInput("20")).toEqual({ ok: true, value: 20 });
        expect(parseAmountInput("19.999")).toEqual({ ok: false, reason: "decimals" });
        expect(parseAmountInput("abc")).toEqual({ ok: false, reason: "format" });
        expect(parseAmountInput(Number.NaN)).toEqual({ ok: false, reason: "format" });
    });

    test("parseAmountToCents lavora in centesimi interi", () => {
        expect(parseAmountToCents("19.99").cents).toBe(1999);
        expect(parseAmountToCents("0.29").cents).toBe(29);
        expect(parseAmountToCents(19.99).cents).toBe(1999);
        expect(parseAmountToCents("19.99").ok).toBe(true);
    });

    test("importi troppo grandi per Decimal(10,2) vengono respinti", () => {
        expect(parseAmountToCents("999999999.99").ok).toBe(false);
        expect(parseAmountToCents("99999999.99").ok).toBe(true);
    });
});
