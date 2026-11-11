import {describe,it,expect} from "vitest";
import {documentoBilancioCasa} from "../../../dev/fotovoltaico-locale/bilancioCasa";
describe("Estratto locale dei flussi della casa",()=>{
 it.each([true,false])("estrae una sola pagina nativa senza preventivi o contratti fittizi, accumulo %s",accumulo=>{
  const {html,flows,consumo}=documentoBilancioCasa(accumulo);
  expect(html.match(/<div class="page">/g)).toHaveLength(1);
  expect(html).toContain('data-fv-section="flussi"');expect(html).toContain('class="pnum">1 / 1');
  expect(html).not.toContain('data-fv-section="firma"');expect(html).not.toContain('data-fv-section="decisione"');
  expect(flows.autoconsumo_kwh+flows.prelievo_rete_kwh).toBe(consumo);
  expect(html.includes("ACCUMULO PREVISTO")).toBe(accumulo);
 });
 it("cambia i flussi, non la produzione o il fabbisogno, quando cambia la batteria del campione",()=>{
  const con=documentoBilancioCasa(true),senza=documentoBilancioCasa(false);
  expect(con.flows.produzione_kwh).toBe(senza.flows.produzione_kwh);
  expect(con.consumo).toBe(senza.consumo);
  expect(senza.flows.autoconsumo_kwh).toBe(2590);expect(con.flows.autoconsumo_kwh).toBe(4200);
  expect(senza.html).not.toContain("4.200 / 7.400");
 });
});
