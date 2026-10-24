// Converte i TTL testuali usati per i token ("15m", "1h", "1d") in unità
// numeriche. Un solo punto di verità: service (scadenza DB), cookie (maxAge)
// e risposte API (expiresIn) devono usare lo stesso calcolo.
const UNITS = { m: 60_000, h: 3_600_000, d: 86_400_000 };

export function ttlToMs(ttl) {
    const match = /^(\d+)([mhd])$/.exec(ttl);
    if (!match) {
        throw new Error(`TTL non supportato: "${ttl}" (usa formati come 15m, 1h, 7d)`);
    }
    return Number(match[1]) * UNITS[match[2]];
}

export function ttlToSeconds(ttl) {
    return Math.floor(ttlToMs(ttl) / 1000);
}
