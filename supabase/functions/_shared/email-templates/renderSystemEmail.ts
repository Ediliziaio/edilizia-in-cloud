// Renderer unico per le 58 email di sistema (copy riscritti dall'utente).
// Sorgente: system-emails.generated.ts (rigenerato dal mockup HTML).
//
// Uso:
//   import { renderSystemEmail } from "../_shared/email-templates/renderSystemEmail.ts";
//   const { subject, html } = renderSystemEmail("benvenuto-azienda-1", {
//     nome_azienda: company.name,
//     nome_utente: profile.first_name,
//     ruolo: "Amministratore",
//   }, { brandColor: branding.primaryColor, brandName: company.name, eicName: "Edilizia in Cloud" });
//
// I token non forniti restano visibili come {token} (così in dev si nota il dato mancante);
// passare `stripUnresolved: true` per ripulirli prima dell'invio in produzione.

import { SYSTEM_EMAILS, SystemEmailDef } from "./system-emails.generated.ts";

export type SystemEmailVars = Record<string, string | number | null | undefined>;

export interface RenderSystemEmailOpts {
  /** Colore brand HEX (es. #F97316). Se passato e l'email è brand="azienda", sostituisce l'arancio default. */
  brandColor?: string;
  /** Nome brand mostrato in testata per le email brand="azienda" (di norma = nome_azienda). */
  brandName?: string;
  /** Email di supporto/assistenza usata come fallback per {email_supporto}. */
  supportEmail?: string;
  /** Base URL app per i link (default https://app.ediliziaincloud.com). */
  appBaseUrl?: string;
  /** Rimuove eventuali token {non_risolti} residui prima dell'invio. */
  stripUnresolved?: boolean;
}

const DEFAULT_ORANGE = "#F97316";
const escAttr = (s: string) => s.replace(/"/g, "&quot;");

function applyVars(input: string, vars: SystemEmailVars): string {
  let out = input;
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined || v === null) continue;
    out = out.split("{" + k + "}").join(String(v));
  }
  return out;
}

export function getSystemEmail(key: string): SystemEmailDef | null {
  return (SYSTEM_EMAILS as Record<string, SystemEmailDef>)[key] ?? null;
}

export function renderSystemEmail(
  key: string,
  vars: SystemEmailVars = {},
  opts: RenderSystemEmailOpts = {},
): { subject: string; html: string; def: SystemEmailDef } {
  const def = getSystemEmail(key);
  if (!def) throw new Error(`renderSystemEmail: chiave email sconosciuta "${key}"`);

  // Default sensati per token comuni se non passati dal chiamante
  const merged: SystemEmailVars = {
    email_supporto: opts.supportEmail ?? "assistenza@ediliziaincloud.it",
    ...vars,
  };

  // Sostituisci il base URL nei link placeholder
  const appBase = opts.appBaseUrl ?? "https://app.ediliziaincloud.com";

  let subject = applyVars(def.subject, merged);
  let html = applyVars(def.html, merged);
  html = html.split("https://app.ediliziaincloud.com").join(appBase);

  // White-label: solo per email a brand azienda, tematizza il colore
  if (def.brand === "azienda" && opts.brandColor && /^#[0-9a-fA-F]{6}$/.test(opts.brandColor)) {
    html = html.split(DEFAULT_ORANGE).join(opts.brandColor);
  }
  // Nome brand in testata (le email azienda usano già {nome_azienda}; questo è un fallback)
  if (def.brand === "azienda" && opts.brandName) {
    html = applyVars(html, { nome_azienda: opts.brandName });
  }

  if (opts.stripUnresolved) {
    subject = subject.replace(/\{[a-z0-9_]+\}/g, "");
    html = html.replace(/\{[a-z0-9_]+\}/g, "");
  }

  // escAttr riservato per usi futuri (evita lint unused)
  void escAttr;
  return { subject, html, def };
}
