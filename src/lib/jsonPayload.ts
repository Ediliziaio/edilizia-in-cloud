import type { Json } from '@/integrations/supabase/types';

/** Materializza il valore JSON che verrebbe inviato al server (date incluse).
 * Rifiuta valori non serializzabili senza forzare il tipo del dato originale.
 */
export function jsonPayload(value: unknown): Json {
  const text = JSON.stringify(value);
  if (text === undefined) throw new TypeError('Il valore non è serializzabile come JSON.');
  return JSON.parse(text) as Json;
}
