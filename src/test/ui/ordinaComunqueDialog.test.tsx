import type React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OrdinaComunqueDialog } from "@/components/orders/OrdinaComunqueDialog";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/components/ui/dialog", () => {
  const Passa = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { Dialog: Passa, DialogContent: Passa, DialogDescription: Passa, DialogFooter: Passa, DialogHeader: Passa, DialogTitle: Passa };
});

const righe = [{ order_item_id: "a", riferimento: "Cucina", nome: "Finestra", stato: "da_rilevare" }];

describe("Ordina comunque", () => {
  beforeEach(() => rpc.mockReset());

  it("senza motivo non parte; col motivo chiama una volta sola anche con doppio clic", async () => {
    rpc.mockResolvedValue({ error: null });
    const fatto = vi.fn();
    render(<OrdinaComunqueDialog odaId="po" righe={righe} onChiudi={vi.fn()} onFatto={fatto} />);
    const bottone = screen.getByRole("button", { name: "Ordina comunque" });
    expect(bottone).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Il cliente ha fretta" } });
    expect(bottone).toBeEnabled();
    fireEvent.click(bottone);
    fireEvent.click(bottone);
    await waitFor(() => expect(fatto).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("oda_ordina_comunque", { p_po: "po", p_motivo: "Il cliente ha fretta" });
  });

  it("mostra la posizione e il suo stato", () => {
    render(<OrdinaComunqueDialog odaId="po" righe={righe} onChiudi={vi.fn()} onFatto={vi.fn()} />);
    expect(screen.getByText("Cucina ·")).toBeInTheDocument();
    expect(screen.getByText("da rilevare")).toBeInTheDocument();
  });
});
