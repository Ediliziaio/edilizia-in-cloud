import { describe, expect, it } from "vitest";
import { datiConsegna, erroriConsegnaDpi } from "@/lib/sicurezza/gestioneDpi";
import {
  statoConsegnaDpi,
  riepilogoDpi,
  type ConsegnaDpi,
} from "@/lib/sicurezza/dpiCommessa";
const record: ConsegnaDpi = {
  id: "c",
  tipo: "casco",
  marca: "Marca",
  matricola: "123",
  consegnato_il: "2026-10-01",
  scade_il: null,
  stato: "in_use",
  restituito_il: null,
  modulo_registrato: true,
  versione: 2,
};
describe("Rettifiche DPI senza ereditare motivazioni o prove", () => {
  it("riprende i dati tecnici, lascia il motivo da compilare e non trasmette il path del modulo", () => {
    const d = datiConsegna(record);
    expect(d.motivo).toBe("");
    expect(d.tipo).toBe("casco");
    expect(d).not.toHaveProperty("modulo_registrato");
    expect(d).not.toHaveProperty("versione");
    expect(d).not.toHaveProperty("id");
    expect(erroriConsegnaDpi(d)).toContain(
      "Indica il motivo della registrazione o rettifica (3–2000 caratteri).",
    );
  });
  it("controlla data effettiva di reso, cronologia e date impossibili", () => {
    const d = { ...datiConsegna(record), motivo: "Prova", stato: "returned" };
    expect(erroriConsegnaDpi(d)).toContain("Indica la data di restituzione.");
    expect(
      erroriConsegnaDpi({ ...d, restituito_il: "2026-02-30" }),
    ).not.toEqual([]);
    expect(erroriConsegnaDpi({ ...d, restituito_il: "2026-10-15" })).toEqual(
      [],
    );
  });
  it("non presume validità da tipi ignoti o testi eccessivi", () => {
    const d = { ...datiConsegna(record), motivo: "Prova" };
    expect(
      erroriConsegnaDpi({
        ...d,
        tipo: "Altro arbitrario",
        note: "x".repeat(2001),
      }),
    ).toHaveLength(2);
    expect(erroriConsegnaDpi({ ...d, stato: "approvato" })).toContain(
      "Scegli lo stato del dispositivo.",
    );
  });
  it("l’annullamento non diventa in uso e il ripristino non si deduce automaticamente", () => {
    const d = { ...record, annullata: true };
    expect(statoConsegnaDpi(d, "2026-10-27")).toBe("annullata");
    expect(
      riepilogoDpi({
        data: "2026-10-27",
        fase_id: null,
        campo_senza_dipendente: 0,
        addetti: [
          {
            id: "a",
            nome: "A",
            cognome: "B",
            attivo: true,
            qualifica: null,
            assegnazioni: [],
            consegne: [d],
          },
        ],
      }).senzaConsegne,
    ).toBe(1);
    expect(datiConsegna(d).annullata).toBe(true);
  });
});
