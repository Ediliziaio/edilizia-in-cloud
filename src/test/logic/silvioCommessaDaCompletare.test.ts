/**
 * «Completa con Silvio» e «Da completare» (fase 2, lotti 2.1 e 2.3), senza database:
 * quello che la commessa ha già non si cambia né si riscrive, il modello propone le fasi a una
 * commessa che non le ha, e la funzione SQL dell'elenco conta con le stesse espressioni del popup. Dati inventati.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applica, fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import { completezza, completezzaPiano, sqlMancano, sqlPunteggio } from "../../../shared/silvio-commessa/completezza.ts";
import type { Frammento, PianoCommessa } from "../../../shared/silvio-commessa/piano.ts";
import { frammentiPerCompletare } from "@/lib/silvio-commessa/lettori/commessa";
import { daAggiungere, giaNellaCommessa, prontaPerScrivere, scritturaDalPiano } from "@/lib/silvio-commessa/scrittura";
import { modificaBloccata } from "@/components/silvio-commessa/useBozzaSilvio";
import { elencoControlla, pianoDellaCommessa, testoValore } from "@/components/silvio-commessa/presentazione";
import {
  cosaManca, leggiDaCompletare,
} from "@/lib/silvio-commessa/daCompletare";

const AZ = "az-1";
const ORDINE = "o0000000-0000-4000-a000-000000000001";
const CLIENTE = "c0000000-0000-4000-a000-000000000001";

/** Una commessa come quelle vere: anagrafica e importo, niente fasi, rate, inizio, cantiere. */
const ordine = (extra: Record<string, unknown> = {}) => ({
  id: ORDINE, company_id: AZ, order_code: "ORD-2026-034", description: "Rifacimento bagno 6 mq",
  customer_id: CLIENTE, client_name: "Mario Rossi", client_email: "mario@example.invalid", client_address: "Via Prova 1, Monza",
  total_amount: 12000, vat_rate: 10, payment_type: "standard", work_start_date: null as string | null, indirizzo_lavori: null as string | null, ...extra,
});

function pianoDa(frammenti: Frammento[]): PianoCommessa {
  return frammenti.reduce((p, f) => fondi(p, f), pianoVuoto(AZ, ORDINE));
}

