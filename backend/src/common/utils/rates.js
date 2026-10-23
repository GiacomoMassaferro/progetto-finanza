// Conversioni fra tassi annui e tasso mensile.
//
// Distinzione essenziale (bug A4): il TAN e' nominale (interesse = TAN/12),
// il TAEG e' effettivo (interesse = (1+TAEG)^(1/12) - 1). Usare il TAEG come
// se fosse nominale gonfia gli interessi di qualche punto percentuale l'anno.

const PCT = 100;

// Tasso annuo nominale (TAN) -> tasso mensile (frazione, es. 0.01 = 1%).
export const monthlyRateFromNominal = (annualPct) => annualPct / PCT / 12;

// Tasso annuo effettivo (TAEG) -> tasso mensile equivalente.
export const monthlyRateFromEffective = (annualPct) => Math.pow(1 + annualPct / PCT, 1 / 12) - 1;

// Tasso mensile -> TAN annuo equivalente (12 * i).
export const nominalAnnualFromMonthly = (monthlyRate) => monthlyRate * 12 * PCT;

// TAEG annuo -> TAN annuo equivalente (stesso tasso mensile, forma nominale).
export const nominalAnnualFromEffective = (annualPct) => nominalAnnualFromMonthly(monthlyRateFromEffective(annualPct));

// Tasso mensile in centesimi per il calcolo del debito.
// kind: "nominal" (TAN) oppure "effective" (TAEG).
export const monthlyRate = (annualPct, kind = "nominal") =>
    kind === "effective" ? monthlyRateFromEffective(annualPct) : monthlyRateFromNominal(annualPct);

