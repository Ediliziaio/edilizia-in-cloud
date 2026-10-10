/** Fonte condivisa del menu impostazioni: sidebar, hub e ricerca. Non sostituisce le guardie delle rotte. */
import type React from "react";
import type { Permissions } from "@/hooks/usePermissions";
import { isIOS as isIOSNativePlatform } from "@/lib/mobile/platform";
import { GRUPPI_IMPOSTAZIONI, percorsoNelGruppo, schedeVisibili, sezioneDaPercorso, type GruppoImpostazioni } from "./gruppiImpostazioni";
import { impostazioneNelPiano, type StatoPiano } from "./pianoImpostazioni";
import { Users, Building2, MapPin, Paintbrush, Wallet, Coins, Brain, Bell, ImagePlus, ListOrdered, FolderOpen, HardHat, ClipboardList, ListChecks, Banknote, Truck, QrCode, RefreshCw, Package, FileSignature, Tag, SlidersHorizontal, GitBranch, ThumbsDown, FileText, CalendarDays, FormInput, Shield, Plug, Key, Globe, AtSign, Phone } from "lucide-react";

/** I parametri dopo il «?» di un indirizzo («…/persone?tab=team#x» → tab=team). */
function parametriDa(url: string): URLSearchParams {
  const dopo = url.split("?")[1] ?? "";
  return new URLSearchParams(dopo.split("#")[0]);
}

/**
 * Le schede dentro una pagina hanno permessi loro, più stretti di quelli della pagina: chi apre «Persone &
 * Accessi» solo per i dipendenti non vede «Commercialista». Gli stessi controlli che fa la pagina, detti qui
 * perché la ricerca non porti a una scheda che poi non c'è.
 */
function schedaInternaAccessibile(url: string, sezione: string | null, permissions: Permissions): boolean {
  const scheda = parametriDa(url).get("tab");
  if (!scheda) return true;
  const admin = permissions.isAdmin;
  if (sezione === "persone") {
    const vedeUtenti = admin || permissions.canViewUsers;
    const vedePersone = admin || permissions.canViewSettingsPeople;
    switch (scheda) {
      case "utenti": case "accessi-azienda": case "commercialista": return vedeUtenti;
      case "sicurezza-accessi": return vedeUtenti || permissions.canViewSettingsSecurity;
      // I modelli di permessi li vede solo l'amministratore.
      case "template-permessi": return admin;
      case "dipendenti": case "subappaltatori": case "venditori": case "team": return vedePersone;
      default: return true;
    }
  }
  // Registro delle attività e accessi: la pagina li apre solo all'amministratore.
  if (sezione === "sicurezza-privacy" && (scheda === "dashboard" || scheda === "attivita")) return admin;
  return true;
}

/**
 * Una sezione dentro una pagina (l'àncora dopo il «#») che la pagina mostra solo a qualcuno: la ricerca non porta
 * a una sezione che poi non c'è. Profilo aziendale: logo, portale clienti e bonus si cambiano, quindi li vede chi può
 * modificare il profilo. Il mio profilo → Sicurezza: le regole dell'azienda sono dell'amministratore. Notifiche: i
 * messaggi programmati sono dell'amministratore.
 */
function ancoraInternaAccessibile(url: string, sezione: string | null, permissions: Permissions): boolean {
  const ancora = url.split("#")[1];
  if (!ancora) return true;
  const admin = permissions.isAdmin;
  if (sezione === "profilo" && ["logo", "portale-clienti", "bonus"].includes(ancora)) return admin || permissions.canEditSettingsProfile;
  if (sezione === "mio-profilo" && ancora === "regole-azienda") return admin;
  if (sezione === "notifiche" && ancora === "messaggi-programmati") return admin;
  return true;
}

