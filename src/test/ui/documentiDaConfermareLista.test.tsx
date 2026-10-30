/**
 * L'elenco unico «Documenti da confermare» (30/10/2026). Il 30/10 c'erano 158 bozze lette dagli
 * allegati delle email e nessuna confermata: si vedevano solo aprendo la singola email.
 * Qui si prova l'elenco con un piccolo database finto che applica davvero scarti e conferme.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentiDaConfermareLista } from "@/components/email-ai/DocumentiDaConfermareLista";
import { toast } from "sonner";

type Riga = Record<string, unknown>;
type Op = [string, ...unknown[]];

const db = vi.hoisted(() => ({
  bozze: [] as Array<Record<string, unknown>>,
  carichi: [] as Array<Record<string, unknown>>,
  scadenze: [] as Array<Record<string, unknown>>,
  /** Ogni scrittura ricevuta: tabella, patch e filtri. */
  scritture: [] as Array<{ tabella: string; patch: Record<string, unknown>; filtri: unknown[][] }>,
  /** Ogni lettura ricevuta: tabella e filtri. */
  letture: [] as Array<{ tabella: string; ops: unknown[][] }>,
  errore: null as string | null,
  rpc: vi.fn(),
  apriPdf: vi.fn(),
  permessi: { canEditWarehouse: true, canViewScadenzario: true, canViewMarketingEmail: true } as Record<string, boolean>,
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => db.permessi }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/storagePrivato", () => ({ apriFileRiservato: (...a: unknown[]) => db.apriPdf(...a) }));
vi.mock("@/integrations/supabase/client", () => {
  const costruisci = (tabella: string) => {
    const ops: Op[] = [];
    let patch: Record<string, unknown> | null = null;
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "in", "order", "limit"]) {
      q[m] = (...a: unknown[]) => {
        ops.push([m, ...a]);
        return q;
      };
    }
    q.update = (p: Record<string, unknown>) => {
      patch = p;
      return q;
    };
    q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
      const righe = tabella === "email_documento_estratto" ? db.bozze : tabella === "email_ddt_carico" ? db.carichi : db.scadenze;
      const corrisponde = (r: Riga) =>
        ops.every(([m, campo, valore]) => {
          if (m === "eq") return r[campo as string] === valore;
          if (m === "neq") return r[campo as string] !== valore;
          if (m === "in") return (valore as unknown[]).includes(r[campo as string]);
          return true;
        });
      let esito: unknown;
      if (db.errore) {
        esito = { data: null, error: { message: db.errore }, count: null };
      } else if (patch) {
        db.scritture.push({ tabella, patch, filtri: ops.filter(([m]) => m === "eq" || m === "in") });
        righe.filter(corrisponde).forEach((r) => Object.assign(r, patch));
        esito = { data: null, error: null };
      } else {
        db.letture.push({ tabella, ops });
        const trovate = righe.filter(corrisponde);
        const testa = ops.some(([m, , o]) => m === "select" && (o as { head?: boolean } | undefined)?.head);
        esito = { data: testa ? null : trovate, error: null, count: trovate.length };
      }
      return Promise.resolve(esito).then(ok, ko);
    };
    return q;
  };
  return {
    supabase: {
      from: costruisci,
      rpc: (...a: unknown[]) => db.rpc(...a),
      auth: { getUser: async () => ({ data: { user: { id: "utente" } } }), getSession: async () => ({ data: { session: null as null } }) },
    },
  };
});

const bozza = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  company_id: "azienda",
  email_id: `email-${id}`,
  attachment_id: null,
  tipo: "fattura",
  confidenza_tipo: 0.97,
  campi: {
    fornitore_ragione_sociale: { valore: `Fornitore ${id}`, conf: 0.99 },
    numero: { valore: `FT-${id}`, conf: 0.99 },
    data: { valore: "2026-10-12", conf: 0.99 },
    totale: { valore: 1220, conf: 0.99 },
  },
  dati_incerti: [] as string[],
  note: null,
  stato: "da_confermare",
  fornitore_match_id: null,
  fornitore_match_tipo: null,
  dedup_fattura_id: null,
  iban_estratto: null,
  iban_alert: false,
  pdf_storage_bucket: "email-attachments",
  pdf_storage_path: `azienda/${id}/documento.pdf`,
  created_at: "2026-10-29T09:00:00",
  email: { thread_id: `thread-${id}`, subject: `Fattura ${id}`, from_name: "Mario Rossi", from_email: "mario@fornitore.it", received_at: "2026-10-29T08:00:00" },
  ...extra,
});

