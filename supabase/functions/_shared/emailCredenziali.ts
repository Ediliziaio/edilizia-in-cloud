/**
 * emailCredenziali — corpo unico delle email che consegnano un accesso.
 *
 * Fino al 10 settembre 2026 ognuna di queste email era HTML scritto a mano
 * dentro la sua edge function, e quattro su cinque non avevano né il logo né
 * il pulsante per entrare: «Password reimpostata» consegnava la password
 * nuova e nessuna porta da aprire, e chi la riceveva restava fermo (il caso
 * di Venusia e Antonella di BeMade, 10/09/2026). Il link d'accesso non è un
 * ornamento: è l'unica cosa che un'email di credenziali deve garantire, per
 * questo `ctaUrl` ha un default e non un ramo che lo salta.
 */

import { escapeHtml } from "./email-templates/types.ts";
import type { BrandingConfig } from "./getBranding.ts";

/** Pagina di accesso della piattaforma (o del dominio white-label). */
export function urlAccesso(branding: BrandingConfig): string {
  return `${branding.siteUrl.replace(/\/+$/, "")}/login`;
}

export interface CredenzialiOpts {
  branding: BrandingConfig;
  /** Titolo grande in cima (es. "Password reimpostata"). */
  titolo: string;
  /** "Ciao Venusia," — omesso se il nome non c'è. */
  saluto?: string | null;
  /** Frase introduttiva, testo semplice. */
  intro: string;
  /** Riquadro credenziali: mostrato solo se c'è almeno uno dei due. */
  email?: string | null;
  password?: string | null;
  /** Etichetta della password nel riquadro. */
  etichettaPassword?: string;
  /** Riga rossa di avvertimento (es. cambio password al primo accesso). */
  avviso?: string | null;
  ctaLabel?: string;
  /** Default: la pagina di login. Non passarlo è la scelta giusta quasi sempre. */
  ctaUrl?: string;
  /** Frase finale sotto il pulsante. */
  chiusura?: string | null;
}

export function emailCredenziali(o: CredenzialiOpts): { html: string; text: string } {
  const b = o.branding;
  const nomePiattaforma = escapeHtml(b.platformName);
  const colore = b.primaryColor || "#F97415";
  const logo = b.emailHeaderLogo || b.logoUrl;
  const ctaUrl = o.ctaUrl ?? urlAccesso(b);
  const ctaLabel = escapeHtml(o.ctaLabel ?? "Accedi alla piattaforma");
  const etichettaPassword = escapeHtml(o.etichettaPassword ?? "Password temporanea");
  const mostraRiquadro = Boolean(o.email || o.password);

  const rigaEmail = o.email
    ? `    <tr><td style="padding:8px 0;">
      <span style="color:#64748b;font-size:13px;">Email</span><br>
      <strong style="color:#0f172a;font-size:15px;">${escapeHtml(o.email)}</strong>
    </td></tr>`
    : "";
  const rigaPassword = o.password
    ? `    <tr><td style="padding:8px 0;${o.email ? "border-top:1px solid #e2e8f0;" : ""}">
      <span style="color:#64748b;font-size:13px;">${etichettaPassword}</span><br>
      <strong style="color:#0f172a;font-size:15px;font-family:monospace;">${escapeHtml(o.password)}</strong>
    </td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(o.titolo)}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="background:#0f172a;padding:24px 32px;text-align:center;">
  ${logo ? `<img src="${logo}" alt="${nomePiattaforma}" style="height:40px;max-width:200px;object-fit:contain;" />` : `<span style="color:#ffffff;font-size:20px;font-weight:700;">${nomePiattaforma}</span>`}
</td></tr>
<tr><td style="padding:32px;">
  <h2 style="color:#0f172a;font-size:22px;margin:0 0 16px;">${escapeHtml(o.titolo)}</h2>
  ${o.saluto ? `<p style="color:#0f172a;font-size:15px;line-height:1.6;margin:0 0 12px;">Ciao ${escapeHtml(o.saluto)},</p>` : ""}
  <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">${escapeHtml(o.intro)}</p>
  ${mostraRiquadro ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:20px;margin-bottom:24px;">
${rigaEmail}
${rigaPassword}
  </table>` : ""}
  ${o.avviso ? `<p style="color:#ef4444;font-size:13px;margin:0 0 24px;">⚠️ ${escapeHtml(o.avviso)}</p>` : ""}
  <table width="100%"><tr><td style="text-align:center;">
    <a href="${ctaUrl}" style="display:inline-block;background:${colore};color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:15px;">
      ${ctaLabel}
    </a>
  </td></tr></table>
  <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:20px 0 0;text-align:center;">
    Se il pulsante non funziona, copia questo indirizzo nel browser:<br>
    <span style="color:#64748b;">${ctaUrl}</span>
  </p>
  ${o.chiusura ? `<p style="color:#475569;font-size:14px;line-height:1.6;margin:24px 0 0;">${escapeHtml(o.chiusura)}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #f1f5f9;text-align:center;">
  <p style="color:#94a3b8;font-size:12px;margin:0;">Questo è un messaggio automatico di ${nomePiattaforma}.</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

  const righe = [
    o.saluto ? `Ciao ${o.saluto},` : null,
    o.intro,
    o.email ? `Email: ${o.email}` : null,
    o.password ? `${o.etichettaPassword ?? "Password temporanea"}: ${o.password}` : null,
    o.avviso ? `Attenzione: ${o.avviso}` : null,
    `${o.ctaLabel ?? "Accedi alla piattaforma"}: ${ctaUrl}`,
    o.chiusura,
  ].filter(Boolean);

  return { html, text: righe.join("\n\n") };
}
