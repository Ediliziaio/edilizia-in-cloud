/**
 * run-all.ts — esegue parse → chunk → embed in sequenza.
 *
 *   npx tsx scripts/kb-ingest/run-all.ts
 */

import { spawn } from "node:child_process";

const STEPS = [
  "scripts/kb-ingest/01-parse-docx.ts",
  "scripts/kb-ingest/02-chunk.ts",
  "scripts/kb-ingest/03-embed-and-upload.ts",
];

function run(file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n━━━ ${file} ━━━`);
    const child = spawn("npx", ["tsx", file], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${file} exited ${code}`));
    });
  });
}

async function main() {
  for (const step of STEPS) {
    await run(step);
  }
  console.log("\n✅ KB Imprenditore Edile 3.0 — ingest completo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
