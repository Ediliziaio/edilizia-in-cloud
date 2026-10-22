/**
 * Le email della firma elettronica, tutte con lo stesso aspetto (22/10/2026).
 *
 * Prima erano quattro email con quattro stili (blu, arancione, testo nudo), il
 * messaggio personalizzato dell'ufficio entrava nell'HTML così com'era, e
 * all'invio partivano due email insieme: l'offerta e il codice, che scadeva
 * dopo 10 minuti e il giorno dopo era inutile. Ora:
 *  - invito: un'email sola con il documento, l'importo, la scadenza e un
 *    bottone; il codice parte quando chi firma lo chiede dalla pagina;
 *  - codice: il codice grande, la durata, cosa fare se non l'hai chiesto tu;
 *  - copia firmata: chi, quando, il codice di verifica e dove controllarlo;
 *  - condizioni: la copia della dichiarazione accettata (firma avanzata);
 *  - avviso all'azienda: il documento è stato firmato.
 * Tutto passa da `renderLayout` (tabelle e stili in linea: Outlook, Gmail,
 * telefono), col logo e il colore dell'azienda, e ogni testo dinamico è
 * ripulito. Niente parole tecniche: «codice», non «OTP».
 */
import { loadBranding } from "./renderTemplate.ts";
import { renderButton, renderLayout } from "./email-templates/layout.ts";
import { escapeHtml, type Branding } from "./email-templates/types.ts";

export interface BrandingFirma {
  branding: Branding;
  telefono: string | null;
  email: string | null;
}

export interface EmailPronta {
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

// deno-lint-ignore no-explicit-any
export async function brandingFirma(sb: any, companyId: string): Promise<BrandingFirma> {
  const [branding, { data: azienda }] = await Promise.all([
    loadBranding(companyId, sb),
    sb.from("companies").select("name, phone, email").eq("id", companyId).maybeSingle(),
  ]);
  // La firma riguarda l'azienda: il nome è quello vero, non il mittente generico.
  if (azienda?.name) branding.companyName = azienda.name;
  return { branding, telefono: azienda?.phone ?? null, email: azienda?.email ?? null };
}

const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
export const dataOra = (iso: string) => new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
}).format(new Date(iso));
export const dataSola = (d: Date | string) => new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome", day: "2-digit", month: "long", year: "numeric",
}).format(new Date(d));

const p = (html: string, stile = "") => `<p style="margin:0 0 14px 0;${stile}">${html}</p>`;
const titolo = (t: string) =>
  `<h1 class="h-title" style="margin:0 0 18px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:30px;color:#111827;">${escapeHtml(t)}</h1>`;

/** Riquadro grigio con righe «etichetta: valore». */
function riepilogo(righe: Array<[string, string | null | undefined]>, colore: string): string {
  const celle = righe.filter(([, v]) => v).map(([k, v]) => `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6B7280;width:38%;vertical-align:top;">${escapeHtml(k)}</td>
      <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;vertical-align:top;">${escapeHtml(v)}</td>
    </tr>`).join("");
  return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"
    style="margin:6px 0 4px 0;background:#F8FAFC;border-left:4px solid ${colore};border-radius:6px;">
    <tr><td style="padding:12px 16px;"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${celle}</table></td></tr>
  </table>`;
}

/** Chi contattare: telefono ed email dell'azienda, se ci sono. */
function contatti(b: BrandingFirma): string {
  const voci = [
    b.telefono ? `<a href="tel:${escapeHtml(b.telefono.replace(/\s+/g, ""))}" style="color:#374151;">${escapeHtml(b.telefono)}</a>` : "",
    b.email ? `<a href="mailto:${escapeHtml(b.email)}" style="color:#374151;">${escapeHtml(b.email)}</a>` : "",
  ].filter(Boolean);
  if (!voci.length) return "";
  return p(`Per qualsiasi domanda: ${voci.join(" · ")}`, "font-size:13px;color:#6B7280;margin-top:22px;");
}
const contattiTesto = (b: BrandingFirma) =>
  [b.telefono, b.email].filter(Boolean).length ? `\nPer qualsiasi domanda: ${[b.telefono, b.email].filter(Boolean).join(" · ")}` : "";

/** Il messaggio scritto dall'ufficio: testo ripulito, a capo rispettati. */
function messaggio(t: string | null | undefined, colore: string): string {
  const pulito = (t ?? "").trim();
  if (!pulito) return "";
  return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:0 0 18px 0;">
    <tr><td style="padding:12px 16px;border-left:3px solid ${colore};background:#FFFFFF;font-size:14px;line-height:1.6;color:#374151;">
      ${escapeHtml(pulito).replace(/\n/g, "<br/>")}
    </td></tr></table>`;
}

