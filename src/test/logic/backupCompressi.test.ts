/**
 * I backup compressi (08/11/2026): pesano un decimo, e un file si sostituisce solo se riapre identico.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ArchivioBackup,
  apriBackup,
  comprimi,
  comprimiFile,
  decomprimi,
  eCompresso,
  TETTO_GIRO_MS,
  TIPO_COMPRESSO,
} from "../../../supabase/functions/_shared/backupCompressi";

const ROOT = join(__dirname, "../../..");
const leggi = (f: string) => readFileSync(join(ROOT, f), "utf8");
const byte = (s: string) => new TextEncoder().encode(s);
const testoJson = JSON.stringify({ n: 500, righe: Array.from({ length: 500 }, (_, i) => ({ id: i, note: "posa infissi in cantiere" })) });

function archivio(iniziale: Record<string, Uint8Array>, altera?: (b: Uint8Array) => Uint8Array) {
  const file = new Map(Object.entries(iniziale));
  const tipi = new Map<string, string>();
  const a: ArchivioBackup = {
    scarica: async (p) => { const b = file.get(p); if (!b) throw new Error("assente"); return b; },
    carica: async (p, b, t) => { file.set(p, altera && t === TIPO_COMPRESSO ? altera(b) : b); tipi.set(p, t); },
  };
  return { a, file, tipi };
}

describe("Aprire un backup", () => {
  it("un file compresso esce uguale all'originale, uno vecchio resta com'è", async () => {
    const compresso = await comprimi(byte(testoJson));
    expect(eCompresso(compresso)).toBe(true);
    expect(compresso.length).toBeLessThan(byte(testoJson).length / 3);
    expect(await (await apriBackup(await new Response(compresso as BodyInit).blob())).text()).toBe(testoJson);
    expect(await (await apriBackup(await new Response(testoJson).blob())).text()).toBe(testoJson);
  });
});

describe("Comprimere un lotto", () => {
  it("il file resta allo stesso percorso, compresso e identico una volta aperto", async () => {
    const { a, file, tipi } = archivio({ "x/1.json": byte(testoJson) });
    const esito = await comprimiFile(a, [{ percorso: "x/1.json", peso: 1 }]);
    expect(esito).toMatchObject({ compressi: 1, errori: [] });
    expect(tipi.get("x/1.json")).toBe(TIPO_COMPRESSO);
    expect(new TextDecoder().decode(await decomprimi(file.get("x/1.json")!))).toBe(testoJson);
  });

  it("se il file salvato non torna, si rimette l'originale e lo si segnala", async () => {
    const guasto = await comprimi(byte("{}"));
    const { a, file, tipi } = archivio({ "x/1.json": byte(testoJson) }, () => guasto);
    const esito = await comprimiFile(a, [{ percorso: "x/1.json", peso: 1 }]);
    expect(esito.compressi).toBe(0);
    expect(esito.errori[0]).toMatch(/rimesso l'originale/);
    expect(new TextDecoder().decode(file.get("x/1.json")!)).toBe(testoJson);
    expect(tipi.get("x/1.json")).toBe("application/json");
  });

  it("un errore su un file non ferma gli altri, e il giro ha un tetto di tempo", async () => {
    const { a } = archivio({ "x/2.json": byte(testoJson) });
    const esito = await comprimiFile(a, [{ percorso: "x/assente.json", peso: 1 }, { percorso: "x/2.json", peso: 1 }]);
    expect(esito.compressi).toBe(1);
    expect(esito.errori).toHaveLength(1);
    let t = 0;
    const fermo = await comprimiFile(a, [{ percorso: "x/2.json", peso: 1 }], () => (t += TETTO_GIRO_MS + 1));
    expect(fermo.compressi).toBe(0);
  });
});

describe("Il giro nel server", () => {
  it("il ripristino apre i file compressi, in tutte e due le strade", () => {
    const restore = leggi("supabase/functions/company-restore/index.ts");
    expect(restore).toContain("const blob = await apriBackup(scaricato);");
    expect(restore).toContain("await (await apriBackup(blob)).text()");
  });

  it("la lista dei file non tocca indice, azienda e copie pre-delete, e non la chiama nessuno da fuori", () => {
    const sql = leggi("supabase/migrations/20290107120000_backup_da_comprimere.sql").replace(/--.*$/gm, "");
    expect(sql).toContain(String.raw`(-backup\.json|/[^/]+/\d+\.json)$`);
    expect(sql).not.toContain("pre-delete");
    expect(sql).toContain("interval '1 hour'");
    expect(sql).toContain("from public, anon, authenticated");
  });
});
