import {mkdir,writeFile} from "node:fs/promises";
import {documentoBilancioCasa} from "./bilancioCasa";
const dir=new URL("../../output/pdf/",import.meta.url);
await mkdir(dir,{recursive:true});
const html=documentoBilancioCasa().html.replace(/<link href="https:\/\/fonts.googleapis.com[^>]*>/g,"").replace(/[\u2010-\u2015]/g,"-");
await writeFile(new URL("anteprima-energia-casa.html",dir),html);
console.log("Anteprima casa preparata");
