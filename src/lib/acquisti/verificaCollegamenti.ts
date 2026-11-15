/**
 * Popup di verifica dei collegamenti (§7.14, docs/automazioni-acquisti.md): la parte pura.
 *
 * Le righe vengono da `acquisti_collegamenti`. Qui si decide come mostrarle:
 *   - «certe»: tutte le prove tornano e almeno una identifica il documento. Si possono confermare
 *     insieme, con un clic: sono quelle che con l'interruttore acceso si sarebbero collegate da sole;
 *   - «da guardare»: una prova manca o non torna. Si confermano una per una, dopo averle lette.
 * Le prove e il percorso si mostrano così come la regola li ha scritti: il perché non si riassume.
 */

export type StatoCollegamento = "proposto" | "collegato" | "verificato" | "approvato_pagamento" | "pagato" | "rifiutato" | "annullato";

export interface ProvaSalvata {
  campo: string;
  ruolo?: "identifica" | "conferma" | "indizio";
  esito: "uguale" | "diverso" | "mancante";
  testo: string;
  atteso?: string | number | null;
  trovato?: string | number | null;
}

export interface RigaCollegamento {
  id: string;
  company_id: string;
  da_tipo: string;
  da_id: string;
  da_riga: string | null;
  a_tipo: string;
  a_id: string;
  a_riga: string | null;
  regola: string;
  esito: string;
  stato: StatoCollegamento;
  prove: ProvaSalvata[] | null;
  percorso: Array<{ passi?: string[] }> | null;
  importo: number | null;
  con_ai: boolean;
  autore_tipo: "utente" | "processo";
  created_at: string;
  updated_at: string;
}

export const ETICHETTA_TIPO: Record<string, string> = {
  fattura_ricevuta: "Fattura ricevuta",
  ddt: "Bolla",
  riga_ddt: "Riga di bolla",
  ordine: "Ordine",
  riga_ordine: "Riga d'ordine",
  commessa: "Commessa",
  fase: "Fase",
  magazzino: "Magazzino",
  anagrafica: "Fornitore",
  contratto: "Contratto",
  sal: "SAL",
  rapportino: "Rapportino",
  movimento_banca: "Movimento in banca",
  costo: "Costo",
  fattura_emessa: "Fattura emessa",
  documento_fiscale: "Fattura emessa",
  scadenza: "Scadenza",
  movimento_cassa: "Movimento di cassa",
  prima_nota: "Prima nota",
  rata_fornitore: "Rata fornitore",
  rata_commessa: "Rata commessa",
};

/** Nomi leggibili delle regole; una regola nuova senza nome si mostra col suo codice. */
export const ETICHETTA_REGOLA: Record<string, string> = {
  xml_ddt_numero_data_fornitore: "Bolla citata nella fattura: stesso fornitore, stesso numero, data vicina",
  oda_importo_fornitore: "Ordine dello stesso fornitore con lo stesso importo (la fattura non cita l'ordine)",
  oda_numero_importo_fornitore: "Ordine citato nella fattura, stesso fornitore e stesso importo",
  oda_importo_fornitore_storico: "Agganciata all'ordine prima del 15/11 senza conferma: da ricontrollare",
};

/**
 * Collegamenti fatti in passato senza una conferma registrata (decisione del titolare, 15/11/2026):
 * restano collegati, ma si mostrano a parte perché una persona li riveda uno per uno.
 */
export function daRicontrollare(r: Pick<RigaCollegamento, "regola" | "stato">): boolean {
  return r.regola.endsWith("_storico") && r.stato === "collegato";
}

export function etichettaRegola(regola: string): string {
  return ETICHETTA_REGOLA[regola] ?? regola.replace(/_/g, " ");
}

export type Gruppo = "certo" | "da_guardare";

export function gruppoVerifica(r: Pick<RigaCollegamento, "prove" | "con_ai">): Gruppo {
  const prove = r.prove ?? [];
  const identifica = prove.some((p) => p.ruolo === "identifica" && p.esito === "uguale");
  const tutteTornano = prove.length > 0 && prove.every((p) => p.esito === "uguale");
  // Un dato letto dall'AI si guarda sempre prima di confermarlo.
  return identifica && tutteTornano && !r.con_ai ? "certo" : "da_guardare";
}

export const SIMBOLO_PROVA: Record<ProvaSalvata["esito"], string> = { uguale: "✓", diverso: "✗", mancante: "?" };

/** Le transizioni che il popup offre: stesse del database (`acquisti_transizione_ammessa`). */
export function azioniPossibili(stato: StatoCollegamento): Array<{ verso: StatoCollegamento; etichetta: string; chiedeMotivo: boolean }> {
  switch (stato) {
    case "proposto":
      return [
        { verso: "collegato", etichetta: "Conferma", chiedeMotivo: false },
        { verso: "rifiutato", etichetta: "Rifiuta", chiedeMotivo: true },
      ];
    case "collegato":
      return [
        { verso: "verificato", etichetta: "Segna verificato", chiedeMotivo: false },
        { verso: "annullato", etichetta: "Annulla", chiedeMotivo: true },
      ];
    case "verificato":
      return [{ verso: "annullato", etichetta: "Annulla", chiedeMotivo: true }];
    case "rifiutato":
    case "annullato":
      return [{ verso: "proposto", etichetta: "Riproponi", chiedeMotivo: false }];
    default:
      return [];
  }
}

export type Scheda = "da_confermare" | "collegati" | "annullati";

export function schedaDi(stato: StatoCollegamento): Scheda {
  if (stato === "proposto") return "da_confermare";
  if (stato === "rifiutato" || stato === "annullato") return "annullati";
  return "collegati";
}
