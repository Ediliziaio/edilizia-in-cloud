// «Verifica formale» di una fattura elettronica (01/10/2026), come nella schermata
// del documento: i controlli che lo SDI fa (e che la nostra funzione di invio
// rifà) detti in parole, PRIMA di spedire e a spedizione fatta.
//
// Non sostituisce lo SDI: dice se i dati che abbiamo sono completi e coerenti
// (anagrafiche, codice destinatario, riepilogo IVA, XML generato). Il verdetto
// definitivo lo dà solo lo SDI.

import type { AnagraficaAzienda, DocumentoFiscale } from "@/types/fatturazione";
import { validateDocumento } from "@/lib/fatturazione/calcoli";
import { validateXML } from "@/lib/fatturazione/generateXML";
import { validaCodiceFiscale, validaPartitaIva } from "@/lib/fatturazione/validazioniAnagrafiche";
import { datiReaMancanti, eSocieta } from "../../../supabase/functions/_shared/datiSocietari";

export type EsitoVoce = "ok" | "avviso" | "errore";

export interface VoceVerifica {
  esito: EsitoVoce;
  testo: string;
}

export interface RisultatoVerifica {
  voci: VoceVerifica[];
  errori: number;
  avvisi: number;
}

type Dati = Record<string, unknown>;

export function verificaFormale(
  doc: DocumentoFiscale,
  azienda: AnagraficaAzienda | null | undefined,
  xml: string | null,
): RisultatoVerifica {
  const voci: VoceVerifica[] = [];
  const ok = (testo: string) => voci.push({ esito: "ok", testo });
  const avviso = (testo: string) => voci.push({ esito: "avviso", testo });
  const errore = (testo: string) => voci.push({ esito: "errore", testo });

  // ── Chi emette ─────────────────────────────────────────────────────────
  const az = (azienda ?? {}) as Dati;
  const pivaAz = String(az.partita_iva ?? "");
  if (!azienda) {
    avviso("Dati dell'azienda non ancora caricati: riapri la pagina per un controllo completo.");
  } else {
    const v = validaPartitaIva(pivaAz);
    if (v.valida) ok("Partita IVA dell'azienda valida"); else errore(`Partita IVA dell'azienda: ${v.errore ?? "non valida"}`);
    if (az.regime_fiscale) ok(`Regime fiscale ${String(az.regime_fiscale)}`); else errore("Regime fiscale dell'azienda mancante");
    if (az.indirizzo_via && az.indirizzo_comune && /^\d{5}$/.test(String(az.indirizzo_cap ?? ""))) ok("Sede dell'azienda completa");
    else errore("Sede dell'azienda incompleta: servono via, comune e CAP di 5 cifre");
    if (eSocieta(az.forma_giuridica)) {
      const mancanti = datiReaMancanti(az as never);
      if (mancanti.length === 0) ok("Iscrizione al registro imprese (REA) completa");
      else avviso(`Dati REA incompleti: ${mancanti.join(", ")}`);
    }
  }

  // ── Chi riceve ─────────────────────────────────────────────────────────
  const cl = ((doc.cliente_snapshot ?? {}) as unknown) as Dati;
  const nazione = String(cl.indirizzo_nazione || "IT").toUpperCase();
  if (!String(cl.ragione_sociale ?? "").trim()) errore("Ragione sociale del cliente mancante"); else ok("Cliente indicato");
  const pivaCl = String(cl.partita_iva ?? "");
  const cfCl = String(cl.codice_fiscale ?? "");
  if (!pivaCl && !cfCl) {
    errore("Il cliente deve avere Partita IVA o Codice Fiscale");
  } else {
    if (pivaCl && nazione === "IT") {
      const v = validaPartitaIva(pivaCl);
      if (v.valida) ok("Partita IVA del cliente valida"); else errore(`Partita IVA del cliente: ${v.errore ?? "non valida"}`);
    }
    if (cfCl) {
      const v = validaCodiceFiscale(cfCl);
      if (v.valida) ok("Codice fiscale del cliente valido"); else errore(`Codice fiscale del cliente: ${v.errore ?? "non valido"}`);
    }
  }
  if (!String(cl.indirizzo_via ?? "").trim() || !String(cl.indirizzo_comune ?? "").trim()) {
    errore("Indirizzo del cliente incompleto: servono via e comune");
  } else if (nazione === "IT" && !/^\d{5}$/.test(String(cl.indirizzo_cap ?? "").trim())) {
    errore("CAP del cliente mancante o non valido: servono 5 cifre");
  } else {
    ok("Indirizzo del cliente completo");
  }
  const pa = cl.tipo_cliente === "PA";
  const cod = String(cl.codice_sdi ?? "").trim();
  if (nazione !== "IT") ok("Cliente estero: codice destinatario XXXXXXX");
  else if (pa) {
    if (cod.length === 6) ok("Codice univoco ufficio PA di 6 caratteri"); else errore("Fattura alla PA: il codice univoco ufficio deve avere 6 caratteri");
  } else if (cod) {
    if (cod.length === 7) ok("Codice destinatario di 7 caratteri");
    else errore("Il codice destinatario del cliente deve avere 7 caratteri");
  } else if (cl.pec) ok("Nessun codice destinatario: la fattura va alla PEC del cliente");
  else avviso("Cliente senza codice destinatario né PEC: la fattura andrà nel suo cassetto fiscale (codice 0000000)");

  // ── Il documento ───────────────────────────────────────────────────────
  for (const e of validateDocumento(doc)) {
    if (e.severity === "error") errore(e.message); else avviso(e.message);
  }
  if (!voci.some((v) => v.esito !== "ok" && /righe|riga|importo|totale|IVA|scadenz/i.test(v.testo))) {
    ok("Righe, riepilogo IVA e totali coerenti");
  }

  // ── L'XML ──────────────────────────────────────────────────────────────
  if (xml) {
    const mancanti = validateXML(xml);
    if (mancanti.length === 0) ok("L'XML contiene tutti gli elementi obbligatori"); else for (const m of mancanti) errore(m.message);
  } else {
    avviso("XML non disponibile per il controllo");
  }

  return {
    voci,
    errori: voci.filter((v) => v.esito === "errore").length,
    avvisi: voci.filter((v) => v.esito === "avviso").length,
  };
}
