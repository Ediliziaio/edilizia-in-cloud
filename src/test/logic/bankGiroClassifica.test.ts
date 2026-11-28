/**
 * Il giro del mattino della banca (28/11/2026): tutte le aziende con movimenti aperti, a lotti
 * sotto gli 8 secondi di PostgREST. Prima `p_limite: 100` moriva ogni mattina con 57014 e
 * tornava indietro per intero, e chi caricava l'estratto a mano non entrava nemmeno nel giro.
 */
import { describe, expect, it } from "vitest";
import {
  aziendeDelGiro,
  classificaALotti,
  LOTTO_CLASSIFICA,
  type ChiamaClassifica,
} from "../../../supabase/functions/bank-auto-reconcile/giroClassifica";
import giro from "../../../supabase/functions/bank-auto-reconcile/index.ts?raw";
import migrazione from "../../../supabase/migrations/20290701100000_tesoreria_classifica_per_tutti.sql?raw";

/** Un classificatore finto con `quanti` movimenti da guardare. */
function classificatore(quanti: number, errore?: { alla: number; messaggio: string }) {
  const chiamate: number[] = [];
  let restano = quanti;
  const chiama: ChiamaClassifica = async (limite) => {
    chiamate.push(limite);
    if (errore && chiamate.length === errore.alla) return { data: null, error: { message: errore.messaggio } };
    const n = Math.min(limite, restano);
    restano -= n;
    return { data: { analizzati: n, cambiati: n, per_esito: { da_gestire: n } }, error: null };
  };
  return { chiama, chiamate };
}

describe("aziende del giro", () => {
  it("prima l'ordine del database, poi le collegate che mancano, senza doppioni", () => {
    expect(
      aziendeDelGiro([{ company_id: "manuale" }, { company_id: "collegata" }], ["collegata", "solo-collegata", null], 10),
    ).toEqual(["manuale", "collegata", "solo-collegata"]);
  });
  it("un'azienda che carica l'estratto a mano entra anche senza collegamento", () => {
    expect(aziendeDelGiro([{ company_id: "manuale" }], [])).toEqual(["manuale"]);
  });
  it("rispetta il tetto", () => {
    expect(aziendeDelGiro([{ company_id: "a" }, { company_id: "b" }, { company_id: "c" }], [], 2)).toEqual(["a", "b"]);
  });
});

describe("classifica a lotti", () => {
  it("mai più di un lotto per chiamata, e si ferma quando non c'è altro", async () => {
    const { chiama, chiamate } = classificatore(23);
    const r = await classificaALotti(chiama, { lotto: 10, tetto: 60 });
    expect(chiamate).toEqual([10, 10, 10]);
    expect(r).toMatchObject({ analizzati: 23, cambiati: 23, chiamate: 3, per_esito: { da_gestire: 23 } });
    expect(r.fermato).toBeUndefined();
  });
  it("il lotto di serie sta sotto gli 8 secondi anche nel caso peggiore misurato (0,68 s a movimento)", () => {
    expect(LOTTO_CLASSIFICA * 0.68).toBeLessThan(8 * 0.5);
  });
  it("si ferma al tetto dell'azienda e lo dice", async () => {
    const { chiama, chiamate } = classificatore(500);
    const r = await classificaALotti(chiama, { lotto: 10, tetto: 25 });
    expect(chiamate).toEqual([10, 10, 5]);
    expect(r).toMatchObject({ analizzati: 25, fermato: "tetto" });
  });
  it("un errore ferma solo questa azienda e tiene ciò che i lotti prima hanno scritto", async () => {
    const { chiama } = classificatore(500, { alla: 3, messaggio: "canceling statement due to statement timeout" });
    const r = await classificaALotti(chiama, { lotto: 10, tetto: 60 });
    expect(r).toMatchObject({ analizzati: 20, chiamate: 3, errore: "canceling statement due to statement timeout" });
  });
  it("a tempo scaduto non parte un'altra chiamata", async () => {
    const { chiama, chiamate } = classificatore(500);
    let giri = 0;
    const r = await classificaALotti(chiama, { lotto: 10, tetto: 60, tempoScaduto: () => ++giri > 2 });
    expect(chiamate).toEqual([10, 10]);
    expect(r.fermato).toBe("tempo");
  });
});

describe("il giro usa i lotti e l'elenco di tutte le aziende", () => {
  it("niente più 100 movimenti in una chiamata", () => {
    expect(giro).not.toContain("p_limite:100");
    expect(giro).toContain('admin.rpc("tesoreria_aziende_da_classificare"');
    expect(giro).toContain("classificaALotti(");
  });
});

describe("migrazione", () => {
  it("le funzioni nuove nascono chiuse ad anon", () => {
    expect(migrazione).toMatch(/revoke all on function public\.tesoreria_aziende_da_classificare\(integer,integer\) from public, anon, authenticated;/);
    expect(migrazione).toMatch(/revoke all on function public\.tesoreria_aperti_vecchi\(uuid,integer\) from public, anon;/);
    expect(migrazione).toMatch(/revoke all on function private\.tesoreria_classifica_coda_lavora\(integer,integer\) from public, anon, authenticated, service_role;/);
  });
  it("la coda si riempie da ogni caricamento e si lavora in SQL, non con pg_net", () => {
    expect(migrazione).toMatch(/after insert on public\.bank_transactions\s+referencing new table as nuovi\s+for each statement/);
    expect(migrazione).toContain("select private.tesoreria_classifica_coda_lavora(8000, 10)");
    expect(migrazione).not.toContain("net.http_post");
  });
  it("la toppa di bank_movimenti_elenco ordina per importo con la chiave sort", () => {
    expect(migrazione).toMatch(/ORDER BY CASE WHEN p_filters->>''sort''=''amount'' THEN abs\(amount\) END DESC/);
  });
  it("il lucchetto dell'azienda resta preso al massimo 8 secondi", () => {
    expect(migrazione).toMatch(/p_tetto_ms integer default 8000/);
    expect(migrazione).toMatch(/clock_timestamp\(\) - inizio \+ durata > tetto/);
  });
  it("il riquadro dei vecchi legge le stesse righe della lista", () => {
    expect(migrazione).toMatch(/from public\.bank_transactions_operativi t\s+where t\.company_id = p_company/);
    expect(migrazione).toContain("then (t.metadata->>'amount')::numeric else t.amount end amount");
    expect(migrazione).not.toMatch(/where x\.residuo > 0/);
  });
  it("le regole della classificazione non si toccano (sono del lotto B)", () => {
    expect(migrazione).not.toMatch(/create or replace function private\.tes_classifica\(/i);
    expect(migrazione).not.toMatch(/create or replace function private\.tes_classifica_movimenti_selezionati/i);
  });
});
