import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { archivioPrevisionale } from "../../../dev/previsionale-cantiere/store.mts";
import { economiaFasi } from "@/lib/orders/economiaFasi";
import { riepilogaPrevisioni, type PianoPrevisto } from "@/lib/orders/previsionaleSalvato";

const squadra = { id: "muratori", nome: "Squadra Muratori", componenti: ["mario", "luca"] };
const fase: PianoPrevisto = {
  ambito: { tipo: "fase", id: "f1", faseId: "f1" },
  persone: [], squadre: [squadra],
  operai: [{ id: "mario", nome: "Mario", tariffa: 25 }, { id: "luca", nome: "Luca", tariffa: 30 }],
  dal: "2026-11-23", al: "2026-11-25", giorni: ["2026-11-23", "2026-11-24", "2026-11-25"],
  oreGiorno: 8, microOreGiorno: 8e6, sabato: false,
};
const voce: PianoPrevisto = {
  ...fase,
  ambito: { tipo: "sottofase", id: "s1", faseId: "f1" },
  al: "2026-11-24", giorni: ["2026-11-23", "2026-11-24"], oreGiorno: 4, microOreGiorno: 4e6,
};

it("riapre il database e legge date, ore, tariffa e costo della fase senza duplicare la voce", () => {
  const cartella = mkdtempSync(join(tmpdir(), "eic-previsto-"));
  let db = new DatabaseSync(join(cartella, "prova.sqlite"));
  try {
    const scrittura = archivioPrevisionale(db);
    expect(scrittura.aggiorna("azienda", "ordine", 0, "prima", [fase, voce]).versione).toBe(1);
    db.close();
    db = new DatabaseSync(join(cartella, "prova.sqlite"));
    const lettura = archivioPrevisionale(db);
    const salvato = lettura.leggi("azienda", "ordine");
    expect(salvato.piani).toEqual([fase, voce]);
    expect(lettura.leggi("altra", "ordine").piani).toEqual([]);
    expect(lettura.leggi("azienda", "altra").piani).toEqual([]);
    const { fasi, ambiti } = riepilogaPrevisioni(salvato.piani);
    expect(ambiti.get("sottofase:s1")).toEqual({ ore: 16, costo: 440, incompleto: false });
    expect(ambiti.get("fase:f1")).toEqual({ ore: 32, costo: 880, incompleto: false });
    expect(fasi.get("f1")).toMatchObject({ ore: 48, costo: 1320 });

    const conto = economiaFasi({
      fasi: [{ id: "f1", importo_venduto: 4000 }], righe: [],
      assegnazioni: [{ phase_id: "f1", employee_id: "mario", planned_hours: 28, source: "employee", cost_preventivo: 700, cost_consuntivo: 80 },
        { phase_id: "f1", employee_id: "altro", source: "employee", cost_preventivo: 100, cost_consuntivo: 30 }],
      vociPreviste: [{ phase_id: "f1", subphase_id: "s1", quantita: 1, costo_manodopera: 600, costo_materiali: 300 }],
      pianiManodopera: fasi, ambitiPianificati: new Set(["fase:f1", "sottofase:s1"]),
    }).perFase.get("f1");
    expect(conto).toMatchObject({ costoPrevisto: 1820, previsto: { manodopera: 1520, materiali: 300 }, costoConsuntivo: 110 });
    expect(lettura.aggiorna("azienda", "ordine", 0, "prima", [fase, voce]).versione).toBe(1);
    expect(() => lettura.aggiorna("azienda", "ordine", 0, "concorrente", [])).toThrow(/cambiato/);
    expect(lettura.aggiorna("azienda", "ordine", 1, "rimozione", [], "sottofase:s1").piani).toEqual([fase]);
  } finally {
    db.close();
    rmSync(cartella, { recursive: true, force: true });
  }
});

it("mantiene il costo delle voci ancora da pianificare e segnala le tariffe mancanti", () => {
  const piano: PianoPrevisto = { ...voce, operai: [{ id: "mario", nome: "Mario", tariffa: null }] };
  const { fasi } = riepilogaPrevisioni([piano]);
  const conto = economiaFasi({
    fasi: [{ id: "f1", importo_venduto: 4000 }], righe: [], assegnazioni: [],
    vociPreviste: [
      { phase_id: "f1", subphase_id: "s1", quantita: 3, costo_manodopera: 600, costo_materiali: 0 },
      { phase_id: "f1", subphase_id: "s2", quantita: 2, costo_manodopera: 350, costo_materiali: 100 },
    ],
    pianiManodopera: fasi, ambitiPianificati: new Set(["sottofase:s1"]),
  }).perFase.get("f1");
  expect(conto).toMatchObject({ costoPrevisto: 900, costoIncompleto: true, marginePrevistoPct: null });
});
