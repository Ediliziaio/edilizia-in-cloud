/**
 * SettingsIntegrations — Pagina /azienda/impostazioni/integrazioni.
 *
 * Refactor 2026-05-27 (stile GHL):
 *  - Logiche di catalogo/manifesto: src/components/integrations/IntegrationsCatalog.tsx
 *  - Logiche di rendering grid + popup + filtri: IntegrationsGrid.tsx
 *  - Loghi brand SVG: brand-logos.tsx
 *
 * Riordino del 05/10/2026: la pagina era due pagine in una. Sopra, cinque
 * pannelli tecnici aperti (calendari e caselle del team, record DNS, conti
 * bancari, Stripe) lunghi quasi duemila pixel; sotto, in fondo, la griglia
 * delle integrazioni vere. I problemi erano sparsi fra i pannelli e il
 * contatore «3/7» contava solo la griglia. Ora:
 *  - in cima, solo se serve, il riquadro «Da sistemare»: un problema per riga,
 *    con il pulsante che lo risolve;
 *  - sotto, una sola griglia: ogni integrazione è una scheda, i pannelli di
 *    prima stanno nel popup della loro scheda.
 * Solo tablet e computer: da telefono la pagina non si apre (SoloTabletDesktop
 * in companyRoutes.tsx).
 */
import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useStatoPiano } from "@/hooks/useStatoPiano";
import { REQUISITI_SEZIONI, requisitoSoddisfatto } from "@/lib/impostazioni/pianoImpostazioni";
// Popup components per integrazioni in modalità "popup"
import GbpConnectionCard from "@/components/integrations/GbpConnectionCard";
import GoogleAdsConnectionCard from "@/components/integrations/GoogleAdsConnectionCard";
import { ConnettoreChatGptPopup, ConnettoreClaudePopup } from "@/components/integrations/ConnettoreAiPopup";
import {
  CalendariPopup,
  CaselleEmailPopup,
  ContiBancariPopup,
  IncassiCartaPopup,
} from "@/components/integrations/PopupIntegrazioniTeam";
import { useOAuthGrants } from "@/hooks/useOAuthGrants";
import { statoCollegamentoAi } from "@/lib/aiConnector";
import {
  COLONNE_STATO_WHATSAPP,
  statoWhatsAppDaiNumeri,
  type NumeroPerStato,
} from "@/lib/impostazioni/statoWhatsAppIntegrazione";
import { useApiKeys } from "@/hooks/useApiKeys";
import { MetaIntegrationWizard } from "@/components/integrations/MetaIntegrationWizard";
import { MetaTroubleshootDialog } from "@/components/integrations/MetaTroubleshootDialog";
// Stato delle schede «di squadra»: stesse query dei loro popup (una sola chiamata).
import { calendarioDaRicollegare, useCalendariDelTeam } from "@/components/integrations/CompanyCalendarsOverview";
import { casellaDaRicollegare, nomeTitolareCasella, useCaselleDelTeam } from "@/components/integrations/CompanyEmailsOverview";
import { useAutenticazioneDomini } from "@/components/integrations/EmailDomainAuthPanel";
import {
  contoDaRicollegare,
  giorniAllaScadenza,
  useConnessioniBanca,
  type BankConnection,
} from "@/components/integrations/BankConnectionsCard";
import { useStatoIncassiCarta } from "@/components/integrations/StripePaymentsCard";
import { IntegrazioniDaSistemare, type VoceDaSistemare } from "@/components/integrations/IntegrazioniDaSistemare";
import {
  BancaLogo,
  CalendariLogo,
  CartaLogo,
  EmailLogo,
  GoogleAdsLogo,
  MetaAssetLogo,
} from "@/components/integrations/brand-logos";
// Nuovo catalogo + grid
import {
  INTEGRATIONS_CATALOG,
  type IntegrationItem,
} from "@/components/integrations/IntegrationsCatalog";
import IntegrationsGrid, {
  type IntegrationConnectionStatus,
  type IntegrationStatusMap,
  type PopupAperto,
} from "@/components/integrations/IntegrationsGrid";
import type { Integration, MetaWizardStep } from "@/types/integrations";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const TOKEN_STALE_DAYS = 60;

// Array vuoti fissi: usati nei useMemo, uno nuovo a ogni render li ricalcolerebbe sempre.
const NESSUNA_CASELLA: Array<{ id: string; email_address: string; provider: string | null; status: string | null }> = [];
const NESSUN_CONTO: BankConnection[] = [];
const NESSUN_NUMERO_WHATSAPP: NumeroPerStato[] = [];

