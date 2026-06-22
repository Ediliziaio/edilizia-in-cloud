/**
 * Configurazione statica dei Moduli Vendita Verticali.
 *
 * Ogni modulo è gated da un feature flag aziendale risolto via
 * `resolve_company_feature` RPC. La logica di stato (attivo/coming_soon/
 * bloccato) è derivata combinando:
 *  - `flag` corrente (feature flag aziendale)
 *  - `availability` statica (alcuni moduli non sono ancora disponibili)
 *
 * Vedi `useModuliVendita` per l'hook consumer.
 */

import type { LucideIcon } from "lucide-react";
import { Sun, PanelTop, Home, Bath, Layers, Thermometer, Hammer } from "lucide-react";

export type ModuloVendutaSlug =
  | "fotovoltaico"
  | "serramenti"
  | "ristrutturazione"
  | "tetti"
  | "bagni"
  | "cappotto"
  | "pompe_calore";

export type ModuloFeatureKey =
  | "modulo_fotovoltaico_attivo"
  | "modulo_serramenti_attivo"
  | "modulo_ristrutturazione_attivo"
  | "modulo_tetti_attivo"
  | "modulo_bagni_attivo"
  | "modulo_cappotto_attivo"
  | "modulo_pompe_calore_attivo";

export type ModuloAvailability = "available" | "coming_soon";

/** Stato derivato per la card UI. */
export type ModuloStato = "attivo" | "coming_soon" | "bloccato";

export interface ModuloVendutaConfig {
  /** Slug interno (URL-safe, mai tradotto). */
  slug: ModuloVendutaSlug;
  /** Nome commerciale (it-IT). */
  nome: string;
  /** Tagline breve sotto al titolo (max ~60 char). */
  tagline: string;
  /** Descrizione lunga per il dialog informativo. */
  descrizione: string;
  /** Icona Lucide associata. */
  icon: LucideIcon;
  /** Feature flag aziendale che governa l'attivazione. */
  flag: ModuloFeatureKey;
  /** URL della home del modulo (route azienda). */
  href: string;
  /** Disponibilità statica: se "coming_soon" il modulo non è cliccabile. */
  availability: ModuloAvailability;
  /** Bullet point di benefici (mostrati nel dialog di attivazione). */
  benefici: readonly string[];
  /** Prezzo mensile indicativo in EUR (mostrato come hint). */
  prezzoMensile: number;
}

/**
 * Catalogo dei 6 moduli verticali. L'ordine determina il rendering nel grid.
 * Modificare qui (e specchiare la migration `20260427120000_moduli_vendita_feature_flags`
 * + i tipi Supabase generati) per aggiungere/rimuovere moduli.
 */
