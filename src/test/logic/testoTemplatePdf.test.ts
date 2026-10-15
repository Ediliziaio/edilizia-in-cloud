import { describe, expect, it } from 'vitest';
import { normalizzaTestoTemplatePdf } from '../../../supabase/functions/_shared/testoTemplatePdf';
describe('Testo contrattuale importato nel PDF', () => {
  it('decodifica gli apostrofi e le virgolette dei documenti importati', () => {
    expect(normalizzaTestoTemplatePdf('<p>l&#x27;Appaltatore &quot;Dimora&quot;: &#39;opera&#39; &amp; posa</p>')).toBe('l\'Appaltatore "Dimora": \'opera\' & posa');
  });
  it('mantiene separati gli articoli senza stampare i tag', () => {
    expect(normalizzaTestoTemplatePdf('<h2>ART. 1</h2><p>Testo<br/>seconda riga</p>')).toBe('ART. 1\n\nTesto\nseconda riga');
  });
  it('non genera eccezioni per punti Unicode non validi', () => {
    expect(normalizzaTestoTemplatePdf('&#x110000; &#xD800;')).toBe('&#x110000; &#xD800;');
  });
});
