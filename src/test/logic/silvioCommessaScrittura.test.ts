/**
 * Dal piano alla scrittura (fase 1, lotto 1.4): quello che le RPC della commessa leggono
 * dalla bozza. Dati inventati.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Frammento, Valore } from "../../../shared/silvio-commessa/piano.ts";
import { applica, fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import { COLONNE_SCRIVIBILI, prontaPerScrivere, scritturaDalPiano } from "@/lib/silvio-commessa/scrittura";

const v = (valore: unknown, extra: Partial<Valore> = {}): Omit<Valore, "fonte"> => ({ valore, fiducia: 1, stato: "fatto", ...extra });
const PREVENTIVO = { tipo: "preventivo" as const, id: "q-1", etichetta: "PR-0001" };
const COMPUTO = { tipo: "computo" as const, id: "c-1", etichetta: "Computo bagno" };
const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const SEDE = "22222222-2222-4222-8222-222222222222";
const VENDITORE = "33333333-3333-4333-8333-333333333333";

function dalPreventivo(): Frammento {
  return {
    fonte: PREVENTIVO,
    aree: {
      identita: {
        "identita.description": v("Bagno via Prova"),
        "identita.tipo_lavoro": v("bagno", { stato: "proposta", fiducia: 0.7 }),
        "identita.sede_id": v(SEDE),
        "identita.origine": v({ quote_id: QUOTE_ID, quote_number: "PR-0001" }),
        "identita.stato": v({ status: "confermato" }),
      },
      cliente: {
        "cliente.nome": v({ client_name: "Cliente Prova" }),
        "cliente.contatto": v({ client_phone: "000", client_email: "cliente@example.invalid" }),
      },
      cantiere: { "cantiere.indirizzo": v({ indirizzo_lavori: "Via Prova 1, Monza" }) },
      economia: {
        "economia.total_amount": v(12000),
        "economia.vat_rate": v(10),
        "economia.order_items": v([
          { id: "riga-preventivo", name: "Piatto doccia", quantity: 1, unit_price: 400 },
          { name: "Massetto", quantity: 12.5, unit_price: 20 },
        ]),
      },
      pagamenti: {
        "pagamenti.rate": v([
          { label: "Acconto", type: "deposit", amount: 3660, trigger_evento: "firma_contratto" },
          { label: "", type: "balance", amount: 9540, trigger_evento: "evento_inventato" },
          { label: "Vuota", type: "deposit", amount: 0 },
        ]),
      },
      fasi: {
        "fasi.order_work_phases": v([
          { name: "Demolizioni", start_date: "2026-11-09", end_date: "2026-11-10", sottofasi: [{ name: "Rimozione sanitari", quantita: 2, costo: 180 }] },
          { name: "Impianti", start_date: "2026-11-13", end_date: "2026-11-11" },
          { name: "  " },
        ]),
        "fasi.work_end_date": v("2026-11-20", { stato: "proposta", fiducia: 0.6 }),
      },
      persone: { "persone.venditori": v([VENDITORE]), "persone.squadra": v(["dip-1"], { stato: "proposta" }) },
      costi: { "costi.previsti": v([{ fase: "Impianti", importo: 900, vociSenzaCosto: 0 }]) },
    },
  };
}

describe("scritturaDalPiano", () => {
  it("traduce il piano nelle colonne, nelle righe e negli elenchi che le RPC leggono", () => {
    const s = scritturaDalPiano(fondi(pianoVuoto("az-1"), dalPreventivo()));
    expect(s.modo).toBe("crea");
    expect(s.ordine).toEqual({
      description: "Bagno via Prova",
      tipo_lavoro: "bagno", // proposta di una variabile 🟢: entra
      sede_id: SEDE,
      client_name: "Cliente Prova",
      client_phone: "000",
      client_email: "cliente@example.invalid",
      indirizzo_lavori: "Via Prova 1, Monza",
      total_amount: 12000,
      vat_rate: 10,
    });
    expect(s.preventivo_id).toBe(QUOTE_ID);
    expect(s.cliente).toEqual({ customer_id: null, nome: "Cliente Prova", email: "cliente@example.invalid" });
    expect(s.venditore).toBe(VENDITORE);
    expect(s.conflitti).toBe(0);
  });

  it("le righe: senza l'id del preventivo, in ordine, la quantità non intera diventa 1 × il totale", () => {
    const { righe } = scritturaDalPiano(fondi(pianoVuoto("az-1"), dalPreventivo()));
    expect(righe[0]).toEqual({ name: "Piatto doccia", quantity: 1, unit_price: 400, position: 0 });
    expect(righe[1]).toMatchObject({ name: "Massetto", quantity: 1, unit_price: 250, position: 1 });
    expect(String(righe[1].description)).toContain("Quantità 12,5");
  });

  it("le rate: solo con un importo, eventi ammessi, etichetta di ripiego", () => {
    const { rate } = scritturaDalPiano(fondi(pianoVuoto("az-1"), dalPreventivo()));
    expect(rate).toEqual([
      { position: 0, label: "Acconto", type: "deposit", amount: 3660, trigger_evento: "firma_contratto", trigger_numero: null },
      { position: 1, label: "Rata 2", type: "balance", amount: 9540, trigger_evento: "data_fissa", trigger_numero: null },
    ]);
  });

  it("le fasi: date solo se coerenti, origine dalla fonte, il costo della fase senza voci diventa una voce", () => {
    const { fasi } = scritturaDalPiano(fondi(pianoVuoto("az-1"), dalPreventivo()));
    expect(fasi).toEqual([
      { nome: "Demolizioni", inizio: "2026-11-09", fine: "2026-11-10", origine: "preventivo",
        sottofasi: [{ nome: "Rimozione sanitari", quantita: 2, unita: null, importo: null, costo: 180, codice: null }] },
      // La fine prima dell'inizio non va: la fase nasce senza date.
      { nome: "Impianti", inizio: null, fine: null, origine: "preventivo",
        sottofasi: [{ nome: "Costo previsto Impianti", quantita: 1, costo: 900 }] },
    ]);
  });

  it("fasi da una fonte senza voci previste (modello, testo): niente origine", () => {
    const fr: Frammento = { fonte: { tipo: "modello", etichetta: "Modello bagno" }, aree: {
      fasi: { "fasi.order_work_phases": v([{ name: "Demolizioni", giorni: 2 }], { stato: "proposta" }) },
    } };
    expect(scritturaDalPiano(fondi(pianoVuoto("az-1"), fr)).fasi[0].origine).toBeNull();
  });

  it("le proposte 🟡 restano fuori finché la persona non le accetta, e il «Controlla» dice perché", () => {
    let piano = fondi(pianoVuoto("az-1"), dalPreventivo());
    let s = scritturaDalPiano(piano);
    expect(s.ordine.work_end_date).toBeUndefined();
    expect(s.escluse).toEqual(expect.arrayContaining([
      { chiave: "fasi.work_end_date", etichetta: "Fine lavori", motivo: "proposta da confermare" },
      { chiave: "persone.squadra", etichetta: "Squadra", motivo: "proposta da confermare" },
      { chiave: "identita.stato", etichetta: "Stato iniziale", motivo: "Silvio non la scrive: la calcola il gestionale o la decide una persona" },
    ]));
    piano = applica(piano, { tipo: "cambia_valore", area: "fasi", chiave: "fasi.work_end_date", valore: "2026-11-20" }).piano;
    s = scritturaDalPiano(piano);
    expect(s.ordine.work_end_date).toBe("2026-11-20");
  });

  it("un valore nel formato sbagliato non arriva alla RPC", () => {
    const fr: Frammento = { fonte: { tipo: "testo", etichetta: "testo" }, aree: {
      fasi: { "fasi.work_start_date": v("9 novembre") },
      identita: { "identita.sede_id": v("sede-non-uuid") },
    } };
    const s = scritturaDalPiano(fondi(pianoVuoto("az-1"), fr));
    expect(s.ordine).toEqual({});
    expect(s.escluse.map((e) => [e.chiave, e.motivo])).toEqual([
      ["identita.sede_id", "il valore non è nel formato giusto"],
      ["fasi.work_start_date", "il valore non è nel formato giusto"],
    ]);
  });

  it("i conflitti si contano e fermano «Crea»; senza modo di trovare il cliente, manca il cliente", () => {
    let piano = fondi(pianoVuoto("az-1"), dalPreventivo());
    piano = fondi(piano, { fonte: COMPUTO, aree: { economia: { "economia.total_amount": v(13000) } } });
    const s = scritturaDalPiano(piano);
    expect(s.conflitti).toBe(1);
    expect(s.ordine.total_amount).toBeUndefined();
    expect(prontaPerScrivere(s)).toEqual(["C'è un valore in conflitto da decidere"]);
    expect(prontaPerScrivere(scritturaDalPiano(pianoVuoto("az-1")))).toEqual(["Manca il cliente"]);
    // Completare una commessa non chiede il cliente: ce l'ha già.
    expect(prontaPerScrivere(scritturaDalPiano(pianoVuoto("az-1", "ord-1")))).toEqual([]);
  });

  it("completare: stesso piano, modo «completa»", () => {
    const s = scritturaDalPiano(fondi(pianoVuoto("az-1", "ord-1"), dalPreventivo()));
    expect(s.modo).toBe("completa");
  });
});

describe("COLONNE_SCRIVIBILI", () => {
  const migrazione = readFileSync(resolve(__dirname, "../../../supabase/migrations/20281106100000_commessa_bozze_silvio.sql"), "utf8");

  it("sono le stesse di _silvio_colonne_scrivibili() nella migrazione", () => {
    const corpo = /function public\._silvio_colonne_scrivibili\(\)[\s\S]*?array\[([\s\S]*?)\]::text\[\]/.exec(migrazione);
    expect(corpo).not.toBeNull();
    const sql = [...corpo![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(sql).toEqual([...COLONNE_SCRIVIBILI]);
  });

  it("sono colonne vere di orders, nei tipi generati", () => {
    const tipi = readFileSync(resolve(__dirname, "../../integrations/supabase/types.ts"), "utf8");
    const orders = /\n {6}orders: \{\n {8}Row: \{([\s\S]*?)\n {8}\}/.exec(tipi);
    expect(orders).not.toBeNull();
    for (const c of COLONNE_SCRIVIBILI) expect(orders![1]).toMatch(new RegExp(`\\n {10}${c}: `));
  });
});
