/**
 * Modelli per tipo di lavoro (fase 1, lotto 1.3): «bagno 6 mq» dà fasi e durate sensate
 * anche senza documento, marcate come stima. I numeri restano quelli dei preventivatori.
 */
import { describe, it, expect } from "vitest";
import type { FaseDelPiano } from "../../../shared/silvio-commessa/piano.ts";
import {
  dateDelleFasi, fasiDelModello, frammentoDalModello, frammentoDalTesto, giorniTotali, misuraDalTesto,
  MODELLI_LAVORO, primoLavorativo, riconosciTipoLavoro, TIPI_LAVORO, type TipoLavoro,
} from "../../../shared/silvio-commessa/modelliLavoro.ts";
import { fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import { completezzaPiano } from "../../../shared/silvio-commessa/completezza.ts";
import { variabile } from "../../../shared/silvio-commessa/registro.ts";
import { fasiDiPartenza } from "@/lib/preventivi/cronoprogramma";
import { giorniLavorativiDellaDurata } from "@/lib/orders/pianoDalCronoprogramma";
import { ORDER_WORKFLOW_MODELS } from "@/lib/orders/workflowModels";

/** Il mestiere dei preventivatori edili (FASI_TIPICHE) per ogni modello che ne viene. */
const DAL_PREVENTIVATORE: Partial<Record<TipoLavoro, string>> = {
  bagno: "bagni", tetto: "tetti", ristrutturazione: "ristrutturazione", climatizzazione: "climatizzazione",
  elettrico: "elettrico", termoidraulica: "termoidraulico", pavimenti: "pavimenti", piscina: "piscine",
};

describe("modelli per tipo di lavoro", () => {
  it("alla misura di riferimento sono le fasi tipiche dei preventivatori, nome e durata", () => {
    for (const [tipo, mestiere] of Object.entries(DAL_PREVENTIVATORE)) {
      const attese = fasiDiPartenza(mestiere).map((f) => [f.fase, giorniLavorativiDellaDurata(f.durata)]);
      const fasi = fasiDelModello(tipo as TipoLavoro, MODELLI_LAVORO[tipo as TipoLavoro].riferimento);
      expect(fasi.map((f) => [f.name, f.giorni]), tipo).toEqual(attese);
    }
  });

  it("ogni tipo ha fasi una dopo l'altra e un tipo di lavoro che la commessa conosce", () => {
    const chiavi = new Set(ORDER_WORKFLOW_MODELS.map((m) => m.key));
    for (const tipo of TIPI_LAVORO) {
      const m = MODELLI_LAVORO[tipo];
      expect(m.tipo).toBe(tipo);
      expect(chiavi.has(m.tipoLavoroCommessa), tipo).toBe(true);
      const fasi = fasiDelModello(tipo);
      fasi.forEach((f, i) => expect(f.giorno_inizio).toBe(i === 0 ? 1 : fasi[i - 1].giorno_inizio! + fasi[i - 1].giorni!));
    }
  });

  it("durate sensate, in giorni lavorativi", () => {
    const totale = (tipo: TipoLavoro, misura?: number) => giorniTotali(fasiDelModello(tipo, misura));
    // Un bagno di 6 mq: tre settimane scarse.
    expect(totale("bagno", 6)).toBe(14);
    // Più grande dura di più, ma non in proporzione; più piccolo, meno.
    expect(totale("bagno", 12)).toBeGreaterThan(14);
    expect(totale("bagno", 12)).toBeLessThan(28);
    expect(totale("bagno", 3)).toBeLessThan(14);
    // Fotovoltaico: le pratiche e la consegna non dipendono dai kW, l'installazione sì.
    expect(totale("fotovoltaico", 3)).toBeLessThan(totale("fotovoltaico", 20));
    expect(totale("fotovoltaico", 6)).toBe(25);
    // Serramenti: la posa è 0,8 giorni a pezzo, la produzione resta.
    const sr = fasiDelModello("serramenti", 20);
    expect(sr.find((f) => f.name === "Posa in opera")?.giorni).toBe(16);
    expect(sr.find((f) => f.name === "Produzione dei serramenti")?.giorni).toBe(22);
    // Nessun lavoro dura meno di una settimana o più di sei mesi lavorativi alle misure comuni.
    for (const tipo of TIPI_LAVORO) {
      const t = totale(tipo);
      expect(t, tipo).toBeGreaterThanOrEqual(5);
      expect(t, tipo).toBeLessThanOrEqual(130);
    }
    // Misure estreme: limitate, mai zero giorni.
    expect(fasiDelModello("tetto", 1).every((f) => f.giorni! >= 1)).toBe(true);
    expect(totale("tetto", 100000)).toBeLessThanOrEqual(4 * totale("tetto") + 5);
  });

  it("le date saltano il fine settimana", () => {
    expect(primoLavorativo("2026-11-07")).toBe("2026-11-09"); // sabato → lunedì
    expect(primoLavorativo("2026-11-10")).toBe("2026-11-10");
    const fasi: FaseDelPiano[] = [{ name: "A", giorno_inizio: 1, giorni: 3 }, { name: "B", giorno_inizio: 4, giorni: 4 }];
    expect(dateDelleFasi(fasi, "2026-11-11").map((f) => [f.start_date, f.end_date])).toEqual([
      ["2026-11-11", "2026-11-13"], ["2026-11-16", "2026-11-19"],
    ]);
  });

  it("il frammento: fonte modello, fiducia sotto 1, tutto in proposta", () => {
    const fr = frammentoDalModello("bagno", { misura: 6, inizio: "2026-11-09" });
    expect(fr.fonte).toMatchObject({ tipo: "modello", etichetta: "modello «bagno» (6 mq)" });
    for (const [area, valori] of Object.entries(fr.aree)) {
      for (const [chiave, v] of Object.entries(valori ?? {})) {
        expect(variabile(chiave)?.area, chiave).toBe(area);
        expect(v.fiducia, chiave).toBeLessThan(1);
        expect(v.stato, chiave).toBe("proposta");
      }
    }
    const fasi = fr.aree.fasi?.["fasi.order_work_phases"]?.valore as FaseDelPiano[];
    expect(fasi[0]).toMatchObject({ name: "Protezioni e demolizioni", start_date: "2026-11-09", end_date: "2026-11-10" });
    expect(fr.aree.fasi?.["fasi.work_end_date"]?.valore).toBe("2026-11-26");
    expect(fr.aree.identita?.["identita.tipo_lavoro"]?.valore).toBe("bagno");
    expect(fr.avvisi).toEqual([]);
  });

  it("senza misura vale meno e lo dice", () => {
    const fr = frammentoDalModello("tetto");
    expect(fr.aree.fasi?.["fasi.order_work_phases"]?.fiducia).toBeLessThan(frammentoDalModello("tetto", { misura: 80 }).aree.fasi!["fasi.order_work_phases"].fiducia);
    expect(fr.avvisi?.[0]).toMatch(/manca la misura/);
    expect(fr.aree.fasi?.["fasi.work_end_date"]).toBeUndefined();
  });

  it("dal testo libero: tipo e misura", () => {
    expect(riconosciTipoLavoro("rifare bagno 6 mq a Monza")).toBe("bagno");
    expect(riconosciTipoLavoro("ristrutturazione appartamento con due bagni")).toBe("ristrutturazione");
    expect(riconosciTipoLavoro("impianto FV da 4,5 kW con accumulo")).toBe("fotovoltaico");
    expect(riconosciTipoLavoro("sostituzione di 8 finestre")).toBe("serramenti");
    expect(riconosciTipoLavoro("tinteggiatura cancello")).toBeNull();
    expect(misuraDalTesto("rifare bagno 6 mq", "mq")).toBe(6);
    expect(misuraDalTesto("impianto da 4,5 kWp", "kW")).toBe(4.5);
    expect(misuraDalTesto("sostituzione di 8 finestre", "pezzi")).toBe(8);
    expect(misuraDalTesto("bagno grande", "mq")).toBeNull();
    const fr = frammentoDalTesto("rifare bagno 6 mq a Monza, 12k");
    expect(fr?.fonte.etichetta).toBe("modello «bagno» (6 mq)");
  });

  it("da solo, il modello dà fasi e date: la parte dei tempi del piano è piena", () => {
    const p = fondi(pianoVuoto("az-1"), frammentoDalModello("bagno", { misura: 6, inizio: "2026-11-09" }));
    const c = completezzaPiano(p);
    expect(c.perArea.fasi.mancano).toEqual(["fasi.work_start_date"]);
    expect(p.avvisi).toEqual([]);
  });
});
