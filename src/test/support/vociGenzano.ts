import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { leggiComputoPrimus, type PdfPaginaPosizionata } from "@/lib/computo/primusPdf";
import { bozzaDaComputoStrutturato } from "@/lib/computo/importaComputo";
import { rigaDaVoce } from "@/lib/computo/computoDaVoci";
import { eNonLavoro } from "@/lib/computo/importaVoci";

export function vociGenzano() {
  const pagine: PdfPaginaPosizionata[] = [];
  for (const riga of readFileSync(resolve(__dirname, "../fixtures/computoPrimusGenzano.tsv"), "utf8").split("\n")) {
    if (!riga || riga.startsWith("# ")) continue;
    if (riga.startsWith("### ")) { pagine.push({ page: Number(riga.slice(4)), items: [] }); continue; }
    const [x, right, y, ...t] = riga.split("\t");
    pagine.at(-1)!.items.push({ x: Number(x), right: Number(right), y: Number(y), text: t.join("\t") });
  }
  return bozzaDaComputoStrutturato(leggiComputoPrimus(pagine)).voci.filter(v => !eNonLavoro(v)).map((v, i) => {
    const r = rigaDaVoce({ ...v, avvisi: [], origine: "collaudo" }, i);
    return { ...r.voce, id: r.voce.numero_ordine, misure: r.misure };
  });
}