export const MODULI_VENDITA: readonly ModuloVendutaConfig[] = [
  {
    slug: "fotovoltaico",
    nome: "Fotovoltaico",
    tagline: "Configuratore impianti FV chiavi in mano",
    descrizione:
      "Modulo verticale per la vendita di impianti fotovoltaici residenziali e commerciali: dimensionamento automatico, business plan finanziario, gestione incentivi e onboarding cliente integrato con il CRM EiC.",
    icon: Sun,
    flag: "modulo_fotovoltaico_attivo",
    href: "/azienda/marketing/fotovoltaico",
    availability: "available",
    benefici: [
      "Dimensionamento impianto in pochi click",
      "Business plan e payback period automatici",
      "Gestione incentivi statali e locali",
      "Onboarding cliente con firma digitale",
      "Listini fornitori integrati e aggiornati",
    ],
    prezzoMensile: 149,
  },
  {
    slug: "serramenti",
    nome: "Preventivatore Serramenti",
    tagline: "Preventivi finestre, porte e oscuranti",
    descrizione:
      "Preventivatore vendita serramenti su misura: BOM completo, calcolo Ecobonus 50/65%, ROI 10 anni, cronoprogramma lavori, import da sopralluogo Infissi e preventivo PDF a 3 pagine pronto per il cliente.",
    icon: PanelTop,
    flag: "modulo_serramenti_attivo",
    href: "/azienda/serramenti",
    availability: "available",
    benefici: [
      "BOM serramenti + accessori con auto-calcolo m² e prezzi",
      "Calcolo risparmio energetico per zona climatica",
      "Ecobonus 50/65% + cashflow 10 anni",
      "Cronoprogramma lavori automatico",
      "Import diretto dal sopralluogo Infissi",
    ],
    prezzoMensile: 149,
  },
  {
    slug: "ristrutturazione",
    nome: "Ristrutturazione",
    tagline: "Computo metrico + preventivo ristrutturazioni",
    descrizione:
      "Preventivatore ristrutturazioni chiavi in mano: computo metrico premium dai listini aziendali (prodotti + manodopera), capitoli e voci con margini live, gestione cantiere/immobile e preventivo PDF brandizzato pronto per il cliente, integrato col CRM EiC.",
    icon: Hammer,
    flag: "modulo_ristrutturazione_attivo",
    href: "/azienda/ristrutturazione",
    availability: "available",
    benefici: [
      "Computo metrico per capitoli con ricalcolo live",
      "Listini prodotti e manodopera aziendali integrati",
      "Margini per voce/capitolo sotto controllo",
      "Gestione cantiere, immobile e media",
      "Preventivo PDF brandizzato a più pagine",
    ],
    prezzoMensile: 149,
  },
  {
    slug: "tetti",
    nome: "Tetti",
    tagline: "Coperture e rifacimento tetti",
    descrizione:
      "Modulo per progettazione e vendita coperture: rifacimento tetto, isolamento termico, lattoneria e linee vita. Calcolo automatico delle quantità e abbinamento incentivi.",
    icon: Home,
    flag: "modulo_tetti_attivo",
    href: "/azienda/marketing/tetti",
    availability: "coming_soon",
    benefici: [
      "Rilievo digitale superfici",
      "Stratigrafie certificate",
      "Calcolo lattoneria e linee vita",
      "Abbinamento incentivi Conto Termico",
    ],
    prezzoMensile: 149,
  },
  {
    slug: "bagni",
    nome: "Bagni",
    tagline: "Ristrutturazione bagno chiavi in mano",
    descrizione:
      "Configuratore ristrutturazione bagno completo: sanitari, rivestimenti, impianti idraulici ed elettrici. Pacchetti pre-confezionati e personalizzazione live.",
    icon: Bath,
    flag: "modulo_bagni_attivo",
    href: "/azienda/bagni",
    availability: "available",
    benefici: [
      "Pacchetti chiavi in mano",
      "Configuratore sanitari e rivestimenti",
      "Computo metrico automatico",
      "Gestione subappalti idraulico/elettrico",
    ],
    prezzoMensile: 149,
  },
  {
    slug: "cappotto",
    nome: "Cappotto Termico",
    tagline: "Isolamento esterno con incentivi",
    descrizione:
      "Modulo per la vendita di cappotto termico esterno: calcolo trasmittanze, scelta materiali, dimensionamento e abbinamento incentivi (Ecobonus, Conto Termico, Superbonus).",
    icon: Layers,
    flag: "modulo_cappotto_attivo",
    href: "/azienda/marketing/cappotto",
    availability: "coming_soon",
    benefici: [
      "Calcolo trasmittanze normativo",
      "Scelta materiali con confronto prestazioni",
      "Abbinamento incentivi automatico",
      "Computo strutture accessorie (ponteggi, finiture)",
    ],
    prezzoMensile: 149,
  },
  {
    slug: "pompe_calore",
    nome: "Pompe di Calore",
    tagline: "Riscaldamento ad alta efficienza",
    descrizione:
      "Modulo per dimensionamento e vendita pompe di calore aria-acqua e geotermiche, residenziali e commerciali. Confronto prestazioni stagionali e abbinamento incentivi.",
    icon: Thermometer,
    flag: "modulo_pompe_calore_attivo",
    href: "/azienda/marketing/pompe-calore",
    availability: "coming_soon",
    benefici: [
      "Dimensionamento carico termico edificio",
      "Confronto SCOP/SEER tra modelli",
      "Integrazione con FV per autoconsumo",
      "Abbinamento incentivi e detrazioni",
    ],
    prezzoMensile: 149,
  },
];

/**
 * Calcola lo stato derivato di una card modulo data la combinazione
 * disponibilità statica + valore feature flag aziendale.
 *
 *  - `coming_soon`: configurazione non ancora rilasciata (override prevale: se
 *    una company ha feature flag a true, mostriamo comunque "coming soon"
 *    perché il modulo non esiste).
 *  - `attivo`: disponibile e flag risolto a true.
 *  - `bloccato`: disponibile ma flag risolto a false (upgrade richiesto).
 */
export function deriveModuloStato(
  modulo: ModuloVendutaConfig,
  flagEnabled: boolean,
): ModuloStato {
  if (modulo.availability === "coming_soon") return "coming_soon";
  return flagEnabled ? "attivo" : "bloccato";
}
