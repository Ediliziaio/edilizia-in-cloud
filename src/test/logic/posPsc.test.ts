import { describe, expect, it } from "vitest";
import {
  improntaPsc,
  normalizzaRiferimentoPsc,
  percorsoPscValido,
  type RiferimentoPsc,
  stessaFontePsc,
} from "../../../supabase/functions/_shared/posPsc";
import {
  lavorazioneVuota,
  normalizzaPos,
  posVuoto,
  vociMancanti,
} from "../../../supabase/functions/_shared/posModello";
import { costruisciHtmlPos } from "../../../supabase/functions/_shared/posHtml";
import { applicaRiusoPos } from "../../../supabase/functions/_shared/posRiuso";
const r: RiferimentoPsc = {
  archivio: "sicurezza_documenti",
  id: "doc",
  company_id: "company",
  order_id: "order",
  titolo: "PSC <script>",
  file_name: "psc.pdf",
  file_path: "company/documenti/order/file.pdf",
  data_documento: "2026-10-27",
  revisione: "02",
  sha256: "a".repeat(64),
};
describe("Riferimento PSC esplicito", () => {
  it("conserva riferimento e metadati delle prescrizioni nel round trip", () => {
    const p = posVuoto();
    p.procedure_psc = {
      psc_presente: true,
      richieste: true,
      documento: r,
      voci: [{
        procedura: "Delimita",
        indicazioni: "Barriere",
        pagina: "14 § 3",
        lavorazione_id: "l1",
        responsabile: "Preposto",
      }],
    };
    expect(normalizzaPos(p).procedure_psc).toEqual(p.procedure_psc);
  });
  it("titolo, nome file e revisione con spazi di testa o di coda restano la stessa fonte (il POS li salva senza spazi)", () => {
    const { sha256: _impronta, ...riferimento } = r;
    const fonte = { ...riferimento, titolo: "  PSC <script> ", file_name: "psc.pdf ", revisione: " 02 ", created_at: "2026-10-27T10:00:00Z" };
    expect(stessaFontePsc(riferimento, fonte)).toBe(true);
    expect(stessaFontePsc(riferimento, { ...fonte, titolo: "Altro titolo" })).toBe(false);
    expect(stessaFontePsc(riferimento, { ...fonte, revisione: "03" })).toBe(false);
    expect(stessaFontePsc({ ...riferimento, revisione: "A" }, { ...fonte, revisione: "  " })).toBe(true);
  });
  it("rifiuta fonti non tipizzate e impronte non valide", () => {
    expect(normalizzaRiferimentoPsc({ ...r, archivio: "altro" }))
      .toBeUndefined();
    expect(normalizzaRiferimentoPsc({ ...r, sha256: "boh" })).toBeUndefined();
    expect(normalizzaRiferimentoPsc({ ...r, order_id: "" })).toBeUndefined();
  });
  it("rifiuta percorsi di altro tenant, esterni e ambigui", () => {
    for (
      const p of [
        "other/x",
        "https://example.com/x",
        "company/../x",
        "company/a%2Fx",
        "company//file",
        "company/x?y",
      ]
    ) expect(percorsoPscValido(p, "company")).toBe(false);
  });
  it("distingue una fonte modificata da una revisione dichiarata per archivio senza revisione", () => {
    const f = { ...r, created_at: "oggi", revisione: "" };
    expect(stessaFontePsc(r, f)).toBe(true);
    expect(stessaFontePsc(r, { ...f, titolo: "Nuovo" })).toBe(false);
    expect(stessaFontePsc(r, { ...f, revisione: "03" })).toBe(false);
    expect(stessaFontePsc(r, { ...f, order_id: "altro" })).toBe(false);
  });
  it("identifica i byte effettivi e rifiuta file vuoti", async () => {
    expect(await improntaPsc(new Blob(["abc"]))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await improntaPsc(new Blob(["abd"]))).not.toBe(
      await improntaPsc(new Blob(["abc"])),
    );
    await expect(improntaPsc(new Blob([]))).rejects.toThrow();
  });
  it("segnala originale mancante e risposte mancanti, non dichiara completo il solo switch", () => {
    const p = posVuoto();p.versione_psc=1;
    p.procedure_psc = {
      psc_presente: true,
      richieste: true,
      voci: [{ procedura: "Recinzione", indicazioni: "" }],
    };
    const m = vociMancanti(p).filter((x) => x.sezione === "psc");
    expect(m).toHaveLength(2);
  });
  it("segnala una lavorazione rimossa senza cancellare la prescrizione", () => {
    const p = posVuoto();
    p.procedure_psc = {
      psc_presente: true,
      richieste: true,
      documento: r,
      voci: [{
        procedura: "Recinzione",
        indicazioni: "Barriera",
        lavorazione_id: "sparita",
      }],
    };
    expect(vociMancanti(p).some((x) => x.sezione === "psc")).toBe(true);
  });
  it("stampa riferimento, impronta e responsabilità senza interpretare HTML", () => {
    const p = posVuoto();
    p.lavorazioni = [lavorazioneVuota("l1")];
    p.lavorazioni[0].titolo = "Posa";
    p.procedure_psc = {
      psc_presente: true,
      richieste: true,
      documento: r,
      voci: [{
        procedura: "Interdizione",
        indicazioni: "Barriere",
        pagina: "14",
        lavorazione_id: "l1",
        responsabile: "Rossi",
      }],
    };
    const html = costruisciHtmlPos({
      contenuto: p,
      stato: "bozza",
      revisione: 0,
      revisioni: [],
    });
    expect(html).toContain("PSC &lt;script&gt;");
    expect(html).toContain(r.sha256);
    expect(html).toContain("Responsabile operativo: Rossi");
    expect(html).toContain("Lavorazione: Posa");
    expect(html).not.toContain("PSC <script>");
  });
  it("non trasferisce il PSC di una commessa al duplicato di un’altra", () => {
    const p = posVuoto();
    p.procedure_psc.documento = r;
    expect(applicaRiusoPos(posVuoto(), p).procedure_psc.documento)
      .toBeUndefined();
  });
});
