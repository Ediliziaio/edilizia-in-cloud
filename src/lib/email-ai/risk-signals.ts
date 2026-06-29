/**
 * risk-signals — MP-EMAIL-AI-16 · Segnali di rischio email (deterministici, testati)
 *
 * Controlli prima dell'AI: autenticazione, look-alike domain, urgenza+pagamento,
 * link mismatch, allegato eseguibile. Nessun singolo segnale condanna: si combinano
 * in un livello di rischio. Pure + unit-testate; usate anche dalla Edge Function.
 */

export type RischioLivello = "basso" | "medio" | "alto";
export interface Segnale { codice: string; descrizione: string; peso: number; }

/** Distanza di Levenshtein (per look-alike domain). */
export function levenshtein(a: string, b: string): number {
  a = a.toLowerCase(); b = b.toLowerCase();
  const m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  const prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let prevDiag = prev[0]; prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, prevDiag + (a[i - 1] === b[j - 1] ? 0 : 1));
      prevDiag = tmp;
    }
  }
  return prev[n];
}

/** Dominio look-alike: simile (1-2 caratteri) ma NON uguale a un dominio noto. */
export function isLookAlikeDomain(senderDomain: string, knownDomains: string[]): string | null {
  const s = (senderDomain || "").toLowerCase().trim();
  if (!s) return null;
  for (const k0 of knownDomains) {
    const k = (k0 || "").toLowerCase().trim();
    if (!k || k === s) continue;            // uguale = legittimo, non look-alike
    const d = levenshtein(s, k);
    if (d > 0 && d <= 2 && Math.abs(s.length - k.length) <= 2) return k;
  }
  return null;
}

const URGENZA = /\b(urgent[ei]|immediat[ao]|entro\s+(oggi|24\s*ore|domani)|scadut[ao]|sollecito|ultimo\s+avviso|bloccat[ao]|sospensione)\b/i;
const PAGAMENTO = /\b(bonifico|paga(re|mento)?|iban|saldo|fattura\s+scadut|estremi\s+bancari|nuovo\s+conto|nuove?\s+coordinate)\b/i;

export function isUrgentPaymentRequest(testo: string): boolean {
  const t = testo || "";
  return URGENZA.test(t) && PAGAMENTO.test(t);
}

/** Link il cui testo mostra un dominio diverso dall'href reale (phishing). */
export function hasLinkMismatch(links: Array<{ text?: string; href?: string }>): boolean {
  const domOf = (s?: string) => (s || "").toLowerCase().match(/https?:\/\/([^/\s"']+)/)?.[1]?.replace(/^www\./, "") ?? null;
  // Etichetta di brand (secondo livello): "ediliziaincloud.it" e "ediliziaincloud.com"
  // sono lo STESSO brand → coerente, NON è phishing (evita il falso positivo .it↔.com).
  // Flagga solo quando il brand differisce davvero (es. "intesasanpaolo" vs "evil-phish").
  const sld = (d: string) => { const p = d.split("."); return p.length >= 2 ? p[p.length - 2] : d; };
  for (const l of links || []) {
    const textDom = (l.text || "").toLowerCase().match(/([a-z0-9-]+\.[a-z]{2,})(?:[/\s]|$)/)?.[1] ?? null;
    const hrefDom = domOf(l.href);
    if (textDom && hrefDom && sld(textDom) !== sld(hrefDom)) return true;
  }
  return false;
}

const ESEGUIBILI = /\.(exe|scr|com|bat|cmd|js|jse|vbs|vbe|wsf|ps1|jar|msi|apk|docm|xlsm|pptm|dotm)$/i;
export function hasSuspiciousAttachment(filenames: string[]): boolean {
  return (filenames || []).some((f) => ESEGUIBILI.test((f || "").trim()));
}

/** Estrae spf/dkim/dmarc da un header Authentication-Results. */
export function parseAuthResults(authHeader?: string | null): { spf?: string; dkim?: string; dmarc?: string } {
  const h = (authHeader || "").toLowerCase();
  const grab = (k: string) => h.match(new RegExp(`${k}=(pass|fail|softfail|neutral|none|permerror|temperror)`))?.[1];
  return { spf: grab("spf"), dkim: grab("dkim"), dmarc: grab("dmarc") };
}

export interface RiskInput {
  authHeader?: string | null;
  senderDomain?: string;
  knownDomains?: string[];
  testo?: string;
  links?: Array<{ text?: string; href?: string }>;
  attachmentNames?: string[];
  ibanDiverso?: boolean;   // dall'estrazione MP-06 (IBAN ≠ storico fornitore)
}

/** Combina i segnali in un livello di rischio. Nessun singolo indizio condanna. */
export function valutaRischio(input: RiskInput): { livello: RischioLivello; segnali: Segnale[] } {
  const segnali: Segnale[] = [];
  const auth = parseAuthResults(input.authHeader);
  const authFail = auth.dmarc === "fail" || (auth.spf === "fail" && auth.dkim === "fail");
  if (authFail) segnali.push({ codice: "auth_fail", descrizione: "Autenticazione mittente fallita (SPF/DKIM/DMARC): mittente probabilmente falsificato", peso: 3 });

  const lookAlike = input.senderDomain ? isLookAlikeDomain(input.senderDomain, input.knownDomains || []) : null;
  if (lookAlike) segnali.push({ codice: "look_alike", descrizione: `Dominio molto simile a "${lookAlike}" di un fornitore noto: possibile imitazione`, peso: 4 });

  if (input.ibanDiverso) segnali.push({ codice: "iban_diverso", descrizione: "IBAN diverso da quello noto del fornitore: verifica con una telefonata prima di pagare", peso: 5 });

  if (isUrgentPaymentRequest(input.testo || "")) segnali.push({ codice: "urgenza_pagamento", descrizione: "Urgenza + richiesta di pagamento: schema tipico della truffa", peso: 2 });

  if (hasLinkMismatch(input.links || [])) segnali.push({ codice: "link_mismatch", descrizione: "Link che punta a un dominio diverso dal testo mostrato: possibile phishing", peso: 3 });

  if (hasSuspiciousAttachment(input.attachmentNames || [])) segnali.push({ codice: "allegato_sospetto", descrizione: "Allegato potenzialmente eseguibile/macro: possibile malware", peso: 4 });

  const tot = segnali.reduce((s, x) => s + x.peso, 0);
  const livello: RischioLivello = tot >= 5 ? "alto" : tot >= 2 ? "medio" : "basso";
  return { livello, segnali };
}