describe("«Completa»: quello che c'è non si tocca", () => {
  it("la commessa entra come persona, bloccata, e non finisce nella scrittura", () => {
    const piano = pianoDa(frammentiPerCompletare({ order: ordine(), conteggi: { tasks: 2 } }));
    const importo = piano.aree.economia?.["economia.total_amount"];
    expect(importo?.fonte).toMatchObject({ tipo: "persona", id: ORDINE });
    expect(giaNellaCommessa(piano, importo)).toBe(true);
    const s = scritturaDalPiano(piano);
    expect(s.modo).toBe("completa");
    // Niente di quello che la commessa ha già: né colonne, né cliente.
    for (const c of ["total_amount", "description", "client_name", "client_email", "vat_rate", "payment_type", "client_address"]) {
      expect(s.ordine).not.toHaveProperty(c);
    }
    expect(s.cliente.customer_id).toBeNull();
    expect(testoValore("comunicazione.tasks", piano.aree.comunicazione?.["comunicazione.tasks"]?.valore)).toBe("2 già inseriti");
    // Il «Controlla» mostra solo quello che si aggiunge.
    const voci = elencoControlla(piano, s).flatMap((g) => g.voci.map((x) => x.chiave));
    expect(voci).not.toContain("economia.total_amount");
    expect(voci).toContain("fasi.order_work_phases");
  });

  it("un documento che dice un altro importo non lo cambia, e non apre un conflitto", () => {
    const contratto: Frammento = {
      fonte: { tipo: "contratto", etichetta: "Contratto.pdf" },
      aree: {
        economia: { "economia.total_amount": { valore: 15000, fiducia: 0.9, stato: "fatto" } },
        cantiere: { "cantiere.indirizzo": { valore: { indirizzo_lavori: "Via Cantiere 5, Lecco" }, fiducia: 0.9, stato: "fatto" } },
      },
    };
    const piano = pianoDa([...frammentiPerCompletare({ order: ordine() }), contratto]);
    expect(piano.aree.economia?.["economia.total_amount"]?.valore).toBe(12000);
    expect(piano.conflitti).toEqual([]);
    const s = scritturaDalPiano(piano);
    expect(s.ordine).not.toHaveProperty("total_amount");
    expect(s.ordine.indirizzo_lavori).toBe("Via Cantiere 5, Lecco");
  });

  it("le modifiche a mano su quello che c'è si fermano, quelle su quello che manca passano", () => {
    const piano = pianoDa(frammentiPerCompletare({ order: ordine() }));
    expect(modificaBloccata(piano, { tipo: "cambia_valore", area: "economia", chiave: "economia.total_amount", valore: 1 }))
      .toMatch(/già nella commessa/);
    expect(modificaBloccata(piano, { tipo: "togli", area: "cliente", chiave: "cliente.nome" })).toMatch(/già nella commessa/);
    expect(modificaBloccata(piano, { tipo: "cambia_valore", area: "fasi", chiave: "fasi.work_start_date", valore: "2026-11-09" })).toBeNull();
    // Un valore scritto nel popup è della persona ma non della commessa: si può ancora cambiare.
    const dopo = applica(piano, { tipo: "cambia_valore", area: "fasi", chiave: "fasi.work_start_date", valore: "2026-11-09" }).piano;
    expect(giaNellaCommessa(dopo, dopo.aree.fasi?.["fasi.work_start_date"])).toBe(false);
    expect(scritturaDalPiano(dopo).ordine.work_start_date).toBe("2026-11-09");
  });

  it("senza fasi e col lavoro riconoscibile, il modello le propone con la misura; con le fasi già datate no", () => {
    const [commessa, modello] = frammentiPerCompletare({ order: ordine({ work_start_date: "2026-11-09" }) });
    expect(commessa.fonte.tipo).toBe("persona");
    expect(modello.fonte.etichetta).toBe("modello «bagno» (6 mq)");
    const fasi = modello.aree.fasi?.["fasi.order_work_phases"]?.valore as { start_date?: string }[];
    expect(fasi.length).toBeGreaterThan(2);
    expect(fasi[0].start_date).toBe("2026-11-09");

    const datata = { id: "f1", name: "Demolizioni", position: 0, start_date: "2026-11-09", end_date: "2026-11-11" };
    expect(frammentiPerCompletare({ order: ordine(), fasi: [datata] })).toHaveLength(1);
    expect(frammentiPerCompletare({ order: ordine({ description: "Lavori vari", tipo_lavoro: null }) })).toHaveLength(1);
  });

  it("il tipo di lavoro della commessa resta suo, le fasi del modello entrano", () => {
    const piano = pianoDa(frammentiPerCompletare({ order: ordine({ tipo_lavoro: "bagno" }) }));
    expect(piano.aree.identita?.["identita.tipo_lavoro"]?.fonte.tipo).toBe("persona");
    const s = scritturaDalPiano(piano);
    expect(s.ordine).not.toHaveProperty("tipo_lavoro");
    expect(s.fasi.map((f) => f.nome)).toContain("Protezioni e demolizioni");
    expect(daAggiungere(s)).toBeGreaterThan(0);
    expect(prontaPerScrivere(s)).toEqual([]);
  });

  it("a una commessa completa non resta niente da aggiungere: «Completa» resta spento", () => {
    const piano = pianoDa(frammentiPerCompletare({
      order: ordine({ work_start_date: "2026-11-09", indirizzo_lavori: "Via Prova 1" }),
      fasi: [{ id: "f1", name: "Demolizioni", start_date: "2026-11-09", end_date: "2026-11-11", position: 0 }],
      rate: [{ label: "Acconto", type: "deposit", amount: 3000, position: 0 }],
    }));
    const s = scritturaDalPiano(piano);
    expect(daAggiungere(s)).toBe(0);
    expect(prontaPerScrivere(s)).toEqual(["Silvio non ha ancora niente da aggiungere"]);
  });

  it("le righe di un documento non si aggiungono a una commessa che c'è: restano fuori col motivo", () => {
    const preventivo: Frammento = {
      fonte: { tipo: "preventivo", id: "q-1", etichetta: "PR-0001" },
      aree: { economia: { "economia.order_items": { valore: [{ name: "Piatto doccia", quantity: 1 }], fiducia: 1, stato: "fatto" } } },
    };
    const s = scritturaDalPiano(pianoDa([...frammentiPerCompletare({ order: ordine() }), preventivo]));
    expect(s.righe).toEqual([]);
    expect(s.escluse.find((e) => e.chiave === "economia.order_items")?.motivo).toMatch(/dalla sua pagina/);
  });

  it("«prima» è il punteggio della sola commessa, uguale a quello calcolato sulla commessa vera", () => {
    const dati = { order: ordine(), conteggi: { tasks: 1 } };
    const piano = pianoDa(frammentiPerCompletare(dati));
    const prima = completezzaPiano(pianoDellaCommessa(piano)).punteggio;
    expect(prima).toBe(completezza({ order: dati.order, righe: { tasks: 1 } }).punteggio);
    expect(completezzaPiano(piano).punteggio).toBeGreaterThan(prima);
  });
});

