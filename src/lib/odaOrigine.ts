/**
 * Come e' stato piazzato un ordine d'acquisto.
 *
 * L'app conosceva un percorso solo — bozza, inviato, confermato, ricevuto —
 * ma un'impresa edile compra in quattro modi diversi, e per tre di questi
 * meta' dei passaggi sono finti: se compro al banco in ferramenta la merce
 * e' gia' sul furgone, "inviato" e "confermato" non vogliono dire niente.
 *
 * L'origine non cambia la contabilita' (impegno quando ordini, costo quando
 * arriva la merce): cambia solo quali passaggi ha senso mostrare e come si
 * chiama il pulsante che li fa avanzare.
 */
import type { LucideIcon } from "lucide-react";
import { Mail, Phone, ShoppingCart, FileText, Store } from "lucide-react";
import type { OdaStatus } from "@/lib/odaStatus";

export const ODA_ORIGINI = ["email", "telefono", "portale", "documento", "negozio"] as const;
export type OdaOrigine = (typeof ODA_ORIGINI)[number];

export interface OdaOrigineInfo {
  /** Come si chiama nella scelta iniziale. */
  titolo: string;
  /** Due parole per la griglia di scelta, dove lo spazio e' poco. */
  titoloBreve: string;
  icona: LucideIcon;
  /** Una riga che dice quando si sceglie questa strada. */
  descrizione: string;
  /** Il pulsante che porta avanti l'ordine dalla bozza. */
  azione: string;
  /** Dove arriva l'ordine con quell'azione. */
  statoDopoAzione: OdaStatus;
  /** Chiede un documento (conferma d'ordine, scontrino) sul dettaglio. */
  vuoleDocumento: boolean;
  /** Etichetta del documento richiesto. */
  documentoLabel?: string;
  /** Etichetta del riferimento fornitore (numero ordine sul sito, scontrino). */
  riferimentoLabel?: string;
}

export const ODA_ORIGINE_INFO: Record<string, OdaOrigineInfo> = {
  email: {
    titoloBreve: "Lo mando io",
    icona: Mail,
    titolo: "Lo mando io al fornitore",
    descrizione: "L'ordine parte da qui via email, con righe e prezzi. Il fornitore risponde nella tua posta.",
    azione: "Invia al fornitore",
    statoDopoAzione: "inviato",
    vuoleDocumento: false,
  },
  telefono: {
    titoloBreve: "A voce",
    icona: Phone,
    titolo: "L'ho ordinato a voce",
    descrizione: "Telefonata o messaggio al fornitore. Nessun documento, serve solo tenerne traccia.",
    azione: "Segna come ordinato",
    statoDopoAzione: "inviato",
    vuoleDocumento: false,
  },
  portale: {
    titoloBreve: "Online",
    icona: ShoppingCart,
    titolo: "Comprato online",
    descrizione: "E-commerce o portale del fornitore: l'ordine è già partito, hai la conferma d'ordine.",
    azione: "Ordine confermato",
    statoDopoAzione: "confermato",
    vuoleDocumento: true,
    documentoLabel: "Conferma d'ordine",
    riferimentoLabel: "Numero ordine sul sito",
  },
  documento: {
    titoloBreve: "Su documento",
    icona: FileText,
    titolo: "Ordine su documento",
    descrizione: "Modulo del fornitore o tuo ordine firmato, in PDF o scansione.",
    azione: "Ordine confermato",
    statoDopoAzione: "confermato",
    vuoleDocumento: true,
    documentoLabel: "Documento d'ordine",
    riferimentoLabel: "Riferimento fornitore",
  },
  negozio: {
    titoloBreve: "Al banco",
    icona: Store,
    titolo: "Comprato al banco",
    descrizione: "Merce già ritirata in negozio. Ordine, consegna e scontrino coincidono: un passaggio solo.",
    azione: "Registra acquisto",
    statoDopoAzione: "ricevuto",
    vuoleDocumento: true,
    documentoLabel: "Scontrino o DDT",
    riferimentoLabel: "Numero scontrino",
  },
};

export const ODA_ORIGINE_LABELS: Record<string, string> = {
  email: "Email",
  telefono: "A voce",
  portale: "Online",
  documento: "Documento",
  negozio: "Negozio",
};

/**
 * Transizioni ammesse tenendo conto di come e' stato ordinato.
 *
 * Chi compra al banco salta dritto a "ricevuto": non c'e' niente da inviare
 * ne' da farsi confermare. Chi compra online parte da "confermato": l'ordine
 * e' gia' andato, il sito ha gia' risposto.
 */
export function prossimiStatiOda(status: string, origine: string | null | undefined): string[] {
  const org = (origine ?? "email") as OdaOrigine;
  if (status === "bozza") {
    if (org === "negozio") return ["ricevuto", "annullato"];
    if (org === "portale" || org === "documento") return ["confermato", "annullato"];
    return ["inviato", "annullato"];
  }
  if (status === "inviato") return ["confermato", "annullato"];
  if (status === "confermato") return ["parziale", "ricevuto"];
  if (status === "parziale") return ["ricevuto"];
  return [];
}
