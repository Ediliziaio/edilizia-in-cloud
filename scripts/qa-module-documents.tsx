/** Local-only PDF QA: no database, browser session or remote service access. Run with bun. */
import React from "react";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { ModuleDocumentPDF } from "../src/components/preventivi/modules/ModuleDocumentPDF";
import { SALES_AREAS } from "../src/lib/moduli-vendita/areas";
import { createModuleDocument } from "../src/lib/moduli-vendita/moduleDocuments";
const output = path.resolve(process.argv[2] || "../module-pdf-qa");
await mkdir(output, { recursive: true });
let count = 0;
for (const area of SALES_AREAS.filter(
  (a) => !["serramenti", "tetti"].includes(a.id),
)) {
  for (const module of area.interventions) {
    const d = createModuleDocument("qa-company", area.id, module.id, {
      name: "Impresa esempio",
      address: "",
      email: "info@example.invalid",
      phone: "",
    });
    d.image = path.resolve("public", d.image!.slice(1));
    await writeFile(
      path.join(output, `${area.id}-${module.id}.pdf`),
      await renderToBuffer(<ModuleDocumentPDF document={d} />),
    );
    count++;
  }
  console.log(`PDF verificabili: ${area.title} (${area.interventions.length})`);
}
const long = createModuleDocument("qa-company", "bagni", "vasca-doccia", {
  name: "Impresa esempio",
  address: "",
  email: "",
  phone: "",
});
long.image = path.resolve("public", long.image!.slice(1));
long.title =
  "Proposta personalizzata per la trasformazione del bagno e la sostituzione della vasca con una nuova doccia accessibile";
long.subtitle =
  "Descrizione dettagliata delle scelte concordate, delle opere previste e dei materiali da confermare. "
    .repeat(4)
    .slice(0, 400);
long.pages[0].intro =
  "Introduzione del progetto con esigenze e condizioni da confermare. "
    .repeat(12)
    .slice(0, 800);
long.pages[0].items[0].text =
  "Descrizione estesa della lavorazione, delle verifiche previste e delle caratteristiche da concordare prima dell'avvio. "
    .repeat(16)
    .slice(0, 1800);
await writeFile(
  path.join(output, "stress-long-copy.pdf"),
  await renderToBuffer(<ModuleDocumentPDF document={long} />),
);
console.log(`Generati ${count} modelli e uno stress test in ${output}`);
