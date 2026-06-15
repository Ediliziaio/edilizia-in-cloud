/**
 * outreach-spam-score — analisi PURA del contenuto di una cold email per
 * stimare il rischio spam/deliverability. Niente Deno/Supabase: testabile.
 * Più alto = peggio. Segnali azionabili per la UI del playground.
 */

export interface SpamSignal { label: string; severity: "low" | "med" | "high" }
export interface SpamScore { score: number; level: "ok" | "attenzione" | "rischio"; signals: SpamSignal[] }

// Parole/segnali tipici da filtro anti-spam (IT + alcune EN comuni).
const SPAM_WORDS = [
  "gratis", "gratuito", "offerta", "sconto", "promozione", "promo", "regalo", "omaggio",
  "clicca qui", "clicca subito", "acquista ora", "compra ora", "urgente", "garantito",
  "soldi", "guadagna", "guadagno", "vincita", "vinci", "congratulazioni", "100%",
  "senza impegno", "nessun costo", "offerta limitata", "affrettati", "ultima possibilità",
  "free", "buy now", "click here", "winner", "cash", "credit",
];

function words(s: string): string[] {
  return (s.match(/[\p{L}\p{N}]+/gu) ?? []);
}

/** True se ci sono variabili di personalizzazione ({{...}}). */
function hasPersonalization(text: string): boolean {
  return /\{\{[^}]+\}\}/.test(text);
}

/** Conta i link (http/https) nel testo. */
export function countLinks(text: string): number {
  return (text.match(/https?:\/\//gi) ?? []).length;
}

/** Rapporto di PAROLE tutte-maiuscole (>=3 lettere) sul totale. */
export function capsRatio(text: string): number {
  const ws = words(text).filter((w) => w.length >= 3);
  if (ws.length === 0) return 0;
  const caps = ws.filter((w) => w === w.toUpperCase() && /[A-ZÀ-Þ]/.test(w)).length;
  return caps / ws.length;
}

/**
 * Calcola lo spam-score (0-100) di una cold email da oggetto + corpo.
 * Pensato per email B2B cold: penalizza spam words, troppi link, MAIUSCOLE,
 * troppi "!", corpo troppo lungo/corto e assenza di personalizzazione.
 *
 * `subject`/`body` sono il testo finale (renderizzato) usato per i controlli
 * di contenuto. `template` opzionale è il sorgente con le variabili ancora
 * presenti ({{...}}): se passato, il controllo di personalizzazione lo usa
 * (dopo il rendering le variabili spariscono e darebbe sempre falso positivo).
 */
export function spamScore(subject: string, body: string, template?: string): SpamScore {
  const signals: SpamSignal[] = [];
  let score = 0;
  const full = `${subject}\n${body}`;
  const lower = full.toLowerCase();
  const bodyWords = words(body).length;

  const foundSpam = [...new Set(SPAM_WORDS.filter((w) => lower.includes(w)))];
  if (foundSpam.length) {
    score += Math.min(40, foundSpam.length * 12);
    signals.push({ label: `Parole a rischio: ${foundSpam.slice(0, 4).join(", ")}`, severity: foundSpam.length >= 2 ? "high" : "med" });
  }

  const links = countLinks(full);
  if (links >= 3) { score += 20; signals.push({ label: `${links} link (troppi per il cold)`, severity: "high" }); }
  else if (links === 2) { score += 8; signals.push({ label: "2 link: meglio 0-1 nel primo invio", severity: "low" }); }

  const exclam = (full.match(/!/g) ?? []).length;
  if (exclam >= 3) { score += 12; signals.push({ label: "Troppi punti esclamativi", severity: "med" }); }

  const caps = capsRatio(full);
  if (caps >= 0.25) { score += 15; signals.push({ label: "Troppe PAROLE IN MAIUSCOLO", severity: "high" }); }
  else if (caps >= 0.12) { score += 6; signals.push({ label: "Diverse parole in maiuscolo", severity: "low" }); }

  if (bodyWords > 0 && bodyWords < 12) { score += 8; signals.push({ label: "Corpo molto corto (<12 parole)", severity: "low" }); }
  if (bodyWords > 160) { score += 10; signals.push({ label: "Corpo lungo (>160 parole): il cold rende meglio breve", severity: "med" }); }

  if (bodyWords >= 12 && !hasPersonalization(template ?? body)) {
    score += 10;
    signals.push({ label: "Nessuna personalizzazione ({{first_name}}…)", severity: "med" });
  }

  if (subject.length > 65) { score += 6; signals.push({ label: "Oggetto lungo (>65 caratteri)", severity: "low" }); }

  score = Math.min(100, score);
  const level: SpamScore["level"] = score >= 50 ? "rischio" : score >= 25 ? "attenzione" : "ok";
  return { score, level, signals };
}
