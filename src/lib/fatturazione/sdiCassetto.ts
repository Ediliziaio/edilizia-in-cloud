// Predicati UI del Cassetto SDI. Rispecchiano la guardia server-side
// (supabase/functions/_shared/sdiInvioGuard.ts) così che il bottone "Reinvia"
// non offra azioni che la Edge Function poi rifiuterebbe.
//
// Dal 24/09/2026 qui c'è anche la FASE della fattura verso lo SDI, la stessa
// in elenco, nell'editor, nel dettaglio e nel cassetto: «Da inviare SDI» →
// «In elaborazione» → «Inviata» (o «Scartata»). Prima ogni pagina aveva le
// sue parole, il dettaglio mostrava le sigle («AT», «NS») e l'elenco una sola
// etichetta che mescolava SDI e incasso: una fattura incassata e mai inviata
// risultava «Pagata» e basta.

import { valutaPreInvio } from "../../../supabase/functions/_shared/sdiInvioGuard";

/**
 * sdi_stato che indicano una fattura già presa in carico/consegnata allo SDI.
 * Confronto esatto: EC01, EC02 e MC vanno elencati (con solo «EC» una fattura
 * rifiutata dall'ente risultava reinviabile).
 */
const SDI_STATO_GIA_TRASMESSA = ["AT", "RC", "MC", "DT", "EC", "EC01", "EC02"];

/** Tipi di documento che vanno allo SDI (gli stessi dell'editor). */
export const TIPI_SDI = [
  "fattura", "fattura_pa", "nota_credito", "nota_debito", "autofattura",
  "fattura_riepilogativa", "parcella", "fattura_accompagnatoria",
  "integrazione_servizi_estero", "integrazione_beni_ue", "integrazione_beni_extra_ue",
  "acconto_fattura", "acconto_parcella", "reverse_charge_interno",
  "autofattura_splafonamento", "fattura_differita_b", "autoconsumo",
];

export interface DocCassetto {
  stato?: string | null;
  sdi_stato?: string | null;
}

export interface DocFaseSdi extends DocCassetto {
  tipo?: string | null;
  sdi_id_trasmissione?: string | null;
  trasmissione?: string | null;
  cliente_snapshot?: { tipo_cliente?: string | null } | null;
}

/** True solo durante la trasmissione (claim atomico lato server). */
export function isInvioInCorso(doc: DocCassetto): boolean {
  return doc.stato === "in_invio";
}

/**
 * Una fattura è reinviabile SOLO se è stata scartata dallo SDI (notifica NS /
 * stato 'rifiutata') e non è in corso un invio. Le fatture già consegnate o
 * accettate (RC/AT/DT/EC) non si reinviano: si emette una nota di credito.
 */
export function puoReinviare(doc: DocCassetto): boolean {
  if (isInvioInCorso(doc)) return false;
  const sdi = (doc.sdi_stato ?? "").toUpperCase();
  if (SDI_STATO_GIA_TRASMESSA.includes(sdi)) return false;
  return sdi === "NS" || doc.stato === "rifiutata";
}

export type FaseSdi =
  | "da_inviare"
  | "invio_in_corso"
  | "in_elaborazione"
  | "inviata"
  | "accettata"
  | "scartata"
  | "rifiutata_ente"
  | "manuale";

export interface StatoSdiVisibile {
  fase: FaseSdi;
  /** Come la si chiama sulla fattura: «Da inviare SDI», «In elaborazione», «Inviata». */
  etichetta: string;
  /** attesa = tocca a te · lavoro = tocca allo SDI · ok = fatto · errore = da sistemare */
  tono: "attesa" | "lavoro" | "ok" | "errore";
  /** Cosa vuol dire e cosa fare, in una o due frasi. */
  spiegazione: string;
}

/**
 * La fase della fattura verso lo SDI, per chi la guarda. null per i documenti
 * che allo SDI non vanno (preventivi, proforma, DDT) e per bozze e annullate.
 *
 * Si legge da sdi_stato e dall'identificativo della trasmissione, non dallo
 * stato del documento: lo stato porta anche l'incasso, e una fattura pagata
 * resta «Pagata» qualunque cosa dica lo SDI.
 */
