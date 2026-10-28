import { expect, it } from "vitest";
import {
  normalizzaRequisitiAddettiPos,
  contestoLavorazioneAddetti,
  erroriRequisitiAddettiPos,
} from "../../../supabase/functions/_shared/posRequisitiAddetti";
import {
  posVuoto,
  lavorazioneVuota,
  normalizzaPos,
  vociMancanti,
} from "../../../supabase/functions/_shared/posModello";
import {
  applicaRiusoPos,
  lavorazioniRiutilizzabili,
} from "../../../supabase/functions/_shared/posRiuso";
import { id, fontePropria } from "../fixtures/riesameProprioPos";
function esempio() {
  const l = lavorazioneVuota("TEST-lavorazione"),
    f = fontePropria();
  const v = normalizzaRequisitiAddettiPos({
    modalita: "riesami",
    dal: f.dal,
    al: f.al,
    motivazione: "",
    adattamento: "TEST riscontri applicati all’attività",
    fonti: [{ id: f.id, impronta: f.impronta, fotografia: f }],
    confermata: true,
    contesto_lavorazione: contestoLavorazioneAddetti(l),
  });
  l.requisiti_addetti = v;
  return { l, v, f };
}
it("non inventa riscontri o conferme quando il campo manca", () => {
  expect(normalizzaRequisitiAddettiPos(null)).toMatchObject({
    modalita: "da_verificare",
    fonti: [],
    confermata: false,
    contesto_lavorazione: null,
  });
  const { l } = esempio();
  expect(
    erroriRequisitiAddettiPos(undefined, l, "2026-11-01", "2026-11-30"),
  ).toHaveLength(1);
});
it("mantiene il riesame selezionato e verifica che copra il periodo dichiarato", () => {
  const { l, v } = esempio();
  expect(erroriRequisitiAddettiPos(v, l, "2026-11-01", "2026-11-30")).toEqual(
    [],
  );
  v.dal = "2026-11-09";
  expect(
    erroriRequisitiAddettiPos(v, l, "2026-11-01", "2026-11-30").join(),
  ).toMatch(/intero periodo/);
  v.dal = "2026-10-31";
  expect(
    erroriRequisitiAddettiPos(v, l, "2026-11-01", "2026-11-30").join(),
  ).toMatch(/date del POS/);
});
it.each(["titolo", "rischi", "misure", "turni", "fase_id"])(
  "una modifica di %s invalida la conferma della lavorazione",
  (key) => {
    const { l, v } = esempio();
    Object.assign(l, { [key]: key === "fase_id" ? id(99) : "TEST variazione" });
    expect(
      erroriRequisitiAddettiPos(v, l, "2026-11-01", "2026-11-30").join(),
    ).toMatch(/dopo le modifiche/);
  },
);
it("l’ordine dei campi JSON non genera una falsa modifica", () => {
  const { l, v } = esempio();
  v.contesto_lavorazione = Object.fromEntries(
    Object.entries(v.contesto_lavorazione!).reverse(),
  );
  expect(erroriRequisitiAddettiPos(v, l, "2026-11-01", "2026-11-30")).toEqual(
    [],
  );
});
it("esclude l’organico proprio soltanto per subappalto esplicito, senza prove residue", () => {
  const { l, v } = esempio();
  v.modalita = "altra_gestione";
  v.motivazione = "TEST lavorazione affidata integralmente";
  v.fonti = [];
  expect(
    erroriRequisitiAddettiPos(v, l, "2026-11-01", "2026-11-30").join(),
  ).toMatch(/altra gestione/);
  l.svolgimento = "subappalto";
  l.svolgimento_con = "TEST impresa esterna";
  v.contesto_lavorazione = contestoLavorazioneAddetti(l);
  expect(erroriRequisitiAddettiPos(v, l, "2026-11-01", "2026-11-30")).toEqual(
    [],
  );
});
it("non eredita persone, prove o conferme nei modelli e nelle duplicazioni di POS", () => {
  const { l } = esempio(),
    p = posVuoto();
  p.versione_requisiti_addetti = 1;
  p.lavorazioni = [l];
  expect(lavorazioniRiutilizzabili(p)[0].requisiti_addetti).toBeUndefined();
  const destinazione = applicaRiusoPos(posVuoto(), p);
  expect(destinazione.versione_requisiti_addetti).toBe(1);
  expect(destinazione.lavorazioni[0].requisiti_addetti).toBeUndefined();
});
it("normalizza il protocollo e include i mancanti nella completezza", () => {
  const { l } = esempio(),
    p = posVuoto();
  p.versione_requisiti_addetti = 1;
  p.lavorazioni = [l];
  const n = normalizzaPos(p);
  expect(n.versione_requisiti_addetti).toBe(1);
  expect(n.lavorazioni[0].requisiti_addetti?.fonti[0].id).toBe(id(3));
  n.lavorazioni[0].requisiti_addetti!.confermata = false;
  expect(
    vociMancanti(n).some((v) =>
      JSON.stringify(v).includes("Requisiti addetti"),
    ),
  ).toBe(true);
});
