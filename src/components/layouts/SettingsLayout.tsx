import { Outlet, useLocation, Link } from "react-router-dom";
import { SettingsSearch } from "@/components/layouts/SettingsSearch";
import { ArrowLeft } from "lucide-react";

// ─── Mappa URL → titolo + descrizione ───────────────────────────────────────
interface SectionMeta {
  title: string;
  description: string;
}

const SECTION_MAP: Record<string, SectionMeta> = {
  "mio-profilo":          { title: "Il mio profilo",           description: "Gestisci i tuoi dati, sicurezza, calendari e notifiche" },
  profilo:                { title: "Profilo aziendale",        description: "Configura le informazioni della tua azienda" },
  sedi:                   { title: "Sedi",                     description: "Gestisci le sedi operative della tua azienda" },
  branding:               { title: "White-Label",              description: "Personalizza il brand e i colori della piattaforma" },
  listino:                { title: "Listino prodotti",         description: "Gestisci il catalogo prodotti e servizi" },
  tariffe:                { title: "Tariffe aziendali",        description: "Configura le tariffe di lavoro e manodopera" },
  "listino-manutenzione": { title: "Listino Manutenzione",      description: "Gestisci i prezzi per tipo impianto e tipo intervento" },
  finanziamenti:          { title: "Finanziamenti",             description: "Tabelle delle finanziarie convenzionate e calcolatore rate" },
  "bundle-serramentista": { title: "Bundle & Pacchetti",         description: "Pacchetti chiavi-in-mano pre-configurati per preventivi serramentista" },
  bundle:                 { title: "Bundle & Pacchetti",         description: "Pacchetti chiavi-in-mano pre-configurati per i preventivi" },
  margini:                { title: "Preventivi & margini",     description: "Imposta margini e configurazioni dei preventivi" },
  scontistica:            { title: "Regole scontistica",        description: "Limiti di sconto per commerciali, clienti e fasce di importo" },
  "stati-ordine":         { title: "Stati ordine",             description: "Configura gli stati del flusso degli ordini" },
  fornitori:              { title: "Fornitori",                description: "Gestisci l'anagrafica fornitori" },
  "categorie-costi":      { title: "Categorie costi",          description: "Organizza le categorie di costo dei cantieri" },
  "automazioni-finanza":  { title: "Automazioni finanza",      description: "Configura automazioni per la gestione finanziaria" },
  tag:                    { title: "Tag",                      description: "Gestisci i tag per classificare contatti e cantieri" },
  "campi-personalizzati": { title: "Campi personalizzati",     description: "Crea campi aggiuntivi per i tuoi record" },
  sequenze:               { title: "Sequenze",                 description: "Configura le sequenze di follow-up automatico" },
  "form-builder":         { title: "Form & UTM",               description: "Crea form di acquisizione lead e traccia le campagne" },
  "materiali-preventivi": { title: "Materiali preventivi",     description: "Gestisci i materiali usati nei preventivi" },
  "template-preventivi":  { title: "Template offerte",         description: "Crea e modifica i template per le offerte commerciali" },
  "firma-elettronica":    { title: "Firma Elettronica",        description: "Configura FEA, OTP, consenso e flussi firma per preventivi e documenti operativi" },
  calendari:              { title: "Calendari marketing",      description: "Configura i calendari per le campagne marketing" },
  "lead-forms":           { title: "Lead Facebook",            description: "Connetti e gestisci i form di acquisizione Facebook" },
  persone:               { title: "Persone & Accessi",         description: "Gestisci utenti, venditori, staff e team" },
  utenti:                 { title: "Utenti",                   description: "Gestisci gli accessi e i ruoli degli utenti" },
  venditori:              { title: "Venditori",                description: "Gestisci l'elenco dei venditori" },
  staff:                  { title: "Staff / Operai",           description: "Gestisci lo staff operativo e gli operai" },
  team:                   { title: "Team",                     description: "Organizza i team di lavoro" },
  "sicurezza-privacy":    { title: "Sicurezza & Privacy",       description: "Password, privacy GDPR, dashboard sicurezza e registro attività" },
  sicurezza:              { title: "Cambio password",          description: "Aggiorna le credenziali di accesso" },
  privacy:                { title: "Privacy & GDPR",           description: "Gestisci le preferenze privacy e la conformità GDPR" },
  "security-dashboard":   { title: "Security dashboard",      description: "Monitora gli accessi e gli eventi di sicurezza" },
  attivita:               { title: "Registro attività",        description: "Visualizza il log completo delle attività" },
  integrazioni:           { title: "Integrazioni",             description: "Connetti strumenti e servizi esterni" },
  crediti:                { title: "Crediti & saldo",          description: "Gestisci i crediti e il saldo del tuo account" },
  api:                    { title: "API platform",             description: "Gestisci le chiavi API per integrazioni avanzate" },
  webhook:                { title: "Webhook",                  description: "Configura i webhook per eventi in tempo reale" },
  "dominio-email":        { title: "Dominio email",            description: "Invia email dal tuo dominio aziendale per deliverability e branding" },
  "numeri-telefono":      { title: "Numeri virtuali",          description: "Gestisci i numeri telefonici virtuali" },
  abbonamento:            { title: "Piano abbonamento",        description: "Gestisci il tuo piano e i dettagli dell'abbonamento" },
  // v8.6.57 — Voce unica "Fatturazione" con 2 tab interni (esterna vs nativa)
  fatturazione:           { title: "Fatturazione",             description: "Provider esterni (Fatture in Cloud, Aruba, ecc.) o configurazione SDI nativa" },
  "fatturazione-nativa":  { title: "Fatturazione",             description: "Provider esterni o configurazione SDI nativa" },
};

