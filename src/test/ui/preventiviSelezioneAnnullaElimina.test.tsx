/**
 * Preventivi del CRM: si selezionano, si segnano come persi, si spostano nel cestino (12/11/2026).
 *
 * Il titolare chiedeva di poter selezionare i preventivi e cancellarli. C'era solo «Elimina»,
 * solo da computer e solo per l'amministratore, che chi non lo era non vedeva affatto. Ora:
 * «Segna come persi» per chi modifica i preventivi (i vinti non si toccano), «Elimina» nel
 * cestino, e chi non può legge perché.
 * Poi (12/11/2026): elimina chi modifica i preventivi, non solo l'amministratore (un commerciale
 * non riusciva a togliere i computi creati per sbaglio), e i computi si eliminano davvero.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DbFinto } from "../helpers/dbFinto";

const stato = vi.hoisted(() => ({ role: "company_admin" as string, db: null as unknown }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: stato.role, user: { id: "u1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() { return (stato.db as { client: unknown }).client; },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { UnifiedBulkToolbar, segnaComePersi, righeDaSegnarePerse, eliminaComputi } from "@/components/marketing/preventivi/UnifiedBulkToolbar";
import type { UnifiedRow } from "@/components/marketing/preventivi/UnifiedPreventiviList";

const riga = (id: string, tipo: UnifiedRow["tipo"], stato_unif: UnifiedRow["stato_unif"]): UnifiedRow => ({
  id, tipo, numero: `P-${id}`, cliente: "Rossi", commerciale_id: null, commerciale_nome: null,
  stato_unif, stato_raw: "", totale: 1000, data: "2026-11-01", href: `/x/${id}`,
});

function semina() {
  return new DbFinto({
    quotes: [
      { id: "q1", company_id: "c1", status: "inviata", deleted_at: null },
      { id: "q2", company_id: "c1", status: "accettata", deleted_at: null },
      { id: "q3", company_id: "c2", status: "inviata", deleted_at: null },
    ],
    sr_progetti: [{ id: "s1", company_id: "c1", stato: "consegnato", deleted_at: null }],
    fv_progetti: [{ id: "f1", company_id: "c1", stato: "emesso", deleted_at: null }],
    computo_preventivo_drafts: [
      { id: "k1", company_id: "c1", title: "Nuovo computo metrico" },
      { id: "k2", company_id: "c2", title: "Di un'altra azienda" },
    ],
  });
}

beforeEach(() => { stato.role = "company_admin"; stato.db = semina(); });

describe("Segna come persi", () => {
  it("ogni modulo con la sua parola; i vinti e i computi restano come sono", async () => {
    const db = stato.db as DbFinto;
    const righe = [riga("q1", "classico", "in_corso"), riga("q2", "classico", "vinto"), riga("s1", "serramenti", "in_corso"),
      riga("f1", "fotovoltaico", "in_corso"), riga("k1", "computo", "bozza")];
    expect(righeDaSegnarePerse(righe).map((r) => r.id)).toEqual(["q1", "s1", "f1"]);
    const esito = await segnaComePersi(righe, "c1");
    expect(esito).toEqual({ aggiornati: 3, errors: [] });
    expect(db.tabelle.quotes.find((r) => r.id === "q1")?.status).toBe("rifiutata");
    expect(db.tabelle.quotes.find((r) => r.id === "q2")?.status).toBe("accettata");
    expect(db.tabelle.sr_progetti[0].stato).toBe("rifiutato");
    expect(db.tabelle.fv_progetti[0].stato).toBe("annullato");
  });

  it("non tocca i preventivi di un'altra azienda", async () => {
    const db = stato.db as DbFinto;
    const esito = await segnaComePersi([riga("q3", "classico", "in_corso")], "c1");
    expect(esito.aggiornati).toBe(0);
    expect(db.tabelle.quotes.find((r) => r.id === "q3")?.status).toBe("inviata");
  });
});

describe("La barra in alto", () => {
  it("l'amministratore che modifica ha «Segna come persi» ed «Elimina»", () => {
    render(<UnifiedBulkToolbar selectedRows={[riga("q1", "classico", "in_corso")]} companyId="c1" onClear={vi.fn()} onDone={vi.fn()} puoModificare />);
    expect(screen.getByRole("button", { name: /Segna come persi/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Elimina/ })).toBeInTheDocument();
  });

  it("chi modifica i preventivi elimina anche se non è amministratore", () => {
    stato.role = "company_user";
    render(<UnifiedBulkToolbar selectedRows={[riga("q1", "classico", "in_corso")]} companyId="c1" onClear={vi.fn()} onDone={vi.fn()} puoModificare />);
    expect(screen.getByRole("button", { name: /Elimina/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Segna come persi/ })).toBeInTheDocument();
  });

  it("chi non può modificarli legge perché non può eliminare, invece di non trovare niente", () => {
    stato.role = "company_user";
    render(<UnifiedBulkToolbar selectedRows={[riga("q1", "classico", "in_corso")]} companyId="c1" onClear={vi.fn()} onDone={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Elimina/ })).toBeNull();
    expect(screen.getByText("Eliminare: serve il permesso di modificare i preventivi")).toBeInTheDocument();
  });

  it("senza il permesso di modifica non si segna niente come perso", () => {
    render(<UnifiedBulkToolbar selectedRows={[riga("q1", "classico", "in_corso")]} companyId="c1" onClear={vi.fn()} onDone={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Segna come persi/ })).toBeNull();
  });

  it("con soli vinti selezionati «Segna come persi» non c'è", () => {
    render(<UnifiedBulkToolbar selectedRows={[riga("q2", "classico", "vinto")]} companyId="c1" onClear={vi.fn()} onDone={vi.fn()} puoModificare />);
    expect(screen.queryByRole("button", { name: /Segna come persi/ })).toBeNull();
  });

  it("conferma, scrive e avvisa la lista; dice che i vinti restano", async () => {
    const onDone = vi.fn();
    render(<UnifiedBulkToolbar selectedRows={[riga("q1", "classico", "in_corso"), riga("q2", "classico", "vinto")]} companyId="c1" onClear={vi.fn()} onDone={onDone} puoModificare />);
    fireEvent.click(screen.getByRole("button", { name: /Segna come persi/ }));
    expect(screen.getByText(/Il preventivo vinto selezionato resta com'è/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Segna come persi" }).at(-1)!);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect((stato.db as DbFinto).tabelle.quotes.find((r) => r.id === "q1")?.status).toBe("rifiutata");
  });

  it("elimina sposta nel cestino, non cancella", async () => {
    const onDone = vi.fn();
    render(<UnifiedBulkToolbar selectedRows={[riga("q1", "classico", "in_corso")]} companyId="c1" onClear={vi.fn()} onDone={onDone} puoModificare />);
    fireEvent.click(screen.getByRole("button", { name: /Elimina/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sposta nel cestino" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const q1 = (stato.db as DbFinto).tabelle.quotes.find((r) => r.id === "q1");
    expect(q1).toBeDefined();
    expect(q1?.deleted_at).toBeTruthy();
  });
});

describe("Eliminare i computi", () => {
  it("si eliminano davvero, con la conferma che dice che non tornano", async () => {
    stato.role = "company_user";
    const onDone = vi.fn();
    render(<UnifiedBulkToolbar selectedRows={[riga("k1", "computo", "bozza")]} companyId="c1" onClear={vi.fn()} onDone={onDone} puoModificare />);
    fireEvent.click(screen.getByRole("button", { name: /Elimina/ }));
    expect(screen.getByText(/si elimina definitivamente/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect((stato.db as DbFinto).tabelle.computo_preventivo_drafts.map((r) => r.id)).toEqual(["k2"]);
  });

  it("non tocca i computi di un'altra azienda, e toglie la copia solo-su-questo-PC", async () => {
    const memoria = new Map<string, string>([
      ["computo-nativo:v1:c1:u1:preventivo%3Ak9", "{}"],
      ["computo-nativo:v1:c1:u1:preventivo%3Ak1", "{}"],
    ]);
    const storage = { getItem: (k: string) => memoria.get(k) ?? null, removeItem: (k: string) => { memoria.delete(k); } };
    const esito = await eliminaComputi(["k1", "k2", "k9"], "c1", "u1", storage);
    expect(esito).toEqual({ deleted: 2, errors: [] });
    expect((stato.db as DbFinto).tabelle.computo_preventivo_drafts.map((r) => r.id)).toEqual(["k2"]);
    expect(memoria.size).toBe(0);
  });
});
