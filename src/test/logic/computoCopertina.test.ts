import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generaComputoPdf } from "@/lib/computo/esportaComputo";
import { bozzaVuota, voceVuota, vociDaBozza } from "@/lib/computo/editorNativo";
import { modelloComputoDiSerie, vesteDalModello } from "@/lib/computo/modelloComputo";
import { calcolaDetrazione } from "@/lib/computo/detrazioneComputo";
import { cronoDaCapitoli } from "@/lib/computo/cronoprogramma";

/**
 * La copertina del preventivo con computo (29/10/2026): con «piena» è una
 * pagina a sé, senza piè di pagina, e il documento comincia dalla seconda.
 * Con COMPUTO_PDF_QA_DIR il PDF si salva per guardarlo.
 */
const voce = (capitolo: string, descrizione: string, unita: string, quantita: string, prezzo: string) => ({ ...voceVuota(), capitolo, descrizione, unita, quantita, prezzo });
const bozza = { ...bozzaVuota(), titolo: "Campo da tennis in resina", committente: "Circolo Tennis Monza", indirizzo: "Via dello Sport 1, 20900 Monza (MB)",
  oggetto: "Realizzazione di un campo da tennis 18 × 36 m con recinzione e illuminazione LED", numero: "P-2026-014", dataDocumento: "29/10/2026", tecnico: "Geom. Luca Bianchi",
  voci: [voce("Scavi e sottofondi", "Scavo di sbancamento dell'area del campo", "mc", "259,2", "12"), voce("Scavi e sottofondi", "Sottofondo in misto stabilizzato, spessore 30 cm", "mc", "194,4", "38"),
    voce("Pavimentazione sportiva", "Manto in resina acrilica a più strati", "mq", "648", "32"), voce("Pavimentazione sportiva", "Tracciatura delle linee di gioco", "corpo", "1", "650"),
    voce("Recinzione e illuminazione", "Recinzione perimetrale h 4 m", "m", "108", "85"), voce("Recinzione e illuminazione", "Proiettore LED su palo da 10 m", "cad", "8", "1100")] };

describe("copertina del preventivo con computo", () => {
  it("piena: una pagina a sé, col titolo e i dati del lavoro, senza prezzo e senza piè di pagina", async () => {
    const modello = { ...modelloComputoDiSerie(), clausoleDaApprovare: "Art. 5 - Varianti in corso d'opera\nArt. 9 - Foro competente", premessa: "Gentile cliente, ecco il computo delle lavorazioni concordate in sopralluogo.", piePagina: "Impresa Esempio srl" };
    const doc = await generaComputoPdf(vociDaBozza(bozza), { ...bozza, presentazione: "preventivo", azienda: "Impresa Esempio srl", dettagliAzienda: "Via Roma 1, Monza | P.IVA 01234567890",
      indirizzoIntervento: bozza.indirizzo, stato: "", veste: vesteDalModello(modello), ivaModalita: "applicata", ivaAliquota: "10",
      calcoloDetrazione: calcolaDetrazione({ tipo: "ristrutturazione-prima-casa", percentuale: "", anni: 10, nota: "", tetto: "" }, 50000),
      condizioniContrattuali: "# Condizioni contrattuali\n## 1. Oggetto\n- I lavori sono quelli del computo allegato.\n## 2. Pagamenti\nSecondo il piano dei pagamenti.",
      cronoprogramma: cronoDaCapitoli(bozza, "02/11/2026"), firmaCommittente: "Circolo Tennis Monza" });
    const pdf = doc.output();
    expect(doc.getNumberOfPages()).toBeGreaterThan(2);
    expect(pdf).toContain("PREVENTIVO · COMPUTO METRICO ESTIMATIVO");
    expect(pdf).toContain("Dati del lavoro");
    expect(pdf).toContain("Detrazione fiscale"); expect(pdf).toContain("COSTO EFFETTIVO DOPO LA DETRAZIONE");
    expect(pdf).toContain("Condizioni contrattuali"); expect(pdf).toContain("1. Oggetto");
    expect(pdf).not.toContain(`Pagina 1 di ${doc.getNumberOfPages()}`);
    expect(pdf).toContain("APPROVAZIONE SPECIFICA"); // jsPDF scappa le parentesi: «\(ARTT. 1341…\)»
    if (process.env.COMPUTO_PDF_QA_DIR) {
      const dest = path.resolve(process.env.COMPUTO_PDF_QA_DIR, "copertina-piena.pdf");
      await mkdir(path.dirname(dest), { recursive: true }); await writeFile(dest, Buffer.from(doc.output("arraybuffer")));
    }
  }, 30_000);
  it("con la copertina spenta il documento parte dalla testata, come prima", async () => {
    const doc = await generaComputoPdf(vociDaBozza(bozza), { ...bozza, presentazione: "preventivo", azienda: "Impresa Esempio srl", stato: "", veste: vesteDalModello(modelloComputoDiSerie()), sezioni: { copertina: false } });
    expect(doc.output()).not.toContain("Dati del lavoro");
  }, 30_000);
});
