#!/usr/bin/env node
/**
 * S2-03 — Guard CI contro proliferazione di .select('*') / .select("*").
 *
 * Esce con status 1 se il conteggio supera ALLOWED_MAX.
 * Decrementare ALLOWED_MAX ad ogni sprint di pulizia per evitare regressioni.
 *
 * Per autorizzare un caso specifico, aggiungere il commento `// allow-select-star`
 * sulla stessa riga del .select(...).
 */

import { execSync } from "node:child_process";

const ALLOWED_MAX = 429;

let raw;
try {
  raw = execSync(
    `grep -rn "\\.select(['\\\"]\\*['\\\"])" src --include='*.ts' --include='*.tsx'`,
    { encoding: "utf8" },
  );
} catch (e) {
  // grep returns non-zero if no matches — treat as 0
  if (e.status === 1) raw = "";
  else throw e;
}

const lines = raw.split("\n").filter((l) => l && !/\/\/\s*allow-select-star/.test(l));
const count = lines.length;

if (count > ALLOWED_MAX) {
  console.error(`❌ select('*') count ${count} > soglia ${ALLOWED_MAX}`);
  console.error(`→ Refactora con select chirurgico, oppure aggiungi // allow-select-star`);
  process.exit(1);
}
console.log(`✅ select('*') sotto soglia (${count}/${ALLOWED_MAX})`);
