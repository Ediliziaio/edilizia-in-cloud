import { Branding, RenderedTemplate, escapeHtml } from "./types.ts";
import { renderLayout, plainTextFooter } from "./layout.ts";

export interface WelcomeProps {
  /** Nome destinatario (es. "Marco"). */
  recipientName: string;
  /** URL per il primo accesso (magic link / setup account). */
  loginUrl: string;
  /** Ruolo assegnato (es. "Amministratore"). */
  roleLabel?: string;
  /** Nome dell'azienda del cliente (es. "Bonarrigo S.r.l."): senza, si parla solo della piattaforma. */
  companyName?: string;
  /** L'email con cui entra: la si scrive, così non deve indovinare quale usare. */
  loginEmail?: string;
  /** La password l'ha già scelta lui (iscrizione dal sito): il bottone porta solo ad accedere. */
  passwordGiaScelta?: boolean;
  /** La password scelta da chi ha creato l'azienda: la si scrive, altrimenti il cliente non può entrare. */
  password?: string;
}

// Lo stesso arancio e la stessa impaginazione delle altre email della
// piattaforma (setup incompleto, prova in scadenza…): prima il benvenuto aveva
// testata e bottone blu ed era l'unica diversa.
const ARANCIO = "#F97316";

const bottone = (label: string, href: string) => `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;"><tr>
      <td align="center" bgcolor="${ARANCIO}" style="background:${ARANCIO};border-radius:6px;">
        <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:6px;">${escapeHtml(label)}</a>
      </td></tr></table>`;

const passo = (n: number, titolo: string, testo: string) => `
      <tr><td style="padding:10px 0;border-top:1px solid #EEF2F6;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#333333;">
        <strong style="color:${ARANCIO};">${n}.</strong> <strong>${escapeHtml(titolo)}</strong><br/>
        <span style="color:#64748b;">${escapeHtml(testo)}</span>
      </td></tr>`;

export function render(props: WelcomeProps, branding: Branding): RenderedTemplate {
  const azienda = props.companyName?.trim() || "";
  const ruolo = props.roleLabel?.trim() || "";
  const subject = azienda
    ? `Benvenuto in Edilizia in Cloud, ${props.recipientName}: ${azienda} è pronta`
    : `Benvenuto in Edilizia in Cloud, ${props.recipientName}`;
  // Tre casi: password scritta qui (l'ha scelta chi ha creato l'azienda), già
  // scelta da lui iscrivendosi, oppure da scegliere col bottone.
  const password = props.password?.trim() || "";
  const entraSubito = !!password || !!props.passwordGiaScelta;
  const preheader = `${azienda ? `L'account di ${azienda}` : "Il tuo account"} è attivo: ${
    password ? "qui dentro trovi email e password per entrare" : entraSubito ? "entra e comincia" : "scegli la password ed entra"}.`;

  const riga = (etichetta: string, valore: string) => `
        <tr>
          <td style="padding:3px 0;width:84px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;">${etichetta}</td>
          <td style="padding:3px 0;font-family:Consolas,Menlo,monospace;font-size:15px;font-weight:700;color:#1a1a1a;">${escapeHtml(valore)}</td>
        </tr>`;

  const accesso = props.loginEmail ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px 0;"><tr>
      <td style="padding:12px 14px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#333333;">
        ${password ? `
        <table role="presentation" cellpadding="0" cellspacing="0">${riga("Email", props.loginEmail)}${riga("Password", password)}</table>
        <div style="margin-top:8px;font-size:12px;color:#64748b;">Dopo il primo accesso puoi cambiarla da <strong>Profilo</strong>.</div>`
        : `Entri con <strong>${escapeHtml(props.loginEmail)}</strong>${props.passwordGiaScelta
          ? " e la password che hai scelto iscrivendoti."
          : `. La password la scegli tu col bottone qui sotto:
        il collegamento si crea quando lo apri, quindi vale anche fra qualche giorno.`}`}
      </td></tr></table>` : "";

  const innerBody = `
    <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:700;color:#1a1a1a;">
      Ciao ${escapeHtml(props.recipientName)},
    </p>
    <p style="margin:0 0 16px 0;">
      ${azienda ? `l'account di <strong>${escapeHtml(azienda)}</strong> su Edilizia in Cloud è pronto` : "il tuo account su Edilizia in Cloud è pronto"}${ruolo ? `: sei <strong>${escapeHtml(ruolo.toLowerCase())}</strong>` : ""}.
      Da qui segui cantieri, preventivi, fatture e squadra, anche dal telefono.
    </p>
    ${accesso}
    ${bottone(entraSubito ? "Entra in Edilizia in Cloud" : "Scegli la password ed entra", props.loginUrl)}
    <p style="margin:22px 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#1a1a1a;">Da dove cominciare</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">
      ${passo(1, "Completa i dati dell'azienda", "Ragione sociale, P. IVA e indirizzo: servono a preventivi e fatture.")}
      ${passo(2, "Crea il primo cantiere", "Basta il nome e il cliente; fasi, costi e documenti li aggiungi quando servono.")}
      ${passo(3, "Invita la squadra", "Ufficio e operai entrano con il loro accesso, ognuno vede quello che gli serve.")}
    </table>
    <p style="margin:14px 0 0 0;font-size:13px;line-height:1.55;color:#64748b;">
      Ti blocchi su un passaggio? Rispondi a questa email: ti risponde una persona del nostro team.
    </p>
  `;

  const html = renderLayout({ branding, innerBodyHtml: innerBody, preheaderText: preheader, testataCompatta: true });

  const text = [
    `Ciao ${props.recipientName},`,
    "",
    `${azienda ? `l'account di ${azienda} su Edilizia in Cloud è pronto` : "il tuo account su Edilizia in Cloud è pronto"}${ruolo ? `: sei ${ruolo.toLowerCase()}` : ""}.`,
    props.loginEmail && password
      ? `Email: ${props.loginEmail}\nPassword: ${password}\n(dopo il primo accesso puoi cambiarla da Profilo)\n\nEntra da qui:`
      : props.loginEmail
      ? (props.passwordGiaScelta ? `Entri con ${props.loginEmail} e la password che hai scelto:` : `Entri con ${props.loginEmail}. La password la scegli tu da qui:`)
      : (entraSubito ? "Entra da qui:" : "Scegli la password ed entra da qui:"),
    props.loginUrl,
    "",
    "Da dove cominciare:",
    "1. Completa i dati dell'azienda (servono a preventivi e fatture)",
    "2. Crea il primo cantiere",
    "3. Invita la squadra",
    "",
    "Ti blocchi su un passaggio? Rispondi a questa email: ti risponde una persona del nostro team.",
    "",
    plainTextFooter(branding),
  ].join("\n");

  return { subject, html, text };
}
