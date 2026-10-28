import { describe, expect, it } from "vitest";
import {
  normalizzaDocumentoTecnico,
  normalizzaFontiTecniche,
  erroriFontiTecniche,
  supportaFontiTecnichePos,
} from "../../../supabase/functions/_shared/posFontiTecniche";
import {
  normalizzaPos,
  posVuoto,
  lavorazioneVuota,
  vociMancanti,
} from "../../../supabase/functions/_shared/posModello";
import {
  tecnicaPosVuota,
  rischioTecnicoVuoto,
  tecnicaPosRiutilizzabile,
} from "../../../supabase/functions/_shared/posTecnica";
const id = "11111111-1111-4111-8111-111111111111";
const doc = () =>
  normalizzaDocumentoTecnico({
    id,
    order_id: "ordine",
    fase_id: null,
    tipo: "attrezzatura",
    titolo: "TEST Manuale",
    file_name: "manuale.pdf",
    revisione: "1",
    data_rilascio: "2026-10-01",
    stato: "verificato",
    disponibile: true,
    confermata: true,
    impronta: "a".repeat(64),
  });
const fonte = () =>
  normalizzaFontiTecniche({
    modalita: "documenti",
    motivazione: "",
    documenti: [doc()],
  });
describe("Fonti tecniche versionate", () => {
  it("non attribuisce una fonte o una conferma a dati vuoti", () => {
    expect(normalizzaFontiTecniche(null)).toEqual({
      modalita: "da_verificare",
      motivazione: "",
      documenti: [],
    });
    expect(normalizzaDocumentoTecnico({ confermata: "true" }).confermata).toBe(
      false,
    );
  });
  it("scarta path, bucket e proprietà non ammesse", () => {
    expect(
      JSON.stringify(
        normalizzaDocumentoTecnico({
          ...doc(),
          file_path: "privato",
          bucket: "HR",
          firma: "falsa",
        }),
      ),
    ).not.toMatch(/privato|HR|falsa/);
  });
  it("la capacità è distinta da quella delle sole schede tecniche", () => {
    expect(
      supportaFontiTecnichePos({
        versione_client: 2,
        versione_tecnica_client: 1,
      }),
    ).toBe(false);
    expect(
      supportaFontiTecnichePos({
        versione_client: 2,
        versione_tecnica_client: 1,
        versione_fonti_tecniche_client: 1,
      }),
    ).toBe(true);
  });
  it("una fotografia coerente copre il periodo senza diventare valutazione automatica", () => {
    expect(
      erroriFontiTecniche(
        fonte(),
        "rischio",
        "ordine",
        null,
        "2026-11-01",
        "2026-11-30",
      ),
    ).toEqual([]);
  });
  it.each([
    { confermata: false },
    { stato: "ricevuto" },
    { disponibile: false },
    { impronta: "mancante" },
    { revisione: null },
    { data_rilascio: null },
    { order_id: "altra" },
    { fase_id: "altra" },
    { data_rilascio: "2026-11-10" },
    { applicabile_dal: "2026-11-10" },
    { data_scadenza: "2026-11-20" },
    { applicabile_al: "2026-11-20" },
  ])("rifiuta fonte fuori ambito o incompleta: %j", (extra) => {
    const f = fonte();
    Object.assign(f.documenti[0], extra);
    expect(
      erroriFontiTecniche(
        f,
        "attrezzatura",
        "ordine",
        null,
        "2026-11-01",
        "2026-11-30",
      ).length,
    ).toBeGreaterThan(0);
  });
  it("assenza di fine POS non rende sufficiente un documento con fine limitata", () => {
    const f = fonte();
    f.documenti[0].data_scadenza = "2026-12-31";
    expect(
      erroriFontiTecniche(f, "rischio", "ordine", null, "2026-11-01", "")
        .length,
    ).toBeGreaterThan(0);
  });
  it("valutazione nel POS e non applicabilità sono scelte distinte, motivate e senza allegati nascosti", () => {
    const f = normalizzaFontiTecniche({
      modalita: "testo_pos",
      motivazione: "TEST motivazione",
      documenti: [],
    });
    expect(erroriFontiTecniche(f, "rischio")).toEqual([]);
    expect(erroriFontiTecniche(f, "attrezzatura").length).toBeGreaterThan(0);
    f.modalita = "non_applicabile";
    expect(erroriFontiTecniche(f, "attrezzatura")).toEqual([]);
    expect(erroriFontiTecniche(f, "rischio").length).toBeGreaterThan(0);
    f.documenti = [doc()];
    expect(erroriFontiTecniche(f, "attrezzatura").length).toBeGreaterThan(0);
  });
  it("documenti duplicati non vengono accettati nella stessa scheda", () => {
    const f = fonte();
    f.documenti.push(doc());
    expect(
      erroriFontiTecniche(f, "rischio").some((e) => e.includes("duplicati")),
    ).toBe(true);
  });
  it("normalizzazione POS conserva il protocollo ma il riuso elimina le fonti del vecchio cantiere", () => {
    const p = posVuoto();
    p.versione_tecnica = 1;
    p.versione_fonti_tecniche = 1;
    const t = tecnicaPosVuota();
    t.rischi = [{ ...rischioTecnicoVuoto("r"), fonti: fonte() }];
    p.lavorazioni = [{ ...lavorazioneVuota("l"), tecnica: t }];
    const n = normalizzaPos(p);
    expect(n.versione_fonti_tecniche).toBe(1);
    expect(n.lavorazioni[0].tecnica?.rischi[0].fonti?.documenti[0].id).toBe(id);
    expect(tecnicaPosRiutilizzabile(t).rischi[0].fonti?.documenti).toEqual([]);
    expect(tecnicaPosRiutilizzabile(t).rischi[0].fonti?.modalita).toBe(
      "da_verificare",
    );
  });
  it("una vecchia scheda sintetica non ottiene un'approvazione implicita delle fonti", () => {
    const p = posVuoto();
    p.versione_tecnica = 1;
    p.versione_fonti_tecniche = 1;
    const t = tecnicaPosVuota();
    t.rischi = [rischioTecnicoVuoto("r")];
    p.lavorazioni = [{ ...lavorazioneVuota("l"), tecnica: t }];
    expect(
      vociMancanti(p).some((v) => v.testo.includes("scegli come documentare")),
    ).toBe(true);
  });
});
