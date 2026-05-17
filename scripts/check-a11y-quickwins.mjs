#!/usr/bin/env node
/**
 * S3-03 — A11y quick-wins linter (regex-based, runs in CI).
 *
 * Conta:
 *   1) bottoni `size="icon"` SENZA aria-label
 *   2) testo low-contrast (slate-300/400, gray-300/400)
 *
 * Esce con status 1 solo se il conteggio supera la soglia configurata
 * (decrementala progressivamente man mano che fixi).
 *
 * Per autorizzare un caso specifico, aggiungere `// allow-a11y-icon` o
 * `// allow-a11y-contrast` sulla stessa riga.
 */

import { execSync } from "node:child_process";

const ICON_BTN_ALLOWED_MAX = 626;
const LOW_CONTRAST_ALLOWED_MAX = 417;

function safeGrep(pattern) {
  try {
    return execSync(
      `grep -rn ${pattern} src --include='*.tsx'`,
      { encoding: "utf8" },
    );
  } catch (e) {
    if (e.status === 1) return "";
    throw e;
  }
}

// 1. icon-only buttons without aria-label
const iconBtnRaw = safeGrep(`'size="icon"'`);
const iconBtnViolations = iconBtnRaw
  .split("\n")
  .filter((l) =>
    l &&
    !/aria-label=/.test(l) &&
    !/\/\/\s*allow-a11y-icon/.test(l),
  );

// 2. low-contrast text
const contrastRaw = safeGrep(`-E 'text-(slate|gray)-(300|400)\\b'`);
const contrastViolations = contrastRaw
  .split("\n")
  .filter((l) => l && !/\/\/\s*allow-a11y-contrast/.test(l));

let failed = false;
if (iconBtnViolations.length > ICON_BTN_ALLOWED_MAX) {
  console.error(
    `❌ icon-only buttons without aria-label: ${iconBtnViolations.length} > soglia ${ICON_BTN_ALLOWED_MAX}`,
  );
  failed = true;
}
if (contrastViolations.length > LOW_CONTRAST_ALLOWED_MAX) {
  console.error(
    `❌ low-contrast text: ${contrastViolations.length} > soglia ${LOW_CONTRAST_ALLOWED_MAX}`,
  );
  failed = true;
}

if (failed) {
  console.error("→ Vedi: docs/accessibility.md");
  process.exit(1);
}
console.log(
  `✅ a11y quick-wins sotto soglia (icon-btn: ${iconBtnViolations.length}/${ICON_BTN_ALLOWED_MAX}, contrast: ${contrastViolations.length}/${LOW_CONTRAST_ALLOWED_MAX})`,
);