const piccolo = (html: string) => p(html, "font-size:12px;color:#9CA3AF;line-height:1.5;");
const linkVisibile = (url: string) =>
  piccolo(`Se il bottone non si apre, copia questo indirizzo nel browser:<br/><a href="${escapeHtml(url)}" style="color:#6B7280;word-break:break-all;">${escapeHtml(url)}</a>`);

// ── Invito a firmare ────────────────────────────────────────────────────────
export function emailInvitoFirma(b: BrandingFirma, d: {
  nome: string;
  documento: string;       // «Preventivo OFF-2026-010»
  oggetto?: string | null; // «Ristrutturazione bagno»
  importo?: number | null;
  scadenza: Date | string;
  link: string;
  messaggio?: string | null;
}): EmailPronta {
  const colore = b.branding.primaryColor;
  const html = renderLayout({
    branding: b.branding,
    fasciaSenzaLogo: true,
    preheaderText: `${d.documento} da firmare entro il ${dataSola(d.scadenza)}`,
    innerBodyHtml: [
      titolo(`${d.documento} da firmare`),
      p(`Gentile ${escapeHtml(d.nome)},`),
      p(`${escapeHtml(b.branding.companyName)} le ha inviato un documento da leggere e firmare online. Ci vogliono un paio di minuti, dal telefono o dal computer.`),
      messaggio(d.messaggio, colore),
      riepilogo([
        ["Documento", d.documento],
        ["Oggetto", d.oggetto ?? null],
        ["Importo", d.importo != null && Number.isFinite(d.importo) && d.importo > 0 ? `${euro(d.importo)} IVA inclusa` : null],
        ["Da firmare entro il", dataSola(d.scadenza)],
      ], colore),
      renderButton({ label: "Leggi e firma", href: d.link, branding: b.branding }),
      p("Quando sarà pronto a firmare, le manderemo un codice di 6 cifre per email per confermare che è proprio lei.", "font-size:13px;color:#6B7280;"),
      linkVisibile(d.link),
      contatti(b),
    ].join("\n"),
  });
  const text = [
    `Gentile ${d.nome},`,
    `${b.branding.companyName} le ha inviato un documento da leggere e firmare online: ${d.documento}${d.oggetto ? ` (${d.oggetto})` : ""}.`,
    d.importo ? `Importo: ${euro(d.importo)} IVA inclusa.` : "",
    `Da firmare entro il ${dataSola(d.scadenza)}.`,
    d.messaggio?.trim() ? `\n${d.messaggio.trim()}\n` : "",
    `Leggi e firma: ${d.link}`,
    "Quando sarà pronto a firmare, le manderemo un codice di 6 cifre per email.",
    contattiTesto(b),
  ].filter(Boolean).join("\n");
  return { subject: `${d.documento} da firmare — ${b.branding.companyName}`, html, text, replyTo: b.email ?? undefined };
}

