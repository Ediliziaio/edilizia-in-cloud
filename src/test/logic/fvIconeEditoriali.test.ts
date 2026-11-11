import {describe,it,expect} from "vitest";
import {ICONE_EDITORIALI_FV,svgIconaEditorialeFv,tavolaIconeEditorialiFv} from "../../../supabase/functions/_shared/fvIconeEditoriali";
import {renderFvPdfHtml} from "../../../supabase/functions/_shared/fvHtmlTemplate";
import {datiCasaTettoReale} from "../../../dev/fotovoltaico-locale/casaTettoReale";
describe("icone comuni ai modelli fotovoltaici",()=>{
 it("offre dodici SVG trasparenti nella stessa griglia, adattabili al marchio",()=>{
  expect(ICONE_EDITORIALI_FV).toHaveLength(12);expect(new Set(ICONE_EDITORIALI_FV.map(i=>i.id)).size).toBe(12);
  for(const i of ICONE_EDITORIALI_FV){const s=svgIconaEditorialeFv(i.id,{colore:"#123456",dimensione:48,label:i.nome});expect(s).toContain('viewBox="0 0 24 24"');expect(s).toContain('color="#123456"');expect(s).toContain('width="48"');expect(s).not.toContain('<image');expect(s).not.toContain('<script');expect(s).toContain('fill="none"');}
 });
 it("scarta colori, dimensioni e nomi non validi senza eseguire il contenuto delle etichette",()=>{
  const s=svgIconaEditorialeFv('__proto__',{colore:'red" onload="attacco()',dimensione:NaN,label:'"><script>attacco()</script>'});
  expect(s).toContain('data-fv-icon="shield"');expect(s).toContain('color="#188569"');expect(s).toContain('width="24"');expect(s).not.toContain('<script>');expect(s).not.toContain('onload');expect(s).toContain('&lt;script&gt;');
  expect(svgIconaEditorialeFv('inesistente')).toContain('aria-hidden="true"');
 });
 it("le nuove icone compaiono nel PDF e le immagini personalizzate restano rispettate",()=>{
  const d=datiCasaTettoReale(),html=renderFvPdfHtml(d);expect(html).toContain('data-fv-icon="sun"');expect(html).toContain('data-fv-icon="tools"');expect(html).toContain('data-fv-icon="shield"');
  d.badge_garanzie={shield:'data:image/png;base64,AA=='};const conBadge=renderFvPdfHtml(d);expect(conBadge).toContain('class="g-badge"');expect(conBadge).toContain('data:image/png;base64,AA==');
 });
 it("esporta una tavola autonoma senza richieste esterne",()=>{
  const s=tavolaIconeEditorialiFv();for(const i of ICONE_EDITORIALI_FV)expect(s).toContain(`${i.id}.svg`);expect(s).not.toContain('href=');expect(s).not.toContain('Demo Solar');
 });
});
