import { describe, expect, it } from "vitest";
import { PHASE_TEMPLATES } from "@/hooks/useOrderWorkPhases";
import { MODELLI_STANDARD } from "@/lib/orders/modelliStandard";
import { fasiDelloStandard, modelloDiPartenza, modelliPerInizializzare } from "@/lib/orders/modelliFasi";
import { giorniDaSottofasi, pianificaFasi } from "@/lib/orders/pianoFasiNuovaCommessa";
import { calendarioCantiere } from "@/lib/orders/sottofasi";
import { modelliDiPartenzaDelProfilo, profiloLavori, tipoDelModelloDiPartenza } from "@/lib/orders/tipiLavoro";

const feriali = calendarioCantiere({ sabato: false, chiusure: new Set() });

describe("modelli standard con sottofasi e giorni tipici", () => {
  it("ogni modello ha un tipo di lavoro, ogni fase almeno una sottofase con i giorni", () => {
    for (const m of MODELLI_STANDARD) {
      expect(tipoDelModelloDiPartenza(m.key), m.key).not.toBeNull();
      for (const f of m.fasi) {
        expect(f.sottofasi.length, `${m.key} / ${f.nome}`).toBeGreaterThan(0);
        expect(giorniDaSottofasi(f), `${m.key} / ${f.nome}`).toBeGreaterThan(0);
      }
    }
  });
  it("PHASE_TEMPLATES conserva i nomi delle fasi e porta le sottofasi", () => {
    const bagno = PHASE_TEMPLATES.find((t) => t.key === "ristrutturazione_bagno")!;
    expect(bagno.phases[0]).toBe("Demolizioni e rimozioni");
    expect(modelloDiPartenza(bagno).fasi[0].sottofasi.map((s) => s.nome)).toContain("Protezione degli ambienti");
  });
  it("importare gli standard porta anche i giorni (salva_modello_fasi li salva)", () => {
    const serramenti = modelliPerInizializzare(PHASE_TEMPLATES).find((m) => m.nome === "Serramenti / Infissi")!;
    const attesa = serramenti.fasi.flatMap((f) => f.sottofasi).find((s) => s.nome === "Attesa merce dal fornitore");
    expect(attesa?.giorni).toBe(20);
  });
  it("le copie non toccano l'originale", () => {
    const copia = fasiDelloStandard(PHASE_TEMPLATES[0]);
    copia[0].sottofasi[0].giorni = 99;
    expect(MODELLI_STANDARD[0].fasi[0].sottofasi[0].giorni).not.toBe(99);
  });
});

describe("una commessa di serramenti dal modello standard", () => {
  it("rispetta l'attesa della merce: la posa cade 5 settimane dopo il rilievo", () => {
    const modello = modelliDiPartenzaDelProfilo(PHASE_TEMPLATES, profiloLavori(null, "serramenti"));
    expect(modello.map((t) => t.key)).toEqual(["serramenti_infissi"]);
    const fasi = fasiDelloStandard(modello[0]);
    const piano = pianificaFasi(fasi, { inizio: "2026-11-16", fine: null, lavorativo: feriali });
    const posa = piano.righe[fasi.findIndex((f) => f.nome === "Posa nuovi serramenti")];
    // Rilievo 2 giorni (16-17/11), ordine 1 (18/11), attesa merce 20 + controllo 1 (fino al 17/12), rimozione 1 (18/12).
    expect(posa.dal).toBe("2026-12-21");
    expect(piano.fineFasi).toBe("2026-12-25");
    // Con Natale chiuso, come nel calendario vero dell'azienda, si finisce dopo.
    const conNatale = calendarioCantiere({ sabato: false, chiusure: new Set(["2026-12-25"]) });
    expect(pianificaFasi(fasi, { inizio: "2026-11-16", fine: null, lavorativo: conNatale }).fineFasi).toBe("2026-12-28");
  });
});
