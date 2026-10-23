import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const db = vi.hoisted(() => ({ aggiornamenti: [] as { tabella: string; valori: unknown; filtri: [string, unknown][] }[], errore: null as string | null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => ({
      update: (valori: unknown) => {
        const voce = { tabella, valori, filtri: [] as [string, unknown][] };
        const catena = {
          eq: (c: string, v: unknown) => { voce.filtri.push([c, v]); return catena; },
          then: (ok: (r: unknown) => unknown) => { db.aggiornamenti.push(voce); return Promise.resolve({ error: db.errore ? { message: db.errore } : null }).then(ok); },
        };
        return catena;
      },
    }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { ModelloDelPreventivo, interventiPerTipo } from "@/components/preventivatore/ModelloDelPreventivo";

const snapshot = (modelId: string) => ({ version: 1 as const, modelId, companyId: "az", capturedAt: "2026-10-22T16:21:00.000Z", template: {} });
const progetto = { id: "p1", company_id: "az", stato: "bozza", tipo_intervento: "ristrutturazione_completa" };
beforeEach(() => { db.aggiornamenti = []; db.errore = null; });

describe("il modello del preventivo", () => {
  it("in bozza rinnova il modello congelato con quello di adesso, stesso intervento", async () => {
    const costruisci = vi.fn(async (_c: string, m: { id: string }) => snapshot(m.id));
    const onAggiornato = vi.fn();
    render(<ModelloDelPreventivo modulo="ristrutturazione" progetto={progetto} snapshot={snapshot("computo")} costruisci={costruisci} onAggiornato={onAggiornato} />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna al modello attuale" }));
    await waitFor(() => expect(onAggiornato).toHaveBeenCalled());
    expect(costruisci).toHaveBeenCalledWith("az", { id: "computo" });
    expect(db.aggiornamenti[0]).toMatchObject({ tabella: "rst_progetti", filtri: [["id", "p1"], ["company_id", "az"], ["stato", "bozza"]] });
  });

  it("un preventivo senza modello prende quello della libreria del suo tipo di intervento", async () => {
    const costruisci = vi.fn(async (_c: string, m: { id: string }) => snapshot(m.id));
    render(<ModelloDelPreventivo modulo="ristrutturazione" progetto={progetto} snapshot={null} costruisci={costruisci} onAggiornato={vi.fn()} />);
    expect(screen.getByText(/usa il modello base/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Usa questo modello" }));
    await waitFor(() => expect(costruisci).toHaveBeenCalledWith("az", { id: "completa" }));
  });

  it("fuori dalla bozza non si mostra", () => {
    const { container } = render(<ModelloDelPreventivo modulo="bagni" progetto={{ ...progetto, stato: "inviato" }} snapshot={snapshot("completo")} costruisci={vi.fn()} onAggiornato={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("gli interventi proposti sono quelli del tipo; senza tipo, tutti", () => {
    expect(interventiPerTipo("ristrutturazione", "ristrutturazione_completa")[0].id).toBe("completa");
    expect(interventiPerTipo("ristrutturazione", "altro").map((i) => i.id)).toEqual(["computo"]);
    expect(interventiPerTipo("bagni", null).length).toBeGreaterThan(1);
  });
});
