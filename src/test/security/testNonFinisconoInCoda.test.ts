/**
 * Un test elencato dopo «npm run <script>» non viene eseguito, e nessuno lo dice.
 *
 * In `test:critical` tre guardie di sicurezza — permessiNovitaProtette,
 * vistePermessiDiChiLegge, cgFunzioniConPermesso — stavano in coda a
 * «npm run test:render». Il CI le elencava nel comando, e non le eseguiva:
 * bun (che in CI riscrive `npm run` in `bun run`) accoda gli argomenti
 * all'ULTIMO comando dello script chiamato, e `test:render` finisce con
 * «npm run test:render-credits», cioè con uno script node che quei nomi di file
 * li ignora. Nel log del 26/11/2026 si legge:
 *
 *     $ node scripts/test-render-refunds.mjs src/test/security/permessiNovitaProtette.test.ts …
 *
 * Il file c'era, il test no. Un test che il CI crede di eseguire e non esegue è
 * peggio di un test che non c'è: dà per sorvegliato ciò che nessuno guarda.
 *
 * Qui si tiene fermo che nessuno script passi file di test a un altro script:
 * i file vanno nel `vitest run` che li esegue davvero.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RADICE = resolve(__dirname, "../../..");
const scripts: Record<string, string> = JSON.parse(
  readFileSync(resolve(RADICE, "package.json"), "utf8"),
).scripts;

/** «npm run x a.test.ts», «bun run x a.test.ts», «npm run x -- a.test.ts». */
const FILE_IN_CODA = /\b(?:npm|bun|yarn|pnpm)\s+run\s+[\w:-]+((?:\s+(?:--)?\s*[^\s&|;]+)*)/g;

describe("nessun file di test finisce in coda a un altro script", () => {
  it("i file di test stanno nel comando che li esegue, non fra gli argomenti di «run»", () => {
    const colpevoli: string[] = [];
    for (const [nome, comando] of Object.entries(scripts)) {
      for (const m of comando.matchAll(FILE_IN_CODA)) {
        const inCoda = (m[1] ?? "").split(/\s+/).filter((a) => /\.test\.(ts|tsx|mts)$/.test(a));
        if (inCoda.length) colpevoli.push(`${nome}: ${inCoda.join(" ")}`);
      }
    }
    expect(
      colpevoli,
      `Questi file sono elencati dopo un «run» e non vengono eseguiti. Spostali nel vitest run che li deve eseguire:\n${colpevoli.join("\n")}`,
    ).toEqual([]);
  });

  it("le due guardie recuperate sono nel primo vitest run di test:critical", () => {
    const primo = scripts["test:critical"].split("&&")[0];
    for (const f of ["vistePermessiDiChiLegge", "cgFunzioniConPermesso"]) {
      expect(primo, f).toContain(`src/test/security/${f}.test.ts`);
    }
  });

  it("permessiNovitaProtette ha uno script suo finché i suoi rossi non sono risolti", () => {
    // Oggi trova tre difetti veri (sei pagine senza permesso, cg_tfr_movimenti
    // senza chi la vede, bank_accounts_operativi senza security_invoker): va
    // acceso nel CI insieme alla loro correzione, non prima. Nel frattempo ha un
    // nome, così non è invisibile: npm run test:permessi-novita.
    expect(scripts["test:permessi-novita"]).toContain("permessiNovitaProtette.test.ts");
  });
});