// ── Preventivo in PDF, senza firma online ──────────────────────────────────
export function emailPreventivoPdf(b: BrandingFirma, d: {
  nome: string; numero: string; oggetto?: string | null; importo?: number | null; messaggio?: string | null;
}): EmailPronta {
  const colore = b.branding.primaryColor;
  const html = renderLayout({
    branding: b.branding,
    fasciaSenzaLogo: true,
    preheaderText: `In allegato il preventivo ${d.numero}`,
    innerBodyHtml: [
      titolo(`Preventivo ${d.numero}`),
      p(`Gentile ${escapeHtml(d.nome)},`),
      p("in allegato trova il nostro preventivo in PDF."),
      messaggio(d.messaggio, colore),
      riepilogo([
        ["Preventivo", d.numero],
        ["Oggetto", d.oggetto ?? null],
        ["Importo", d.importo ? `${euro(d.importo)} IVA inclusa` : null],
      ], colore),
      p("Restiamo a disposizione per qualsiasi chiarimento."),
      p(`Cordiali saluti,<br/>${escapeHtml(b.branding.companyName)}`),
      contatti(b),
    ].join("\n"),
  });
  const text = [
    `Gentile ${d.nome},`,
    `in allegato trova il preventivo ${d.numero}${d.oggetto ? ` (${d.oggetto})` : ""}${d.importo ? `, ${euro(d.importo)} IVA inclusa` : ""}.`,
    d.messaggio?.trim() ?? "",
    `Cordiali saluti,\n${b.branding.companyName}`,
    contattiTesto(b),
  ].filter(Boolean).join("\n");
  return { subject: `Preventivo ${d.numero} — ${b.branding.companyName}`, html, text, replyTo: b.email ?? undefined };
}

// ── Codice per firmare ─────────────────────────────────────────────────────
export function emailCodiceFirma(b: BrandingFirma, d: { nome: string; codice: string; documento?: string | null; link: string }): EmailPronta {
  const cifre = d.codice.split("").join("&nbsp;");
  const html = renderLayout({
    branding: b.branding,
    fasciaSenzaLogo: true,
    preheaderText: `${d.codice} è il suo codice per firmare. Vale 10 minuti.`,
    innerBodyHtml: [
      titolo("Il suo codice per firmare"),
      p(`Gentile ${escapeHtml(d.nome)},`),
      p(`ecco il codice per firmare ${d.documento ? `<strong>${escapeHtml(d.documento)}</strong> di ` : "il documento di "}${escapeHtml(b.branding.companyName)}. Lo inserisca nella pagina di firma.`),
      `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:8px 0 6px 0;">
        <tr><td align="center" style="padding:18px 12px;background:#F8FAFC;border:1px solid #E5E7EB;border-radius:8px;
          font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:700;letter-spacing:6px;color:#111827;">${cifre}</td></tr>
      </table>`,
      p("Vale <strong>10 minuti</strong>. Non lo comunichi a nessuno: nemmeno l'azienda glielo chiederà mai.", "font-size:13px;color:#6B7280;text-align:center;"),
      renderButton({ label: "Torna alla pagina di firma", href: d.link, branding: b.branding }),
      piccolo(`Non ha chiesto lei di firmare? Ignori questa email e avvisi ${escapeHtml(b.branding.companyName)}.`),
      contatti(b),
    ].join("\n"),
  });
  const text = [
    `Gentile ${d.nome},`,
    `il suo codice per firmare${d.documento ? ` ${d.documento}` : ""} è: ${d.codice}`,
    "Vale 10 minuti. Non lo comunichi a nessuno.",
    `Pagina di firma: ${d.link}`,
    `Non ha chiesto lei di firmare? Ignori questa email e avvisi ${b.branding.companyName}.`,
  ].join("\n");
  return { subject: `${d.codice} è il suo codice per firmare — ${b.branding.companyName}`, html, text, replyTo: b.email ?? undefined };
}

