import { describe, expect, it } from "vitest";
import {
  appuntamentiImminenti,
  componiPromemoriaAppuntamento,
  minutiDaHHMM,
  type AppuntamentoRow,
} from "../../../supabase/functions/_shared/promemoriaAppuntamento";

describe("promemoria appuntamento del bot", () => {
  it("converte HH:MM in minuti, scarta i formati sbagliati", () => {
    expect(minutiDaHHMM("14:30")).toBe(870);
    expect(minutiDaHHMM("09:05:00")).toBe(545);
    expect(minutiDaHHMM("")).toBeNull();
    expect(minutiDaHHMM("mezzogiorno")).toBeNull();
    expect(minutiDaHHMM("30:00")).toBeNull();
  });

  it("prende solo gli appuntamenti di oggi dentro la finestra di anticipo", () => {
    const appts: AppuntamentoRow[] = [
      { id: "a", appointment_date: "2026-09-28", appointment_time: "15:00" }, // tra 90'
      { id: "b", appointment_date: "2026-09-28", appointment_time: "18:00" }, // tra 270' (fuori)
      { id: "c", appointment_date: "2026-09-27", appointment_time: "15:00" }, // ieri
      { id: "d", appointment_date: "2026-09-28", appointment_time: "13:00" }, // già passato
    ];
    // adesso = 13:30 (810'), anticipo 120'
    const out = appuntamentiImminenti(appts, "2026-09-28", 810, 120);
    expect(out.map((a) => a.id)).toEqual(["a"]);
  });

  it("compone il promemoria con ora e luogo", () => {
    const t = componiPromemoriaAppuntamento({
      id: "a",
      title: "Sopralluogo Rossi",
      appointment_time: "15:00:00",
      formatted_address: "Via Roma 1, Como",
    });
    expect(t).toContain("Sopralluogo Rossi");
    expect(t).toContain("alle 15:00");
    expect(t).toContain("📌 Via Roma 1, Como");
  });

  it("senza luogo, omette la riga del posto", () => {
    const t = componiPromemoriaAppuntamento({ id: "a", title: "Call", appointment_time: "10:00" });
    expect(t).toContain("Call");
    expect(t).not.toContain("📌");
  });
});