const DEFAULT_META: SectionMeta = {
  title: "Impostazioni",
  description: "Configura il tuo account e la tua azienda",
};

// v8.6.69 — MOBILE_SETTINGS_GROUPS rimosso: il dropdown "Vai a una sezione"
// che usava questa lista è stato eliminato. La navigazione mobile delle
// impostazioni avviene ora via rotellina nell'header CompanyLayout.

/** Estrae il segmento URL dopo /impostazioni/ — funzione pura, zero side effects */
function getSectionMeta(pathname: string): SectionMeta {
  const match = pathname.match(/\/impostazioni\/([^/]+)/);
  if (!match) return DEFAULT_META;
  return SECTION_MAP[match[1]] ?? DEFAULT_META;
}

// ─── Layout wrapper per tutte le route /azienda/impostazioni/* ───────────────
export function SettingsLayout() {
  const { pathname } = useLocation();
  const { title, description } = getSectionMeta(pathname);

  // v8.6.71 — Sull'hub (/azienda/impostazioni senza sub-segmento) non mostriamo
  // il back arrow (è la pagina root). Su tutte le sotto-pagine sì.
  const isHubRoot = pathname === "/azienda/impostazioni" || pathname === "/azienda/impostazioni/";

  return (
    <div className="flex flex-col min-h-full">
      {/* Header contestuale — titolo + descrizione derivati dall'URL corrente */}
      <div className="border-b bg-background px-4 py-4 md:px-6 md:py-5">
        <div className="flex items-start gap-3">
          {/* v8.6.71 — Back arrow mobile: porta all'hub griglia impostazioni.
              Nascosto su desktop (sidebar laterale è la navigazione primaria)
              e sulla root impostazioni (sarebbe self-link). */}
          {!isHubRoot && (
            <Link
              to="/azienda/impostazioni"
              aria-label="Torna a tutte le impostazioni"
              className="md:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-background hover:bg-muted transition-colors -ml-1"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 flex-1 min-w-0">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight truncate">{title}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            </div>
            {/* v8.6.71 — Search settings: nascosta su mobile (richiesto), resta su desktop */}
            <div className="hidden md:block">
              <SettingsSearch />
            </div>
          </div>
        </div>
      </div>

      {/* Contenuto della pagina figlia — larghezza piena */}
      <div className="flex-1 px-4 py-4 md:px-6 md:py-6">
        <Outlet />
      </div>
    </div>
  );
}