/** «Anna», «Anna e Luca», «Anna, Luca e altri 2». */
function elencoNomi(nomi: string[], t: (testo: string, valori?: Record<string, string | number>) => string): string {
  const unici = [...new Set(nomi)];
  if (unici.length <= 2) return unici.join(` ${t("e")} `);
  if (unici.length === 3) return t("{a}, {b} e {c}", { a: unici[0], b: unici[1], c: unici[2] });
  return t("{a}, {b} e altri {n}", { a: unici[0], b: unici[1], n: unici.length - 2 });
}

// ── Popup wrappers ─────────────────────────────────────────────────────────
// I componenti esistenti GbpConnectionCard e GoogleAdsConnectionCard sono già
// auto-contained (fanno query interna, gestiscono OAuth, disconnect ecc.) —
// li renderizziamo dentro il Dialog della grid senza modifiche.

function GbpPopupContent(_props: { onClose: () => void }) {
  return <GbpConnectionCard />;
}

function GoogleAdsPopupContent(_props: { onClose: () => void }) {
  return <GoogleAdsConnectionCard />;
}

// Meta usa il wizard esistente che è già un Dialog: wrapper che fornisce
// le props mancanti (integration + onComplete).
function makeMetaWizardWrapper(
  metaIntegration: Integration | null,
  onComplete: () => void,
) {
  return function MetaWizardWrapper({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) {
    return (
      <MetaIntegrationWizard
        open={open}
        onOpenChange={onOpenChange}
        integration={metaIntegration}
        onComplete={onComplete}
      />
    );
  };
}

export default function SettingsIntegrations() {
  const t = useT();
  const { effectiveCompany, user, role } = useAuth();
  const companyId = (effectiveCompany as any)?.id;

  // Assistenti AI: quante chiavi attive e non scadute (le usano Claude Code e
  // Claude Desktop) e quanti collegamenti OAuth, divisi per Claude e ChatGPT.
  const { data: aiKeys = [], isError: aiKeysError, isLoading: aiKeysLoading } = useApiKeys(companyId);
  const { data: aiGrants = [], isError: aiGrantsError, isLoading: aiGrantsLoading } = useOAuthGrants(companyId);
  const userId = user?.id;
  const permissions = usePermissions();
  // Conti correnti e incassi con carta servono con tesoreria, preventivi o
  // fatture: col piano Marketing non compaiono (21/09/2026). E solo a chi ha
  // il permesso Tesoreria, come prima i loro pannelli.
  const { stato: piano } = useStatoPiano();
  const mostraPagamentiCarta = requisitoSoddisfatto(REQUISITI_SEZIONI.pagamenti_carta, piano);
  const canViewTesoreria = permissions.canViewTesoreria && !permissions.isLoading;
  // Una scheda che manca non ha nemmeno il popup: niente conti né Stripe senza piano e permesso.
  const visibile: Record<string, boolean> = {
    // I conti correnti sono usciti da qui: ora stanno in Impostazioni → Fatturazione → Banca,
    // vicino a fatture e incassi invece che in mezzo a Meta, Google e Stripe.
    banca: false,
    stripe: mostraPagamentiCarta && canViewTesoreria,
  };
  const catalogo = INTEGRATIONS_CATALOG.filter((i) => visibile[i.id] ?? true);
  // 13/7/2026: vale anche il permesso "Integrazioni & Canali" (Modifica), non solo il ruolo admin
  const canManageIntegrations = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsIntegrations;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Popup aperto (comandato da qui: lo aprono anche le righe «Da sistemare»).
  // Al ritorno dal consenso della banca (?code=&state=, o ?error=&state=) o da
  // Stripe (?stripe=) si riapre il popup giusto: è lì dentro che il
  // collegamento si completa.
  const [searchParams] = useSearchParams();
  const [popup, setPopup] = useState<PopupAperto>(() => {
    if (searchParams.get("bank_provider") === "saltedge" || searchParams.get("code") || (searchParams.get("error") && searchParams.get("state"))) return { id: "banca" };
    if (searchParams.get("stripe")) return { id: "stripe" };
    return null;
  });

  // ── Query: integrations table ─────────────────────────────────────────────
  const {
    data: integrations = [],
    refetch: refetchIntegrations,
    isLoading: isLoadingIntegrations,
    isError: isErrorIntegrations,
  } = useQuery({
    queryKey: ["integrations", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .eq("company_id", companyId);
      if (error) throw error;
      return (data || []) as Integration[];
    },
    enabled: !!companyId,
  });

  // ── Query: numeri WhatsApp dell'azienda (di qualunque scopo) ───────────────
  // Prima la scheda guardava solo il numero «Operativo / Cantieri»: chi aveva numeri Marketing o Lead attivi
  // vedeva «Non collegato». Sola lettura: legge soltanto, non cambia nessun collegamento.
  const {
    data: numeriWhatsApp = NESSUN_NUMERO_WHATSAPP,
    isError: numeriWhatsAppInErrore,
  } = useQuery({
    queryKey: ["whatsapp-config-status", companyId],
    queryFn: async () => {
      if (!companyId) return NESSUN_NUMERO_WHATSAPP;
      const { data, error } = await supabase
        .from("ai_whatsapp_numbers")
        .select(COLONNE_STATO_WHATSAPP)
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? NESSUN_NUMERO_WHATSAPP) as NumeroPerStato[];
    },
    enabled: !!companyId,
  });

  // ── Query: Google Business Profile connection ─────────────────────────────
  const { data: gbpConnection } = useQuery({
    queryKey: ["gbp-connection", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("gbp_connections")
        .select("id, status, google_account_email")
        .eq("company_id", companyId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
  });

  // ── Query: Google Calendar (per stale token check) ────────────────────────
  const { data: gcalConnection } = useQuery({
    queryKey: ["google-calendar-connection", companyId, userId],
    queryFn: async () => {
      if (!companyId || !userId) return null;
      const { data } = await supabase
        .from("google_calendar_connections")
        .select("id, status, google_account_email, updated_at")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId && !!userId,
  });

  // ── Query: Apple Calendar (per stale token check) ─────────────────────────
  const { data: appleCalConnection } = useQuery({
    queryKey: ["apple-calendar-connection", companyId, userId],
    queryFn: async () => {
      if (!companyId || !userId) return null;
      const { data } = await supabase
        .from("apple_calendar_connections")
        .select("id, status, apple_id_email, updated_at")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId && !!userId,
  });

  // ── Query: Outlook Calendar (per stale token check) ──────────────────────
  const { data: outlookCalConnection } = useQuery({
    queryKey: ["outlook-calendar-connection-summary", companyId, userId],
    queryFn: async () => {
      if (!companyId || !userId) return null;
      const { data } = await supabase
        .from("outlook_calendar_connections")
        .select("id, status, microsoft_account_email, updated_at")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!data) return null;
      // L'eta' del token si calcola qui, nel caricamento: nel render il
      // compilatore React segnala Date.now() come impuro.
      const giorniDalRinnovo = data.updated_at
        ? Math.floor((Date.now() - new Date(data.updated_at).getTime()) / 86400000)
        : null;
      return { ...data, giorniDalRinnovo };
    },
    enabled: !!companyId && !!userId,
  });

  // ── Query: Email OAuth (personale) ────────────────────────────────────────
  const { data: emailConnections = NESSUNA_CASELLA } = useQuery({
    queryKey: ["email-oauth-connections-summary", companyId, userId],
    queryFn: async () => {
      if (!companyId || !userId) return NESSUNA_CASELLA;
      const { data, error } = await supabase
        .from("email_oauth_connections")
        .select("id, email_address, provider, status")
        .eq("company_id", companyId)
        .eq("user_id", userId);
      if (error) return NESSUNA_CASELLA;
      return data || NESSUNA_CASELLA;
    },
    enabled: !!companyId && !!userId,
  });

  // ── Schede di squadra: calendari e caselle di tutti (solo admin), domini,
  // conti, incassi. Le stesse query dei popup: si caricano una volta sola.
  const calendariTeam = useCalendariDelTeam();
  const caselleTeam = useCaselleDelTeam();
  const domini = useAutenticazioneDomini();
  const { data: contiBanca = NESSUN_CONTO } = useConnessioniBanca(visibile.banca);
  const { data: incassiCarta } = useStatoIncassiCarta(visibile.stripe);

  // ── Derive: status map per ogni integrazione del catalogo ─────────────────
  const metaIntegration = integrations.find((i) => i.provider === "meta") ?? null;
  const googleAdsIntegration = integrations.find((i) => i.provider === "google_ads") ?? null;

  // I miei calendari (per chi non vede quelli del team).
  const mieiCalendari = useMemo(() => {
    const elenco: Array<{ nome: string; status: string }> = [];
    if (gcalConnection) elenco.push({ nome: "Google Calendar", status: gcalConnection.status ?? "" });
    if (appleCalConnection) elenco.push({ nome: "Apple Calendar", status: appleCalConnection.status ?? "" });
    if (outlookCalConnection) elenco.push({ nome: "Outlook", status: outlookCalConnection.status ?? "" });
    return elenco;
  }, [gcalConnection, appleCalConnection, outlookCalConnection]);

  const statuses: IntegrationStatusMap = useMemo(() => {
    const result: IntegrationStatusMap = {};

    // WhatsApp: qualunque numero attivo dell'azienda, non solo quello dei cantieri. Se la lettura non riesce non si
    // dice «Non collegato» (sarebbe falso): si dice che lo stato non si può verificare, come per Claude e ChatGPT.
    result["whatsapp"] = numeriWhatsAppInErrore
      ? { status: "warning", detail: t("Stato non verificabile · riprova") }
      : statoWhatsAppDaiNumeri(numeriWhatsApp);

    // Meta
    const metaStatus: IntegrationConnectionStatus =
      metaIntegration?.status === "connected"
        ? "connected"
        : metaIntegration?.status === "error" || metaIntegration?.status === "token_expired"
          ? "error"
          : "disconnected";
    // Token scaduto o revocato da Meta: non serve una diagnosi, serve ricollegarlo.
    result["meta"] = { status: metaStatus, detail: null, daRicollegare: metaIntegration?.status === "token_expired" };

    // Google Business Profile
    const gbpConnected = gbpConnection?.status === "connected";
    result["google-business"] = {
      status: gbpConnected ? "connected" : "disconnected",
      detail: gbpConnection?.google_account_email ?? null,
    };

    // Google Ads
    let gadsStatus: IntegrationConnectionStatus = "disconnected";
    if (googleAdsIntegration?.status === "connected") {
      gadsStatus =
        googleAdsIntegration.health === "critical" || googleAdsIntegration.last_error_code
          ? "pending"
          : "connected";
    } else if (
      googleAdsIntegration?.status === "error" ||
      googleAdsIntegration?.status === "token_expired"
    ) {
      gadsStatus = "error";
    }
    result["google-ads"] = { status: gadsStatus, detail: null };

    // Caselle email: per gli amministratori quelle di tutto il team (più il
    // controllo dei domini), per gli altri le proprie.
    // Lo stato scritto dal DB è "active" (mai "connected"): con il confronto
    // sbagliato l'email risultava SEMPRE scollegata, anche con caselle attive.
    const isAttiva = (s: string | null) => s === "active" || s === "connected";
    if (caselleTeam.isAdmin) {
      const n = caselleTeam.righe.length;
      const attive = caselleTeam.righe.filter((r) => isAttiva(r.status)).length;
      const guaste = caselleTeam.righe.filter((r) => casellaDaRicollegare(r.status)).length;
      const problemi = guaste + domini.daSistemare.length;
      // Nel dettaglio le caselle da ricollegare; il dominio lo dicono lo
      // stato della scheda e il riquadro «Da sistemare» («3 da sistemare» su
      // 3 caselle sembrava dire che erano guaste tutte).
      const nota = guaste > 0 ? ` · ${t("{n} da ricollegare", { n: guaste })}` : domini.daSistemare.length > 0 ? ` · ${t("dominio da sistemare")}` : "";
      result["email"] = {
        status: problemi > 0 ? (attive > 0 ? "warning" : "error") : attive > 0 ? "connected" : "disconnected",
        detail: n > 0 ? `${t(n === 1 ? "{n} casella" : "{n} caselle", { n })}${nota}` : null,
      };
    } else {
      const firstEmail = emailConnections.find((c) => isAttiva(c.status));
      const guaste = emailConnections.filter((c) => casellaDaRicollegare(c.status ?? "")).length;
      result["email"] = {
        status: guaste > 0 ? "warning" : firstEmail ? "connected" : "disconnected",
        detail: firstEmail?.email_address ?? null,
      };
    }

    // Calendari: stesso criterio delle caselle.
    if (calendariTeam.isAdmin) {
      const n = calendariTeam.righe.length;
      const attivi = calendariTeam.righe.filter((r) => r.status === "connected").length;
      const guasti = calendariTeam.righe.filter((r) => calendarioDaRicollegare(r.status)).length;
      result["calendari"] = {
        status: guasti > 0 ? (attivi > 0 ? "warning" : "error") : attivi > 0 ? "connected" : "disconnected",
        detail: n > 0 ? `${t(attivi === 1 ? "{n} attivo" : "{n} attivi", { n: attivi })}${guasti > 0 ? ` · ${t("{n} da ricollegare", { n: guasti })}` : ""}` : null,
      };
    } else {
      const attivo = mieiCalendari.find((x) => x.status === "connected");
      const guasti = mieiCalendari.filter((x) => calendarioDaRicollegare(x.status)).length;
      result["calendari"] = {
        status: guasti > 0 ? "warning" : attivo ? "connected" : "disconnected",
        detail: attivo?.nome ?? null,
      };
    }

    // Conti bancari: da sistemare se un consenso è scaduto, in errore o scade
    // entro 7 giorni; «in sospeso» se il consenso non è mai stato dato.
    if (contiBanca.length > 0) {
      const nConti = contiBanca.reduce((tot, c) => tot + (c.accounts_count ?? 0), 0);
      const banche = [...new Set(contiBanca.map((c) => c.institution_name ?? t("Banca")))].join(", ");
      result["banca"] = {
        status: contiBanca.some(contoDaRicollegare)
          ? "warning"
          : contiBanca.some((c) => c.status === "linked")
            ? "connected"
            : "pending",
        detail: nConti > 0 ? `${banche} · ${t(nConti === 1 ? "{n} conto" : "{n} conti", { n: nConti })}` : banche,
      };
    } else {
      result["banca"] = { status: "disconnected", detail: null };
    }

    // Pagamenti con carta: collegato ma con la verifica Stripe a metà = da sistemare.
    result["stripe"] = incassiCarta?.charges_enabled
      ? { status: "connected", detail: t("Incassi attivi") }
      : incassiCarta?.connected
        ? { status: "warning", detail: t("Configurazione da completare") }
        : { status: "disconnected", detail: null };

    // A saved credential is configuration, not evidence of a working client.
    for (const client of ["claude", "chatgpt"] as const) {
      result[client] = aiGrantsError || (client === "claude" && aiKeysError)
        ? { status: "warning", detail: t("Stato non verificabile · riprova") }
        : aiGrantsLoading || (client === "claude" && aiKeysLoading)
          ? { status: "warning", detail: t("Verifica collegamenti…") }
          : statoCollegamentoAi(client, aiGrants, aiKeys);
    }

    return result;
  }, [
    numeriWhatsApp,
    numeriWhatsAppInErrore,
    metaIntegration,
    gbpConnection,
    googleAdsIntegration,
    emailConnections,
    caselleTeam.isAdmin,
    caselleTeam.righe,
    calendariTeam.isAdmin,
    calendariTeam.righe,
    mieiCalendari,
    domini.daSistemare,
    contiBanca,
    incassiCarta,
    aiKeys, aiGrants, aiKeysError, aiGrantsError, aiKeysLoading, aiGrantsLoading,
    t,
  ]);

  // ── Stale token warnings (>60gg) ──────────────────────────────────────────
  const staleTokenWarnings = useMemo(() => {
    const warnings: Array<{ nome: string; giorni: number }> = [];
    if (gcalConnection?.status === "connected" && (gcalConnection as any).updated_at) {
      const ageDays = Math.floor(
        (Date.now() - new Date((gcalConnection as any).updated_at).getTime()) / 86400000,
      );
      if (ageDays > TOKEN_STALE_DAYS) warnings.push({ nome: "Google Calendar", giorni: ageDays });
    }
    if (appleCalConnection?.status === "connected" && (appleCalConnection as any).updated_at) {
      const ageDays = Math.floor(
        (Date.now() - new Date((appleCalConnection as any).updated_at).getTime()) / 86400000,
      );
      if (ageDays > TOKEN_STALE_DAYS) warnings.push({ nome: "Apple Calendar", giorni: ageDays });
    }
    if (
      outlookCalConnection?.status === "connected" &&
      outlookCalConnection.giorniDalRinnovo !== null &&
      outlookCalConnection.giorniDalRinnovo > TOKEN_STALE_DAYS
    ) {
      warnings.push({ nome: "Outlook", giorni: outlookCalConnection.giorniDalRinnovo });
    }
    return warnings;
  }, [gcalConnection, appleCalConnection, outlookCalConnection]);

  // ── "Risolvi problemi" Meta (stile GHL) + wizard con passo iniziale ───────
  // metaWizardStep = null → chiuso; "oauth" → ri-consenso permessi (Ricollega);
  // "forms" → gestione moduli lead diretta dal kebab.
  const [metaTroubleshootOpen, setMetaTroubleshootOpen] = useState(false);
  const [metaWizardStep, setMetaWizardStep] = useState<MetaWizardStep | null>(null);
  const [metaOpenDisconnect, setMetaOpenDisconnect] = useState(false);
  const handleTroubleshoot = (item: IntegrationItem) => {
    if (item.id === "meta") setMetaTroubleshootOpen(true);
  };
  const handleManageForms = (item: IntegrationItem) => {
    if (item.id === "meta") setMetaWizardStep("forms");
  };

  // ── Da sistemare: un problema per riga, dal più grave ─────────────────────
  const daSistemare = useMemo(() => {
    const voci: VoceDaSistemare[] = [];
    const apri = (id: string, scheda?: string) => () => setPopup({ id, scheda });
    const profilo = (scheda: "calendari" | "email") => () =>
      navigate(`/azienda/impostazioni/mio-profilo?tab=${scheda}`);

    if (statuses.meta?.daRicollegare) {
      voci.push({
        id: "meta",
        Logo: MetaAssetLogo,
        titolo: t("Facebook e Instagram"),
        messaggio: t("Meta ha chiuso il collegamento: lead e messaggi non arrivano finché non lo ricolleghi."),
        azione: t("Ricollega"),
        onAzione: () => setMetaWizardStep("oauth"),
      });
    } else if (statuses.meta?.status === "error") {
      voci.push({
        id: "meta",
        Logo: MetaAssetLogo,
        titolo: t("Facebook e Instagram"),
        messaggio: t("Il collegamento non funziona più: lead e messaggi non arrivano. Controlla i permessi o ricollegalo."),
        azione: t("Risolvi"),
        onAzione: () => setMetaTroubleshootOpen(true),
      });
    }

    if (visibile.banca) {
      for (const c of contiBanca.filter(contoDaRicollegare)) {
        const giorni = giorniAllaScadenza(c);
        voci.push({
          id: `banca-${c.id}`,
          Logo: BancaLogo,
          titolo: c.institution_name ?? t("Conto bancario"),
          messaggio:
            c.status === "expired"
              ? t("Il consenso della banca è scaduto: i movimenti non arrivano più.")
              : c.status === "error"
                ? t("La banca segnala un errore: i movimenti potrebbero non arrivare.")
                : giorni <= 0
                  ? t("Il consenso della banca scade oggi: ricollega il conto, così i movimenti non si fermano.")
                  : t(giorni === 1 ? "Il consenso della banca scade fra {n} giorno: ricollega il conto prima." : "Il consenso della banca scade fra {n} giorni: ricollega il conto prima.", { n: giorni }),
          azione: t("Ricollega"),
          onAzione: apri("banca"),
        });
      }
    }

    // Caselle: del team per gli amministratori, le proprie per gli altri.
    const caselleGuaste = caselleTeam.isAdmin
      ? caselleTeam.righe.filter((r) => casellaDaRicollegare(r.status))
      : [];
    if (caselleGuaste.length > 0) {
      voci.push({
        id: "caselle",
        Logo: EmailLogo,
        titolo: t("Caselle email"),
        messaggio: caselleGuaste.length === 1
          ? t("{n} casella da ricollegare ({nomi}): finché non si ricollega, la posta non arriva nel gestionale.", { n: 1, nomi: elencoNomi(caselleGuaste.map(nomeTitolareCasella), t) })
          : t("{n} caselle da ricollegare ({nomi}): finché non si ricollegano, la posta non arriva nel gestionale.", { n: caselleGuaste.length, nomi: elencoNomi(caselleGuaste.map(nomeTitolareCasella), t) }),
        azione: t("Vedi"),
        onAzione: apri("email", "caselle"),
      });
    }
    const mieGuaste = caselleTeam.isAdmin ? [] : emailConnections.filter((c) => casellaDaRicollegare(c.status ?? ""));
    if (mieGuaste.length > 0) {
      voci.push({
        id: "mie-caselle",
        Logo: EmailLogo,
        titolo: mieGuaste.length === 1 ? t("La tua casella email") : t("Le tue caselle email"),
        messaggio: t("{caselle}: il collegamento si è interrotto, la posta non arriva nel gestionale.", { caselle: mieGuaste.map((c) => c.email_address).join(", ") }),
        azione: t("Ricollega"),
        onAzione: profilo("email"),
      });
    }

    // Calendari: stesso schema.
    const calendariGuasti = calendariTeam.isAdmin
      ? calendariTeam.righe.filter((r) => calendarioDaRicollegare(r.status))
      : [];
    if (calendariGuasti.length > 0) {
      voci.push({
        id: "calendari",
        Logo: CalendariLogo,
        titolo: t("Calendari"),
        messaggio: calendariGuasti.length === 1
          ? t("{n} calendario da ricollegare ({nomi}): finché non si ricollega, gli appuntamenti non arrivano.", { n: 1, nomi: elencoNomi(calendariGuasti.map((r) => r.nome), t) })
          : t("{n} calendari da ricollegare ({nomi}): finché non si ricollegano, gli appuntamenti non arrivano.", { n: calendariGuasti.length, nomi: elencoNomi(calendariGuasti.map((r) => r.nome), t) }),
        azione: t("Vedi"),
        onAzione: apri("calendari"),
      });
    }
    const mieiGuasti = calendariTeam.isAdmin ? [] : mieiCalendari.filter((x) => calendarioDaRicollegare(x.status));
    if (mieiGuasti.length > 0) {
      voci.push({
        id: "miei-calendari",
        Logo: CalendariLogo,
        titolo: t("Il tuo calendario"),
        messaggio: t("{calendari}: l'accesso si è interrotto, gli appuntamenti non arrivano.", { calendari: mieiGuasti.map((x) => x.nome).join(` ${t("e")} `) }),
        azione: t("Ricollega"),
        onAzione: profilo("calendari"),
      });
    }

    if (domini.daSistemare.length > 0) {
      const uno = domini.daSistemare.length === 1;
      voci.push({
        id: "domini",
        Logo: EmailLogo,
        titolo: uno ? t("Dominio casella {dominio}", { dominio: domini.daSistemare[0].dominio }) : t("Domini delle caselle collegate"),
        messaggio: uno
          ? t("Mancano record DNS (SPF, DKIM o DMARC), le email rischiano di finire in spam.")
          : t("{n} domini: mancano record DNS (SPF, DKIM o DMARC), le email rischiano di finire in spam.", { n: domini.daSistemare.length }),
        azione: t("Vedi i record"),
        onAzione: apri("email", "dominio"),
      });
    }

    const gads = statuses["google-ads"]?.status;
    if (gads === "error" || gads === "pending") {
      voci.push({
        id: "google-ads",
        Logo: GoogleAdsLogo,
        titolo: "Google Ads",
        messaggio:
          gads === "error"
            ? t("Il collegamento non funziona più: ricollegalo.")
            : t("Il collegamento segnala un problema: le conversioni potrebbero non arrivare a Google."),
        azione: t("Apri"),
        onAzione: apri("google-ads"),
      });
    }

    if (visibile.stripe && statuses.stripe?.status === "warning") {
      voci.push({
        id: "stripe",
        Logo: CartaLogo,
        titolo: t("Pagamenti con carta"),
        messaggio: t("La verifica su Stripe non è finita: gli incassi con carta non sono ancora attivi."),
        azione: t("Completa"),
        onAzione: apri("stripe"),
      });
    }

    if (staleTokenWarnings.length > 0) {
      const uno = staleTokenWarnings.length === 1;
      voci.push({
        id: "token-calendario",
        Logo: CalendariLogo,
        titolo: uno ? t("Il tuo {nome}", { nome: staleTokenWarnings[0].nome }) : t("I tuoi calendari"),
        messaggio: uno
          ? t("L'accesso non si rinnova da {giorni} giorni: se gli appuntamenti non arrivano, ricollegalo.", { giorni: staleTokenWarnings[0].giorni })
          : t("{calendari}: l'accesso non si rinnova da più di {giorni} giorni. Se gli appuntamenti non arrivano, ricollegali.", { calendari: staleTokenWarnings.map((w) => w.nome).join(` ${t("e")} `), giorni: TOKEN_STALE_DAYS }),
        azione: t("Apri profilo"),
        onAzione: profilo("calendari"),
      });
    }

    return voci;
  }, [
    statuses,
    visibile.banca,
    visibile.stripe,
    contiBanca,
    caselleTeam.isAdmin,
    caselleTeam.righe,
    emailConnections,
    calendariTeam.isAdmin,
    calendariTeam.righe,
    mieiCalendari,
    domini.daSistemare,
    staleTokenWarnings,
    navigate,
    t,
  ]);

  // ── Popup + wizard registry ───────────────────────────────────────────────
  const externalWizardRegistry = useMemo(
    () => ({
      meta: makeMetaWizardWrapper(metaIntegration, () => {
        refetchIntegrations();
        queryClient.invalidateQueries({ queryKey: ["integrations", companyId] });
      }),
    }),
    [metaIntegration, refetchIntegrations, queryClient, companyId],
  );

  const popupRegistry = useMemo(
    () => ({
      "google-business": GbpPopupContent,
      "google-ads": GoogleAdsPopupContent,
      claude: ConnettoreClaudePopup,
      chatgpt: ConnettoreChatGptPopup,
      email: CaselleEmailPopup,
      calendari: CalendariPopup,
      banca: ContiBancariPopup,
      stripe: IncassiCartaPopup,
    }),
    [],
  );

  // ── Disconnect handler ────────────────────────────────────────────────────
  // «Disconnetti» nel menu c'è solo per Meta (vedi `senzaDisconnetti` nel catalogo): il suo wizard si apre già sulla
  // conferma di disconnessione. Prima c'era anche per Claude, ChatGPT, WhatsApp e Google, ma lì mostrava solo un avviso
  // («Apri la pagina dell'integrazione…») e portava altrove senza disconnettere niente.
  const handleDisconnect = (item: IntegrationItem) => {
    if (item.id !== "meta") return;
    setMetaOpenDisconnect(true);
    setMetaWizardStep("pages");
  };

  return (
    <div className="space-y-5">
      {/* Stato caricamento / errore della query principale integrations */}
      {isErrorIntegrations ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-sm">{t("Errore di caricamento")}</AlertTitle>
          <AlertDescription className="text-xs">
            {t("Errore nel caricamento delle integrazioni. Riprova.")}
          </AlertDescription>
        </Alert>
      ) : isLoadingIntegrations ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-28 rounded-xl border bg-muted/40 animate-pulse"
            />
          ))}
        </div>
      ) : null}

      {/* Alert sola lettura */}
      {!canManageIntegrations && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle className="text-sm">{t("Stai solo consultando")}</AlertTitle>
          <AlertDescription className="text-xs">
            {t("Vedi se ogni integrazione è collegata o ha un problema. Per collegarla, ricollegarla o scollegarla serve il permesso «Integrazioni & Canali» in modifica (o essere amministratore).")}
          </AlertDescription>
        </Alert>
      )}

      {/* Quello che non funziona, prima di tutto il resto */}
      <IntegrazioniDaSistemare voci={daSistemare} conAzioni={canManageIntegrations} />

      {/* Grid integrazioni: una scheda per integrazione, i dettagli nel popup */}
      <IntegrationsGrid
        items={catalogo}
        statuses={statuses}
        canManage={canManageIntegrations}
        popupRegistry={popupRegistry}
        externalWizardRegistry={externalWizardRegistry}
        onDisconnect={handleDisconnect}
        onTroubleshoot={handleTroubleshoot}
        onManageForms={handleManageForms}
        onRicollega={(item) => { if (item.id === "meta") setMetaWizardStep("oauth"); }}
        popup={popup}
        onPopupChange={setPopup}
      />

      {/* "Risolvi problemi" Meta: autorizzazioni, pagine mancanti, backfill lead */}
      <MetaTroubleshootDialog
        open={metaTroubleshootOpen}
        onOpenChange={setMetaTroubleshootOpen}
        integration={metaIntegration}
        onReconnect={() => setMetaWizardStep("oauth")}
      />
      {/* Wizard Meta con passo iniziale: "oauth" (Ricollega) o "forms" (Moduli lead) */}
      <MetaIntegrationWizard
        open={metaWizardStep !== null}
        onOpenChange={(v) => { if (!v) { setMetaWizardStep(null); setMetaOpenDisconnect(false); } }}
        integration={metaIntegration}
        initialStep={metaWizardStep ?? undefined}
        openDisconnect={metaOpenDisconnect}
        onComplete={() => {
          refetchIntegrations();
          queryClient.invalidateQueries({ queryKey: ["integrations", companyId] });
        }}
      />
    </div>
  );
}
