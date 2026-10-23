import { AppError } from "./AppError.js";

// Concorrenza: quando due richieste toccano la stessa riga, una sola
// deve vincere. Il lock ottimistico (update con WHERE sul valore letto)
// fa fallire la seconda con count = 0: qui si distingue il conflitto
// transitorio (concorrente, quindi ritentabile) dall'errore di business.

// Conflitto transitorio: il client puo' riprovare subito.
export class ConflictError extends AppError {
    constructor(message, details) {
        super(409, message, details);
        this.name = "ConflictError";
        this.retryable = true;
    }
}

// Rilancia l'operazione quando il conflitto e' transitorio: riapre la
// lettura dei dati freschi e ricalcola (tipico caso: due pagamenti
// simultanei sulla stessa rata). Dopo i tentativi lascia propagare il 409.
export async function withOptimisticRetry(operation, { attempts = 3 } = {}) {
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            return await operation(attempt);
        } catch (err) {
            if (!err?.retryable) throw err;
            lastError = err;
        }
    }
    throw lastError;
}
