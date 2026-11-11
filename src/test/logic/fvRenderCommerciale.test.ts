import { expect,it } from "vitest";
import { creaDisegnoTetto,disponiModuliAutomaticamente } from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { svgVistaTetto } from "../../../supabase/functions/_shared/fvRenderCommerciale";
const casi=(["due_falde","singola","elle"] as const).flatMap(tipo=>[0,1,2,3].flatMap(lato=>(["antracite","tegole"] as const).map(copertura=>({tipo,lato,copertura}))));
it.each(casi)("vista illustrativa $tipo, lato $lato, $copertura",({tipo,lato,copertura})=>{
  const piano=disponiModuliAutomaticamente(creaDisegnoTetto(tipo),16),prima=JSON.stringify(piano);
  const svg=svgVistaTetto(piano,lato,copertura),doc=new DOMParser().parseFromString(svg,"image/svg+xml");
  expect(doc.querySelector("parsererror")).toBeNull();
  expect(doc.querySelectorAll('polygon[fill="url(#fv-render-black)"]')).toHaveLength(piano.pannelli.length);
  expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  expect(svg).toContain("quote e pendenze da confermare");
  expect(JSON.stringify(piano)).toBe(prima);
});
