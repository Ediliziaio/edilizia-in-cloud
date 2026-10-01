import { describe, expect, it } from "vitest";
import {
  chiaveGiorno, contaPerCategoria, estremiIso, intervalloPreset, raggruppaPerGiorno,
  vocedaAttivitaRegistro, vocedaLogAzienda, type VoceLog,
} from "@/lib/users/logAttivitaUtente";

describe("log attività utente", () => {
  it("traduce i tipi del registro e del log aziendale", () => {
    expect(vocedaAttivitaRegistro("stage_changed")).toEqual({ categoria: "pipeline", titolo: "Fase cambiata" });
    expect(vocedaAttivitaRegistro("boh_strano")).toEqual({ categoria: "altro", titolo: "Boh strano" });
    expect(vocedaLogAzienda("contact.updated")).toEqual({ categoria: "contatti", titolo: "Contatto modificato" });
    expect(vocedaLogAzienda("task_created")).toEqual({ categoria: "attivita", titolo: "Task creato" });
  });

  it("calcola gli intervalli", () => {
    const adesso = new Date(2026, 8, 30, 15, 0);
    expect(intervalloPreset("oggi", adesso)).toEqual({ da: "2026-09-30", a: "2026-09-30" });
    expect(intervalloPreset("ieri", adesso)).toEqual({ da: "2026-09-29", a: "2026-09-29" });
    expect(intervalloPreset("7", adesso)).toEqual({ da: "2026-09-24", a: "2026-09-30" });
    expect(intervalloPreset("tutto", adesso)).toEqual({ da: null, a: null });
  });

  it("gli estremi coprono l'intera giornata", () => {
    const e = estremiIso({ da: "2026-09-30", a: "2026-09-30" });
    expect(new Date(e.a!).getTime() - new Date(e.da!).getTime()).toBeGreaterThan(86_399_000);
    expect(estremiIso({ da: null, a: null })).toEqual({ da: null, a: null });
  });

  it("raggruppa per giorno, più recenti prima, e conta", () => {
    const v = (id: string, quando: string, categoria: VoceLog["categoria"] = "note"): VoceLog => ({ id, quando, categoria, titolo: id });
    const voci = [v("a", "2026-09-28T09:00:00"), v("b", "2026-09-29T10:00:00"), v("c", "2026-09-29T18:00:00", "pipeline")];
    const g = raggruppaPerGiorno(voci);
    expect(g.map((x) => x.giorno)).toEqual([chiaveGiorno("2026-09-29T10:00:00"), chiaveGiorno("2026-09-28T09:00:00")]);
    expect(g[0].voci.map((x) => x.id)).toEqual(["c", "b"]);
    expect(contaPerCategoria(voci)).toEqual({ note: 2, pipeline: 1 });
  });
});
