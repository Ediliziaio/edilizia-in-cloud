import { describe, it, expect } from "vitest";
import {
  richiestaConferma,
  confermaValida,
  totaleCollegamenti,
  SOGLIA_ELIMINAZIONE_MASSIVA,
  PAROLA_CONFERMA,
} from "@/lib/marketing/confermaEliminazione";

/**
 * Questa è l'ultima cosa che sta fra un clic e la perdita irreversibile di
 * migliaia di anagrafiche. Se sbaglia in senso permissivo, non c'è un secondo
 * controllo dietro: la cancellazione dei contatti è dura, non c'è cestino.
 */

const senzaCollegamenti = { opportunities: 0, appointments: 0, quotes: 0, tasks: 0 };

describe("richiestaConferma", () => {
  it("il caso che prima passava con un clic: tanti contatti, nessun collegamento", () => {
    // È esattamente la forma di un'anagrafica fredda importata in blocco.
    const r = richiestaConferma(5000, senzaCollegamenti);
    expect(r.serve).toBe(true);
    expect(r.motivo).toBe("quantita");
    expect(r.parola).toBe("5000");
  });

  it("sopra la soglia si scrive il numero, non una parola fissa", () => {
    // Una parola si digita a memoria; un numero costringe a leggere quanti sono.
    expect(richiestaConferma(37, senzaCollegamenti).parola).toBe("37");
    expect(richiestaConferma(37, senzaCollegamenti).parola).not.toBe(PAROLA_CONFERMA);
  });

  it("la soglia è inclusiva: al valore esatto si scrive già", () => {
    expect(richiestaConferma(SOGLIA_ELIMINAZIONE_MASSIVA, senzaCollegamenti).serve).toBe(true);
    expect(richiestaConferma(SOGLIA_ELIMINAZIONE_MASSIVA - 1, senzaCollegamenti).serve).toBe(false);
  });

  it("pochi contatti ma con collegamenti: resta la parola", () => {
    const r = richiestaConferma(2, { ...senzaCollegamenti, opportunities: 3 });
    expect(r.serve).toBe(true);
    expect(r.motivo).toBe("collegamenti");
    expect(r.parola).toBe(PAROLA_CONFERMA);
  });

  it("un contatto solo e senza collegamenti si conferma col pulsante", () => {
    // Cancellare un'anagrafica sbagliata appena creata non deve diventare un rito.
    expect(richiestaConferma(1, senzaCollegamenti).serve).toBe(false);
  });

  it("la quantità decide anche mentre il conteggio dei collegamenti è in corso", () => {
    // links null = sto ancora contando. Tanti restano tanti comunque.
    const r = richiestaConferma(800, null);
    expect(r.serve).toBe(true);
    expect(r.parola).toBe("800");
  });

  it("pochi contatti e conteggio non ancora arrivato: non si inventa una richiesta", () => {
    expect(richiestaConferma(3, null).serve).toBe(false);
  });

  it("la quantità ha la precedenza sui collegamenti", () => {
    const r = richiestaConferma(50, { ...senzaCollegamenti, opportunities: 2 });
    expect(r.parola).toBe("50");
  });
});

describe("confermaValida", () => {
  it("senza richiesta è sempre valida", () => {
    expect(confermaValida("", richiestaConferma(1, senzaCollegamenti))).toBe(true);
  });

  it("il numero deve combaciare esattamente", () => {
    const r = richiestaConferma(120, senzaCollegamenti);
    expect(confermaValida("120", r)).toBe(true);
    expect(confermaValida("12", r)).toBe(false);
    expect(confermaValida("1200", r)).toBe(false);
    expect(confermaValida("", r)).toBe(false);
  });

  it("spazi attorno perdonati, contenuto no", () => {
    const r = richiestaConferma(15, senzaCollegamenti);
    expect(confermaValida("  15 ", r)).toBe(true);
    expect(confermaValida("quindici", r)).toBe(false);
  });

  it("la parola non è sensibile alle maiuscole", () => {
    const r = richiestaConferma(2, { ...senzaCollegamenti, tasks: 1 });
    expect(confermaValida("conferma", r)).toBe(true);
    expect(confermaValida("CONFERMA", r)).toBe(true);
    expect(confermaValida("confermare", r)).toBe(false);
  });

  it("scrivere CONFERMA non sblocca un'eliminazione massiva", () => {
    // Chi ha imparato il gesto sul caso piccolo non deve poterlo ripetere qui.
    const r = richiestaConferma(4000, senzaCollegamenti);
    expect(confermaValida(PAROLA_CONFERMA, r)).toBe(false);
  });
});

describe("totaleCollegamenti", () => {
  it("somma i tipi collegati", () => {
    expect(totaleCollegamenti({ opportunities: 1, appointments: 2, quotes: 3, tasks: 4 })).toBe(10);
    // I preventivi fotovoltaici sono opzionali ma, se ci sono, contano.
    expect(
      totaleCollegamenti({ opportunities: 1, appointments: 2, quotes: 3, tasks: 4, progettiFv: 5 })
    ).toBe(15);
    expect(totaleCollegamenti(senzaCollegamenti)).toBe(0);
  });
});
