/**
 * IntegrationsCatalog — manifest dichiarativo delle integrazioni
 *
 * Definisce TUTTE le integrazioni esposte nella griglia di
 * /azienda/impostazioni/integrazioni. Il file principale (SettingsIntegrations.tsx)
 * resta una shell: leggere/modificare integrazioni qui = aggiungere righe al
 * manifest, non riscrivere JSX.
 *
 * Tipi di "gestisci":
 *  - "popup":           il click apre un Dialog con `popupComponent` dentro
 *  - "navigate":        il click naviga direttamente a `pageHref` (no popup)
 *  - "external-wizard": apre un componente che è già un Dialog (gestisce il
 *                       proprio open state via prop `open`/`onOpenChange`)
 */
import type React from "react";
import {
  BrandIconShell,
  GoogleAdsLogo,
  GoogleBusinessProfileLogo,
  MetaAssetLogo,
  WhatsAppLogo,
  EmailLogo,
} from "./brand-logos";

export type IntegrationCategory =
  | "comunicazione"
  | "calendari"
  | "marketing"
  | "reputazione"
  | "pagamenti";

export const CATEGORY_LABELS: Record<IntegrationCategory | "tutte", string> = {
  tutte: "Tutte",
  comunicazione: "Comunicazione",
  calendari: "Calendari",
  marketing: "Marketing & Ads",
  reputazione: "Reputazione",
  pagamenti: "Pagamenti",
};

export const CATEGORY_ORDER: Array<IntegrationCategory | "tutte"> = [
  "tutte",
  "comunicazione",
  "calendari",
  "marketing",
  "reputazione",
  "pagamenti",
];

export type IntegrationGestisciMode = "popup" | "navigate" | "external-wizard";

/**
 * Renderizzato dentro un Dialog wrapper gestito da IntegrationsGrid.
 * Il componente riceve `onClose` per chiudere il dialog dall'interno.
 */
export type PopupComponentProps = { onClose: () => void };

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
  /** Pagina dedicata (kebab menu → "Vai alla pagina") */
  pageHref: string;
  /** Nascondi dalla griglia il pulsante "Gestisci" se non è connesso (raro) */
  hideManageWhenDisconnected?: boolean;
  /** Override label CTA quando non connesso (default: "Collega") */
  connectCtaLabel?: string;
  /** Override label CTA quando connesso (default: "Gestisci") */
  manageCtaLabel?: string;
  /** Mostra "Risolvi problemi" nel kebab (richiede onTroubleshoot sulla grid) */
  troubleshoot?: boolean;
};

/**
 * Helper per renderizzare un logo "raw" (es: MetaAssetLogo che non è un SVG singolo)
 * dentro la BrandIconShell. Usato dalle card.
 */
export function renderLogo(
  Logo: IntegrationItem["Logo"],
  shellClassName?: string,
): React.ReactElement {
  return (
    <BrandIconShell className={shellClassName}>
      <Logo className="h-6 w-6" />
    </BrandIconShell>
  );
}

/**
 * Catalogo statico delle integrazioni. L'ordine qui = l'ordine nella griglia.
 * Per aggiungerne una nuova: append + categoria + Logo + gestisciMode + pageHref.
 *
 * NOTA: il popupComponent/externalWizardComponent NON è incluso qui per evitare
 * import circolari e per tenere il manifest leggero. Viene passato dal grid
 * tramite la mappa `INTEGRATIONS_POPUP_REGISTRY` definita più sotto.
 */
export const INTEGRATIONS_CATALOG: IntegrationItem[] = [
  {
    id: "whatsapp",
    name: "WhatsApp Business + Bot AI",
    description:
      "Un solo collegamento per WhatsApp Business (invio messaggi e conversazioni clienti) e Bot AI Cantiere (rapportini, DDT, foto e presenze).",
    category: "comunicazione",
    Logo: WhatsAppLogo,
    gestisciMode: "navigate",
    pageHref: "/azienda/whatsapp",
    connectCtaLabel: "Configura",
    manageCtaLabel: "Apri WhatsApp",
  },
  {
    id: "meta",
    name: "Facebook + Instagram (Meta)",
    description:
      "Pagina e recensioni Facebook, Business Manager, Lead Ads e Instagram Business per i post social — un solo collegamento.",
    category: "marketing",
    Logo: MetaAssetLogo,
    gestisciMode: "external-wizard",
    pageHref: "/azienda/marketing/social",
    troubleshoot: true,
  },
  {
    id: "google-business",
    name: "Google Business Profile",
    description:
      "Schede Google, recensioni e risposte automatiche. Sincronizza le recensioni nel CRM e gestisci la reputazione locale.",
    category: "reputazione",
    Logo: GoogleBusinessProfileLogo,
    gestisciMode: "popup",
    pageHref: "/azienda/marketing/reputazione",
  },
  {
    id: "google-ads",
    name: "Google Ads",
    description:
      "Campagne Search, Performance Max e conversioni offline dal CRM (vendite e appuntamenti) verso Google Ads.",
    category: "marketing",
    Logo: GoogleAdsLogo,
    gestisciMode: "popup",
    pageHref: "/azienda/marketing/pubblicita",
  },
  {
    id: "email",
    name: "Email Provider",
    description:
      "Connetti Gmail o Outlook personale (OAuth) per invio email transazionali e campagne con il tuo dominio.",
    category: "comunicazione",
    Logo: EmailLogo,
    gestisciMode: "navigate",
    pageHref: "/azienda/impostazioni/mio-profilo",
    connectCtaLabel: "Collega",
    manageCtaLabel: "Gestisci email",
  },
];
