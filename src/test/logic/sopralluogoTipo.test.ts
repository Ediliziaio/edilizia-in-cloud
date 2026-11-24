import { describe, expect, it } from "vitest";
import { filtraBacheca, type SopralluogoBacheca } from "@/lib/sopralluoghi/bacheca";
import { leggiFiltriBacheca, scriviFiltriBacheca } from "@/lib/sopralluoghi/filtriBacheca";

const riga = (id: string, tipo: SopralluogoBacheca["tipo"]): SopralluogoBacheca => ({
  id, code: id, status: "draft", tipo, scheduled_at: null, address: null, city: null, contact_id: null, client_id: null,
  technician_id: null, estimate_id: null, order_id: null, created_at: new Date().toISOString(),
});

describe("commerciali e tecnici in bacheca", () => {
  const righe = [riga("c", "commerciale"), riga("t", "tecnico"), riga("vecchio", null)];
  it("filtra per tipo; un rilievo senza tipo conta come tecnico", () => {
    expect(filtraBacheca(righe, { ambito: "commerciali" }).map((r) => r.id)).toEqual(["c"]);
    expect(filtraBacheca(righe, { ambito: "tecnici" }).map((r) => r.id)).toEqual(["t", "vecchio"]);
    expect(filtraBacheca(righe, { ambito: "tutti" })).toHaveLength(3);
  });
  it("il filtro sta nell'indirizzo come sop_tipo, senza toccare sop_ambito dell'archivio", () => {
    const p = scriviFiltriBacheca(new URLSearchParams("sop_ambito=all"), { ambito: "commerciali" });
    expect(p.get("sop_tipo")).toBe("commerciali");
    expect(p.get("sop_ambito")).toBe("all");
    expect(leggiFiltriBacheca(p).ambito).toBe("commerciali");
    expect(leggiFiltriBacheca(new URLSearchParams("sop_tipo=boh")).ambito).toBe("tutti");
  });
});
