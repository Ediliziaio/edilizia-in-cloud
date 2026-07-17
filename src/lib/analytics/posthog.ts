/**
 * PostHog client wrapper — v8.6.89
 *
 * Inizializzazione SAFE: se la API key non è configurata in platform_settings,
 * tutte le chiamate diventano no-op. Zero errori, zero overhead.
 *
 * Self-hosting friendly: l'host PostHog è configurabile (default EU cloud
 * https://eu.i.posthog.com). Niente lock-in.
 *
 * Privacy GDPR:
 *  - sanitize: maschera email/telefono/P.IVA negli eventi
 *  - autocapture: limitato (no input fields, no dom-text)
 *  - opt-out: utenti possono disabilitarlo da "Privacy settings"
 *  - session_recording disabilitato di default
 */
// posthog-js è caricato DINAMICAMENTE dentro initAnalytics(): questa facade è
// importata da AnalyticsProvider (montato in App) e un import statico
// trascinerebbe la libreria nel chunk d'ingresso. Gli eventi emessi tra la
// richiesta di init e il load del modulo vengono accodati e flushati in ordine,
// così il primo identify/pageview della sessione non va perso.
import type { PostHog } from "posthog-js";

interface PostHogConfig {
  apiKey: string;
  host?: string;
  enabled?: boolean;
}

let posthogMod: PostHog | null = null;
let initStarted = false;
let configCache: PostHogConfig | null = null;
let pending: Array<(ph: PostHog) => void> = [];

/**
 * Esegue subito se il client è pronto, accoda se l'init è in corso,
 * scarta se PostHog non è configurato (stesso no-op di prima).
 */
function withPostHog(fn: (ph: PostHog) => void): void {
  if (posthogMod) {
    try {
      fn(posthogMod);
    } catch { /* swallow */ }
    return;
  }
  if (initStarted) pending.push(fn);
}

/**
 * Inizializza PostHog. Idempotente — chiamabile più volte safely.
 * Se config.enabled = false o apiKey vuoto → no-op.
 */
export async function initAnalytics(config: PostHogConfig | null | undefined): Promise<void> {
  if (initStarted) return;
  if (!config || !config.apiKey || config.enabled === false) return;
  initStarted = true;

  try {
    const { default: posthog } = await import("posthog-js");
    posthog.init(config.apiKey, {
      api_host: config.host ?? "https://eu.i.posthog.com",
      // ── Privacy hardening ─────────────────────────────────────────
      autocapture: {
        // Cattura solo click su element con data-analytics o button
        css_selector_allowlist: ["[data-analytics]", "button", "a[href]"],
        dom_event_allowlist: ["click", "submit"],
        // NON catturare input fields (privacy)
        element_allowlist: ["button", "a", "form"],
      },
      // session_recording disabilitato finché non lo richiediamo esplicitamente
      disable_session_recording: true,
      // Persist solo localStorage (no cookie sub-domain leak)
      persistence: "localStorage",
      // Capture pageviews via SPA navigation (NON automatico — facciamo manuale)
      capture_pageview: false,
      capture_pageleave: true,
      // Bootstrap distinct_id: stabile per utente loggato (vedi identifyUser)
      bootstrap: {},
      // No debug in production
      debug: false,
      // Loaded callback
      loaded: (ph: PostHog) => {
        // GDPR opt-out: rispetta scelta utente persistita
        if (typeof window !== "undefined" && localStorage.getItem("analytics_opt_out") === "true") {
          ph.opt_out_capturing();
        }
      },
    });
    posthogMod = posthog;
    configCache = config;
    // Flush della coda pre-init nell'ordine di emissione (identify → pageview…).
    const queued = pending;
    pending = [];
    queued.forEach((fn) => {
      try {
        fn(posthog);
      } catch { /* swallow */ }
    });
  } catch (e) {
    // Non bloccare l'app se posthog fallisce
    pending = [];
    console.warn("[analytics] PostHog init failed:", e);
  }
}

