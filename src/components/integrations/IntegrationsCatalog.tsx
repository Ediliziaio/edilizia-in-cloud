/**
 * IntegrationsCatalog — manifest dichiarativo delle integrazioni
 *
 * Definisce TUTTE le integrazioni esposte nella griglia di
 * /azienda/impostazioni/integrazioni. Il file principale (SettingsIntegrations.tsx)
 * resta una shell: leggere/modificare integrazioni qui = aggiungere righe al
 * manifest, non riscrivere JSX.
 *
 * Dal 05/10/2026 ogni integrazione è una scheda, anche quelle che prima erano
 * pannelli aperti sopra la griglia (calendari e caselle del team, conti
 * bancari, incassi con carta): i dettagli stanno nel loro popup.
 *
 * Tipi di "gestisci":
 *  - "popup":           il click apre un Dialog con `popupComponent` dentro
 *  - "navigate":        il click naviga direttamente a `pageHref` (no popup)
 *  - "external-wizard": apre un componente che è già un Dialog (gestisce il
 *                       proprio open state via prop `open`/`onOpenChange`)
 */
import type React from "react";
import {
  BancaLogo,
  BrandIconShell,
  CalendariLogo,
  CartaLogo,
  ChatGptLogo,
  ClaudeLogo,
  GoogleAdsLogo,
  GoogleBusinessProfileLogo,
  MetaAssetLogo,
  WhatsAppLogo,
  EmailLogo,
} from "./brand-logos";

export type IntegrationCategory =
  | "ai"
  | "comunicazione"
  | "calendari"
  | "marketing"
  | "reputazione"
  | "pagamenti";

export const CATEGORY_LABELS: Record<IntegrationCategory | "tutte", string> = {
  tutte: "Tutte",
  ai: "Assistenti AI",
  comunicazione: "Comunicazione",
  calendari: "Calendari",
  marketing: "Marketing & Ads",
  reputazione: "Reputazione",
  pagamenti: "Banca e incassi",
};

export const CATEGORY_ORDER: Array<IntegrationCategory | "tutte"> = [
  "tutte",
  "ai",
  "comunicazione",
  "calendari",
  "marketing",
  "reputazione",
  "pagamenti",
];

export type IntegrationGestisciMode = "popup" | "navigate" | "external-wizard";

/**
 * Renderizzato dentro un Dialog wrapper gestito da IntegrationsGrid.
 * Il componente riceve `onClose` per chiudere il dialog dall'interno e, se ha
 * più sezioni, `scheda` per aprirsi già su quella giusta (es. dal riquadro
 * «Da sistemare»).
 */
export type PopupComponentProps = { onClose: () => void; scheda?: string };

/**
 * Renderizzato direttamente come Dialog (il componente gestisce il proprio open).
 * Esempio: MetaIntegrationWizard.
 */
export type ExternalWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export type IntegrationItem = {
  id: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  /** Icona brand renderizzata dentro BrandIconShell 40x40 */
  Logo: React.FC<{ className?: string }> | (() => React.ReactElement);
  /** Comportamento del CTA "Gestisci" / click sulla card */
  gestisciMode: IntegrationGestisciMode;
  popupComponent?: React.FC<PopupComponentProps>;
  externalWizardComponent?: React.FC<ExternalWizardProps>;
  /** Pagina dedicata (kebab menu); senza, la voce di menu non c'è. */
  pageHref?: string;
  /** Voce di menu per la pagina dedicata (default: "Vai alla pagina"). */
  pageLabel?: string;
  /** Popup largo: per gli elenchi del team (persone, account, record DNS). */
  popupLargo?: boolean;
  /** Niente «Disconnetti» nel menu: si scollega altrove (es. dal profilo di ognuno). */
  senzaDisconnetti?: boolean;
  /** Nascondi dalla griglia il pulsante "Gestisci" se non è connesso (raro) */
  hideManageWhenDisconnected?: boolean;
  /** Override label CTA quando non connesso (default: "Collega") */
  connectCtaLabel?: string;
  /** Override label CTA quando connesso (default: "Gestisci") */
  manageCtaLabel?: string;
  /** Mostra "Risolvi problemi" nel kebab (richiede onTroubleshoot sulla grid) */
  troubleshoot?: boolean;
  /** Mostra "Moduli lead" nel kebab quando connesso (richiede onManageForms) */
  leadFormsMenu?: boolean;
};

/**
 * Helper per renderizzare un logo "raw" (es: MetaAssetLogo che non è un SVG singolo)
 * dentro la BrandIconShell. Usato dalle card.
 */
export function renderLogo(
  Logo: IntegrationItem["Logo"],
  shellClassName?: string,
  logoClassName = "h-6 w-6",
): React.ReactElement {
  return (
    <BrandIconShell className={shellClassName}>
      <Logo className={logoClassName} />
    </BrandIconShell>
  );
}

/**
 * Catalogo statico delle integrazioni. L'ordine qui = l'ordine nella griglia
 * (per categoria, come le pillole del filtro).
 * Per aggiungerne una nuova: append + categoria + Logo + gestisciMode.
 *
 * NOTA: il popupComponent/externalWizardComponent NON è incluso qui per evitare
 * import circolari e per tenere il manifest leggero. Viene passato dalla
 * pagina alla grid (`popupRegistry`, `externalWizardRegistry`).
 *
 * Nomi corti (la scheda ne tiene due righe) e descrizioni di due o tre righe:
 * prima «WhatsApp Business + Bot AI» si tagliava e le descrizioni finivano
 * a metà frase.
 */
