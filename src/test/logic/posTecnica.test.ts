import { describe, expect, it } from "vitest";
import {
  CAMPI_CONTESTO_TECNICO,
  CAMPI_RISCHIO_TECNICO,
  CAMPI_ATTREZZATURA_TECNICA,
  tecnicaPosVuota,
  normalizzaTecnicaPos,
  rischioTecnicoVuoto,
  attrezzaturaTecnicaVuota,
  erroriTecnicaPos,
  tecnicaPosRiutilizzabile,
  invalidaRiesameTecnico,
  supportaTecnicaPos,
  type TecnicaLavorazionePos,
} from "../../../supabase/functions/_shared/posTecnica";
import {
  normalizzaPos,
  lavorazioneVuota,
  posVuoto,
  vociMancanti,
} from "../../../supabase/functions/_shared/posModello";
import { applicaRiusoPos } from "../../../supabase/functions/_shared/posRiuso";
import { costruisciHtmlPos } from "../../../supabase/functions/_shared/posHtml";
export function completa(): TecnicaLavorazionePos {
  const t = tecnicaPosVuota();
  for (const k of Object.keys(CAMPI_CONTESTO_TECNICO))
    (t as unknown as Record<string, unknown>)[k] = `TEST ${k}`;
  const r = rischioTecnicoVuoto("r1");
  for (const k of Object.keys(CAMPI_RISCHIO_TECNICO))
    (r as unknown as Record<string, unknown>)[k] = `TEST ${k}`;
  const a = attrezzaturaTecnicaVuota("a1");
  for (const k of Object.keys(CAMPI_ATTREZZATURA_TECNICA))
    (a as unknown as Record<string, unknown>)[k] = `TEST ${k}`;
  return {
    ...t,
    rischi: [r],
    attrezzature: [a],
    attrezzature_previste: "si" as const,
    riesaminata: true,
  };
}
function pos() {
  const p = posVuoto();
  p.versione_tecnica = 1;
  p.lavorazioni = [{ ...lavorazioneVuota("l"), tecnica: completa() }];
  return p;
}
describe("Dettaglio tecnico POS", () => {
  it("il vecchio contenuto non viene marcato come riesaminato o aggiornato", () => {
    const p = normalizzaPos(posVuoto());
    expect(p.versione_tecnica).toBeUndefined();
    expect(normalizzaTecnicaPos(null).riesaminata).toBe(false);
  });
  it("normalizza solo la struttura ammessa, senza path e attestazioni client arbitrarie", () => {
    const t = normalizzaTecnicaPos({
      ...completa(),
      file_path: "privato",
      firma: "falsa",
      rischi: [{ ...completa().rischi[0], approvato_da: "falso" }],
    });
    expect(JSON.stringify(t)).not.toMatch(/privato|falsa|falso/);
    expect(erroriTecnicaPos(t)).toEqual([]);
  });
  it("l’adozione è una capacità separata dal protocollo precedente", () => {
    expect(
      supportaTecnicaPos({ versione_client: 2, versione_prodotti_client: 1 }),
    ).toBe(false);
    expect(
      supportaTecnicaPos({ versione_client: 2, versione_tecnica_client: "1" }),
    ).toBe(false);
    expect(
      supportaTecnicaPos({ versione_client: 2, versione_tecnica_client: 1 }),
    ).toBe(true);
  });
  it("manca una scheda specifica anche se il riepilogo generico è compilato", () => {
    const p = pos();
    delete p.lavorazioni[0].tecnica;
    p.lavorazioni[0].rischi = "Rischio generico";
    expect(
      vociMancanti(p).some((v) => v.testo.includes("scheda tecnica")),
    ).toBe(true);
  });
  it.each(Object.keys(CAMPI_CONTESTO_TECNICO))(
    "richiede il contesto %s",
    (k) => {
      const t = completa();
      (t as unknown as Record<string, unknown>)[k] = " ";
      expect(erroriTecnicaPos(t).length).toBeGreaterThan(0);
    },
  );
  it.each(Object.keys(CAMPI_RISCHIO_TECNICO))(
    "non accetta rischio senza %s",
    (k) => {
      const t = completa();
      (t.rischi[0] as unknown as Record<string, unknown>)[k] = "";
      expect(erroriTecnicaPos(t).length).toBeGreaterThan(0);
    },
  );
  it.each(Object.keys(CAMPI_ATTREZZATURA_TECNICA))(
    "non accetta attrezzatura senza %s",
    (k) => {
      const t = completa();
      (t.attrezzature[0] as unknown as Record<string, unknown>)[k] = "";
      expect(erroriTecnicaPos(t).length).toBeGreaterThan(0);
    },
  );
  it("nessuna attrezzatura richiede motivazione e non può nascondere schede presenti", () => {
    const t = completa();
    t.attrezzature_previste = "no";
    expect(erroriTecnicaPos(t)).not.toEqual([]);
    t.attrezzature = [];
    t.motivo_senza_attrezzature = "Motivazione sintetica di collaudo";
    expect(erroriTecnicaPos(t)).toEqual([]);
  });
  it("assenza di rischi, identificativi duplicati e riesame non confermato sono bloccanti", () => {
    const t = completa();
    t.rischi.push({ ...t.rischi[0] });
    expect(erroriTecnicaPos(t).some((e) => e.includes("duplicati"))).toBe(true);
    t.rischi = [];
    t.riesaminata = false;
    expect(erroriTecnicaPos(t)).toContain(
      "descrivi i rischi specifici della lavorazione",
    );
    expect(erroriTecnicaPos(t)).toContain(
      "riesamina il dettaglio tecnico per questo cantiere",
    );
  });
  it("il contenuto tecnico attraversa normalizzazione e stampa con escaping", () => {
    const p = pos();
    p.lavorazioni[0].tecnica!.rischi[0].pericolo = "<script>TEST</script>";
    const n = normalizzaPos(p);
    expect(n.versione_tecnica).toBe(1);
    expect(n.lavorazioni[0].tecnica).toEqual(p.lavorazioni[0].tecnica);
    const html = costruisciHtmlPos({
      contenuto: n,
      stato: "bozza",
      revisione: 0,
      revisioni: [],
    });
    expect(html).toContain("Valutazione residua e verifiche di efficacia");
    expect(html).toContain("&lt;script&gt;TEST&lt;/script&gt;");
    expect(html).not.toContain("<script>TEST");
  });
  it("riuso mantiene proposte tecniche ma elimina persone esposte, valutazioni, fonti e attrezzature reali", () => {
    const src = pos();
    const t = src.lavorazioni[0].tecnica!;
    t.area = "CANTIERE PRECEDENTE";
    t.rischi[0].esposti = "PERSONA PRECEDENTE";
    t.rischi[0].riferimento = "DOCUMENTO PRECEDENTE";
    t.attrezzature[0].identificativo = "MATRICOLA PRECEDENTE";
    const dst = applicaRiusoPos(posVuoto(), src);
    expect(dst.versione_tecnica).toBe(1);
    expect(dst.lavorazioni[0].tecnica?.riesaminata).toBe(false);
    expect(JSON.stringify(dst)).not.toContain("PRECEDENTE");
    expect(
      erroriTecnicaPos(tecnicaPosRiutilizzabile(t)).length,
    ).toBeGreaterThan(0);
    expect(t.riesaminata).toBe(true);
  });
  it("modifica di rischio, prodotto, fase o contesto revoca il riesame", () => {
    for (const cambio of [
      (p: ReturnType<typeof pos>) => {
        p.lavorazioni[0].tecnica!.rischi[0].misure_collettive = "Nuove";
      },
      (p: ReturnType<typeof pos>) => {
        p.lavorazioni[0].fase_id = "altra";
      },
      (p: ReturnType<typeof pos>) => {
        p.opera.cantiere.via = "Altro indirizzo";
      },
      (p: ReturnType<typeof pos>) => {
        p.procedure_psc.richieste = true;
      },
    ]) {
      const prima = pos();
      const dopo = structuredClone(prima);
      cambio(dopo);
      invalidaRiesameTecnico(prima, dopo);
      expect(dopo.lavorazioni[0].tecnica!.riesaminata).toBe(false);
      expect(prima.lavorazioni[0].tecnica!.riesaminata).toBe(true);
    }
  });
  it("conferma esplicita non si autoannulla e riordino non perde il riesame", () => {
    const prima = pos();
    prima.lavorazioni[0].tecnica!.riesaminata = false;
    const dopo = structuredClone(prima);
    dopo.lavorazioni[0].tecnica!.riesaminata = true;
    invalidaRiesameTecnico(prima, dopo);
    expect(dopo.lavorazioni[0].tecnica!.riesaminata).toBe(true);
  });
});