/** Una sottopagina con un permesso suo: caricare una tabella di finanziamento vuole la modifica, non basta vederle. */
function sottopaginaAccessibile(url: string, sezione: string | null, permissions: Permissions): boolean {
  const percorso = url.split(/[?#]/)[0];
  if (sezione === "finanziamenti" && percorso.endsWith("/finanziamenti/nuova")) return permissions.isAdmin || permissions.canEditSettingsFinanziamenti;
  return true;
}

/** Ricerca e link secondari rispettano gli stessi permessi della sidebar.
 * Le schede raggruppate controllano il proprio permesso, non quello di una scheda vicina. */
export function impostazioneAccessibile(url: string, permissions: Permissions, piano: StatoPiano, isMobile: boolean): boolean {
  if (!impostazioneNelPiano(url, piano)) return false;
  const sezione = sezioneDaPercorso(url);
  if (url.includes("listino/import") && !(permissions.isAdmin || permissions.canEditSettingsPricing)) return false;
  const scheda = GRUPPI_IMPOSTAZIONI.flatMap(g => g.schede).find(s => s.sezione === sezione || s.alias?.includes(sezione ?? ""));
  if (scheda) return permissions.isAdmin || Boolean(permissions[scheda.permesso]);
  const secondarie: Record<string, boolean> = {
    "crediti": (permissions.isAdmin || permissions.canViewBilling) && !isIOSNativePlatform,
    "fatturazione-nativa": permissions.isAdmin || permissions.canViewBilling,
    "ai-automazioni": permissions.isAdmin || permissions.canViewSettingsCustomization,
    "preferenze-email": permissions.isAdmin || permissions.canViewMarketingEmail,
    "whatsapp-bot": permissions.isAdmin || permissions.canViewSettingsIntegrations,
  };
  if (sezione && sezione in secondarie) return Boolean(secondarie[sezione]);
  if (!schedaInternaAccessibile(url, sezione, permissions) || !ancoraInternaAccessibile(url, sezione, permissions) || !sottopaginaAccessibile(url, sezione, permissions)) return false;
  return buildSettingsGroups(permissions.isAdmin, permissions, piano, isMobile)
    .flatMap(g => g.items)
    .some(i => i.visible && sezioneDaPercorso(i.to) === sezione);
}
// ─── Tipi struttura dati sidebar impostazioni ────────────────────────────────
export interface SettingsNavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  visible: boolean;
  /** Voce di un gruppo con schede: resta accesa su tutte le sue pagine. */
  attivoSu?: (pathname: string) => boolean;
  /** Solo tablet e computer: da telefono la voce sparisce (vedi useIsMobile). */
  desktopOnly?: boolean;
  /**
   * Tutti gli indirizzi che la voce può aprire. Una voce con le schede (Listino, Modelli di preventivo, Firma e
   * condizioni) apre la prima scheda che l'utente può vedere: chi sceglie cosa nascondere da telefono deve
   * guardarli tutti, non solo quello di oggi.
   */
  indirizzi?: string[];
}
export interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

/** Costruisce i gruppi della sidebar impostazioni in base ai permessi.
 *  Il primo gruppo "Il mio account" è sempre visibile a tutti i ruoli.
 *  I gruppi aziendali sono visibili solo se l'utente ha i permessi necessari. */
export function buildSettingsGroups(isAdmin: boolean, permissions: Permissions, piano: StatoPiano, isMobile: boolean): SettingsNavGroup[] {
  // Una voce per argomento: dentro, le schede delle pagine (vedi SettingsLayout).
  const voceGruppo = (id: GruppoImpostazioni["id"], icon: React.ReactNode): SettingsNavItem => {
    const gruppo = GRUPPI_IMPOSTAZIONI.find((g) => g.id === id)!;
    const schede = schedeVisibili(gruppo, isAdmin, permissions).filter((s) => impostazioneNelPiano(s.to, piano));
    return {
      to: schede[0]?.to ?? gruppo.schede[0].to,
      label: gruppo.titolo,
      icon,
      visible: schede.length > 0,
      attivoSu: (pathname) => percorsoNelGruppo(gruppo, pathname),
      indirizzi: gruppo.schede.map((s) => s.to),
    };
  };
  const gruppi: SettingsNavGroup[] = [
    {
      label: "Il mio account",
      items: [
        { to: "/azienda/impostazioni/mio-profilo", label: "Il mio profilo", icon: <Users className="h-4 w-4" />, visible: true },
      ],
    },
    {
      label: "La mia azienda",
      items: [
        { to: "/azienda/impostazioni/profilo",      label: "Profilo aziendale", icon: <Building2 className="h-4 w-4" />,    visible: isAdmin || permissions.canViewSettingsProfile },
        { to: "/azienda/impostazioni/sedi",          label: "Sedi",              icon: <MapPin className="h-4 w-4" />,       visible: isAdmin || permissions.canViewSettingsPeople },
        { to: "/azienda/impostazioni/branding",      label: "White-Label",       icon: <Paintbrush className="h-4 w-4" />,   visible: isAdmin },
        // v8.6.59 — Solo "Piano abbonamento": "Crediti & Saldo" è ora il tab
        // "Portafoglio" interno alla dashboard Abbonamento (no duplicazione).
        // Apple Guideline 3.1.1 — nascosto su iOS nativo (no link a Stripe checkout).
        { to: "/azienda/impostazioni/abbonamento",   label: "Piano abbonamento", icon: <Wallet className="h-4 w-4" />,       visible: isAdmin && !isIOSNativePlatform },
        // Crediti e ricariche: il saldo, la ricarica e la ricarica automatica. Chi ha «Fatturazione» la vede anche senza
        // essere amministratore, come la rotta (companyRoutes: crediti).
        { to: "/azienda/impostazioni/crediti",       label: "Crediti e ricariche", icon: <Coins className="h-4 w-4" />,     visible: (isAdmin || permissions.canViewBilling) && !isIOSNativePlatform },
      ],
    },
    {
      label: "Persone & Accessi",
      items: [
        // IMP3: voce unica → pagina con 4 tab (utenti/venditori/staff/team)
        { to: "/azienda/impostazioni/persone", label: "Persone & Accessi", icon: <Users className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsPeople },
      ],
    },
    {
      // v8.6.72 — Nuovo gruppo "AI & Notifiche" — voci precedentemente
      // raggiungibili solo da Cmd+K o dall'hub mobile (/azienda/impostazioni).
      // Stesso permesso delle rotte (companyRoutes.tsx): le Notifiche sono di
      // tutti, AI Personas vuole Branding & Template.
      label: "AI & Notifiche",
      items: [
        { to: "/azienda/impostazioni/ai-memoria", label: "AI Personas (chat + memoria)", icon: <Brain className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/notifiche",  label: "Notifiche",           icon: <Bell className="h-4 w-4" />,  visible: true },
        { to: "/azienda/impostazioni/catalogo-render", label: "Catalogo render", icon: <ImagePlus className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsCustomization },
      ],
    },
    {
      label: "Cantieri & Costi",
      items: [
        { to: "/azienda/impostazioni/stati-ordine",        label: "Stati commessa",        icon: <ListOrdered className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/cartelle-documenti",  label: "Cartelle documenti",  icon: <FolderOpen className="h-4 w-4" />,  visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/calendari-lavori",   label: "Calendari lavori",    icon: <HardHat className="h-4 w-4" />,     visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/rapportini-cantiere", label: "Rapportini e presenze", icon: <ClipboardList className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/modelli-fasi", label: "Fasi e avanzamento", icon: <ListChecks className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/modelli-pagamento", label: "Modelli di pagamento", icon: <Banknote className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/categorie-costi",     label: "Categorie costi",     icon: <FolderOpen className="h-4 w-4" />, visible: isAdmin || permissions.canViewCosts },
        { to: "/azienda/impostazioni/fornitori",           label: "Fornitori",           icon: <Truck className="h-4 w-4" />,       visible: isAdmin || permissions.canViewSettingsSuppliers },
        { to: "/azienda/impostazioni/sopralluoghi",        label: "Sopralluoghi",        icon: <ClipboardList className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/qr-codici",           label: "QR & Codici",         icon: <QrCode className="h-4 w-4" />,      visible: isAdmin || permissions.canViewSettingsOrders },
        { to: "/azienda/impostazioni/automazioni-finanza", label: "Automazioni finanza", icon: <RefreshCw className="h-4 w-4" />,  visible: isAdmin || permissions.canViewCosts },
      ],
    },
    {
      // 13/7/2026: gate voci allineati 1:1 ai permessi delle route
      // (companyRoutes.tsx): prima molte voci usavano canViewSettingsOrders e chi
      // aveva SOLO can_view_settings_pricing non vedeva Listino & Prezzi in menu.
      label: "Preventivi & Listino",
      items: [
        // 15/09/2026: da undici voci a cinque. Le pagine e gli indirizzi sono gli
        // stessi; manodopera e kit stanno nel Listino, condizioni con la firma.
        // Render e sopralluoghi sono nei loro gruppi.
        // 09/10/2026: da cinque a quattro. Prezzo e margini, sconti e approvazioni
        // sono schede di «Modelli di preventivo», non più una voce a sé.
        voceGruppo("listino", <Package className="h-4 w-4" />),
        { to: "/azienda/impostazioni/finanziamenti",        label: "Finanziamenti",        icon: <Banknote className="h-4 w-4" />,   visible: isAdmin || permissions.canViewSettingsFinanziamenti },
        voceGruppo("modelli", <Paintbrush className="h-4 w-4" />),
        voceGruppo("firma", <FileSignature className="h-4 w-4" />),
      ],
    },
    {
      label: "CRM & Vendite",
      items: [
        { to: "/azienda/impostazioni/tag",                 label: "Tag",                  icon: <Tag className="h-4 w-4" />,              visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/campi-personalizzati",label: "Campi personalizzati", icon: <SlidersHorizontal className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/sequenze",            label: "Pipeline di vendita",             icon: <GitBranch className="h-4 w-4" />,         visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/motivi-perdita",      label: "Motivi di perdita",    icon: <ThumbsDown className="h-4 w-4" />,        visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/form-builder",        label: "Form & UTM",           icon: <FileText className="h-4 w-4" />,          visible: isAdmin || permissions.canViewSettingsCustomization },
      ],
    },
    {
      label: "Marketing",
      items: [
        { to: "/azienda/impostazioni/calendari",  label: "Appuntamenti e prenotazioni", icon: <CalendarDays className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsCustomization },
        { to: "/azienda/impostazioni/lead-forms", label: "Lead Facebook",       icon: <FormInput className="h-4 w-4" />,    visible: isAdmin || permissions.canViewSettingsIntegrations },
      ],
    },
    {
      label: "Sicurezza & Privacy",
      items: [
        // IMP4: voce unica → pagina con tre schede (Accessi · Registro attività · Privacy); la password è in «Il mio profilo → Sicurezza»
        { to: "/azienda/impostazioni/sicurezza-privacy", label: "Sicurezza & Privacy", icon: <Shield className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsSecurity },
        { to: "/azienda/impostazioni/esporta-dati", label: "Esporta i dati", icon: <Shield className="h-4 w-4" />, visible: isAdmin || permissions.canViewSettingsSecurity },
      ],
    },
    {
      label: "Integrazioni & API",
      items: [
        // v8.6.57 — "Crediti & Saldo" spostato in "La mia azienda" sopra
        // Integrazioni solo da tablet e computer (richiesta 05/10/2026).
        { to: "/azienda/impostazioni/integrazioni",   label: "Integrazioni",   icon: <Plug className="h-4 w-4" />,   visible: isAdmin || permissions.canViewSettingsIntegrations, desktopOnly: true },
        { to: "/azienda/impostazioni/api",            label: "API Platform",   icon: <Key className="h-4 w-4" />,    visible: isAdmin || permissions.canViewSettingsIntegrations },
        { to: "/azienda/impostazioni/webhook",        label: "Webhook",        icon: <Globe className="h-4 w-4" />,  visible: isAdmin || permissions.canViewSettingsIntegrations },
        { to: "/azienda/impostazioni/dominio-email",  label: "Dominio Email",  icon: <AtSign className="h-4 w-4" />, visible: isAdmin || permissions.canViewMarketingEmail },
        { to: "/azienda/impostazioni/numeri-telefono",label: "Telefonia",icon: <Phone className="h-4 w-4" />,  visible: isAdmin || permissions.canViewSettingsIntegrations },
      ],
    },
    {
      // v8.6.57 — "Piano abbonamento" spostato in "La mia azienda".
      // "Fatturazione" + "Fatturazione elettronica" unificate in 1 voce sola
      // con tabs interni (modalità esterna provider vs nativa).
      label: "Fatturazione",
      items: [
        { to: "/azienda/impostazioni/fatturazione", label: "Fatturazione", icon: <FileText className="h-4 w-4" />, visible: isAdmin || permissions.canViewBilling },
      ],
    },
  ];
  return gruppi.map((gruppo) => ({
    ...gruppo,
    // Le impostazioni seguono il piano (21/09/2026): una voce resta solo se
    // oltre al permesso c'è anche il modulo. Vedi pianoImpostazioni.ts.
    // E le voci «solo tablet e computer» spariscono da telefono.
    items: gruppo.items.map((voce) => ({
      ...voce,
      visible: voce.visible && impostazioneNelPiano(voce.to, piano) && !(voce.desktopOnly && isMobile),
    })),
  }));
}