export const INTEGRATIONS_CATALOG: IntegrationItem[] = [
  // Claude e ChatGPT sono due card separate: si collegano in modo diverso
  // (Claude anche con chiave per Claude Code/Desktop, ChatGPT solo con accesso
  // OAuth) e ognuna mostra solo i propri collegamenti.
  {
    id: "claude",
    name: "Claude",
    description:
      "Chiedi a Claude i dati del gestionale e fagli creare contatti e attività. Anche da Claude Code.",
    category: "ai",
    Logo: ClaudeLogo,
    gestisciMode: "popup",
    pageHref: "/azienda/impostazioni/api",
    pageLabel: "Chiavi API",
    connectCtaLabel: "Collega",
    manageCtaLabel: "Gestisci",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    description:
      "Chiedi a ChatGPT i dati del gestionale e fagli creare contatti e attività. Serve la Modalità sviluppatore.",
    category: "ai",
    Logo: ChatGptLogo,
    gestisciMode: "popup",
    pageHref: "/azienda/impostazioni/api",
    pageLabel: "Chiavi API",
    connectCtaLabel: "Collega",
    manageCtaLabel: "Gestisci",
  },
  {
    // Prima «Email Provider»: la scheda guardava solo le caselle di chi
    // apriva la pagina, mentre sopra c'era il pannello di tutto il team.
    // Ora è una sola scheda: caselle del team + controllo del dominio.
    id: "email",
    name: "Caselle email",
    description:
      "Gmail, Outlook e IMAP del team: la posta arriva in Conversazioni. Con il controllo del dominio.",
    category: "comunicazione",
    Logo: EmailLogo,
    gestisciMode: "popup",
    popupLargo: true,
    senzaDisconnetti: true,
    pageHref: "/azienda/impostazioni/mio-profilo?tab=email",
    pageLabel: "Le mie caselle",
    connectCtaLabel: "Collega",
    manageCtaLabel: "Gestisci",
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    description:
      "Messaggi ai clienti e Bot AI di cantiere per rapportini, DDT, foto e presenze: un solo collegamento.",
    category: "comunicazione",
    Logo: WhatsAppLogo,
    gestisciMode: "navigate",
    pageHref: "/azienda/whatsapp",
    pageLabel: "Apri WhatsApp",
    connectCtaLabel: "Configura",
    manageCtaLabel: "Apri",
  },
  {
    id: "calendari",
    name: "Calendari",
    description:
      "Google, Apple e Outlook: gli appuntamenti del gestionale finiscono nei calendari di chi li ha collegati.",
    category: "calendari",
    Logo: CalendariLogo,
    gestisciMode: "popup",
    popupLargo: true,
    senzaDisconnetti: true,
    pageHref: "/azienda/impostazioni/mio-profilo?tab=calendari",
    pageLabel: "I miei calendari",
    connectCtaLabel: "Collega",
    manageCtaLabel: "Gestisci",
  },
  {
    id: "meta",
    name: "Facebook e Instagram",
    description:
      "Pagina Facebook, Instagram, recensioni e Lead Ads: un solo collegamento per i social e i moduli contatto.",
    category: "marketing",
    Logo: MetaAssetLogo,
    gestisciMode: "external-wizard",
    pageHref: "/azienda/marketing/social",
    pageLabel: "Apri Social",
    troubleshoot: true,
    leadFormsMenu: true,
  },
  {
    id: "google-ads",
    name: "Google Ads",
    description:
      "Campagne Search e Performance Max, con vendite e appuntamenti del CRM rimandati a Google come conversioni.",
    category: "marketing",
    Logo: GoogleAdsLogo,
    gestisciMode: "popup",
    pageHref: "/azienda/marketing/pubblicita",
    pageLabel: "Apri Pubblicità",
  },
  {
    id: "google-business",
    name: "Google Business Profile",
    description:
      "La scheda Google dell'azienda: recensioni nel CRM e risposte automatiche per la reputazione in zona.",
    category: "reputazione",
    Logo: GoogleBusinessProfileLogo,
    gestisciMode: "popup",
    pageHref: "/azienda/marketing/reputazione",
    pageLabel: "Apri Reputazione",
  },
  // Banca e incassi: le schede compaiono solo col piano e il permesso
  // Tesoreria (filtro in SettingsIntegrations.tsx).
  {
    id: "banca",
    name: "Conti bancari",
    description:
      "Il conto dell'azienda in sola lettura: i movimenti arrivano da soli e si abbinano a fatture e costi.",
    category: "pagamenti",
    Logo: BancaLogo,
    gestisciMode: "popup",
    senzaDisconnetti: true,
    pageHref: "/azienda/tesoreria",
    pageLabel: "Apri Tesoreria",
    connectCtaLabel: "Collega",
    manageCtaLabel: "Gestisci",
  },
  {
    id: "stripe",
    name: "Pagamenti con carta",
    description:
      "Incassa con carta e link di pagamento dalle fatture. La verifica (IBAN, dati dell'azienda) si fa su Stripe.",
    category: "pagamenti",
    Logo: CartaLogo,
    gestisciMode: "popup",
    senzaDisconnetti: true,
    connectCtaLabel: "Attiva",
    manageCtaLabel: "Gestisci",
  },
];
