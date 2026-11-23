import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/campo/useCampoWorkDay", () => ({ useCampoWorkDay: () => "2026-11-23" }));
vi.mock("@/hooks/useCalendarioCantiere", () => ({ useCalendarioCantiere: () => ({ lavorativo: () => true }) }));
import { FasiSchedaCantiere, conArticolo, faseInRitardo } from "@/components/campo/PianoSchedaCantiere";
import type { FaseSchedaCantiere } from "@/lib/campo/schedaCantiere";

afterEach(cleanup);
const fase = (id: string, status: string, end_date: string | null) =>
  ({ id, name: `Fase ${id}`, status, end_date, start_date: null, percentuale: 0, sottofasi: [], note: null }) as unknown as FaseSchedaCantiere;

describe("Ritardi delle fasi nella scheda cantiere (collaudo 23/11)", () => {
  it("una fase non conclusa con la fine passata è in ritardo; conclusa o senza data no", () => {
    expect(faseInRitardo(fase("a", "in_corso", "2026-06-08"), "2026-11-23")).toBe("2026-06-08");
    expect(faseInRitardo(fase("b", "completata", "2026-06-08"), "2026-11-23")).toBeNull();
    expect(faseInRitardo(fase("c", "da_iniziare", null), "2026-11-23")).toBeNull();
    expect(faseInRitardo(fase("d", "da_iniziare", "2026-11-23"), "2026-11-23")).toBeNull();
  });

  it("il conteggio in cima e la riga della fase dicono il ritardo", () => {
    render(<FasiSchedaCantiere fasi={[fase("a", "in_corso", "2026-06-08"), fase("b", "completata", "2026-06-17"), fase("c", "da_iniziare", "2026-07-14")]} />);
    expect(screen.getByText(/2 in ritardo/)).toBeInTheDocument();
    expect(screen.getAllByText(/In ritardo · doveva finire/)).toHaveLength(2);
  });

  it("l'articolo davanti alla data è italiano: l'8, l'11, il 9", () => {
    expect(conArticolo("8 giu 2026")).toBe("l’8 giu 2026");
    expect(conArticolo("11 giu 2026")).toBe("l’11 giu 2026");
    expect(conArticolo("9 giu 2026")).toBe("il 9 giu 2026");
    expect(conArticolo("18 giu 2026")).toBe("il 18 giu 2026");
  });
});
