/**
 * Utility per il modulo SMS Marketing.
 * normalizzaTelefono — tutti i formati italiani reali
 * calcolaPartiSms — GSM-7 base, GSM-7 extended, Unicode
 * interpolaVariabili — sostituzione variabili template
 * formattaNumeroIT — formattazione display
 */

// ─── Normalizzazione telefono ────────────────────────────────

export interface NormalizzazioneRisultato {
  e164: string;
  valido: boolean;
  errore?: string;
  warning?: string;
}

/** Cifre del charset GSM-7 esteso (contano 2 caratteri) */
const GSM7_EXTENDED = new Set(['{', '}', '\\', '[', ']', '~', '|', '€', '^']);

/** Caratteri del charset GSM-7 base */
const GSM7_BASE = new Set([
  '@', '£', '$', '¥', 'è', 'é', 'ù', 'ì', 'ò', 'Ç', '\n', 'Ø', 'ø', '\r', 'Å', 'å',
  'Δ', '_', 'Φ', 'Γ', 'Λ', 'Ω', 'Π', 'Ψ', 'Σ', 'Θ', 'Ξ', '\x1B', 'Æ', 'æ', 'ß', 'É',
  ' ', '!', '"', '#', '¤', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/',
  '0','1','2','3','4','5','6','7','8','9', ':', ';', '<', '=', '>', '?',
  '¡','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
  'Ä','Ö','Ñ','Ü','§','¿','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z',
  'ä','ö','ñ','ü','à',
]);

/**
 * Normalizza un numero di telefono in formato E.164.
 * Supporta tutti i formati italiani reali.
 */
export function normalizzaTelefono(input: string): NormalizzazioneRisultato {
  if (!input || !input.trim()) {
    return { e164: '', valido: false, errore: 'Numero di telefono obbligatorio' };
  }

  // Rimuovi spazi, trattini, punti, parentesi
  let cleaned = input.trim().replace(/[\s.()-]/g, '');

  // Rimuovi prefisso 0039
  if (cleaned.startsWith('0039')) {
    cleaned = '+39' + cleaned.slice(4);
  }

  // Aggiungi +39 se inizia con 3 (cellulare IT) o 0 (fisso IT)
  if (/^3\d{8,9}$/.test(cleaned)) {
    cleaned = '+39' + cleaned;
  } else if (/^0\d{6,11}$/.test(cleaned)) {
    cleaned = '+39' + cleaned;
  } else if (/^\d{6,12}$/.test(cleaned)) {
    // numero ambiguo senza prefisso
    cleaned = '+39' + cleaned;
  }

  // Validazione formato E.164
  if (!/^\+\d{7,15}$/.test(cleaned)) {
    return { e164: cleaned, valido: false, errore: 'Numero non valido — controlla il formato' };
  }

  // Warning per numeri non italiani
  if (!cleaned.startsWith('+39')) {
    return {
      e164: cleaned,
      valido: true,
      warning: 'Numero non italiano — verifica che il destinatario riceva SMS internazionali',
    };
  }

  return { e164: cleaned, valido: true };
}

// ─── Calcolo parti SMS ───────────────────────────────────────

export type SmsCharset = 'GSM-7' | 'GSM-7-Extended' | 'Unicode';

export interface SmsPartiRisultato {
  parti: number;
  caratteriUsati: number;
  caratteriPerParte: number;
  tipoCharset: SmsCharset;
  caratteriRimanenti: number;
}

/**
 * Calcola il numero di parti SMS necessarie per un messaggio.
 */
export function calcolaPartiSms(messaggio: string): SmsPartiRisultato {
  if (!messaggio) {
    return { parti: 1, caratteriUsati: 0, caratteriPerParte: 160, tipoCharset: 'GSM-7', caratteriRimanenti: 160 };
  }

  let hasUnicode = false;
  let hasExtended = false;
  let gsm7Length = 0;

  for (const char of messaggio) {
    if (GSM7_EXTENDED.has(char)) {
      hasExtended = true;
      gsm7Length += 2; // Carattere extended conta 2
    } else if (GSM7_BASE.has(char)) {
      gsm7Length += 1;
    } else {
      hasUnicode = true;
      break;
    }
  }

  if (hasUnicode) {
    // Unicode (UTF-16): 70 char per parte singola, 67 per multipart
    const len = messaggio.length;
    const parteUnica = 70;
    const parteMultiple = 67;
    const parti = len <= parteUnica ? 1 : Math.ceil(len / parteMultiple);
    const caratteriPerParte = parti === 1 ? parteUnica : parteMultiple;
    const caratteriUsatiInParte = parti === 1 ? len : ((parti - 1) * parteMultiple + (len - (parti - 1) * parteMultiple));
    return {
      parti,
      caratteriUsati: len,
      caratteriPerParte,
      tipoCharset: 'Unicode',
      caratteriRimanenti: (parti * caratteriPerParte) - len,
    };
  }

  // GSM-7: 160 char per parte singola, 153 per multipart
  const parteUnica = 160;
  const parteMultiple = 153;
  const parti = gsm7Length <= parteUnica ? 1 : Math.ceil(gsm7Length / parteMultiple);
  const caratteriPerParte = parti === 1 ? parteUnica : parteMultiple;
  const tipoCharset: SmsCharset = hasExtended ? 'GSM-7-Extended' : 'GSM-7';

  return {
    parti,
    caratteriUsati: gsm7Length,
    caratteriPerParte,
    tipoCharset,
    caratteriRimanenti: (parti * caratteriPerParte) - gsm7Length,
  };
}

// ─── Interpolazione variabili ────────────────────────────────

/**
 * Sostituisce le variabili {{nome_variabile}} con i valori forniti.
 * Le variabili senza valore restano intatte.
 */
export function interpolaVariabili(
  template: string,
  valori: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, chiave: string) => {
    return valori[chiave] !== undefined ? valori[chiave] : match;
  });
}

// ─── Formattazione numero ────────────────────────────────────

/**
 * Formatta un numero E.164 in formato display italiano.
 * +393331234567 → +39 333 123 4567
 * +390212345678 → +39 02 1234 5678
 */
export function formattaNumeroIT(e164: string): string {
  if (!e164.startsWith('+39')) return e164;
  const numero = e164.slice(3); // rimuovi +39

  // Cellulare: inizia con 3, 10 cifre totali
  if (/^3\d{9}$/.test(numero)) {
    return `+39 ${numero.slice(0, 3)} ${numero.slice(3, 6)} ${numero.slice(6)}`;
  }

  // Fisso Milano/Roma (2 cifre prefisso)
  if (/^0[2-9]\d{7,8}$/.test(numero)) {
    return `+39 ${numero.slice(0, 2)} ${numero.slice(2, 6)} ${numero.slice(6)}`;
  }

  // Fisso altro (3 cifre prefisso)
  if (/^0\d{2,3}\d{6,8}$/.test(numero)) {
    return `+39 ${numero.slice(0, 3)} ${numero.slice(3)}`;
  }

  return `+39 ${numero}`;
}