const mostra = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <DocumentiDaConfermareLista />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  db.bozze = [bozza("a"), bozza("b", { tipo: "ddt", dati_incerti: ["totale", "data"] })];
  db.carichi = [];
  db.scadenze = [];
  db.scritture = [];
  db.letture = [];
  db.errore = null;
  db.permessi = { canEditWarehouse: true, canViewScadenzario: true, canViewMarketingEmail: true };
  db.rpc.mockResolvedValue({ data: { ok: true, caricati: [1], da_abbinare: [] }, error: null });
  db.apriPdf.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("l'elenco", () => {
  it("legge le bozze ancora da confermare dell'azienda, dalla più recente", async () => {
    mostra();
    await screen.findByText("Fornitore a");
    const lettura = db.letture.find((l) => l.tabella === "email_documento_estratto")!;
    expect(lettura.ops).toContainEqual(["eq", "company_id", "azienda"]);
    expect(lettura.ops).toContainEqual(["eq", "stato", "da_confermare"]);
    expect(lettura.ops).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(lettura.ops).toContainEqual(["limit", 200]);
  });

  it("una riga per bozza: fornitore, tipo, numero, data e importo; i campi incerti si vedono", async () => {
    mostra();
    await screen.findByText("Fornitore a");
    expect(screen.getByText("Fattura · n. FT-a · 12 ott 2026")).toBeInTheDocument();
    expect(screen.getByText("Bolla (DDT) · n. FT-b · 12 ott 2026")).toBeInTheDocument();
    expect(screen.getAllByText(/1\.220,00\s€/)).toHaveLength(2);
    expect(screen.getByText("2 da controllare")).toBeInTheDocument();
  });

  it("toccando una riga si apre la scheda con mittente, oggetto e il collegamento all'email", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Fornitore a/ }));
    expect(await screen.findByText("Fattura a")).toBeInTheDocument();
    // il mittente compare nella riga (da computer) e nel dettaglio: qui conta il dettaglio
    expect(screen.getByText("· Mario Rossi")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Apri email" })).toHaveAttribute("href", "/azienda/email?thread_id=thread-a");
    // una alla volta: aprire un'altra chiude questa
    fireEvent.click(screen.getByRole("button", { name: /Fornitore b/ }));
    await waitFor(() => expect(screen.queryByText("Fattura a")).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Apri email" })).toHaveAttribute("href", "/azienda/email?thread_id=thread-b");
  });

  it("un documento arrivato senza email non ha il collegamento", async () => {
    db.bozze = [bozza("w", { email_id: null, email: null })];
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Fornitore w/ }));
    expect(await screen.findByText("Documento arrivato senza email")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Apri email" })).not.toBeInTheDocument();
  });

  it("«Apri PDF» apre il file della bozza", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Fornitore a/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Apri PDF/ }));
    expect(db.apriPdf).toHaveBeenCalledWith("email-attachments", "azienda/a/documento.pdf");
  });

  it("se il PDF non si apre lo dice in italiano, senza il messaggio tecnico dello storage", async () => {
    db.apriPdf.mockRejectedValue(new Error("Object not found"));
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Fornitore a/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Apri PDF/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith("Non riesco ad aprire il PDF", {
      description: "Il file non è disponibile, o non hai il permesso di aprirlo.",
    });
  });

  it("il blocco delle schede del browser si dice com'è (è già scritto per l'utente)", async () => {
    db.apriPdf.mockRejectedValue(new Error("Il browser ha bloccato l’apertura. Consenti la nuova scheda e riprova."));
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Fornitore a/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Apri PDF/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith("Non riesco ad aprire il PDF", {
      description: "Il browser ha bloccato l’apertura. Consenti la nuova scheda e riprova.",
    });
  });

  it("senza PDF il pulsante non c'è", async () => {
    db.bozze = [bozza("n", { pdf_storage_bucket: null, pdf_storage_path: null })];
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Fornitore n/ }));
    await screen.findByText("Fattura n");
    expect(screen.queryByRole("button", { name: /Apri PDF/ })).not.toBeInTheDocument();
  });
});

describe("conferma e scarto", () => {
  it("«Conferma» segna la bozza confermata da chi la conferma, e la riga sparisce", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Fornitore a/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Conferma$/ }));
    await waitFor(() => expect(screen.queryByText("Fornitore a")).not.toBeInTheDocument());
    const s = db.scritture.find((x) => x.tabella === "email_documento_estratto")!;
    expect(s.patch).toMatchObject({ stato: "confermato", confirmed_by: "utente" });
    expect(s.filtri).toContainEqual(["eq", "id", "a"]);
    expect(screen.getByText("Fornitore b")).toBeInTheDocument();
  });

  it("«Scarta» toglie la bozza dall'elenco", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Fornitore a/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Scarta$/ }));
    await waitFor(() => expect(screen.queryByText("Fornitore a")).not.toBeInTheDocument());
    expect(db.scritture[0].patch).toEqual({ stato: "scartato" });
  });
});

