#!/usr/bin/env node
/**
 * S3-01 — Budget guard per `as any` / `: any`.
 *
 * Esce con status 1 se il conteggio supera ALLOWED_MAX_TOTAL.
 * Decrementare la soglia ad ogni sprint per evitare regressioni.
 *
 * Per giustificare un caso specifico, aggiungere `// eslint-disable-next-line @typescript-eslint/no-explicit-any`
 * con motivazione su una riga sopra.
 */

import { execSync } from "node:child_process";

const ALLOWED_MAX_TOTAL = 2100; // baseline maggio 2026: 946 + 1136 = 2082

function safeGrep(pattern) {
  try {
    return execSync(
      `grep -rn "${pattern}" src --include='*.ts' --include='*.tsx'`,
      { encoding: "utf8" },
    );
  } catch (e) {
    if (e.status === 1) return "";
    throw e;
  }
}

const asAnyLines = safeGrep("as any").split("\n").filter(Boolean);
const colonAnyLines = safeGrep(": any\\b").split("\n").filter(Boolean);
const total = asAnyLines.length + colonAnyLines.length;

console.log(`as any: ${asAnyLines.length}`);
console.log(`: any:  ${colonAnyLines.length}`);
console.log(`TOTAL:  ${total} (soglia: ${ALLOWED_MAX_TOTAL})`);

if (total > ALLOWED_MAX_TOTAL) {
  console.error(`❌ any count ${total} > soglia ${ALLOWED_MAX_TOTAL}`);
  console.error(`→ Tipizza correttamente o aggiungi // eslint-disable con motivazione`);
  process.exit(1);
}
console.log(`✅ any budget sotto soglia`);
