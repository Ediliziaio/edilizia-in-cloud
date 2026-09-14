import { describe, expect, it } from "vitest";
import {
  confermaSalvate,
  modificheDaSalvare,
  segnaModifica,
  type ModificheInSospeso,
} from "@/lib/serramenti/modificheInSospeso";

interface Preventivo {
  note_cliente: string | null;
  sconto_percentuale: number | null;
  stato: string;
}

describe("autosave del preventivo: solo i campi toccati", () => {
  it("manda i campi modificati, mai lo stato o la firma caricati all'apertura", () => {
    const modifiche: ModificheInSospeso<Preventivo> = new Map();
    segnaModifica(modifiche, "note_cliente", "Posa a ottobre");
    segnaModifica(modifiche, "sconto_percentuale", 5);
    expect(modificheDaSalvare(modifiche).patch).toEqual({ note_cliente: "Posa a ottobre", sconto_percentuale: 5 });
  });

  it("una modifica fatta mentre si salva resta da salvare", () => {
    const modifiche: ModificheInSospeso<Preventivo> = new Map();
    segnaModifica(modifiche, "note_cliente", "Prima");
    segnaModifica(modifiche, "sconto_percentuale", 5);
    const { versioni } = modificheDaSalvare(modifiche);
    // Il salvataggio è partito; intanto si riscrive la nota.
    segnaModifica(modifiche, "note_cliente", "Dopo");
    confermaSalvate(modifiche, versioni);
    expect(modificheDaSalvare(modifiche).patch).toEqual({ note_cliente: "Dopo" });
  });

  it("un campo svuotato si salva come vuoto", () => {
    const modifiche: ModificheInSospeso<Preventivo> = new Map();
    segnaModifica(modifiche, "note_cliente", undefined);
    expect(modificheDaSalvare(modifiche).patch).toEqual({ note_cliente: null });
  });
});