describe("DDT: il carico di magazzino si conferma dall'elenco e chiude la bozza", () => {
  const carico: Record<string, unknown> = {
    id: "c1", email_id: "email-b", documento_estratto_id: "b", ddt_numero: "88", purchase_order_numero: "ODA-5",
    senza_ordine: false, scostamenti_totali: 0, stato: "bozza", created_at: "2026-10-29T10:00:00",
    righe: [{ descrizione: "Tubo PVC", codice: null, qta_bolla: 12, qta_ordine: 12, scostamento: 0, po_item_id: null, note: null }],
  };

  it("il carico proposto dalla bozza compare sotto la bozza, anche senza aprire l'email", async () => {
    db.carichi = [carico];
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Fornitore b/ }));
    expect(await screen.findByText(/Carico da DDT n\. 88/)).toBeInTheDocument();
    expect(screen.getByText("Tubo PVC")).toBeInTheDocument();
    // …e solo il carico di QUESTA bozza
    const lettura = db.letture.find((l) => l.tabella === "email_ddt_carico")!;
    expect(lettura.ops).toContainEqual(["eq", "documento_estratto_id", "b"]);
  });

  it("«Conferma carico» carica il magazzino e poi segna confermata la bozza del DDT", async () => {
    db.carichi = [carico];
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Fornitore b/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Conferma carico/ }));
    await waitFor(() => expect(screen.queryByText("Fornitore b")).not.toBeInTheDocument());
    expect(db.rpc).toHaveBeenCalledWith("conferma_carico_ddt", { p_carico_id: "c1" });
    const s = db.scritture.find((x) => x.tabella === "email_documento_estratto")!;
    expect(s.patch).toMatchObject({ stato: "confermato", confirmed_by: "utente" });
    expect(s.filtri).toContainEqual(["eq", "id", "b"]);
    expect(s.filtri).toContainEqual(["eq", "stato", "da_confermare"]);
  });

  it("se il carico non riesce, la bozza resta da confermare", async () => {
    db.carichi = [carico];
    db.rpc.mockResolvedValue({ data: { ok: false, errore: "Ordine già chiuso" }, error: null });
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Fornitore b/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Conferma carico/ }));
    await waitFor(() => expect(db.rpc).toHaveBeenCalled());
    expect(db.scritture.filter((x) => x.tabella === "email_documento_estratto")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /Fornitore b/ })).toBeInTheDocument();
  });

  it("chi non può modificare il magazzino non vede «Conferma carico»", async () => {
    db.carichi = [carico];
    db.permessi = { ...db.permessi, canEditWarehouse: false };
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Fornitore b/ }));
    await screen.findByText(/Carico da DDT n\. 88/);
    expect(screen.queryByRole("button", { name: /Conferma carico/ })).not.toBeInTheDocument();
  });
});

describe("gli «altri documenti»", () => {
  beforeEach(() => {
    db.bozze = [bozza("a"), bozza("x", { tipo: "altro" }), bozza("y", { tipo: "altro" })];
  });

  it("stanno in fondo, chiusi, e non si mescolano ai documenti veri", async () => {
    mostra();
    await screen.findByText("Fornitore a");
    expect(screen.getByText("Altri documenti (2)")).toBeInTheDocument();
    expect(screen.queryByText("Fornitore x")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Altri documenti (2)"));
    expect(await screen.findByText("Fornitore x")).toBeInTheDocument();
    expect(screen.getByText("Fornitore y")).toBeInTheDocument();
  });

  it("«Scarta tutti» chiede conferma e poi scarta solo quelli, in una volta", async () => {
    mostra();
    await screen.findByText("Fornitore a");
    fireEvent.click(screen.getByRole("button", { name: "Scarta tutti" }));
    const finestra = await screen.findByRole("alertdialog");
    expect(within(finestra).getByText("Scartare 2 documenti?")).toBeInTheDocument();
    expect(db.scritture).toHaveLength(0);
    fireEvent.click(within(finestra).getByRole("button", { name: "Scarta tutti" }));
    await waitFor(() => expect(screen.queryByText("Altri documenti (2)")).not.toBeInTheDocument());
    expect(db.scritture).toHaveLength(1);
    expect(db.scritture[0].patch).toEqual({ stato: "scartato" });
    expect(db.scritture[0].filtri).toContainEqual(["in", "id", ["x", "y"]]);
    expect(db.scritture[0].filtri).toContainEqual(["eq", "stato", "da_confermare"]);
    // i documenti veri restano
    expect(screen.getByText("Fornitore a")).toBeInTheDocument();
  });

  it("«Annulla» non scarta niente", async () => {
    mostra();
    await screen.findByText("Fornitore a");
    fireEvent.click(screen.getByRole("button", { name: "Scarta tutti" }));
    fireEvent.click(await screen.findByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(db.scritture).toHaveLength(0);
  });

  it("senza documenti veri lo dice, e gli altri restano raggiungibili", async () => {
    db.bozze = [bozza("x", { tipo: "altro" })];
    mostra();
    expect(await screen.findByText("Nessuna fattura o bolla da confermare.")).toBeInTheDocument();
    expect(screen.getByText("Altri documenti (1)")).toBeInTheDocument();
  });
});

describe("stati dell'elenco", () => {
  it("niente da confermare", async () => {
    db.bozze = [];
    mostra();
    expect(await screen.findByText("Niente da confermare.")).toBeInTheDocument();
  });

  it("se la lettura fallisce lo dice e si può riprovare", async () => {
    db.errore = "permission denied";
    mostra();
    const avviso = await screen.findByRole("alert");
    expect(avviso).toHaveTextContent("Non riesco a leggere i documenti da confermare.");
    db.errore = null;
    fireEvent.click(within(avviso).getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Fornitore a")).toBeInTheDocument();
  });
});
