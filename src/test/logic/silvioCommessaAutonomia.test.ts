/**
 * Cosa fa Silvio da solo (fase 5, lotto 5.1): il catalogo è uguale nel codice e nel database, il
 * predefinito è «chiede», le azioni non promuovibili non salgono, «vietata» resta fuori dalla
 * scrittura anche se accettata, «da sola» entra senza «Va bene» (gli ordini solo coi prezzi e
 * sotto la soglia), e il database ritoglie quello che è vietato.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AZIONI_SILVIO, SEMPRE_TU, autonomiaDaRighe, azioneDellaVariabile, livelloDi, ordineDaSolo, totaleOrdine, type Autonomia,
} from "../../../shared/silvio-commessa/autonomia.ts";
import { REGISTRO } from "../../../shared/silvio-commessa/registro.ts";
import { FONTE_RISORSE, proposteRisorse, type ContestoRisorse } from "../../../shared/silvio-commessa/risorse.ts";
import type { PianoCommessa, Valore } from "../../../shared/silvio-commessa/piano.ts";
import { pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import { scritturaDalPiano } from "@/lib/silvio-commessa/scrittura";

const radice = resolve(__dirname, "../../..");
const migrazione = readFileSync(resolve(radice, "supabase/migrations/20281106140000_silvio_autonomia.sql"), "utf8");

const EMP = "e0000000-0000-4000-a000-000000000001";
const SUP = "50000000-0000-4000-a000-000000000001";
const MEZ = "a0000000-0000-4000-a000-000000000001";

const daSilvio = (valore: unknown): Valore => ({ valore, fonte: FONTE_RISORSE, fiducia: 0.6, stato: "proposta", nota: null });

function piano(): PianoCommessa {
  return {
    ...pianoVuoto("c"),
    aree: {
      persone: { "persone.squadra": daSilvio([{ employee_id: EMP, nome: "Mario", fase: "Posa", motivo: "m", stato: "proposta" }]) },
      mezzi: { "mezzi.allocazioni": daSilvio([{ mezzo_id: MEZ, nome: "Furgone", fasi: ["Posa"], dal: "2026-11-16", al: "2026-11-18", quantita: 1, motivo: "m", stato: "proposta" }]) },
      materiali: { "materiali.acquisti": daSilvio([
        { supplier_id: SUP, fornitore: "Coi prezzi", fase: "Posa", data_consegna: null, data_ordine: null, giorni_consegna: null, motivo: "m", stato: "proposta",
          righe: [{ descrizione: "Silicone", quantita: 10, prezzo: 8 }] },
        { supplier_id: SUP, fornitore: "Senza prezzi", fase: "Posa", data_consegna: null, data_ordine: null, giorni_consegna: null, motivo: "m", stato: "proposta",
          righe: [{ descrizione: "Profili", quantita: 4, prezzo: null }] },
      ]) },
      sicurezza: { "sicurezza.adempimenti": daSilvio([{ tipo: "cila_scia", titolo: "CILA", testo: "t", scadenza: "2026-11-09" }]) },
    },
  };
}

describe("il catalogo delle azioni", () => {
  it("è lo stesso nel codice e in _silvio_azioni_autonomia()", () => {
    const corpo = migrazione.slice(migrazione.indexOf("create or replace function public._silvio_azioni_autonomia"),
      migrazione.indexOf("revoke all on function public._silvio_azioni_autonomia"));
    const sql = [...corpo.matchAll(/\('([a-z_]+)', '(chiede|da_sola)'\)/g)].map((m) => [m[1], m[2]]);
    expect(sql).toEqual(AZIONI_SILVIO.map((a) => [a.azione, a.massimo]));
  });

  it("le azioni che Silvio non fa mai non sono nel catalogo (nessun livello le promuove)", () => {
    for (const s of SEMPRE_TU) {
      expect(AZIONI_SILVIO.some((a) => a.azione === s.azione), s.azione).toBe(false);
      expect(livelloDi({ [s.azione]: { livello: "da_sola", soglia_eur: null } }, s.azione)).toBe("chiede");
    }
    expect(SEMPRE_TU.map((s) => s.azione)).toEqual(["firma_contratti", "fatture_sdi", "pagamenti", "importo_contratto", "cancellazioni", "fornitori_nuovi"]);
  });

  it("ogni variabile delle azioni è nel registro", () => {
    const chiavi = new Set(REGISTRO.map((v) => v.chiave));
    for (const a of AZIONI_SILVIO) for (const v of a.variabili) expect(chiavi.has(v), `${a.azione}: ${v}`).toBe(true);
  });

  it("predefinito «chiede»; «da sola» solo dove il massimo lo permette", () => {
    for (const a of AZIONI_SILVIO) expect(livelloDi({}, a.azione)).toBe("chiede");
    const righe = autonomiaDaRighe([
      { azione: "ditte", livello: "da_sola" }, { azione: "squadra", livello: "da_sola" },
      { azione: "ordini", livello: "da_sola", soglia_eur: 500 }, { azione: "inventata", livello: "da_sola" },
    ]);
    expect(livelloDi(righe, "ditte")).toBe("chiede");
    expect(livelloDi(righe, "squadra")).toBe("da_sola");
    expect(righe.ordini.soglia_eur).toBe(500);
    expect(righe.inventata).toBeUndefined();
  });

  it("gli ordini da soli solo coi prezzi e sotto la soglia", () => {
    const aut: Autonomia = { ordini: { livello: "da_sola", soglia_eur: 500 } };
    expect(totaleOrdine([{ quantita: 10, prezzo: 8 }])).toBe(80);
    expect(totaleOrdine([{ quantita: 10, prezzo: null }])).toBeNull();
    expect(ordineDaSolo(aut, [{ quantita: 10, prezzo: 8 }])).toBe(true);
    expect(ordineDaSolo(aut, [{ quantita: 100, prezzo: 8 }])).toBe(false);
    expect(ordineDaSolo(aut, [{ quantita: 1, prezzo: null }])).toBe(false);
    expect(ordineDaSolo({ ordini: { livello: "da_sola", soglia_eur: null } }, [{ quantita: 1, prezzo: 1 }])).toBe(false);
    expect(ordineDaSolo({}, [{ quantita: 1, prezzo: 1 }])).toBe(false);
  });
});

describe("la scrittura segue l'autonomia", () => {
  it("predefinito: le proposte di Silvio aspettano il «Va bene», anche gli adempimenti", () => {
    const s = scritturaDalPiano(piano());
    expect(s.squadra).toEqual([]);
    expect(s.mezzi).toEqual([]);
    expect(s.oda).toEqual([]);
    expect(s.adempimenti).toEqual([]);
    expect(s.escluse.filter((e) => e.motivo === "proposta da confermare").map((e) => e.chiave).sort())
      .toEqual(["materiali.acquisti", "mezzi.allocazioni", "persone.squadra", "sicurezza.adempimenti"]);
  });

  it("«da sola» entra senza chiedere; gli ordini solo quello coi prezzi sotto la soglia", () => {
    const aut: Autonomia = {
      squadra: { livello: "da_sola", soglia_eur: null }, mezzi: { livello: "da_sola", soglia_eur: null },
      ordini: { livello: "da_sola", soglia_eur: 500 }, promemoria: { livello: "da_sola", soglia_eur: null },
    };
    const s = scritturaDalPiano(piano(), aut);
    expect(s.squadra).toEqual([{ employee_id: EMP, fase: "Posa" }]);
    expect(s.mezzi).toHaveLength(1);
    expect(s.oda.map((o) => o.righe[0].descrizione)).toEqual(["Silicone"]);
    expect(s.escluse.find((e) => e.chiave === "materiali.acquisti")?.motivo).toMatch(/Senza prezzi: senza prezzi o sopra la soglia/);
    expect(s.adempimenti).toEqual([{ tipo: "cila_scia", titolo: "CILA", note: "t", scadenza: "2026-11-09" }]);
  });

  it("«vietata» resta fuori anche quando la persona l'ha accettata", () => {
    const p = piano();
    p.aree.persone!["persone.squadra"] = { ...p.aree.persone!["persone.squadra"], stato: "fatto", fonte: { tipo: "persona", etichetta: "va bene" } };
    const s = scritturaDalPiano(p, { squadra: { livello: "vietata", soglia_eur: null } });
    expect(s.squadra).toEqual([]);
    expect(s.escluse.find((e) => e.chiave === "persone.squadra")?.motivo).toMatch(/Silvio non lo fa/);
  });

  it("le proposte di un'azione vietata non nascono nemmeno", () => {
    const ctx: ContestoRisorse = {
      oggi: "2026-11-01", dipendenti: [{ id: EMP, nome: "Mario", attivo: true }], storicoDipendenti: [{ employee_id: EMP, fase: "Posa serramenti" }],
      impegniDipendenti: [], assenze: [], staff: [], capomastri: [], ditte: [], storicoDitte: [], documentiDitte: [],
      mezzi: [], storicoMezzi: [], impegniMezzi: [], fornitori: [], storicoAcquisti: [],
    };
    const conFasi: PianoCommessa = { ...pianoVuoto("c"), aree: { fasi: { "fasi.order_work_phases": {
      valore: [{ name: "Posa serramenti", start_date: "2026-11-16", end_date: "2026-11-18" }], fonte: { tipo: "preventivo", etichetta: "p" }, fiducia: 1, stato: "fatto" } } } };
    expect(proposteRisorse(conFasi, ctx)?.aree.persone?.["persone.squadra"]).toBeDefined();
    const vietato = proposteRisorse(conFasi, ctx, { squadra: { livello: "vietata", soglia_eur: null }, avvio_cliente: { livello: "vietata", soglia_eur: null } });
    expect(vietato?.aree.persone?.["persone.squadra"]).toBeUndefined();
    expect(vietato?.aree.comunicazione?.["comunicazione.avvio_cliente"]).toBeUndefined();
    expect(vietato?.aree.sicurezza?.["sicurezza.pos_duvri"]).toBeDefined();
  });
});

describe("il controllo nel database", () => {
  it("_silvio_scrittura_permessa toglie ogni elenco che le azioni scrivono", () => {
    const corpo = migrazione.slice(migrazione.indexOf("create or replace function public._silvio_scrittura_permessa"));
    for (const [azione, campo] of [["squadra", "squadra"], ["mezzi", "mezzi"], ["ordini", "oda"], ["ditte", "ditte"],
      ["contratti_ditte", "contratti"], ["promemoria", "adempimenti"]] as const) {
      expect(corpo, azione).toContain(`'${azione}'`);
      expect(corpo, campo).toContain(`'{${campo}}'`);
    }
    expect(corpo).toContain("#- '{ordine,capomastro_user_id}'");
    expect(corpo).toMatch(/v_tipi := v_tipi \|\| array\['pos', 'duvri'\]/);
  });

  it("_silvio_bozza passa da lì: vale per «Crea», «Completa» e per chi chiama le RPC a mano", () => {
    const bozze = readFileSync(resolve(radice, "supabase/migrations/20281106100000_commessa_bozze_silvio.sql"), "utf8");
    const f = bozze.slice(bozze.indexOf("create or replace function public._silvio_bozza"), bozze.indexOf("revoke all on function public._silvio_bozza"));
    expect(f).toContain("public._silvio_scrittura_permessa($1, $2)");
  });

  it("le azioni hanno un'azione in catalogo per ogni variabile che il popup promuove", () => {
    expect(azioneDellaVariabile("persone.capomastro")?.azione).toBe("squadra");
    expect(azioneDellaVariabile("sicurezza.adempimenti")?.azione).toBe("promemoria");
    expect(azioneDellaVariabile("economia.total_amount")).toBeUndefined();
  });
});

describe("le migrazioni della fase 5 sono chiuse ad anon", () => {
  for (const nome of ["20281106140000_silvio_autonomia", "20281106141000_silvio_piano_volo", "20281106142000_silvio_quanto_lavora"]) {
    it(nome, () => {
      const sql = readFileSync(resolve(radice, `supabase/migrations/${nome}.sql`), "utf8");
      const funzioni = [...sql.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);
      expect(funzioni.length).toBeGreaterThan(0);
      for (const f of funzioni) expect(sql, f).toMatch(new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon`));
      expect(sql).toMatch(/set local lock_timeout = '3s'/);
      expect(sql).not.toMatch(/cron\.schedule/);
    });
  }
});
