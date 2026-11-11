import { describe, expect, it, vi } from "vitest";
import { intervalloRapportini } from "@/lib/orders/periodoRapportini";
import { preparaRapportoEconomia } from "@/lib/documentiOperativi/preparaRapportoEconomia";
import { rapportoEconomiaDaRapportini } from "@/lib/documentiOperativi/rapporti";
import {
  importoRiga,
  modificaNumeroRigaDocumento,
} from "@/lib/documentiOperativi/modello";
import { corpoDocumento } from "@/lib/documentiOperativi/modello";
import { creaPdfOperativo } from "@/lib/documentiOperativi/pdf";
import type { RapportinoCompleto } from "@/hooks/useRapportiniMese";

const r: RapportinoCompleto = {
  id: "r1",
  order_id: "cantiere-1",
  data_lavoro: "2026-11-04",
  stato: "approvato",
  descrizione_lavori: "SIMULAZIONE — posa finiture",
  ore_lavorate: 0,
  order: {
    order_code: "SIM-1",
    client_name: "Cliente SIM",
    client_email: "cliente@no-email.ediliziaincloud.local",
  },
};

describe("Periodi dei rapportini", () => {
  it("tutti non aggiunge limiti; gli ultimi 30 attraversano il cambio di mese", () => {
    expect(intervalloRapportini("tutti", "2026-11-11", "2026-11")).toEqual({});
    expect(intervalloRapportini("ultimi30", "2026-11-11", "2026-11")).toEqual({
      da: "2026-10-13",
      a: "2026-11-11",
    });
  });
  it("rifiuta date inesistenti, mancanti e intervalli invertiti", () => {
    for (const [da, a] of [
      ["2026-02-30", "2026-03-01"],
      ["", "2026-11-11"],
      ["2026-11-12", "2026-11-11"],
    ])
      expect(
        intervalloRapportini("personalizzato", "2026-11-11", "2026-11", da, a),
      ).toBeNull();
    expect(intervalloRapportini("mese", "2026-11-11", "2024-02")).toEqual({
      da: "2024-02-01",
      a: "2024-02-29",
    });
  });
});

describe("Bozza automatica del rapporto in economia", () => {
  it("una descrizione approvata senza ore produce un riepilogo, con prezzo da definire", async () => {
    const d = await preparaRapportoEconomia([r], "Tutto il periodo");
    expect(d.righe).toHaveLength(1);
    expect(d.righe[0]).toMatchObject({
      descrizione: r.descrizione_lavori,
      quantita: 1,
      unita: "cad",
      prezzo: null,
    });
    expect(d.destinatario.email).toBeNull();
    expect(d.numero).not.toContain("/");
    const azienda = { id: "a", name: "Impresa SIM" };
    const pdf = creaPdfOperativo(d, azienda).output();
    expect(pdf).toContain("Da definire");
    expect(pdf).not.toContain("0,00");
    expect(pdf).toContain("Da concordare con il committente");
    expect(corpoDocumento(d, azienda)).toContain("Totale IVA esclusa: Da definire");
  });
  it("usa quantità, ricavo e vendita del quadro economico, senza esportare i costi", async () => {
    const leggi = vi.fn(async () => ({
      persone: [
        {
          nome: "Operaio SIM",
          ore: 8,
          unita: "ora",
          quantita: 8,
          prezzo: 45,
          ricavo: 390,
          costo: 98765,
        },
      ],
      voci: [
        {
          descrizione: "Trasporto SIM",
          quantita: 2,
          unita: "viaggio",
          vendita_unitaria: 25,
          costo_unitario: 98765,
        },
      ],
    }));
    const d = await preparaRapportoEconomia(
      [r, { ...r, id: "rifiutato", stato: "rifiutato" }],
      "2026-11",
      leggi,
    );
    expect(leggi).toHaveBeenCalledTimes(1);
    expect(d.righe.map(importoRiga)).toEqual([390, 50]);
    expect(JSON.stringify(d)).not.toContain("98765");
    expect(d.righe[0]).toMatchObject({ unita: "h", prezzo: 45, quantita: 8 });
    expect(
      importoRiga(modificaNumeroRigaDocumento(d.righe[0], "prezzo", "40")),
    ).toBe(320);
    expect(
      importoRiga(modificaNumeroRigaDocumento(d.righe[0], "quantita", "4")),
    ).toBe(180);
  });
  it("un costo interno non diventa un prezzo di vendita e non si inventano importi mancanti", () => {
    const d = rapportoEconomiaDaRapportini(
      [
        {
          ...r,
          presenze: [{ employee_id: "e", nome: "Operaio SIM", ore: 4 }],
          costo_manodopera: 98765,
        },
      ],
      "2026-11",
    );
    expect(d.righe[0].prezzo).toBeNull();
    expect(d.righe[0].quantita).toBe(4);
    expect(JSON.stringify(d)).not.toContain("98765");
  });
  it("nessuna lettura economica prima della scelta di un cantiere o senza approvati", async () => {
    const leggi = vi.fn(async (): Promise<null> => null);
    await expect(
      preparaRapportoEconomia([{ ...r, stato: "inviato" }], "2026-11", leggi),
    ).rejects.toThrow("Approva");
    await expect(
      preparaRapportoEconomia(
        [r, { ...r, id: "r2", order_id: "cantiere-2" }],
        "2026-11",
        leggi,
      ),
    ).rejects.toThrow("solo cantiere");
    expect(leggi).not.toHaveBeenCalled();
  });
  it("un errore nei dati economici blocca la bozza senza saltare voci in silenzio", async () => {
    await expect(
      preparaRapportoEconomia([r], "2026-11", async () => {
        throw new Error("Rete non disponibile");
      }),
    ).rejects.toThrow("Rete non disponibile");
  });
  it("una selezione annullata non prosegue con le letture dei blocchi successivi", async () => {
    const controller = new AbortController();
    const leggi = vi.fn(async (): Promise<null> => {
      controller.abort();
      return null;
    });
    await expect(
      preparaRapportoEconomia(
        Array.from({ length: 9 }, (_, i) => ({ ...r, id: `r${i}` })),
        "2026-11",
        leggi,
        controller.signal,
      ),
    ).rejects.toThrow("annullata");
    expect(leggi).toHaveBeenCalledTimes(4);
  });
});
