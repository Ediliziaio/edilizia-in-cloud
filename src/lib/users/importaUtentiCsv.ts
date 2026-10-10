/**
 * Il file CSV con cui si importano le persone (Persone & Accessi → Utenti →
 * «Importa»): le colonne sono quelle del file che si esporta dallo stesso elenco,
 * cioè Nome, Cognome, Email, Telefono, Ruolo (e, in fondo, l'ultimo accesso, che
 * si ignora).
 *
 * Prima il ruolo che non si riconosceva diventava «Operatore» senza dirlo (con i
 * permessi di un operatore): un «Vendtore» scritto male nasceva operatore. Ora
 * una riga con un ruolo che non conosciamo viene scartata con il motivo; una
 * riga senza ruolo resta «Operatore», come prima.
 *
 * Modulo puro: nessun React, nessun Supabase.
 */

export type RuoloImportabile = "company_staff" | "salesperson" | "call_center" | "employee" | "subcontractor";

/** I nomi che si scrivono nella colonna Ruolo (minuscoli). «Operaio / Tecnico» è come lo esporta l'elenco. */
export const RUOLI_DEL_FILE: Record<string, RuoloImportabile> = {
  operatore: "company_staff",
  venditore: "salesperson",
  "call center": "call_center",
  "operaio / tecnico": "employee",
  operaio: "employee",
  tecnico: "employee",
  subappaltatore: "subcontractor",
};

/** Gli amministratori non si importano: si creano a mano, con la conferma esplicita. */
const RUOLI_AMMINISTRATORE = new Set(["amministratore", "admin", "company_admin"]);

export const COLONNE_DEL_FILE = "Nome, Cognome, Email, Telefono, Ruolo";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RigaDaImportare {
  /** Numero di riga nel file (la prima è l'intestazione). */
  riga: number;
  firstName: string;
  lastName: string;
  email: string;
  roleType: RuoloImportabile;
}

export interface RigaScartata {
  riga: number;
  email: string;
  motivo: string;
}

export interface EsitoLetturaCsv {
  /** Il file non ha righe da leggere (vuoto, o solo l'intestazione). */
  vuoto: boolean;
  daImportare: RigaDaImportare[];
  scartate: RigaScartata[];
}

/** Excel in italiano salva i CSV col punto e virgola: lo si riconosce dall'intestazione. */
function separatoreDi(intestazione: string): string {
  return intestazione.includes(";") && !intestazione.includes(",") ? ";" : ",";
}

/** Divide una riga rispettando le virgolette: «"Rossi, Mario",…» resta una cella sola. */
function dividiRiga(riga: string, separatore: string): string[] {
  const celle: string[] = [];
  let corrente = "";
  let traVirgolette = false;
  for (let i = 0; i < riga.length; i += 1) {
    const c = riga[i];
    if (traVirgolette) {
      if (c === '"') {
        if (riga[i + 1] === '"') {
          corrente += '"';
          i += 1;
        } else {
          traVirgolette = false;
        }
      } else {
        corrente += c;
      }
    } else if (c === '"') {
      traVirgolette = true;
    } else if (c === separatore) {
      celle.push(corrente.trim());
      corrente = "";
    } else {
      corrente += c;
    }
  }
  celle.push(corrente.trim());
  return celle;
}

export function leggiCsvUtenti(testo: string): EsitoLetturaCsv {
  const righe = testo.replace(/^\uFEFF/, "").split(/\r?\n/).filter((r) => r.trim());
  if (righe.length < 2) return { vuoto: true, daImportare: [], scartate: [] };

  const separatore = separatoreDi(righe[0]);
  const daImportare: RigaDaImportare[] = [];
  const scartate: RigaScartata[] = [];
  const emailViste = new Set<string>();

  righe.slice(1).forEach((riga, indice) => {
    const numero = indice + 2;
    const colonne = dividiRiga(riga, separatore);
    const [firstName, lastName, emailGrezza, , ruoloGrezzo] = colonne;
    const email = (emailGrezza || "").trim().toLowerCase();
    const ruolo = (ruoloGrezzo || "").trim().toLowerCase();

    if (!firstName || !lastName || !email) {
      scartate.push({ riga: numero, email: email || "—", motivo: "Mancano nome, cognome o email" });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      scartate.push({ riga: numero, email, motivo: "Email non valida" });
      return;
    }
    if (emailViste.has(email)) {
      scartate.push({ riga: numero, email, motivo: "Email ripetuta nel file" });
      return;
    }
    emailViste.add(email);
    if (RUOLI_AMMINISTRATORE.has(ruolo)) {
      scartate.push({ riga: numero, email, motivo: "Gli amministratori si creano a mano, con «Nuovo utente»" });
      return;
    }
    if (ruolo && !(ruolo in RUOLI_DEL_FILE)) {
      scartate.push({
        riga: numero,
        email,
        motivo: "Ruolo non riconosciuto: scrivi Operatore, Venditore, Call Center, Operaio / Tecnico o Subappaltatore",
      });
      return;
    }
    daImportare.push({ riga: numero, firstName, lastName, email, roleType: RUOLI_DEL_FILE[ruolo] ?? "company_staff" });
  });

  return { vuoto: false, daImportare, scartate };
}