// Track ultima company assegnata per detectare switch (impersonation toggle)
let lastIdentifiedCompanyId: string | null = null;

/** Identifica l'utente loggato. distinct_id stabile = user_id Supabase. */
export function identifyUser(params: {
  userId: string;
  email?: string;
  companyId?: string;
  companyName?: string;
  role?: string;
  planSlug?: string;
}): void {
  withPostHog((ph) => {
    ph.identify(params.userId, {
      // PII minima — mai email completa, solo dominio per segmentazione
      email_domain: params.email ? params.email.split("@")[1] : undefined,
      company_id: params.companyId,
      company_name: params.companyName,
      role: params.role,
      plan_slug: params.planSlug,
    });
    // v8.6.96 — Group switch: se la company è cambiata (impersonation), resetta
    // i group precedenti per evitare leak di eventi in dashboard sbagliata.
    if (params.companyId !== lastIdentifiedCompanyId) {
      // resetGroups() rilascia tutti i group precedenti
      ph.resetGroups?.();
      lastIdentifiedCompanyId = params.companyId ?? null;
    }
    if (params.companyId) {
      ph.group("company", params.companyId, {
        name: params.companyName,
        plan: params.planSlug,
      });
    }
  });
}

/** Reset session (chiamare al logout). */
export function resetAnalytics(): void {
  withPostHog((ph) => {
    ph.reset();
    lastIdentifiedCompanyId = null;
  });
}

/** Capture evento custom. */
export function track(event: string, properties?: Record<string, unknown>): void {
  withPostHog((ph) => {
    ph.capture(event, properties);
  });
}

/** Capture pageview manuale (chiamato dal router listener). */
export function trackPageview(path: string, properties?: Record<string, unknown>): void {
  withPostHog((ph) => {
    ph.capture("$pageview", { $current_url: path, ...properties });
  });
}

/** GDPR opt-out manuale (es. settings utente). */
export function setAnalyticsOptOut(optOut: boolean): void {
  try {
    localStorage.setItem("analytics_opt_out", optOut ? "true" : "false");
  } catch { /* swallow */ }
  withPostHog((ph) => {
    if (optOut) ph.opt_out_capturing();
    else ph.opt_in_capturing();
  });
}

export function isAnalyticsInitialized(): boolean {
  return posthogMod !== null;
}

export function getAnalyticsConfig(): PostHogConfig | null {
  return configCache;
}

// ── Eventi standard EiC ─────────────────────────────────────────────────────
// Costanti per evitare typo + uniformità tra tab.
export const ANALYTICS_EVENTS = {
  // Lifecycle account
  SIGNUP_COMPLETED: "signup_completed",
  ONBOARDING_STEP_COMPLETED: "onboarding_step_completed",
  ONBOARDING_FULLY_COMPLETED: "onboarding_fully_completed",
  // Activation milestones
  FIRST_CUSTOMER_CREATED: "first_customer_created",
  FIRST_ORDER_CREATED: "first_order_created",
  FIRST_QUOTE_CREATED: "first_quote_created",
  FIRST_RENDER_GENERATED: "first_render_generated",
  TEAM_MEMBER_INVITED: "team_member_invited",
  // Conversion
  UPGRADE_CTA_CLICKED: "upgrade_cta_clicked",
  PLAN_CHANGED: "plan_changed",
  TRIAL_EXTENDED: "trial_extended",
  // Engagement quotidiano
  ORDER_CREATED: "order_created",
  RENDER_GENERATED: "render_generated",
  INVOICE_SENT: "invoice_sent",
  // Churn signals
  PAYMENT_FAILED: "payment_failed",
  SUBSCRIPTION_CANCELED: "subscription_canceled",
  // Demo / preview
  PREVIEW_FEATURE_BLOCKED: "preview_feature_blocked",
  UNLOCK_REQUESTED: "unlock_requested",
} as const;

export type AnalyticsEvent = typeof ANALYTICS_EVENTS[keyof typeof ANALYTICS_EVENTS];