export function faseSdi(doc: DocFaseSdi): StatoSdiVisibile | null {
  if (!doc.tipo || !TIPI_SDI.includes(doc.tipo)) return null;
  if (!doc.stato || doc.stato === "bozza" || doc.stato === "annullata") return null;

  if (isInvioInCorso(doc)) {
    return { fase: "invio_in_corso", etichetta: "Invio in corso", tono: "lavoro", spiegazione: "La fattura sta partendo verso lo SDI." };
  }

  const sdi = (doc.sdi_stato ?? "").trim().toUpperCase();
  const idTrasmissione = (doc.sdi_id_trasmissione ?? "").trim();
  const versoPa = doc.cliente_snapshot?.tipo_cliente === "PA";

  if (doc.trasmissione === "manuale" || idTrasmissione.startsWith("MAN-")) {
    return {
      fase: "manuale",
      etichetta: "XML da caricare",
      tono: "attesa",
      spiegazione: "Invio manuale: scarica l'XML e caricalo su Fatture e Corrispettivi dell'Agenzia delle Entrate. Finché non lo fai, la fattura non è trasmessa.",
    };
  }

  switch (sdi) {
    case "NS":
      return {
        fase: "scartata",
        etichetta: "Scartata dallo SDI",
        tono: "errore",
        spiegazione: "Per l'Agenzia delle Entrate una fattura scartata non è emessa: correggila e rimandala entro 5 giorni, con lo stesso numero e la stessa data.",
      };
    case "RC":
      return {
        fase: "inviata",
        etichetta: "Inviata",
        tono: "ok",
        spiegazione: versoPa
          ? "Consegnata all'ente, che ha 15 giorni per accettarla o rifiutarla."
          : "Consegnata al cliente.",
      };
    case "MC":
      return {
        fase: "inviata",
        etichetta: "Inviata",
        tono: "ok",
        spiegazione: versoPa
          ? "Lo SDI non è riuscito a consegnarla all'ente: la fattura vale come trasmessa."
          : "Il cliente non ha un indirizzo di ricezione: lo SDI l'ha messa nel suo cassetto fiscale. La fattura è emessa; mandagli una copia in PDF.",
      };
    case "EC01":
      return { fase: "accettata", etichetta: "Accettata", tono: "ok", spiegazione: "Accettata dall'ente." };
    case "DT":
      return {
        fase: "accettata",
        etichetta: "Accettata",
        tono: "ok",
        spiegazione: "Accettata per decorrenza dei termini: l'ente non ha risposto entro 15 giorni.",
      };
    case "EC02":
      return {
        fase: "rifiutata_ente",
        etichetta: "Rifiutata dall'ente",
        tono: "errore",
        spiegazione: "L'ente l'ha rifiutata. La fattura è stata consegnata e non si rimanda: emetti una nota di credito e una fattura nuova.",
      };
  }

  if (sdi === "AT" || idTrasmissione) {
    return {
      fase: "in_elaborazione",
      etichetta: "In elaborazione",
      tono: "lavoro",
      spiegazione: "Lo SDI la sta controllando: di solito bastano pochi minuti, al massimo cinque giorni. Lo stato si aggiorna da solo.",
    };
  }

  return {
    fase: "da_inviare",
    etichetta: "Da inviare SDI",
    tono: "attesa",
    spiegazione: "Emessa ma non ancora inviata allo SDI: senza invio non ha valore fiscale. Va trasmessa entro 12 giorni dalla data della fattura.",
  };
}

/**
 * Si può premere «Invia allo SDI»? La stessa regola del server (valutaPreInvio),
 * così il pulsante non compare dove l'invio verrebbe rifiutato — e compare
 * anche su una fattura incassata prima di essere inviata.
 */
export function puoInviare(doc: DocFaseSdi): boolean {
  if (!doc.tipo || !TIPI_SDI.includes(doc.tipo)) return false;
  if (doc.trasmissione === "manuale" && (doc.sdi_id_trasmissione ?? "").startsWith("MAN-")) return false;
  return valutaPreInvio({
    stato: doc.stato ?? null,
    sdi_stato: doc.sdi_stato ?? null,
    sdi_id_trasmissione: doc.sdi_id_trasmissione ?? null,
  }).ok;
}

/** Il motivo di uno scarto o di un errore d'invio, leggibile. null se non c'è. */
export function motivoSdi(errori: unknown): string | null {
  if (!Array.isArray(errori) || errori.length === 0) return null;
  const frasi = errori
    .map((e) => {
      if (typeof e === "string") return e;
      if (e && typeof e === "object") {
        const o = e as { messaggio?: unknown; message?: unknown };
        const m = o.messaggio ?? o.message;
        return typeof m === "string" ? m : null;
      }
      return null;
    })
    .filter((m): m is string => !!m && m.trim().length > 0);
  return frasi.length ? frasi.join(" · ") : null;
}
