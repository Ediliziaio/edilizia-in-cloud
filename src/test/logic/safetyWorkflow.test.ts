import { describe, it, expect } from "vitest";
import {
  fasePos,
  faseDurc,
  faseAdempimento,
  faseNota,
  DUVRI_STAGES,
  VERBALI_STAGES,
} from "@/lib/sicurezza/workflow";
import { posVuoto } from "../../../supabase/functions/_shared/posModello";
describe("Fasi sicurezza cantiere", () => {
  const now = new Date(2026, 9, 26, 12);
  it("mantiene approvazioni e archivio POS distinti dalla sola compilazione", () => {
    expect(
      fasePos({ status: "bozza", daCompilare: false, contenuto: posVuoto() }),
    ).toBe("compilare");
    expect(
      fasePos({
        status: "approvato",
        daCompilare: false,
        contenuto: posVuoto(),
      }),
    ).toBe("approvato");
    expect(
      fasePos({
        status: "archiviato",
        daCompilare: true,
        contenuto: posVuoto(),
      }),
    ).toBe("archiviato");
    expect(
      fasePos({
        status: "stato_futuro",
        daCompilare: false,
        contenuto: posVuoto(),
      }),
    ).toBe("altro");
  });
  it("non classifica date assenti o non valide come DURC non scaduti", () => {
    for (const date of [null, "", "invalida"])
      expect(faseDurc(date, now)).toBe("mancante");
    expect(faseDurc("2026-10-25", now)).toBe("scaduto");
    expect(faseDurc("2026-10-26", now)).toBe("in_scadenza");
    expect(faseDurc("2026-11-25", now)).toBe("in_scadenza");
    expect(faseDurc("2026-11-26", now)).toBe("in_validita");
  });
  it("deriva il ritardo dalla data e mantiene completata un’attività con data passata", () => {
    expect(
      faseAdempimento(
        { stato: "completato", scadenza_data: "2026-01-01" },
        now,
      ),
    ).toBe("completato");
    expect(
      faseAdempimento({ stato: "da_fare", scadenza_data: "2026-01-01" }, now),
    ).toBe("scaduto");
    expect(
      faseAdempimento({ stato: "da_fare", scadenza_data: "2026-10-26" }, now),
    ).toBe("da_fare");
    expect(faseAdempimento({ stato: "da_fare" }, now)).toBe("da_fare");
  });
  it("rispetta gli stati DUVRI effettivi e non perde verbali con esiti sconosciuti", () => {
    expect(DUVRI_STAGES.map((s) => s.id)).not.toContain("approvato");
    expect(faseNota("firmato", DUVRI_STAGES)).toBe("firmato");
    expect(faseNota("in_attesa", VERBALI_STAGES)).toBe("altro");
  });
});
