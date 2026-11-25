/**
 * Il prezzo corretto a mano vale per tutta l'azienda (24/11/2026).
 *
 * Una lavorazione della pianta nasce quotata dal listino dell'azienda e, se lì non c'è,
 * con un prezzo indicativo. Quando l'utente lo corregge, il prezzo giusto va nel listino:
 * da lì in poi lo usano questa pianta, le altre piante e i preventivi, senza rifare il
 * lavoro ogni volta. Scrive sulla stessa tabella delle pagine del listino
 * (`rst_listino_voci`), quindi resta modificabile e cancellabile da lì.
 *
 * Il listino tiene costi e ricarico, non un prezzo secco: la divisione fra manodopera e
 * materiali viene dalla quota tipica della lavorazione (`REGOLE_POSA`) e il ricarico resta
 * a zero, così il prezzo salvato è esattamente quello scritto dall'utente. La nota lo dice.
 */
import { supabase } from "@/integrations/supabase/client";
import type { RstUnitaMisura } from "@/types/ristrutturazione";
import { REGOLE_POSA } from "./previsioneLavori";
import { tipoLavorazione } from "./prezziProposti";
import type { RigaStudio } from "./studioImmobiliare";

// La tabella del listino non è nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

/** Dall'unità della pianta a quella del listino. */
export function unitaListino(u: RigaStudio["unita"]): RstUnitaMisura {
  return u === "m²" ? "mq" : u === "m³" ? "mc" : u === "m" ? "ml" : u === "cad" ? "cad" : "a corpo";
}

export interface PrezzoDaSalvare {
  descrizione: string;
  unita: RigaStudio["unita"];
  importo: number;
  /** La riga da cui viene, per dividere costo e manodopera come la previsione. */
  riga?: Pick<RigaStudio, "id" | "descrizione">;
}

/** Quanto di quel prezzo è manodopera, secondo la lavorazione: 0,5 se non la riconosco. */
export function quotaManodopera(riga?: Pick<RigaStudio, "id" | "descrizione">): number {
  const tipo = riga && tipoLavorazione(riga);
  return tipo ? REGOLE_POSA[tipo].manodopera : 0.5;
}

export const NOTA_LISTINO = "Prezzo corretto dalla planimetria";

/**
 * Scrive il prezzo nel listino dell'azienda: aggiorna la voce con la stessa descrizione e
 * unità se c'è, altrimenti ne crea una. Restituisce cosa è successo, per dirlo all'utente.
 */
export async function salvaPrezzoNelListino(companyId: string, p: PrezzoDaSalvare): Promise<"aggiornata" | "creata"> {
  const descrizione = p.descrizione.trim().slice(0, 300);
  const unita = unitaListino(p.unita);
  if (!descrizione || !(p.importo >= 0)) throw new Error("Prezzo non valido.");
  const quota = quotaManodopera(p.riga);
  const costo_manodopera = Math.round(p.importo * quota * 100) / 100;
  const valori = {
    unita_misura: unita,
    costo_manodopera,
    costo_materiali: Math.round((p.importo - costo_manodopera) * 100) / 100,
    ricarico_pct: 0,
    prezzo_unitario: p.importo,
    note: `${NOTA_LISTINO} il ${new Date().toLocaleDateString("it-IT")}. Divisione fra manodopera e materiali indicativa.`,
  };
  const { data: esistente, error: erroreLettura } = await sb()
    .from("rst_listino_voci").select("id").eq("company_id", companyId).eq("descrizione", descrizione).eq("unita_misura", unita).limit(1).maybeSingle();
  if (erroreLettura) throw new Error("Listino non disponibile: riprova.");
  if (esistente?.id) {
    const { error } = await sb().from("rst_listino_voci").update(valori).eq("id", esistente.id).eq("company_id", companyId);
    if (error) throw new Error("Prezzo non salvato nel listino: riprova.");
    return "aggiornata";
  }
  const { error } = await sb().from("rst_listino_voci").insert({ company_id: companyId, capitolo_id: null, codice: null, descrizione, ordine: 0, ...valori });
  if (error) throw new Error("Prezzo non salvato nel listino: riprova.");
  return "creata";
}

export const messaggioListino = (esito: "aggiornata" | "creata", descrizione: string) =>
  esito === "creata"
    ? `«${descrizione}» è ora nel listino dell'azienda: lo useranno anche le altre piante e i preventivi.`
    : `Ho aggiornato «${descrizione}» nel listino dell'azienda.`;
