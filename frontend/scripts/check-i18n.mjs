// Confronta le chiavi (appiattite) dei 4 dizionari i18n.
// Uso: pnpm i18n:check — esce 1 se mancano/avanzi chiavi.
import { readFileSync } from "node:fs";

const langs = ["it", "en", "es", "de"];
const flat = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flat(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

const sets = {};
for (const l of langs) {
  const json = JSON.parse(readFileSync(new URL(`../src/i18n/${l}.json`, import.meta.url), "utf8"));
  sets[l] = new Set(flat(json));
}

const base = sets.it;
let ok = true;
for (const l of langs) {
  const missing = [...base].filter((k) => !sets[l].has(k));
  const extra = [...sets[l]].filter((k) => !base.has(k));
  if (missing.length > 0 || extra.length > 0) {
    ok = false;
    console.log(`${l}: mancanti=[${missing.join(", ")}] extra=[${extra.join(", ")}]`);
  } else {
    console.log(`${l}: OK (${sets[l].size} chiavi)`);
  }
}
process.exit(ok ? 0 : 1);
