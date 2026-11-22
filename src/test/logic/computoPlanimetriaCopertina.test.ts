import { expect, it } from "vitest";
import { generaComputoPdf } from "@/lib/computo/esportaComputo";
import { bozzaVuota, voceVuota, vociDaBozza } from "@/lib/computo/editorNativo";
import type { PlanimetriaComputoPdf } from "@/lib/computo/stampaPlanimetria";

const dati = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGMQVDL+//8/A4QCACdvBscTXpfUAAAAAElFTkSuQmCC", "base64"));
const planimetria: PlanimetriaComputoPdf = {
  versione: 3, variante: "Ristrutturazione", numeroPiani: 2, misureStimate: true,
  tavole: ["Piano terra", "Primo piano"].map(nome => ({ nome, dati, larghezza: 170, altezza: 135, nuovo: true, demolito: true })),
};
const voci = () => vociDaBozza({ ...bozzaVuota(), voci: [{
  ...voceVuota(), descrizione: "Realizzazione tramezzo", quantita: "10", prezzo: "50",
}] });

it.each(["editoriale", "primus", "elenco-prezzi", undefined] as const)("incorpora i due piani sulla prima pagina del formato %s", async impaginazione => {
  const doc = await generaComputoPdf(voci(), { titolo: "Ristrutturazione", impaginazione, planimetria });
  const [prima, ...altre] = (doc.internal.pages as unknown as string[][]).slice(1).map(p => p.join("\n"));
  for (const testo of ["Planimetria della variante", "Versione 3", "Piano terra", "Primo piano", "Misure indicative", "Da demolire"]) {
    expect(prima).toContain(testo);
  }
  expect(prima.match(/\/I\d+ Do/g)).toHaveLength(2);
  expect(altre.join("\n")).not.toContain("Planimetria della variante");
  expect(doc.output()).toContain("Realizzazione tramezzo");
});

it("stampa la pianta nella prima pagina anche quando si usa la testata compatta", async () => {
  const doc = await generaComputoPdf(voci(), { titolo: "Casa", impaginazione: "editoriale", planimetria, sezioni: { copertina: false } });
  const prima = (doc.internal.pages as unknown as string[][])[1].join("\n");
  expect(prima).toContain("Versione 3");
  expect(prima.match(/\/I\d+ Do/g)).toHaveLength(2);
});
