import { contrattoInHtml, leggiTestoRiccoContratto } from '../../../supabase/functions/_shared/testoRiccoContratto';
/** Read-only conversion on mount. The stored source changes only after a user edit/save. */
export function htmlPerEditorContratto(text: string): string {
  return /<(?:p|h[1-6]|div|ul|ol)\b/i.test(text) ? text : contrattoInHtml(leggiTestoRiccoContratto(text));
}
