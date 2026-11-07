/**
 * La bozza del preventivo classico per il PDF vero a destra dell'editor (07/11/2026).
 *
 * Il server stampa la bozza com'è sullo schermo con la strada del PDF vero. Qui: le righe hanno il totale che
 * darebbe il database, la scadenza è quella che darebbe il salvataggio, e identità, numero, stato e firma non
 * si cambiano dal browser.
 */
import { describe, expect, it } from "vitest";
import {
  RIGHE_MASSIME_BOZZA, campiNonDaBozza, leggiBozzaDelPreventivo, totaleRiga, unisciBozza,
} from "../../../supabase/functions/_shared/bozzaDelPreventivo";
import { pdfDallaRisposta } from "@/components/quotes/PdfVeroPreventivoClassico";

describe("Le righe della bozza", () => {
  it("il totale di riga è quello della colonna generata del database: quantità × prezzo × (1 − sconto%), a due decimali", () => {
    expect(totaleRiga({ quantity: 3, unit_price: 19.99, discount_percent: 10 })).toBe(53.97);
    expect(totaleRiga({ quantity: "2", unit_price: "100" })).toBe(200);
    expect(totaleRiga({ quantity: 1, unit_price: -50 })).toBe(-50);
  });

  it("ogni riga ha un id e l'ordine dello schermo", () => {
    const b = leggiBozzaDelPreventivo({ quote: { title: "Bagno" }, items: [{ name: "A", quantity: 1, unit_price: 10 }, { name: "B", quantity: 2, unit_price: 5 }] })!;
    expect(b.items.map((r) => [r.id, r.sort_order, r.line_total])).toEqual([["bozza-1", 0, 10], ["bozza-2", 1, 10]]);
  });

  it("una bozza senza righe valide, o troppo grande, non si legge", () => {
    expect(leggiBozzaDelPreventivo(null)).toBeNull();
    expect(leggiBozzaDelPreventivo({ quote: [], items: [] })).toBeNull();
    expect(leggiBozzaDelPreventivo({ quote: {}, items: "no" })).toBeNull();
    expect(leggiBozzaDelPreventivo({ quote: {}, items: Array.from({ length: RIGHE_MASSIME_BOZZA + 1 }, () => ({})) })).toBeNull();
  });
});

describe("Cosa non si cambia dal browser", () => {
  it("numero, stato, firma e condizioni fissate restano quelli del database", () => {
    const b = leggiBozzaDelPreventivo({
      quote: { company_id: "az", title: "Nuovo titolo", quote_number: "FALSO", status: "accettato", signed_at: "2026-01-01", condizioni_origine: { modello_id: "x" } },
      items: [],
    })!;
    expect(b.quote).toEqual({ company_id: "az", title: "Nuovo titolo" });
    const dalDatabase = { id: "q1", company_id: "az", quote_number: "PRV-2026-010", status: "inviato", signed_at: null as string | null, title: "Vecchio" };
    const unito = { ...dalDatabase, ...b.quote, ...campiNonDaBozza(dalDatabase) };
    expect(unito).toMatchObject({ id: "q1", quote_number: "PRV-2026-010", status: "inviato", title: "Nuovo titolo" });
  });

  it("la scadenza è quella che darebbe il salvataggio: adesso + giorni di validità", () => {
    const adesso = new Date("2026-11-07T10:00:00.000Z");
    expect(leggiBozzaDelPreventivo({ quote: { validity_days: 30 }, items: [] }, adesso)!.quote.expires_at).toBe("2026-12-07T10:00:00.000Z");
  });
});

describe("La validità stampata è quella del PDF scaricato", () => {
  // Visto il 07/11/2026 su Demo Azienda 2: anteprima «44 giorni», PDF scaricato «30».
  const salvato = { id: "q1", company_id: "az", validity_days: 30, created_at: "2026-10-24T09:00:00.000Z", expires_at: "2026-11-23T09:00:00.000Z" };
  const adesso = new Date("2026-11-07T10:00:00.000Z");

  it("con gli stessi giorni la scadenza resta quella salvata", () => {
    const b = leggiBozzaDelPreventivo({ quote: { validity_days: 30, title: "X" }, items: [] }, adesso)!;
    expect(unisciBozza(salvato, b).expires_at).toBe("2026-11-23T09:00:00.000Z");
  });

  it("cambiati i giorni, la scadenza è quella che darebbe il salvataggio", () => {
    const b = leggiBozzaDelPreventivo({ quote: { validity_days: 60 }, items: [] }, adesso)!;
    expect(unisciBozza(salvato, b).expires_at).toBe("2027-01-06T10:00:00.000Z");
  });
});

describe("La risposta del server", () => {
  it("il PDF arriva in base64 e diventa un PDF", async () => {
    const blob = await pdfDallaRisposta({ pdf_base64: btoa("%PDF-1.4") });
    expect(blob.type).toBe("application/pdf");
    expect(await blob.text()).toBe("%PDF-1.4");
  });

  it("senza PDF dice perché", async () => {
    await expect(pdfDallaRisposta({ error: "modello non valido" })).rejects.toThrow("modello non valido");
    await expect(pdfDallaRisposta(null)).rejects.toThrow(/non ha restituito/);
  });
});
