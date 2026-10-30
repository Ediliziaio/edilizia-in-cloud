import { describe, expect, it } from "vitest";
import { passiScegliibili, passoDaiDocumenti, statoMateriale, type RigaOrdineCollegata } from "@/lib/distinta/statoMateriale";
import { quantitaSommabili, trovaDoppione } from "@/lib/distinta/elencoArticoli";

const riga = { id: "r", quantity: 10, status: "da_ordinare", supplier_rfq_item_id: null as string | null, unita_misura: "m" };
const oda = (status: string, quantity = 10, quantity_received = 0): RigaOrdineCollegata => ({
  order_item_id: "r", quantity, quantity_received, unit_of_measure: "m",
  purchase_orders: { oda_number: "ODA-7", status, issue_date: "2026-10-12", expected_delivery_date: "2026-10-20" },
});
const scegliibili = (info: Parameters<typeof passiScegliibili>[0], offerta = false) =>
  passiScegliibili(info, offerta).filter((p) => p.status).map((p) => p.stato);

describe("stato cambiato a mano", () => {
  it("senza documenti si sceglie ogni passo tranne offerta e bozza", () => {
    const info = statoMateriale(riga, []);
    expect(scegliibili(info)).toEqual(["da_ordinare", "ordinato", "consegnato", "installato"]);
    const offerta = passiScegliibili(info, false).find((p) => p.stato === "in_offerta")!;
    expect(offerta.motivo).toMatch(/richiesta d'offerta/);
  });

  it("ogni passo scelto, scritto sulla riga, torna lo stesso passo", () => {
    for (const p of passiScegliibili(statoMateriale(riga, []), false).filter((x) => x.status)) {
      expect(statoMateriale({ ...riga, status: p.status }, []).stato).toBe(p.stato);
    }
  });

  it("con un ordine emesso non si torna a «Da ordinare» e il motivo cita l'ordine", () => {
    const info = statoMateriale(riga, [oda("inviato")]);
    expect(passoDaiDocumenti(info, false)).toBe("ordinato");
    expect(scegliibili(info)).toEqual(["ordinato", "consegnato", "installato"]);
    expect(passiScegliibili(info, false)[0].motivo).toMatch(/ODA-7/);
  });

  it("tutto arrivato: si sceglie solo consegnato o installato", () => {
    expect(scegliibili(statoMateriale(riga, [oda("ricevuto", 10, 10)]))).toEqual(["consegnato", "installato"]);
  });

  it("l'attuale è segnato", () => {
    const info = statoMateriale({ ...riga, status: "installato" }, []);
    expect(passiScegliibili(info, false).filter((p) => p.attuale).map((p) => p.stato)).toEqual(["installato"]);
  });
});

describe("doppioni in aggiunta", () => {
  const esistenti = [
    { id: "a", name: "Pittura lavabile  bianca", phase_id: "f1", unita_misura: "l" },
    { id: "b", name: "Posa pavimento", phase_id: "f1", natura_riga: "lavorazione" },
    { id: "c", name: "Colla", phase_id: "f2", article_template_id: "t1" },
  ];

  it("stesso nome nella stessa fase, senza badare ad accenti e maiuscole", () => {
    expect(trovaDoppione({ name: "pittura lavabile bianca", phase_id: "f1" }, esistenti)?.id).toBe("a");
  });

  it("in un'altra fase non è un doppione", () => {
    expect(trovaDoppione({ name: "Pittura lavabile bianca", phase_id: "f2" }, esistenti)).toBeNull();
  });

  it("stesso articolo del listino anche con un nome diverso", () => {
    expect(trovaDoppione({ name: "Colla per piastrelle C2", phase_id: "f2", article_template_id: "t1" }, esistenti)?.id).toBe("c");
  });

  it("le lavorazioni non contano", () => {
    expect(trovaDoppione({ name: "Posa pavimento", phase_id: "f1" }, esistenti)).toBeNull();
  });

  it("senza fasi (nuova commessa) conta solo il nome", () => {
    expect(trovaDoppione({ name: "Colla" }, [{ name: "COLLA" }])?.name).toBe("COLLA");
  });

  it("una riga non è il doppione di sé stessa", () => {
    expect(trovaDoppione(esistenti[0], esistenti)).toBeNull();
  });

  it("si sommano solo quantità della stessa unità, senza posizioni né magazzino", () => {
    expect(quantitaSommabili({ name: "x", unita_misura: "L" }, { name: "x", unita_misura: "l" })).toBe(true);
    expect(quantitaSommabili({ name: "x" }, { name: "x", unita_misura: "pz" })).toBe(true);
    expect(quantitaSommabili({ name: "x", unita_misura: "m" }, { name: "x", unita_misura: "m2" })).toBe(false);
    expect(quantitaSommabili({ name: "x", posizioni: [{}] }, { name: "x" })).toBe(false);
    expect(quantitaSommabili({ name: "x", stock_item_id: "s" }, { name: "x" })).toBe(false);
  });
});