describe("«Da completare»: cosa manca e la lettura", () => {
  it("dice cosa manca, in parole", () => {
    expect(cosaManca(["fasi.order_work_phases", "pagamenti.rate", "fasi.work_start_date", "cantiere.indirizzo", "identita.sede_id"]))
      .toBe("fasi, rate, inizio lavori e altre 2");
    expect(cosaManca(["pagamenti.rate", "fasi.work_start_date"])).toBe("rate e inizio lavori");
    // Il nome può esserci già: quello che manca è il collegamento all'anagrafica.
    expect(cosaManca(["cliente.customer_id"])).toBe("cliente in anagrafica");
  });

  it("legge la funzione SQL con l'azienda, la commessa e il tetto", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ order_id: "o1", order_code: "ORD-1", titolo: "Bagno", cliente: "Rossi", inizio: "2026-11-03", consegna: null,
        importo: "12000.00", punteggio: 33, mancano: ["pagamenti.rate"], totale: 41 }],
      error: null,
    }));
    const righe = await leggiDaCompletare(AZ, { limite: 50 }, { rpc });
    expect(rpc).toHaveBeenCalledWith("commesse_da_completare", { p_company_id: AZ, p_order_id: null, p_limite: 50 });
    expect(righe[0]).toMatchObject({ order_id: "o1", importo: 12000, punteggio: 33, totale: 41, mancano: ["pagamenti.rate"] });
    await expect(leggiDaCompletare(AZ, {}, { rpc: async () => ({ data: null, error: { message: "Could not find the function", code: "PGRST202" } }) }))
      .rejects.toThrow("non è ancora attiva");
  });
});

describe("La funzione SQL conta come il popup", () => {
  const migrazione = readFileSync(resolve(__dirname, "../../../supabase/migrations/20281112120000_commesse_da_completare.sql"), "utf8");
  const spazi = (s: string) => s.replace(/\s+/g, " ").trim();

  it("usa le stesse espressioni di completezza.ts per punteggio e cosa manca", () => {
    expect(spazi(migrazione)).toContain(spazi(sqlPunteggio("o")));
    expect(spazi(migrazione)).toContain(spazi(sqlMancano("o")));
  });

  it("è chiusa ad anon, controlla il permesso e l'azienda, e ha un tetto", () => {
    expect(migrazione).toMatch(/revoke all on function public\.commesse_da_completare\(uuid, uuid, integer\) from public, anon/);
    expect(migrazione).toMatch(/has_permission_for_company\(v_uid, 'can_edit_orders', p_company_id\)/);
    expect(migrazione).toMatch(/get_effective_company_id\(\)/);
    expect(migrazione).toMatch(/can_see_order\(o\.id, o\.assigned_to, o\.destination_warehouse_id\)/);
    expect(migrazione).toMatch(/least\(greatest\(coalesce\(p_limite, 50\), 1\), 200\)/);
    expect(migrazione).toMatch(/set search_path = ''/);
  });
});
