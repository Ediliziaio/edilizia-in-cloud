import { Outlet, useLocation, useNavigate } from "react-router-dom";

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
  fatturazione:           { title: "Fatturazione",             description: "Gestisci le informazioni di fatturazione" },
  "fatturazione-nativa":  { title: "Fatturazione elettronica", description: "Configura la fatturazione elettronica italiana" },
};

const DEFAULT_META: SectionMeta = {
  title: "Impostazioni",
  description: "Configura il tuo account e la tua azienda",
};

const MOBILE_SETTINGS_GROUPS = [
  {
    label: "Account",
    items: [
      { to: "/azienda/impostazioni/mio-profilo", label: "Il mio profilo" },
      { to: "/azienda/impostazioni/sicurezza-privacy", label: "Sicurezza & privacy" },
    ],
  },
  {
    label: "Azienda",
    items: [
      { to: "/azienda/impostazioni/profilo", label: "Profilo aziendale" },
      { to: "/azienda/impostazioni/sedi", label: "Sedi" },
      { to: "/azienda/impostazioni/branding", label: "White-Label" },
      { to: "/azienda/impostazioni/persone", label: "Persone & accessi" },
    ],
  },
  {
    label: "Vendite e operativo",
    items: [
      { to: "/azienda/impostazioni/listino", label: "Listino prodotti" },
      { to: "/azienda/impostazioni/template-preventivi", label: "Template offerte" },
      { to: "/azienda/impostazioni/firma-elettronica", label: "Firma elettronica" },
      { to: "/azienda/impostazioni/sopralluoghi", label: "Sopralluoghi" },
      { to: "/azienda/impostazioni/finanziamenti", label: "Finanziamenti" },
    ],
  },
  {
    label: "Marketing e integrazioni",
    items: [
      { to: "/azienda/impostazioni/calendari", label: "Calendari marketing" },
      { to: "/azienda/impostazioni/lead-forms", label: "Lead Facebook" },
      { to: "/azienda/impostazioni/integrazioni", label: "Integrazioni" },
      { to: "/azienda/impostazioni/crediti", label: "Crediti & saldo" },
      { to: "/azienda/impostazioni/abbonamento", label: "Piano abbonamento" },
    ],
  },
];

/** Estrae il segmento URL dopo /impostazioni/ — funzione pura, zero side effects */
function getSectionMeta(pathname: string): SectionMeta {
  const match = pathname.match(/\/impostazioni\/([^/]+)/);
  if (!match) return DEFAULT_META;
  return SECTION_MAP[match[1]] ?? DEFAULT_META;
}

// ─── Layout wrapper per tutte le route /azienda/impostazioni/* ───────────────
export function SettingsLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { title, description } = getSectionMeta(pathname);
  const currentMobileSection =
    MOBILE_SETTINGS_GROUPS
      .flatMap(group => group.items)
      .find(item => pathname === item.to || pathname.startsWith(`${item.to}/`))
      ?.to ?? "";

  return (
    <div className="flex flex-col min-h-full">
      {/* Header contestuale — titolo + descrizione derivati dall'URL corrente */}
      <div className="border-b bg-background px-4 py-4 md:px-6 md:py-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>

        <div className="mt-4 md:hidden">
          <label htmlFor="mobile-settings-nav" className="sr-only">
            Vai a una sezione delle impostazioni
          </label>
          <select
            id="mobile-settings-nav"
            value={currentMobileSection}
            onChange={(event) => {
              if (event.target.value) navigate(event.target.value);
            }}
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm font-medium shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="" disabled>
              Vai a una sezione...
            </option>
            {MOBILE_SETTINGS_GROUPS.map(group => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map(item => (
                  <option key={item.to} value={item.to}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {/* Contenuto della pagina figlia — larghezza piena */}
      <div className="flex-1 px-4 py-4 md:px-6 md:py-6">
        <Outlet />
      </div>
    </div>
  );
}