// ── Copia del documento firmato ────────────────────────────────────────────
export function emailCopiaFirmata(b: BrandingFirma, d: {
  nome: string; documento: string; firmatoIl: string; codiceVerifica: string | null; linkVerifica: string | null; conPdf: boolean;
}): EmailPronta {
  const colore = b.branding.primaryColor;
  const html = renderLayout({
    branding: b.branding,
    fasciaSenzaLogo: true,
    preheaderText: `Ha firmato ${d.documento} il ${dataOra(d.firmatoIl)}`,
    innerBodyHtml: [
      titolo(`${d.documento} firmato`),
      p(`Gentile ${escapeHtml(d.nome)},`),
      p(`la firma è registrata. ${d.conPdf ? "In allegato trova la copia firmata: ogni pagina porta il timbro di firma e in fondo c'è il certificato." : "La copia firmata è conservata da " + escapeHtml(b.branding.companyName) + "."}`),
      riepilogo([
        ["Documento", d.documento],
        ["Firmato da", d.nome],
        ["Il", dataOra(d.firmatoIl)],
        ["Codice di verifica", d.codiceVerifica],
      ], colore),
      d.linkVerifica ? renderButton({ label: "Verifica il documento", href: d.linkVerifica, branding: b.branding }) : "",
      p("Conservi questa email: con il codice di verifica chiunque può controllare che il documento sia quello firmato.", "font-size:13px;color:#6B7280;"),
      contatti(b),
    ].join("\n"),
  });
  const text = [
    `Gentile ${d.nome},`,
    `ha firmato ${d.documento} il ${dataOra(d.firmatoIl)}.`,
    d.codiceVerifica ? `Codice di verifica: ${d.codiceVerifica}` : "",
    d.linkVerifica ? `Verifica il documento: ${d.linkVerifica}` : "",
    d.conPdf ? "In allegato la copia firmata." : "",
    contattiTesto(b),
  ].filter(Boolean).join("\n");
  return { subject: `${d.documento} firmato — ${b.branding.companyName}`, html, text, replyTo: b.email ?? undefined };
}

// ── Avviso all'azienda ─────────────────────────────────────────────────────
export function emailFirmaAvvenutaAzienda(b: BrandingFirma, d: {
  firmatario: string; documento: string; firmatoIl: string; codiceVerifica: string | null; linkApp: string;
}): EmailPronta {
  const html = renderLayout({
    branding: b.branding,
    fasciaSenzaLogo: true,
    preheaderText: `${d.firmatario} ha firmato ${d.documento}`,
    innerBodyHtml: [
      titolo(`${d.documento} firmato`),
      p(`<strong>${escapeHtml(d.firmatario)}</strong> ha firmato elettronicamente il documento.`),
      riepilogo([
        ["Documento", d.documento],
        ["Firmato da", d.firmatario],
        ["Il", dataOra(d.firmatoIl)],
        ["Codice di verifica", d.codiceVerifica],
      ], b.branding.primaryColor),
      renderButton({ label: "Apri l'archivio delle firme", href: d.linkApp, branding: b.branding }),
    ].join("\n"),
  });
  const text = `${d.firmatario} ha firmato ${d.documento} il ${dataOra(d.firmatoIl)}.${d.codiceVerifica ? ` Codice di verifica: ${d.codiceVerifica}.` : ""}\nArchivio delle firme: ${d.linkApp}`;
  return { subject: `Firmato: ${d.documento} da ${d.firmatario}`, html, text };
}

// ── Condizioni accettate (firma avanzata) ──────────────────────────────────
export function emailCondizioniFirma(b: BrandingFirma, d: {
  nome: string; accettataIl: string; testo: string; versione: string; hash: string;
}): EmailPronta {
  const html = renderLayout({
    branding: b.branding,
    fasciaSenzaLogo: true,
    preheaderText: `La copia delle condizioni di firma accettate il ${dataOra(d.accettataIl)}`,
    innerBodyHtml: [
      titolo("Le condizioni della firma elettronica"),
      p(`Gentile ${escapeHtml(d.nome)},`),
      p(`ecco la copia delle condizioni che ha accettato il ${escapeHtml(dataOra(d.accettataIl))} per firmare elettronicamente i documenti di ${escapeHtml(b.branding.companyName)}. La conservi.`),
      `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:6px 0 14px 0;">
        <tr><td style="padding:16px;background:#F8FAFC;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;line-height:1.6;color:#374151;">
          ${escapeHtml(d.testo).replace(/\n/g, "<br/>")}
        </td></tr></table>`,
      piccolo(`Versione ${escapeHtml(d.versione)} · impronta ${escapeHtml(d.hash)}`),
      contatti(b),
    ].join("\n"),
  });
  const text = `Gentile ${d.nome},\necco la copia delle condizioni che ha accettato il ${dataOra(d.accettataIl)}:\n\n${d.testo}\n\nVersione ${d.versione} · impronta ${d.hash}${contattiTesto(b)}`;
  return { subject: `Le condizioni della firma elettronica — ${b.branding.companyName}`, html, text, replyTo: b.email ?? undefined };
}
