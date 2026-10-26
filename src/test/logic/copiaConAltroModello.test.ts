/**
 * Copia di un preventivo edile con un altro modello (26/10/2026): stessi dati e stesso computo, nuovo modello e nuovo
 * numero, in bozza; quello di partenza non si tocca; se il computo non si copia la copia non resta.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Riga = Record<string, unknown>;
const stato = vi.hoisted(() => ({
  tabelle: {} as Record<string, Riga[]>,
  inserimenti: [] as Array<{ tabella: string; riga: Riga | Riga[] }>,
  cancellazioni: [] as Array<{ tabella: string; id: unknown }>,
  erroreVoci: null as string | null,
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const costruttore = (tabella: string) => {
    const filtri: Array<[string, unknown]> = [];
    let operazione: "select" | "insert" | "delete" = "select";
    let dati: Riga | Riga[] | null = null;
    const q: Record<string, unknown> = {};
    const righe = () => (stato.tabelle[tabella] ?? []).filter((r) => filtri.every(([k, v]) => r[k] === v));
    Object.assign(q, {
      select: () => q,
      eq: (k: string, v: unknown) => { filtri.push([k, v]); if (operazione === "delete") stato.cancellazioni.push({ tabella, id: v }); return q; },
      order: () => q,
      maybeSingle: async (): Promise<{ data: Riga | null; error: null }> => ({ data: righe()[0] ?? null, error: null }),
      single: async (): Promise<{ data: Riga | null; error: null }> => ({ data: operazione === "insert" ? { id: "nuovo-1", code: (dati as Riga).code } : righe()[0] ?? null, error: null }),
      insert: (riga: Riga | Riga[]) => {
        operazione = "insert"; dati = riga; stato.inserimenti.push({ tabella, riga });
        if (tabella.endsWith("_computo_voci") && stato.erroreVoci) return Promise.resolve({ error: { message: stato.erroreVoci } });
        return q;
      },
      delete: () => { operazione = "delete"; return q; },
      then: (ok: (v: unknown) => unknown) => ok(operazione === "select" ? { data: righe(), error: null } : { error: null }),
    });
    return q;
  };
  return { supabase: { from: costruttore, rpc: (...a: unknown[]) => stato.rpc(...a) } };
});

import { copiaConAltroModello, tabellaComputo } from "@/lib/moduli/copiaConAltroModello";

const AZIENDA = "az-1";
const ORIGINE: Riga = {
  id: "orig-1", company_id: AZIENDA, code: "RST-2026-004", stato: "inviata", tipo_intervento: "ristrutturazione_completa",
  cliente_nome: "Giulia", cliente_cognome: "Di Raimondo", cliente_email: "g@esempio.it", cantiere_citta: "Torino",
  sconto_pct: 5, iva_pct: 10, totale: 59805.06, finanziamento_rate: 84, mostra_finanziamento: true,
  ordine_id: "ord-9", origine_quote_id: "q-1", modello_snapshot: { modelId: "completa" }, deleted_at: null,
  created_at: "2026-10-17", updated_at: "2026-10-24", created_by: "u-1",
};
const VOCI: Riga[] = [
  { id: "v1", progetto_id: "orig-1", company_id: AZIENDA, descrizione: "Demolizioni", quantita: 1, importo: 1000, ordine: 0, created_at: "x" },
  { id: "v2", progetto_id: "orig-1", company_id: AZIENDA, descrizione: "Impianto elettrico", quantita: 2, importo: 4000, ordine: 1, created_at: "x" },
];
const SNAPSHOT = { version: 1, modelId: "computo" };
const costruisci = vi.fn(async () => SNAPSHOT);

beforeEach(() => {
  stato.tabelle = { rst_progetti: [ORIGINE], rst_computo_voci: VOCI };
  stato.inserimenti = []; stato.cancellazioni = []; stato.erroreVoci = null;
  stato.rpc.mockReset(); stato.rpc.mockResolvedValue({ data: "RST-2026-009", error: null });
  costruisci.mockClear();
});

const copia = () => copiaConAltroModello({ modulo: "ristrutturazione", sourceId: "orig-1", companyId: AZIENDA, nuovoModelId: "computo", costruisci });

describe("copiaConAltroModello", () => {
  it("il nuovo preventivo ha numero nuovo, è in bozza, ha il nuovo modello e il tipo di intervento di quel modello", async () => {
    const creata = await copia();
    expect(creata).toEqual({ id: "nuovo-1", code: "RST-2026-009" });
    const nuovo = stato.inserimenti.find((i) => i.tabella === "rst_progetti")!.riga as Riga;
    expect(nuovo).toMatchObject({ company_id: AZIENDA, code: "RST-2026-009", stato: "bozza", modello_snapshot: SNAPSHOT, tipo_intervento: "altro" });
    expect(costruisci).toHaveBeenCalledWith(AZIENDA, { id: "computo" });
    expect(stato.rpc).toHaveBeenCalledWith("genera_codice_progetto", { p_company_id: AZIENDA, p_modulo: "ristrutturazione" });
  });

  it("porta con sé cliente, cantiere e condizioni, ma non la commessa, l'origine, l'id e le date", async () => {
    await copia();
    const nuovo = stato.inserimenti.find((i) => i.tabella === "rst_progetti")!.riga as Riga;
    expect(nuovo).toMatchObject({ cliente_nome: "Giulia", cliente_cognome: "Di Raimondo", cliente_email: "g@esempio.it", cantiere_citta: "Torino", sconto_pct: 5, iva_pct: 10, finanziamento_rate: 84, mostra_finanziamento: true });
    for (const k of ["id", "created_at", "updated_at", "created_by", "ordine_id", "origine_quote_id", "deleted_at"]) expect(nuovo, k).not.toHaveProperty(k);
  });

  it("copia tutte le voci del computo sul preventivo nuovo, con le loro quantità, senza i loro id", async () => {
    await copia();
    const voci = stato.inserimenti.find((i) => i.tabella === "rst_computo_voci")!.riga as Riga[];
    expect(voci).toHaveLength(2);
    expect(voci.map((v) => v.descrizione)).toEqual(["Demolizioni", "Impianto elettrico"]);
    for (const v of voci) {
      expect(v).toMatchObject({ progetto_id: "nuovo-1", company_id: AZIENDA });
      expect(v).not.toHaveProperty("id");
      expect(v).not.toHaveProperty("created_at");
    }
    expect(voci[1]).toMatchObject({ quantita: 2, importo: 4000 });
  });

  it("il preventivo di partenza non si tocca: nessuna scrittura o cancellazione su di lui", async () => {
    await copia();
    expect(stato.inserimenti.every((i) => i.tabella !== "rst_progetti" || (i.riga as Riga).code === "RST-2026-009")).toBe(true);
    expect(stato.cancellazioni).toEqual([]);
  });

  it("se il computo non si copia la copia viene tolta e l'errore si dice", async () => {
    stato.erroreVoci = "violazione";
    await expect(copia()).rejects.toThrow("Copia non riuscita: violazione");
    expect(stato.cancellazioni).toContainEqual({ tabella: "rst_progetti", id: "nuovo-1" });
  });

  it("se il modello non si può costruire non si crea niente (nemmeno il numero)", async () => {
    costruisci.mockRejectedValueOnce(new Error("Questo intervento non ha un modello completo."));
    await expect(copia()).rejects.toThrow("non ha un modello completo");
    expect(stato.inserimenti).toEqual([]);
    expect(stato.rpc).not.toHaveBeenCalled();
  });

  it("un preventivo nel cestino, o di un'altra azienda, non si copia", async () => {
    stato.tabelle.rst_progetti = [{ ...ORIGINE, deleted_at: "2026-10-20" }];
    await expect(copia()).rejects.toThrow("cestino");
    stato.tabelle.rst_progetti = [{ ...ORIGINE, company_id: "altra" }];
    await expect(copia()).rejects.toThrow("non trovato");
  });

  it("la tabella del computo si ricava da quella dei preventivi, per tutti e sette", () => {
    const attese = { bagni: "bgn", climatizzazione: "clm", elettrico: "ele", termoidraulico: "idr", pavimenti: "pav", piscine: "pis", ristrutturazione: "rst" } as const;
    for (const [modulo, prefisso] of Object.entries(attese)) expect(tabellaComputo(modulo as keyof typeof attese)).toBe(`${prefisso}_computo_voci`);
  });
});
