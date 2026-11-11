import {mkdir,writeFile} from "node:fs/promises";
import {ICONE_EDITORIALI_FV,svgIconaEditorialeFv,tavolaIconeEditorialiFv} from "../../supabase/functions/_shared/fvIconeEditoriali";
const dir=new URL("../../output/icons/fotovoltaico/",import.meta.url);await mkdir(dir,{recursive:true});
for(const i of ICONE_EDITORIALI_FV)await writeFile(new URL(`${i.id}.svg`,dir),svgIconaEditorialeFv(i.id,{dimensione:64,label:i.nome}));
await writeFile(new URL("tavola-icone.svg",dir),tavolaIconeEditorialiFv());
await writeFile(new URL("README.txt",dir),"12 icone vettoriali comuni per PDF e interfaccia.\nGriglia 24x24; SVG trasparenti; tratto uniforme 1,6.\nColore predefinito #188569: modificare l’attributo color oppure usare svgIconaEditorialeFv con il colore del marchio.\nLe icone non attestano certificazioni, garanzie o servizi: accompagnano le voci effettive del modello.\n");
console.log("12 icone SVG e tavola esportate.");
