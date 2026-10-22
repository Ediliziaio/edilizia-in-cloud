/**
 * Lettura dello stato patrimoniale riclassificato: quali voci il gestionale
 * non sa ancora calcolare e dove sta, con ogni probabilità, la differenza
 * tra impieghi e fonti.
 *
 * Demo 2, 22/10/2026: attivo 2.611.458,82 €, passivo 1.265.127,27 €,
 * differenza 1.346.331,55 €. Il messaggio diceva solo il totale; i debiti verso
 * fornitori erano a zero (la funzione cercava ordini con stati in inglese) con
 * 124.284 € di pagamenti a fornitori ancora aperti nello scadenzario.
 */

import type { SPAttivo, SPPassivo, SPResult } from "@/hooks/controlloGestione/useStatoPatrimoniale";
import { formatCurrency } from "@/lib/formatters";

/**
 * Voci per cui non esiste ancora una fonte nel gestionale: a zero vuol dire
 * «da inserire», non «zero». Se la funzione del database dice quali sono
 * (meta.voci_manuali) vale quella; altrimenti l'elenco di oggi.
 */
export const VOCI_SENZA_FONTE_PREDEFINITE = [
  "crediti_tributari",
  "anticipi_fornitori",
  "cassa",
  "debiti_personale",
  "debiti_previdenziali",
] as const;

export function vociSenzaFonte(sp: Pick<SPResult, "meta">): Set<string> {
  const dalDb = (sp.meta as { voci_manuali?: string[] }).voci_manuali;
  return new Set(Array.isArray(dalDb) ? dalDb : VOCI_SENZA_FONTE_PREDEFINITE);
}

export interface IndizioQuadratura {
  testo: string;
  href?: string;
  cta?: string;
}

/**
 * Dove sta probabilmente la differenza. Attivo > passivo = mancano fonti
 * (debiti non registrati, patrimonio netto o utili degli anni passati non
 * inseriti); attivo < passivo = mancano impieghi (cespiti, magazzino, crediti).
 */
export function indiziQuadratura(attivo: SPAttivo, passivo: SPPassivo, differenza: number, manuali: Set<string>): IndizioQuadratura[] {
  const out: IndizioQuadratura[] = [];
  if (Math.abs(differenza) < 1) return out;

  if (differenza > 0) {
    if (passivo.capitale_sociale === 0 && passivo.riserve === 0) {
      out.push({
        testo: "Capitale e riserve non inseriti: il patrimonio netto contiene solo l'utile di quest'anno.",
        href: "/azienda/controllo-gestione/health",
        cta: "Inserisci il patrimonio netto",
      });
    } else {
      out.push({
        testo: `Patrimonio netto inserito: ${formatCurrency(passivo.capitale_sociale + passivo.riserve)} tra capitale e riserve. Mancano gli utili degli anni passati non distribuiti? Vanno nelle riserve.`,
        href: "/azienda/controllo-gestione/health",
        cta: "Controlla il patrimonio netto",
      });
    }
    if (passivo.debiti_fornitori === 0) {
      out.push({
        testo: "Debiti verso fornitori a zero: le fatture dei fornitori non ancora pagate dovrebbero comparire qui.",
        href: "/azienda/scadenzario",
        cta: "Apri lo scadenzario",
      });
    }
    if (passivo.debiti_tributari === 0) {
      out.push({ testo: "Debiti tributari a zero: IVA, ritenute e F24 ancora da versare non risultano." });
    }
    const manualiPassivo = (["debiti_personale", "debiti_previdenziali"] as const)
      .filter((k) => manuali.has(k) && passivo[k] === 0);
    if (manualiPassivo.length > 0) {
      out.push({ testo: "Stipendi e contributi del mese non ancora pagati: il gestionale non li calcola, vanno chiesti al consulente del lavoro." });
    }
    if (passivo.fondo_tfr === 0) {
      out.push({ testo: "Fondo TFR a zero: se avete dipendenti, il TFR maturato è un debito." });
    }
  } else {
    if (attivo.attivo_fisso === 0) {
      out.push({ testo: "Nessun cespite: mezzi, attrezzature e immobili non risultano tra gli impieghi." });
    }
    if (attivo.rimanenze === 0) {
      out.push({ testo: "Magazzino a zero: materiale in giacenza e lavori in corso non risultano." });
    }
    if (attivo.crediti_clienti === 0) {
      out.push({ testo: "Crediti verso clienti a zero: le fatture emesse non ancora incassate dovrebbero comparire qui." });
    }
  }
  return out;
}
