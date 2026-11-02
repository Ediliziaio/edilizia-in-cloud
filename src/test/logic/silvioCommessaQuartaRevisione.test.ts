/**
 * La quarta revisione di «Crea con Silvio» (2/11/2026). Dati di prova inventati.
 * Il salvataggio dentro il popup (Crea, ripresa) sta in src/test/ui/silvioCommessaQuartaRevisione.test.tsx.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Frammento, PianoCommessa } from "../../../shared/silvio-commessa/piano.ts";
import {
  annulla, applica, fondi, modificaBloccata, pianoVuoto, storiaDopoRilettura, type Passo,
} from "../../../shared/silvio-commessa/fondi.ts";
import { autonomiaDaRighe } from "../../../shared/silvio-commessa/autonomia.ts";
import { creaBozza, salvaBozza, type ClientBozze } from "@/lib/silvio-commessa/bozze";
import { scritturaDalPiano, type ScritturaCommessa } from "@/lib/silvio-commessa/scrittura";
import { frammentoDaCommessa } from "@/lib/silvio-commessa/lettori/commessa";
import { accettaProposte, vistaPerLaChat } from "@/components/silvio-commessa/presentazione";
import { pianoSenzaFonte } from "@/components/silvio-commessa/useBozzaSilvio";

const AZ = "d2000000-0000-4000-a000-000000000002";
const ORD = "d2000000-0000-4000-a000-000000000301";
const PERSONA = "e0000000-0000-4000-a000-000000000001";
const TOT = "economia.total_amount";
const IND = "cantiere.indirizzo";

const doc = (nome: string, area: string, chiave: string, valore: unknown, stato: "fatto" | "proposta" = "fatto"): Frammento => ({
  fonte: { tipo: "documento", id: `f-${nome}`, etichetta: `${nome}.pdf` },
  aree: { [area]: { [chiave]: { valore, fiducia: 0.9, stato } } },
} as unknown as Frammento);
const tot = (p: PianoCommessa) => p.aree.economia?.[TOT];
const fonteDi = (nome: string) => [{ id: `f-${nome}`, etichetta: `${nome}.pdf` }];
const migrazione = (nome: string) => readFileSync(`supabase/migrations/${nome}.sql`, "utf8");

describe("1. Il salvataggio usa l'autonomia del popup", () => {
  const aut = autonomiaDaRighe([{ azione: "squadra", livello: "da_sola" }]);
  const conSquadra = fondi(pianoVuoto(AZ), doc("S", "persone", "persone.squadra", [{ employee_id: PERSONA, nome: "Mario Prova", fase: null, stato: "proposta", motivo: "m" }], "proposta"));
  const dbFinto = () => {
    let scritta: ScritturaCommessa | null = null;
    const q: Record<string, unknown> = {};
    const prendi = (r: { scrittura: ScritturaCommessa }) => { scritta = r.scrittura; return q; };
    Object.assign(q, {
      insert: prendi, update: prendi, eq: () => q, select: () => q,
      single: async (): Promise<unknown> => ({ data: { id: "b1" }, error: null }),
      maybeSingle: async (): Promise<unknown> => ({ data: { id: "b1" }, error: null }),
    });
    return { db: { from: () => q } as unknown as ClientBozze, letta: () => scritta! };
  };

  it("il popup e la scrittura salvata contano le stesse persone", async () => {
    expect(scritturaDalPiano(conSquadra, aut).squadra).toHaveLength(1);
    const uno = dbFinto();
    await salvaBozza("b1", { piano: conSquadra, autonomia: aut }, uno.db);
    expect(uno.letta().squadra).toHaveLength(1);
    const due = dbFinto();
    await creaBozza({ companyId: AZ, piano: conSquadra, autonomia: aut }, due.db);
    expect(due.letta().squadra).toHaveLength(1);
  });

  it("senza autonomia resta tutto da confermare", async () => {
    const uno = dbFinto();
    await salvaBozza("b1", { piano: conSquadra }, uno.db);
    expect(uno.letta().squadra).toHaveLength(0);
  });
});

describe("2. Fonte tolta: la storia non la fa rientrare", () => {
  it("corretto a mano, fonte tolta: Cmd+Z non riporta l'indirizzo del documento", () => {
    const p = fondi(pianoVuoto(AZ), doc("D", "cantiere", IND, { indirizzo_lavori: "Via Falsa 9, Lodi" }, "proposta"));
    const b = applica(p, { tipo: "cambia_valore", area: "cantiere", chiave: IND, valore: { indirizzo_lavori: "Via Vera 1, Lodi" } }, []);
    const r = pianoSenzaFonte(b.piano, fonteDi("D"), b.storia);
    expect(r.piano.aree.cantiere?.[IND]?.valore).toEqual({ indirizzo_lavori: "Via Vera 1, Lodi" });
    const u = annulla(r.piano, r.storia);
    expect(u.piano.aree.cantiere?.[IND]).toBeUndefined();
    expect(scritturaDalPiano(u.piano).ordine.indirizzo_lavori).toBeUndefined();
  });

  it("proposta della chat sopra il documento tolto: l'annulla non lo rimette", () => {
    const p = fondi(pianoVuoto(AZ), doc("A", "economia", TOT, 10000));
    const b = applica(p, { tipo: "cambia_valore", area: "economia", chiave: TOT, valore: 12000, proposta: true }, []);
    const r = pianoSenzaFonte(b.piano, fonteDi("A"), b.storia);
    expect(tot(annulla(r.piano, r.storia).piano)).toBeUndefined();
  });

  it("un conflitto di prima perde il candidato tolto e resta chi c'è", () => {
    const p = fondi(fondi(pianoVuoto(AZ), doc("A", "economia", TOT, 10000)), doc("B", "economia", TOT, 11000));
    const b = applica(p, { tipo: "scegli_fonte", area: "economia", chiave: TOT, fonte: "documento", idFonte: "f-A" }, []);
    const r = pianoSenzaFonte(b.piano, fonteDi("B"), b.storia);
    const u = annulla(r.piano, r.storia);
    expect(u.piano.conflitti).toEqual([]);
    expect(tot(u.piano)?.valore).toBe(10000);
    expect(tot(u.piano)?.stato).not.toBe("attenzione");
  });

  it("su tre fonti in disaccordo restano le altre due, anche nell'annulla", () => {
    let p = fondi(fondi(pianoVuoto(AZ), doc("A", "economia", TOT, 10000)), doc("B", "economia", TOT, 11000));
    p = fondi(p, doc("C", "economia", TOT, 12000));
    const b = applica(p, { tipo: "cambia_valore", area: "economia", chiave: TOT, valore: 9000 }, []);
    const r = pianoSenzaFonte(b.piano, fonteDi("A"), b.storia);
    const u = annulla(r.piano, r.storia);
    expect(u.piano.conflitti[0].candidati.map((c) => c.valore)).toEqual([11000, 12000]);
    expect(tot(u.piano)?.valore).toBe(11000);
  });
});

describe("3 e 8. Il database", () => {
  const silvio = migrazione("20281112100000_commessa_bozze_silvio");
  it("3. alle date passano solo le fasi che ci sono, e mai una fine prima dell'inizio", () => {
    expect(silvio).toMatch(/where exists \(select 1 from public\.order_work_phases f\s+where f\.order_id = p_order[\s\S]{0,200}d\.voce->>'nome'/);
    expect(silvio).toContain("when coalesce(work_start_date, v_min) <= v_max then v_max");
    expect(silvio).toContain("if v_fine < v_inizio then");
  });
  it("8. senza il permesso sui costi la voce che porta solo il costo non nasce", () => {
    expect(migrazione("20281112140000_silvio_autonomia")).toContain("x.voce->>'solo_costo' is not distinct from 'true'");
    const fasi = [{ name: "Nuova", start_date: null as string | null }];
    const p = fondi(pianoVuoto(AZ), {
      fonte: { tipo: "computo", id: "c", etichetta: "computo" },
      aree: {
        fasi: { "fasi.order_work_phases": { valore: fasi, fiducia: 1, stato: "fatto" } },
        costi: { "costi.previsti": { valore: [{ fase: "Nuova", importo: 70, vociSenzaCosto: 0 }], fiducia: 1, stato: "fatto" } },
      },
    } as unknown as Frammento);
    expect(scritturaDalPiano(p).fasi[0].sottofasi).toEqual([{ nome: "Costo previsto Nuova", quantita: 1, costo: 70, solo_costo: true }]);
  });
});

describe("4. Ripresa: quello che è ora nella commessa non torna con Cmd+Z", () => {
  const prima = { order: { id: ORD, order_code: "O-1", description: "Lavoro", total_amount: 0 } };
  const conDoc = () => {
    const p = fondi(fondi(pianoVuoto(AZ, ORD), frammentoDaCommessa(prima)), doc("X", "economia", TOT, 50000, "proposta"));
    let b = { piano: p, storia: [] as Passo[] };
    for (const m of accettaProposte(b.piano, [TOT])) b = applica(b.piano, m, b.storia);
    return b;
  };

  it("un altro ha scritto 70.000: niente passo, e l'annulla non mostra 50.000", () => {
    const b = conDoc();
    expect(b.storia).toHaveLength(1);
    const ripresa = fondi(b.piano, frammentoDaCommessa({ order: { ...prima.order, total_amount: 70000 } }));
    const storia = storiaDopoRilettura(ripresa, b.storia);
    expect(storia).toEqual([]);
    const u = annulla(ripresa, storia);
    expect(tot(u.piano)?.valore).toBe(70000);
    expect(modificaBloccata(u.piano, { tipo: "cambia_valore", area: "economia", chiave: TOT, valore: 1 })).toMatch(/già nella commessa/);
  });

  it("i passi su quello che non è cambiato restano", () => {
    const b = conDoc();
    const ripresa = fondi(b.piano, frammentoDaCommessa(prima));
    expect(storiaDopoRilettura(ripresa, b.storia)).toHaveLength(1);
  });

  it("in un gruppo si toglie solo la variabile chiusa", () => {
    const p = fondi(pianoVuoto(AZ, ORD), doc("X", "economia", TOT, 50000, "proposta"));
    const b1 = applica(p, { tipo: "cambia_valore", area: "economia", chiave: TOT, valore: 50000 }, [], "g");
    const b2 = applica(b1.piano, { tipo: "cambia_valore", area: "fasi", chiave: "fasi.work_end_date", valore: "2027-01-10" }, b1.storia, "g");
    const ripresa = fondi(b2.piano, frammentoDaCommessa({ order: { ...prima.order, total_amount: 70000 } }));
    expect(storiaDopoRilettura(ripresa, b2.storia).flatMap((x) => x.prima.map((y) => y.chiave))).toEqual(["fasi.work_end_date"]);
  });

  it("sotto le colonne che si aggiungono ci va la commessa di adesso", () => {
    const K = "cliente.contatto";
    const p = fondi(fondi(pianoVuoto(AZ, ORD), frammentoDaCommessa({ order: { ...prima.order, client_email: "vecchia@example.test" } })),
      doc("X", "cliente", K, { client_phone: "3331112222" }, "proposta"));
    const nuovo = { client_email: "vecchia@example.test", client_phone: "3331112222" };
    const b = applica(p, { tipo: "cambia_valore", area: "cliente", chiave: K, valore: nuovo }, []);
    const ripresa = fondi(b.piano, frammentoDaCommessa({ order: { ...prima.order, client_email: "nuova@example.test" } }));
    const u = annulla(ripresa, storiaDopoRilettura(ripresa, b.storia));
    expect(JSON.stringify(u.piano.aree.cliente?.[K]?.valore)).toContain("nuova@example.test");
    expect(JSON.stringify(u.piano.aree.cliente?.[K]?.valore)).not.toContain("vecchia@example.test");
  });
});

describe("5. Senza il permesso sui costi il modello non riceve i prezzi d'acquisto", () => {
  it.each(["purchase_price", "standard_cost", "unit_cost", "prezzo_acquisto", "margine", "markup", "sconto_fornitore"])("%s", (campo) => {
    const p = fondi(pianoVuoto(AZ, ORD), frammentoDaCommessa({
      order: { id: ORD, order_code: "O-1" },
      righe: [{ id: "r", name: "Riga", quantity: 1, unit_price: 777, [campo]: 4321 }],
    }));
    const riga = () => JSON.stringify(vistaPerLaChat(p, true, false).aree.economia?.["economia.order_items"]?.valore);
    expect(riga()).not.toContain("4321");
    expect(riga()).toContain("777");
    expect(JSON.stringify(vistaPerLaChat(p, true, true).aree.economia?.["economia.order_items"]?.valore)).toContain("4321");
  });
});

describe("6. Conflitto con una proposta sopra e un valore messo da parte", () => {
  const scenario = () => {
    const p = fondi(fondi(pianoVuoto(AZ), doc("A", "economia", TOT, 10000)), doc("B", "economia", TOT, 11000));
    const b = applica(p, { tipo: "cambia_valore", area: "economia", chiave: TOT, valore: 12000, proposta: true }, []);
    return { ...b, piano: fondi(b.piano, doc("C", "economia", TOT, 13000)) };
  };

  it("togliendo A restano in disaccordo B e C", () => {
    const { piano, storia } = scenario();
    expect(piano.scartati?.map((s) => s.valore.valore)).toEqual([13000]);
    const r = pianoSenzaFonte(piano, fonteDi("A"), storia);
    expect(r.piano.conflitti.map((c) => c.candidati.map((x) => x.valore))).toEqual([[11000, 13000]]);
    expect(tot(r.piano)?.valore).toBe(12000);
    expect(tot(r.piano)?.alPostoDi?.valore).toBe(11000);
    expect(r.piano.scartati).toBeUndefined();
  });

  it("uguale se si toglie B, che non era quello mostrato", () => {
    const { piano, storia } = scenario();
    const r = pianoSenzaFonte(piano, fonteDi("B"), storia);
    expect(r.piano.conflitti.map((c) => c.candidati.map((x) => x.valore))).toEqual([[10000, 13000]]);
  });

  it("con la scrittura ferma finché non si sceglie", () => {
    const { piano, storia } = scenario();
    expect(scritturaDalPiano(pianoSenzaFonte(piano, fonteDi("A"), storia).piano).conflitti).toBe(1);
  });
});

describe("7. Dopo «Va bene» le colonne della commessa restano ferme", () => {
  const K = "comunicazione.direttore_lavori";
  const accettata = () => {
    const p = fondi(pianoVuoto(AZ, ORD), frammentoDaCommessa({ order: { id: ORD, order_code: "O-1", dl_notification_email: "dl@example.test" } }));
    const valore = { dl_notification_email: "dl@example.test", dl_notification_phone: "3331234567" };
    let b = applica(p, { tipo: "cambia_valore", area: "comunicazione", chiave: K, valore, proposta: true }, []);
    for (const m of accettaProposte(b.piano, [K])) {
      expect(modificaBloccata(b.piano, m)).toBeNull();
      b = applica(b.piano, m, b.storia);
    }
    return b;
  };

  it("resta sopra la commessa, e cambiare l'email è bloccato", () => {
    const b = accettata();
    expect(b.piano.aree.comunicazione?.[K]?.sopraCommessa).toBeTruthy();
    expect(modificaBloccata(b.piano, {
      tipo: "cambia_valore", area: "comunicazione", chiave: K,
      valore: { dl_notification_email: "altra@example.test", dl_notification_phone: "3331234567" },
    })).toMatch(/già nella commessa/);
  });

  it("aggiungere una colonna che manca si può ancora", () => {
    const b = accettata();
    expect(modificaBloccata(b.piano, {
      tipo: "cambia_valore", area: "comunicazione", chiave: K,
      valore: { dl_notification_email: "dl@example.test", dl_notification_phone: "3339999999" },
    })).toBeNull();
  });

  it("togliere quello che si è accettato rimette la commessa", () => {
    const b = accettata();
    const t = applica(b.piano, { tipo: "togli", area: "comunicazione", chiave: K }, b.storia);
    expect(t.piano.aree.comunicazione?.[K]?.valore).toEqual({ dl_notification_email: "dl@example.test" });
  });
});
