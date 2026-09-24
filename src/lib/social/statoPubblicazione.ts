/**
 * Può pubblicare? Lo stato vero delle pagine social (24/09/2026).
 *
 * La pagina Social diceva «collegata» per ogni pagina presente, anche con
 * l'accesso a Meta scaduto o senza il permesso di pubblicare: il post si
 * programmava e falliva all'ora stabilita. Lo stato ora arriva dal database
 * (stato_pubblicazione_social), pagina per pagina, con il motivo; qui si legge
 * e si traduce in frasi semplici.
 */

export type MotivoPubblicazione =
  | "ok"
  | "nessuna_integrazione"
  | "token_scaduto"
  | "piattaforma_non_supportata"
  | "pagina_senza_token"
  | "permessi_da_verificare"
  | "permesso_mancante"
  | "in_approvazione_meta"
  | "pubblicazione_non_attiva"
  | "instagram_senza_account_business";

export type ModalitaPost = "attivo" | "revisione" | "spento";

export interface PaginaSocialStato {
  id: string;
  piattaforma: string;
  pageId: string;
  nome: string;
  puoPubblicare: boolean;
  motivo: MotivoPubblicazione;
}

export interface StatoPubblicazioneSocial {
  modalitaPost: ModalitaPost;
  integrazione: {
    id: string;
    stato: string;
    scadeIl: string | null;
    scaduta: boolean;
    permessiNoti: boolean;
  } | null;
  pagine: PaginaSocialStato[];
}

const MOTIVI: MotivoPubblicazione[] = [
  "ok",
  "nessuna_integrazione",
  "token_scaduto",
  "piattaforma_non_supportata",
  "pagina_senza_token",
  "permessi_da_verificare",
  "permesso_mancante",
  "in_approvazione_meta",
  "pubblicazione_non_attiva",
  "instagram_senza_account_business",
];

function testo(valore: unknown): string {
  return typeof valore === "string" ? valore : "";
}

/** Dalla risposta della RPC a un oggetto sicuro: un campo strano non passa per «può pubblicare». */
export function leggiStatoPubblicazione(grezzo: unknown): StatoPubblicazioneSocial {
  const radice = (grezzo && typeof grezzo === "object" ? grezzo : {}) as Record<string, unknown>;
  const modalita = testo(radice.modalita_post);
  const integrazione = radice.integrazione && typeof radice.integrazione === "object"
    ? radice.integrazione as Record<string, unknown>
    : null;
  const pagine = Array.isArray(radice.pagine) ? radice.pagine : [];

  return {
    modalitaPost: modalita === "attivo" || modalita === "revisione" ? modalita : "spento",
    integrazione: integrazione && testo(integrazione.id)
      ? {
        id: testo(integrazione.id),
        stato: testo(integrazione.stato),
        scadeIl: testo(integrazione.scade_il) || null,
        scaduta: integrazione.scaduta === true,
        permessiNoti: integrazione.permessi_noti === true,
      }
      : null,
    pagine: pagine
      .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
      .map((p) => {
        const motivo = MOTIVI.includes(p.motivo as MotivoPubblicazione)
          ? p.motivo as MotivoPubblicazione
          : "permessi_da_verificare";
        return {
          id: testo(p.id),
          piattaforma: testo(p.piattaforma),
          pageId: testo(p.page_id),
          nome: testo(p.nome),
          // Serve il sì del database E il motivo «ok»: nel dubbio, non pubblica.
          puoPubblicare: p.puo_pubblicare === true && motivo === "ok",
          motivo,
        };
      })
      .filter((p) => p.pageId && p.piattaforma),
  };
}

export type AzioneMotivo = "ricollega" | "attendi" | "verifica" | null;

export interface SpiegazioneMotivo {
  /** Due-tre parole, per l'etichetta accanto al nome della pagina. */
  breve: string;
  /** Una frase: cosa succede e cosa si può fare. */
  lungo: string;
  azione: AzioneMotivo;
}

