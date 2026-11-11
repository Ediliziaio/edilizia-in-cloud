/**
 * Il registro delle variabili della commessa contro il database vero (fase 0, lotto 0.1).
 *
 * Ogni colonna di `orders` nei tipi generati (src/integrations/supabase/types.ts) deve
 * stare in una variabile del registro o in COLONNE_IGNORATE col motivo. Una colonna
 * nuova senza posto fa fallire questo test: Silvio non può non vederla.
 * Le tabelle collegate devono esistere e avere `order_id`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AREE } from "../../../shared/silvio-commessa/piano.ts";
import { COLONNE_IGNORATE, REGISTRO, variabile, variabiliDellArea } from "../../../shared/silvio-commessa/registro.ts";

const ROOT = join(__dirname, "../../..");

/** tabella → colonne della Row, lette dai tipi generati (solo le Tables, non le viste). */
function colonneDaiTipi(): Map<string, string[]> {
  const righe = readFileSync(join(ROOT, "src/integrations/supabase/types.ts"), "utf8").split("\n");
  const out = new Map<string, string[]>();
  let nelleTabelle = false;
  let tabella: string | null = null;
  let nellaRow = false;
  for (const r of righe) {
    if (/^ {4}Tables: \{$/.test(r)) { nelleTabelle = true; continue; }
    if (/^ {4}Views: \{$/.test(r)) { nelleTabelle = false; continue; }
    if (!nelleTabelle) continue;
    const apri = /^ {6}(\w+): \{$/.exec(r);
    if (apri) { tabella = apri[1]; continue; }
    if (/^ {8}Row: \{$/.test(r)) { nellaRow = true; out.set(tabella!, []); continue; }
    if (nellaRow && /^ {8}\}$/.test(r)) { nellaRow = false; continue; }
    const col = nellaRow ? /^ {10}(\w+)\??:/.exec(r) : null;
    if (col) out.get(tabella!)!.push(col[1]);
  }
  return out;
}

const TABELLE = colonneDaiTipi();

// Anche le cinque tabelle prima assenti sono ora nei tipi generati:
// tutte passano dagli stessi controlli di esistenza, order_id e colonne.
const ORDERS = TABELLE.get("orders") ?? [];

describe("registro delle variabili della commessa", () => {
  it("legge davvero le colonne di orders dai tipi", () => {
    expect(ORDERS.length).toBeGreaterThan(60);
    expect(ORDERS).toContain("total_amount");
    expect(ORDERS).toContain("work_start_date");
  });

  it("classifica ogni colonna di orders: in una variabile o ignorata col motivo", () => {
    const coperte = new Set(REGISTRO.flatMap((v) => v.colonne));
    const senzaPosto = ORDERS.filter((c) => !coperte.has(c) && !(c in COLONNE_IGNORATE));
    expect(senzaPosto, "colonne di orders da mettere nel registro o in COLONNE_IGNORATE").toEqual([]);
  });

  it("non nomina colonne di orders che non esistono", () => {
    const vere = new Set(ORDERS);
    const nominate = [
      ...REGISTRO.flatMap((v) => v.colonne),
      ...REGISTRO.flatMap((v) => (v.controllo.tipo === "colonne" ? v.controllo.colonne : [])),
      ...Object.keys(COLONNE_IGNORATE),
    ];
    expect(nominate.filter((c) => !vere.has(c))).toEqual([]);
  });

  it("una colonna sta in un posto solo", () => {
    const viste = new Map<string, string>();
    const doppie: string[] = [];
    for (const v of REGISTRO) {
      for (const c of v.colonne) {
        if (viste.has(c)) doppie.push(`${c}: ${viste.get(c)} e ${v.chiave}`);
        viste.set(c, v.chiave);
        if (c in COLONNE_IGNORATE) doppie.push(`${c}: ${v.chiave} e ignorata`);
      }
    }
    expect(doppie).toEqual([]);
  });

  it("il controllo di una variabile su orders guarda solo colonne sue", () => {
    for (const v of REGISTRO) {
      if (v.controllo.tipo === "colonne") {
        for (const c of v.controllo.colonne) expect(v.colonne, v.chiave).toContain(c);
      }
    }
  });

  it("le tabelle collegate esistono e hanno order_id (e la colonna del controllo)", () => {
    const problemi: string[] = [];
    for (const v of REGISTRO) {
      const tabelle = new Set([...(v.tabelle ?? []), ...(v.controllo.tipo === "righe" ? v.controllo.tabelle : [])]);
      for (const t of tabelle) {
        const cols = TABELLE.get(t);
        if (!cols) problemi.push(`${v.chiave}: ${t} non esiste`);
        else if (!cols.includes("order_id")) problemi.push(`${v.chiave}: ${t} senza order_id`);
        else if (v.controllo.tipo === "righe" && v.controllo.conColonna && !cols.includes(v.controllo.conColonna)) {
          problemi.push(`${v.chiave}: ${t} senza ${v.controllo.conColonna}`);
        }
      }
      if (v.controllo.tipo === "righe") {
        for (const t of v.controllo.tabelle) expect(v.tabelle ?? [], v.chiave).toContain(t);
      }
    }
    expect(problemi).toEqual([]);
  });

  it("chiavi uniche, col nome dell'area davanti, e ogni area ha le sue variabili", () => {
    const chiavi = REGISTRO.map((v) => v.chiave);
    expect(new Set(chiavi).size).toBe(chiavi.length);
    for (const v of REGISTRO) {
      expect(v.chiave.startsWith(`${v.area}.`), v.chiave).toBe(true);
      expect(v.fonti.length, v.chiave).toBeGreaterThan(0);
      expect(v.peso, v.chiave).toBeGreaterThanOrEqual(0);
      expect(v.colonne.length + (v.tabelle?.length ?? 0), v.chiave).toBeGreaterThan(0);
    }
    for (const area of AREE) expect(variabiliDellArea(area).length, area).toBeGreaterThan(0);
    expect(variabile("economia.total_amount")?.livello).toBe("chiede");
    expect(variabile("non.esiste")).toBeUndefined();
  });

  it("le quattro cose che Silvio chiede sono cliente, cantiere, importo e inizio", () => {
    expect(REGISTRO.filter((v) => v.livello === "chiede").map((v) => v.chiave).sort()).toEqual([
      "cantiere.indirizzo", "cliente.customer_id", "economia.total_amount", "fasi.work_start_date",
    ]);
  });

  it("ogni colonna ignorata ha un motivo scritto", () => {
    for (const [c, motivo] of Object.entries(COLONNE_IGNORATE)) expect(motivo.length, c).toBeGreaterThan(10);
  });
});
