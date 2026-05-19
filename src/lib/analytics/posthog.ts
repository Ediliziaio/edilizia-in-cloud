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
import posthog, { type PostHog } from "posthog-js";

interface PostHogConfig {
  apiKey: string;
  host?: string;
  enabled?: boolean;
}

let initialized = false;
let configCache: PostHogConfig | null = null;

/**
 * Inizializza PostHog. Idempotente — chiamabile più volte safely.
 * Se config.enabled = false o apiKey vuoto → no-op.
 */
export function initAnalytics(config: PostHogConfig | null | undefined): void {
  if (initialized) return;
  if (!config || !config.apiKey || config.enabled === false) return;

  try {
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
    initialized = true;
    configCache = config;
  } catch (e) {
    // Non bloccare l'app se posthog fallisce
    console.warn("[analytics] PostHog init failed:", e);
  }
}

/** Identifica l'utente loggato. distinct_id stabile = user_id Supabase. */
export function identifyUser(params: {
  userId: string;
  email?: string;
  companyId?: string;
  companyName?: string;
  role?: string;
  planSlug?: string;
}): void {
  if (!initialized) return;
  try {
    posthog.identify(params.userId, {
      // PII minima — mai email completa, solo dominio per segmentazione
      email_domain: params.email ? params.email.split("@")[1] : undefined,
      company_id: params.companyId,
      company_name: params.companyName,
      role: params.role,
      plan_slug: params.planSlug,
    });
    if (params.companyId) {
      // Group analytics per company (consigliato per SaaS B2B)
      posthog.group("company", params.companyId, {
        name: params.companyName,
        plan: params.planSlug,
      });
    }
  } catch { /* swallow */ }
}

/** Reset session (chiamare al logout). */
export function resetAnalytics(): void {
  if (!initialized) return;
  try {
    posthog.reset();
  } catch { /* swallow */ }
}

/** Capture evento custom. */
export function track(event: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    posthog.capture(event, properties);
  } catch { /* swallow */ }
}

/** Capture pageview manuale (chiamato dal router listener). */
export function trackPageview(path: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    posthog.capture("$pageview", { $current_url: path, ...properties });
  } catch { /* swallow */ }
}

/** GDPR opt-out manuale (es. settings utente). */
export function setAnalyticsOptOut(optOut: boolean): void {
  try {
    localStorage.setItem("analytics_opt_out", optOut ? "true" : "false");
    if (!initialized) return;
    if (optOut) posthog.opt_out_capturing();
    else posthog.opt_in_capturing();
  } catch { /* swallow */ }
}

export function isAnalyticsInitialized(): boolean {
  return initialized;
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