const SPIEGAZIONI: Record<MotivoPubblicazione, SpiegazioneMotivo> = {
  ok: {
    breve: "Pronta",
    lungo: "Può pubblicare.",
    azione: null,
  },
  nessuna_integrazione: {
    breve: "Da collegare",
    lungo: "Meta non è collegato: collegalo dalle Integrazioni per pubblicare.",
    azione: "ricollega",
  },
  token_scaduto: {
    breve: "Accesso scaduto",
    lungo: "L'accesso a Meta è scaduto: ricollega Meta dalle Integrazioni per tornare a pubblicare.",
    azione: "ricollega",
  },
  pagina_senza_token: {
    breve: "Da ricollegare",
    lungo: "Manca l'accesso alla pagina: ricollega Meta e selezionala.",
    azione: "ricollega",
  },
  permessi_da_verificare: {
    breve: "In verifica",
    lungo: "Sto chiedendo a Meta se si può pubblicare.",
    azione: "verifica",
  },
  permesso_mancante: {
    breve: "Permesso mancante",
    lungo: "Meta non ha dato il permesso di pubblicare: ricollega Meta e accetta tutti i permessi richiesti.",
    azione: "ricollega",
  },
  in_approvazione_meta: {
    breve: "In attesa di Meta",
    lungo: "La pubblicazione da qui è in attesa dell'approvazione di Meta. Intanto puoi preparare i post e salvarli come bozza.",
    azione: "attendi",
  },
  pubblicazione_non_attiva: {
    breve: "Non ancora attiva",
    lungo: "La pubblicazione da qui non è ancora attiva. Intanto puoi preparare i post e salvarli come bozza.",
    azione: "attendi",
  },
  instagram_senza_account_business: {
    breve: "Instagram da collegare",
    lungo: "Alla pagina Facebook non è collegato un account Instagram professionale: collegalo da Meta, poi ricollega Meta qui.",
    azione: "ricollega",
  },
  piattaforma_non_supportata: {
    breve: "Non supportata",
    lungo: "Da qui si pubblica su Facebook e Instagram.",
    azione: null,
  },
};

/**
 * La frase per un motivo. Una verifica già chiesta a Meta e rimasta senza
 * risposta (token non più valido, Meta muto) non è più «in verifica»: si ricollega.
 */
export function spiegaMotivo(
  motivo: MotivoPubblicazione,
  opzioni: { verificaNonRiuscita?: boolean } = {},
): SpiegazioneMotivo {
  if (motivo === "permessi_da_verificare" && opzioni.verificaNonRiuscita) {
    return {
      breve: "Da ricollegare",
      lungo: "Meta non dice se si può pubblicare: ricollega Meta dalle Integrazioni.",
      azione: "ricollega",
    };
  }
  return SPIEGAZIONI[motivo] ?? SPIEGAZIONI.permessi_da_verificare;
}

/** Le pagine che possono pubblicare adesso, nella forma che usa il composer. */
export function paginePronte(
  stato: StatoPubblicazioneSocial | null | undefined,
): Array<{ platform_id: string; page_id: string; page_name: string }> {
  return (stato?.pagine ?? [])
    .filter((p) => p.puoPubblicare)
    .map((p) => ({ platform_id: p.piattaforma, page_id: p.pageId, page_name: p.nome }));
}

/** Piattaforme con almeno una pagina che può pubblicare adesso. */
export function piattaformePronte(stato: StatoPubblicazioneSocial | null | undefined): string[] {
  return Array.from(new Set(paginePronte(stato).map((p) => p.platform_id)));
}

/**
 * Perché una piattaforma non può pubblicare: il motivo della sua prima pagina
 * (le pagine di un'azienda condividono quasi sempre lo stesso). Null se ha
 * almeno una pagina pronta, o se non ha pagine collegate.
 */
export function motivoPiattaforma(
  stato: StatoPubblicazioneSocial | null | undefined,
  piattaforma: string,
): MotivoPubblicazione | null {
  const pagine = (stato?.pagine ?? []).filter((p) => p.piattaforma === piattaforma);
  if (pagine.length === 0 || pagine.some((p) => p.puoPubblicare)) return null;
  return pagine[0].motivo;
}

/** Il motivo comune a TUTTE le pagine bloccate, per dirlo una volta sola. */
export function motivoComune(stato: StatoPubblicazioneSocial | null | undefined): MotivoPubblicazione | null {
  const bloccate = (stato?.pagine ?? []).filter((p) => !p.puoPubblicare);
  if (bloccate.length === 0) return null;
  const primo = bloccate[0].motivo;
  return bloccate.every((p) => p.motivo === primo) ? primo : null;
}
