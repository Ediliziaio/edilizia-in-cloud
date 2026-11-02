/**
 * Le correzioni della revisione dell'1/11/2026 (docs/silvio-commessa-revisione-20261101.md)
 * che non hanno già un test nei file della loro fase: fusione e annulla (L1, L5, L13), SAL
 * del piano di volo (L6), lettori col calendario (L10), impegni letti in ordine (L11), DURC e
 * patrono (L14), le lacune (durata delle fasi senza date, quadratura, voci già ordinate) e la
 * funzione del piano di volo (E4, S6).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Frammento, PianoCommessa, RataDelPiano } from "../../../shared/silvio-commessa/piano.ts";
import { annulla, applica, fondi, pianoVuoto, stessoValore } from "../../../shared/silvio-commessa/fondi.ts";
import { propostaSal } from "../../../shared/silvio-commessa/pianoVolo.ts";
import { calendarioAzienda, cittaDaIndirizzo } from "../../../shared/silvio-commessa/calendario.ts";
import { frammentoDalModello } from "../../../shared/silvio-commessa/modelliLavoro.ts";
import { leggiContestoRisorse, type ClientRisorse } from "../../../shared/silvio-commessa/contestoRisorse.ts";
import { contrattiDelleDitte, documentiDitta, type ContestoRisorse, type DittaDelPiano, type OdaDelPiano } from "../../../shared/silvio-commessa/risorse.ts";
import { controlliQuadratura } from "../../../shared/silvio-commessa/quadratura.ts";
import { scritturaDalPiano } from "@/lib/silvio-commessa/scrittura";
import { idDelTesto } from "@/lib/silvio-commessa/leggiDocumento";

const AZIENDA = "d2000000-0000-4000-a000-000000000002";
const radice = resolve(__dirname, "../../..");

const fr = (tipo: Frammento["fonte"]["tipo"], etichetta: string, aree: Frammento["aree"], id?: string): Frammento =>
  ({ fonte: { tipo, etichetta, ...(id ? { id } : {}) }, aree });
const importo = (n: number) => ({ economia: { "economia.total_amount": { valore: n, fiducia: 0.9, stato: "fatto" as const } } });

describe("fusione e annulla", () => {
  it("L1: senza id, «tieni questo» sceglie per etichetta, non il primo documento dello stesso tipo", () => {
    let p = fondi(pianoVuoto(AZIENDA), fr("documento", "Capitolato.pdf", importo(100000)));
    p = fondi(p, fr("documento", "Offerta.pdf", importo(95000)));
    expect(p.conflitti).toHaveLength(1);
    const { piano } = applica(p, { tipo: "scegli_fonte", area: "economia", chiave: "economia.total_amount", fonte: "documento", idFonte: null, etichettaFonte: "Offerta.pdf" });
    expect(piano.aree.economia!["economia.total_amount"].valore).toBe(95000);
  });

  it("L1: due testi diversi hanno id diversi, lo stesso testo lo stesso id", () => {
    expect(idDelTesto("bagno 6 mq, 12k")).toBe(idDelTesto("bagno 6 mq, 12k"));
    expect(idDelTesto("bagno 6 mq, 12k")).not.toBe(idDelTesto("bagno 8 mq, 14k"));
  });

  it("L5: un documento arrivato mentre il valore era scritto a mano torna nel conflitto all'annulla", () => {
    let p = fondi(pianoVuoto(AZIENDA), fr("documento", "Capitolato.pdf", importo(100000), "c"));
    const scritto = applica(p, { tipo: "cambia_valore", area: "economia", chiave: "economia.total_amount", valore: 98000 });
    p = fondi(scritto.piano, fr("contratto", "Contratto.pdf", importo(95000), "k"));
    expect(p.aree.economia!["economia.total_amount"].valore).toBe(98000);
    const { piano } = annulla(p, scritto.storia);
    expect(piano.conflitti).toHaveLength(1);
    expect(piano.conflitti[0].candidati.map((c) => c.valore).sort()).toEqual([100000, 95000].sort());
    expect(piano.scartati).toBeUndefined();
  });

  it("L13: un campo a null e un campo che manca sono lo stesso valore: niente conflitto inventato sulle rate", () => {
    expect(stessoValore({ label: "Saldo", amount: 1000, trigger_numero: null }, { label: "Saldo", amount: 1000 })).toBe(true);
    const rate = (r: Partial<RataDelPiano>) => ({ pagamenti: { "pagamenti.rate": { valore: [{ label: "Saldo", type: "balance", amount: 1000, trigger_evento: "fine_lavori", ...r }], fiducia: 0.9, stato: "fatto" as const } } });
    let p = fondi(pianoVuoto(AZIENDA), fr("preventivo", "Preventivo", rate({ trigger_numero: null } as Partial<RataDelPiano>), "q"));
    p = fondi(p, fr("contratto", "Contratto", rate({}), "k"));
    expect(p.conflitti).toEqual([]);
  });
});

describe("piano di volo e calendario", () => {
  it("L6: il SAL dalla rata è senza IVA, come quello dall'avanzamento", () => {
    const fasi = [{ id: "f1", nome: "Demolizioni", dal: "2026-11-02", al: "2026-11-06" }, { id: "f2", nome: "Impianti", dal: "2026-11-09", al: "2026-11-13" }];
    const sal = propostaSal({
      fasi, finita: fasi[0], totale: 100000, iva: 10, salFatti: [],
      rate: [{ trigger_evento: "sal_numero", trigger_numero: 1, amount: 33000, label: "SAL 1" }],
    });
    expect(sal?.importo).toBe(30000);
  });

  it("L10: il modello data le fasi col calendario dell'azienda (chiusura estiva)", () => {
    const cal = calendarioAzienda({ calendario: { chiusura_dal: "08-08", chiusura_al: "08-23" }, festivita: [] });
    const conChiusura = frammentoDalModello("bagno", { inizio: "2027-08-05", calendario: cal });
    const senza = frammentoDalModello("bagno", { inizio: "2027-08-05" });
    const fine = (f: Frammento) => f.aree.fasi!["fasi.work_end_date"].valore as string;
    expect(fine(conChiusura) > fine(senza)).toBe(true);
    expect(fine(conChiusura) >= "2027-08-24").toBe(true);
  });

  it("L14: «20121 Milano MI», senza parentesi, è Milano", () => {
    expect(cittaDaIndirizzo("Via Torino 3, 20121 Milano MI")).toBe("milano");
    expect(cittaDaIndirizzo("Via Roma 1, 20900 Monza (MB)")).toBe("monza");
  });

  it("L14: un documento della ditta che scade prima della fine della fase è un problema, come il DURC", () => {
    const ctx = {
      oggi: "2026-11-01",
      documentiDitte: [
        { subappaltatore_id: "s1", tipo: "durc", scadenza: "2027-03-01" },
        { subappaltatore_id: "s1", tipo: "polizza_rc", scadenza: "2026-12-10" },
      ],
    } as unknown as ContestoRisorse;
    const ditta = { id: "t1", nome: "Rossi Impianti", subappaltatore_id: "s1" };
    expect(documentiDitta(ctx, ditta, "2026-12-01")).toBeNull();
    expect(documentiDitta(ctx, ditta, "2026-12-20")).toMatch(/scadono prima della fine della fase: polizza RC/);
  });

  it("L11: gli impegni delle persone si leggono dalle commesse aperte, i più recenti prima", async () => {
    const chiamate: { tabella: string; passi: string[] }[] = [];
    const db = {
      from: (tabella: string) => {
        const c = { tabella, passi: [] as string[] };
        chiamate.push(c);
        const q: Record<string, unknown> = {};
        for (const m of ["select", "eq", "is", "not", "gte", "lte", "or", "in", "order", "limit"]) {
          q[m] = (...a: unknown[]) => { c.passi.push(`${m}:${a.map((x) => JSON.stringify(x)).join(",")}`); return q; };
        }
        q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
        return q;
      },
    } as unknown as ClientRisorse;
    await leggiContestoRisorse(AZIENDA, [], null, db);
    const impegni = chiamate.filter((c) => c.tabella === "order_employees");
    expect(impegni).toHaveLength(2);
    expect(impegni[0].passi.join(" ")).toMatch(/not:"ordine\.status","in","\(completato/);
    for (const c of impegni) expect(c.passi.join(" ")).toMatch(/order:"created_at",\{"ascending":false\}/);
  });
});

describe("le lacune", () => {
  const conFasi = (fasi: unknown[]): PianoCommessa => fondi(pianoVuoto(AZIENDA), fr("persona", "io", {
    fasi: { "fasi.order_work_phases": { valore: fasi, fiducia: 1, stato: "fatto" } },
  }));

  it("le fasi senza date portano la durata nella scrittura", () => {
    const s = scritturaDalPiano(conFasi([{ name: "Demolizioni", giorni: 3 }, { name: "Collaudo", start_date: "2026-12-01", end_date: "2026-12-02", giorni: 2 }]));
    expect(s.fasi[0]).toMatchObject({ nome: "Demolizioni", inizio: null, giorni: 3 });
    expect(s.fasi[1].giorni).toBeUndefined();
    const sql = readFileSync(resolve(radice, "supabase/migrations/20281106100000_commessa_bozze_silvio.sql"), "utf8");
    expect(sql).toContain("jsonb_build_array(jsonb_build_object('nome', f->>'nome', 'giorni', f->'giorni'))");
  });

  it("quadratura: rate che non fanno il totale ivato → ⚠ col motivo, e non entrano; sistemate, tornano come prima", () => {
    let p = fondi(pianoVuoto(AZIENDA), fr("contratto", "Contratto", {
      economia: { "economia.total_amount": { valore: 100000, fiducia: 0.9, stato: "fatto" }, "economia.vat_rate": { valore: 10, fiducia: 0.9, stato: "fatto" } },
      pagamenti: { "pagamenti.rate": { valore: [{ label: "Acconto", type: "deposit", amount: 30000, trigger_evento: "firma_contratto" }], fiducia: 0.9, stato: "fatto" } },
    }, "k"));
    const rate = p.aree.pagamenti!["pagamenti.rate"];
    expect(rate.stato).toBe("attenzione");
    expect(rate.nota).toMatch(/Le rate fanno 30\.000,00 €, il totale con l'IVA è 110\.000,00 €: mancano 80\.000,00 €/);
    expect(scritturaDalPiano(p).rate).toEqual([]);
    p = fondi(p, fr("contratto", "Contratto", {
      pagamenti: { "pagamenti.rate": { valore: [
        { label: "Acconto", type: "deposit", amount: 30000, trigger_evento: "firma_contratto" },
        { label: "Saldo", type: "balance", amount: 80000, trigger_evento: "fine_lavori" },
      ], fiducia: 0.9, stato: "fatto" } },
    }, "k"));
    expect(p.aree.pagamenti!["pagamenti.rate"].stato).toBe("fatto");
    expect(p.aree.pagamenti!["pagamenti.rate"].quadratura).toBeUndefined();
  });

  it("quadratura: contratti delle ditte più ordini oltre l'imponibile → ⚠", () => {
    const piano = {
      ...pianoVuoto(AZIENDA),
      aree: {
        economia: { "economia.total_amount": { valore: 10000, fonte: { tipo: "contratto", etichetta: "k" }, fiducia: 1, stato: "fatto" } },
        ditte: { "ditte.contratti": { valore: [{ importo: 7000, stato: "proposta" }], fonte: { tipo: "modello", etichetta: "s" }, fiducia: 0.5, stato: "proposta" } },
        materiali: { "materiali.acquisti": { valore: [{ righe: [{ quantita: 10, prezzo: 400 }], stato: "proposta" }], fonte: { tipo: "modello", etichetta: "s" }, fiducia: 0.5, stato: "proposta" } },
      },
    } as unknown as PianoCommessa;
    const problemi = controlliQuadratura(piano);
    expect(problemi.map((x) => x.chiave)).toEqual(["ditte.contratti", "materiali.acquisti"]);
    expect(problemi[0].testo).toMatch(/11\.000,00 €, più dell'imponibile/);
  });

  it("il contratto della ditta non ripete le voci già in un ordine della stessa fase", () => {
    const ditte: DittaDelPiano[] = [{ external_team_id: "t1", nome: "Rossi", fase: "Bagno", costo_previsto: 0, subappaltatore_id: "s1", motivo: "", stato: "proposta" }];
    const fasi = [{ nome: "Bagno", dal: "2026-12-01", al: "2026-12-05", sottofasi: [
      { name: "Posa piastrelle", quantita: 20, costo: 600 }, { name: "Piastrelle 60x60", quantita: 20, costo: 800 },
    ] }];
    const oda: OdaDelPiano[] = [{
      supplier_id: "f1", fornitore: "Ceramiche", fase: "Bagno", data_consegna: null, data_ordine: null, giorni_consegna: null,
      righe: [{ descrizione: "Piastrelle 60x60", quantita: 20 }], motivo: "", stato: "proposta",
    }];
    const [senza] = contrattiDelleDitte(ditte, fasi as never);
    const [con] = contrattiDelleDitte(ditte, fasi as never, oda);
    expect(senza.importo).toBe(1400);
    expect(con.elenco.map((v) => v.descrizione)).toEqual(["Posa piastrelle"]);
    expect(con.importo).toBe(600);
  });
});

describe("la funzione del piano di volo (E4, S6)", () => {
  const funzione = readFileSync(resolve(radice, "supabase/functions/silvio-piano-volo/index.ts"), "utf8") + readFileSync(resolve(radice, "supabase/functions/silvio-piano-volo/giro.ts"), "utf8");
  it("legge le fasi in una finestra, dalle commesse aperte, a rotazione dalla meno vista", () => {
    expect(funzione).toMatch(/\.lte\("start_date", aggiungiGiorni\(oggi, GIORNI_AVANTI\)\)/);
    expect(funzione).toMatch(/\.not\("ordine\.status", "in"/);
    expect(funzione).toContain("limit(MAX_FASI)");
    expect(funzione).not.toContain("limit(2000)");
    expect(funzione).toMatch(/visteIl\.get\(a\) \?\? ""\)\.localeCompare/);
  });
  it("la campanella suona solo per una proposta nuova o cambiata", () => {
    expect(funzione).toContain("if (daNotificare(reg) && controlloDaSegnalare(c)) nuove.push(c.riassunto)");
    expect(funzione).toMatch(/r\.nuova === true \|\| r\.cambiata === true/);
  });
});
