import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NoteInterneFattura } from "@/components/fatturazione/NoteInterneFattura";
import { PagaRataDialog } from "@/components/scadenzario/PagaRataDialog";

const db = vi.hoisted(() => ({
  nota: null as string | null,
  versioneRata: "2026-11-20T09:00:00Z",
  success: vi.fn(), error: vi.fn(), rataPagata: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: db.success, error: db.error } }));
vi.mock("@/lib/orders/financialRefresh", () => ({ refreshFinancialQueries: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => {
      const filtri = new Map<string, string | null>();
      let dati: { note_interne?: string | null; pagata_il?: string } = {};
      const q = {
        update: (nuovi: typeof dati) => { dati = nuovi; return q; },
        eq: (campo: string, valore: string) => { filtri.set(campo, valore); return q; },
        is: (campo: string, valore: null) => { filtri.set(campo, valore); return q; },
        select: () => q,
        maybeSingle: async (): Promise<{ data: { id: string | null | undefined } | null; error: null }> => {
          if (filtri.get("company_id") !== "a1") return { data: null, error: null };
          if (tabella === "rate_fornitori") {
            if (filtri.get("updated_at") !== db.versioneRata) return { data: null, error: null };
            db.rataPagata(dati.pagata_il);
          } else {
            if (filtri.get("note_interne") !== db.nota) return { data: null, error: null };
            db.nota = dati.note_interne ?? null;
          }
          return { data: { id: filtri.get("id") }, error: null };
        },
      };
      return q;
    },
  },
}));

beforeEach(() => {
  db.nota = null;
  db.versioneRata = "2026-11-20T09:00:00Z";
  db.success.mockClear();
  db.error.mockClear();
  db.rataPagata.mockClear();
});

afterEach(async () => {
  cleanup();
  // Radix ripristina il focus in un timer dopo l'unmount. Completarlo prima
  // della distruzione di JSDOM evita eventi appartenenti alla finestra seguente.
  await new Promise(resolve => setTimeout(resolve, 0));
});

describe("Modifiche concorrenti su note e rate", () => {
  it("mantiene la bozza dopo un conflitto e salva solo dopo aver mostrato la versione dal server", async () => {
    const client = new QueryClient();
    const vista = (valore: string | null) => <QueryClientProvider client={client}>
      <NoteInterneFattura tabella="fatture_ricevute" id="f1" companyId="a1" valore={valore} puoModificare chiaviDaAggiornare={["fatture-ricevute"]} />
    </QueryClientProvider>;
    const { rerender } = render(vista(null));
    const campo = screen.getByLabelText("Note interne");
    fireEvent.change(campo, { target: { value: "Bozza di questa scheda" } });
    db.nota = "Nota scritta altrove";
    fireEvent.click(screen.getByRole("button", { name: "Salva la nota" }));
    await waitFor(() => expect(db.error).toHaveBeenCalledOnce());
    expect(db.nota).toBe("Nota scritta altrove");
    expect(db.success).not.toHaveBeenCalled();
    rerender(vista(db.nota));
    expect(campo).toHaveValue("Bozza di questa scheda");
    expect(screen.getByRole("status")).toHaveTextContent("Nota scritta altrove");
    expect(screen.queryByRole("button", { name: "Salva la nota" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tieni la mia bozza" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva la nota" }));
    await waitFor(() => expect(db.nota).toBe("Bozza di questa scheda"));
    await waitFor(() => expect(db.success).toHaveBeenCalledOnce());
    expect(campo).toHaveValue("Bozza di questa scheda");
  });

  it("apre la fattura seguente con la sua nota anche se la nota iniziale era identica", () => {
    const client = new QueryClient();
    const vista = (id: string) => <QueryClientProvider client={client}>
      <NoteInterneFattura tabella="fatture_ricevute" id={id} companyId="a1" valore="" puoModificare chiaviDaAggiornare={[]} />
    </QueryClientProvider>;
    const { rerender } = render(vista("f1"));
    fireEvent.change(screen.getByLabelText("Note interne"), { target: { value: "GH09" } });
    rerender(vista("f2"));
    expect(screen.getByLabelText("Note interne")).toHaveValue("");
  });

  it("impedisce la conferma di una rata modificata dopo l’apertura", async () => {
    const versioneAperta = db.versioneRata;
    const onClose = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}>
      <PagaRataDialog companyId="a1" scelta={{ id: "r1", stato: "avvisata", importo: 250, updated_at: versioneAperta, titolo: "Rata 1" }} onClose={onClose} />
    </QueryClientProvider>);
    db.versioneRata = "2026-11-20T09:01:00Z";
    fireEvent.click(screen.getByRole("button", { name: "Conferma pagamento" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/La rata è cambiata/);
    expect(screen.getByRole("button", { name: "Conferma pagamento" })).toBeDisabled();
    expect(db.rataPagata).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
