import {describe,it,expect}from 'vitest';
import {SEGNALI_POS,segnalePosSvg,normalizzaSegnaliPos}from '../../../supabase/functions/_shared/posSegnaletica';
import {posVuoto,lavorazioneVuota,normalizzaPos}from '../../../supabase/functions/_shared/posModello';
import {costruisciHtmlPos}from '../../../supabase/functions/_shared/posHtml';
import {layoutPdfPos}from '../../../supabase/functions/_shared/posPdfLayout';
import {lavorazioniRiutilizzabili}from '../../../supabase/functions/_shared/posRiuso';
describe('Segnaletica POS esplicita',()=>{
 it('usa le cinque famiglie geometriche senza risorse o codice esterni',()=>{expect(new Set(SEGNALI_POS.map(s=>s.famiglia)).size).toBe(5);for(const s of SEGNALI_POS){expect(segnalePosSvg(s.id)).toContain('<svg');expect(segnalePosSvg(s.id)).not.toMatch(/<image|href=|script|onload|ISO/i);}expect(()=>segnalePosSvg('arbitrario' as never)).toThrow();});
 it('scarta identificativi estranei e duplicati senza generare segnali impliciti',()=>{expect(normalizzaSegnaliPos([{id:'elmetto',ubicazione:'Ingresso'},{id:'elmetto'},{id:'javascript:'},null])).toEqual([{id:'elmetto',ubicazione:'Ingresso',note:''}]);expect(normalizzaSegnaliPos(null)).toEqual([]);});
 it('conserva ubicazioni nel POS ma le esclude dal riuso aziendale',()=>{const p=posVuoto();p.lavorazioni=[{...lavorazioneVuota('l'),segnaletica:[{id:'elmetto',ubicazione:'Ingresso A',note:'Solo area delimitata'}]}];expect(normalizzaPos(p).lavorazioni[0].segnaletica?.[0].ubicazione).toBe('Ingresso A');expect(lavorazioniRiutilizzabili(p)[0].segnaletica).toBeUndefined();});
 it('stampa lo stesso segnale e testo HTML/PDF con ubicazione sfuggita',()=>{const p=posVuoto();p.lavorazioni=[{...lavorazioneVuota('l'),segnaletica:[{id:'elmetto',ubicazione:'<script>Ingresso</script>',note:'DEMO'}]}];const html=costruisciHtmlPos({contenuto:p,stato:'bozza',revisione:0,revisioni:[]});expect(html).toContain('data-segnale="elmetto"');expect(html).toContain('&lt;script&gt;');const pdf=JSON.stringify(layoutPdfPos(html,'TEST',0,'2026-10-27T12:00:00Z',true).definizione);expect(pdf).toContain('Protezione del capo');expect(pdf).toContain('Ingresso');expect(pdf).toContain('width=\\"64');});
});
