/**
 * Il preventivo aggiorna il contatto del CRM a cui è collegato (07/11/2026).
 *
 * Florin: «se aggiungo un campo, tipo il codice fiscale, quando faccio il preventivo, quel campo aggiorna il
 * resto; idem l'indirizzo». La regola:
 *  · si mandano al contatto SOLO i campi cambiati adesso nel preventivo, rispetto a come erano quando lo si è
 *    aperto (o quando si è scelto il contatto). Aprire un preventivo di mesi fa non riporta sul contatto dati
 *    vecchi;
 *  · un campo svuotato nel preventivo non cancella niente sul contatto;
 *  · l'indirizzo dei lavori degli edili è del cantiere, non del cliente: arriva al contatto solo se il contatto
 *    un indirizzo non ce l'ha (`indirizzoSoloSeVuoto`);
 *  · chi può modificare quel contatto lo decide il database (permesso sui contatti, «Solo i propri»).
 */
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface DatiClientePreventivo {
  nome?: string | null; cognome?: string | null; email?: string | null; telefono?: string | null;
  codiceFiscale?: string | null; partitaIva?: string | null; ragioneSociale?: string | null;
  indirizzo?: string | null; citta?: string | null; cap?: string | null; provincia?: string | null;
}

export const COLONNE_CONTATTO: Record<keyof DatiClientePreventivo, string> = {
  nome: "first_name", cognome: "last_name", email: "email", telefono: "phone",
  codiceFiscale: "fiscal_code", partitaIva: "vat_number", ragioneSociale: "company_name",
  indirizzo: "address", citta: "city", cap: "postal_code", provincia: "province",
};

const CAMPI_INDIRIZZO: Array<keyof DatiClientePreventivo> = ["indirizzo", "citta", "cap", "provincia"];

const norm = (v: string | null | undefined): string => String(v ?? "").trim();

/** Quello che va scritto sul contatto: i campi cambiati rispetto a `base`, non vuoti. */
export function cambiDaMandare(
  base: DatiClientePreventivo,
  adesso: DatiClientePreventivo,
  opzioni: { indirizzoSoloSeVuoto?: boolean; contattoHaIndirizzo?: boolean } = {},
): Record<string, string> {
  const fuori: Record<string, string> = {};
  for (const campo of Object.keys(COLONNE_CONTATTO) as Array<keyof DatiClientePreventivo>) {
    if (!(campo in adesso)) continue;
    const nuovo = norm(adesso[campo]);
    if (!nuovo || nuovo === norm(base[campo])) continue;
    if (CAMPI_INDIRIZZO.includes(campo) && opzioni.indirizzoSoloSeVuoto && opzioni.contattoHaIndirizzo) continue;
    fuori[COLONNE_CONTATTO[campo]] = campo === "codiceFiscale" || campo === "provincia" ? nuovo.toUpperCase() : nuovo;
  }
  return fuori;
}

/**
 * Tiene allineato il contatto collegato: 1,5 s dopo l'ultima modifica scrive i campi cambiati. Una volta per
 * preventivo avvisa che il contatto è stato aggiornato; se il contatto non si può modificare, tace e smette.
 */
export function useAggiornaContattoDalPreventivo(
  contattoId: string | null | undefined,
  adesso: DatiClientePreventivo,
  opzioni: { indirizzoSoloSeVuoto?: boolean; contattoHaIndirizzo?: boolean } = {},
): void {
  const base = useRef<{ id: string | null; dati: DatiClientePreventivo }>({ id: null, dati: {} });
  const avvisato = useRef(false);
  const bloccato = useRef(false);
  const chiave = JSON.stringify(adesso);

  // Il punto di partenza: come sono i dati quando il contatto entra (apertura o scelta dal popup).
  if (base.current.id !== (contattoId ?? null)) {
    base.current = { id: contattoId ?? null, dati: { ...adesso } };
    bloccato.current = false;
  }

  useEffect(() => {
    if (!contattoId || bloccato.current) return;
    const cambi = cambiDaMandare(base.current.dati, adesso, opzioni);
    if (Object.keys(cambi).length === 0) return;
    const attesa = setTimeout(() => {
      void (async () => {
        let esito: { data: unknown[] | null; error: unknown } = { data: null, error: true };
        try {
          esito = await supabase.from("marketing_contacts").update(cambi as never).eq("id", contattoId).select("id") as typeof esito;
        } catch { /* rete o altro: il preventivo non ne risente */ }
        const { data, error } = esito;
        if (error || !data || data.length === 0) {
          // Niente permesso su quel contatto (o non c'è più): il preventivo resta com'è, il contatto non si tocca.
          bloccato.current = true;
          return;
        }
        base.current = { id: contattoId, dati: { ...base.current.dati, ...adesso } };
        if (!avvisato.current) {
          avvisato.current = true;
          toast.success("Aggiornato anche il contatto nel CRM", { description: "I dati nuovi del preventivo sono passati al contatto collegato." });
        }
      })();
    }, 1500);
    return () => clearTimeout(attesa);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contattoId, chiave, opzioni.indirizzoSoloSeVuoto, opzioni.contattoHaIndirizzo]);
}
