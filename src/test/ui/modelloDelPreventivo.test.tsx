import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const db = vi.hoisted(() => ({ aggiornamenti: [] as { tabella: string; valori: unknown; filtri: [string, unknown][] }[], errore: null as string | null, trovato: true }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => ({
      update: (valori: unknown) => {
        const voce = { tabella, valori, filtri: [] as [string, unknown][] };
        const catena = {
          eq: (c: string, v: unknown) => { voce.filtri.push([c, v]); return catena; },
          select: () => catena,
          maybeSingle: async () => { db.aggiornamenti.push(voce); return { data: db.trovato ? { id: "p1", updated_at: "2026-10-24T12:00:00Z" } : null, error: db.errore ? { message: db.errore } : null }; },
        };
        return catena;
      },
    }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { ModelloDelPreventivo, interventiPerTipo } from "@/components/preventivatore/ModelloDelPreventivo";
import { toast } from "sonner";

const snapshot = (modelId: string) => ({ version: 1 as const, modelId, companyId: "az", capturedAt: "2026-10-22T16:21:00.000Z", template: {} });
const progetto = { id: "p1", company_id: "az", stato: "bozza", tipo_intervento: "ristrutturazione_completa" };
beforeEach(() => { db.aggiornamenti = []; db.errore = null; db.trovato = true; vi.clearAllMocks(); });
afterEach(cleanup);

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

  it("non annuncia un successo se la bozza è cambiata o la policy non aggiorna righe", async () => {
    db.trovato = false;
    const onAggiornato = vi.fn();
    render(<ModelloDelPreventivo modulo="bagni" progetto={{ ...progetto, updated_at: "2026-10-24T10:00:00Z" }} snapshot={snapshot("completo")} costruisci={async () => snapshot("completo")} onAggiornato={onAggiornato} />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna al modello attuale" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled(); expect(onAggiornato).not.toHaveBeenCalled();
    expect(db.aggiornamenti[0].filtri).toContainEqual(["updated_at", "2026-10-24T10:00:00Z"]);
  });

  it("blocca doppi clic e non scrive dopo il cambio del preventivo mentre carica il modello", async () => {
    let finish!: (v: unknown) => void;
    const costruisci = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const onAggiornato = vi.fn();
    const view = render(<ModelloDelPreventivo modulo="bagni" progetto={progetto} snapshot={snapshot("completo")} costruisci={costruisci} onAggiornato={onAggiornato} />);
    const button = screen.getByRole("button", { name: "Aggiorna al modello attuale" });
    fireEvent.click(button); fireEvent.click(button);
    expect(costruisci).toHaveBeenCalledTimes(1);
    view.rerender(<ModelloDelPreventivo modulo="bagni" progetto={{ ...progetto, id: "altro" }} snapshot={snapshot("completo")} costruisci={costruisci} onAggiornato={onAggiornato} />);
    finish(snapshot("completo"));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(db.aggiornamenti).toHaveLength(0); expect(onAggiornato).not.toHaveBeenCalled();
  });

  it("restituisce la versione del proprio aggiornamento per il successivo salvataggio atomico FV", async () => {
    const onVersion = vi.fn();
    render(<ModelloDelPreventivo tabella="fv_progetti" progetto={progetto} snapshot={snapshot("nuovo")} costruisci={async () => snapshot("nuovo")} onAggiornato={vi.fn()} onVersion={onVersion} />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna al modello attuale" }));
    await waitFor(() => expect(onVersion).toHaveBeenCalledWith({ id: "p1", updated_at: "2026-10-24T12:00:00Z" }));
  });

  it("gli interventi proposti sono quelli del tipo; senza tipo, tutti", () => {
    expect(interventiPerTipo("ristrutturazione", "ristrutturazione_completa")[0].id).toBe("completa");
    expect(interventiPerTipo("ristrutturazione", "altro").map((i) => i.id)).toEqual(["computo"]);
    expect(interventiPerTipo("bagni", null).length).toBeGreaterThan(1);
  });
});
