import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactsTable, DEFAULT_VISIBLE, type MarketingContact, type SortDirection, type SortField } from "@/components/marketing/ContactsTable";
import { useURLFilters } from "@/hooks/useURLFilters";

/**
 * Lista Contatti CRM: «Righe per pagina» non cambiava niente, e ordinare una colonna nemmeno.
 *
 * La tabella vera, il gancio vero dell'indirizzo e gli stessi gestori della pagina (MarketingContacts): il menu 25/50/100
 * scrive `per_pagina` e riporta a pagina 1; il clic su una colonna scrive campo e direzione e riporta a pagina 1.
 */
const contatto = (n: number): MarketingContact => ({
  id: `c${n}`, first_name: `Nome${n}`, last_name: `Cognome${n}`, phone: null, email: `c${n}@esempio.it`, company_name: null, tags: [],
  notes: null, source: null, last_activity_at: null, created_at: "2026-10-06T10:00:00Z", city: null, province: null, address: null,
  postal_code: null, country: null, contact_type: "persona", date_of_birth: null, website: null, assigned_to: null, call_center_id: null,
  call_center_name: null, attr_source: null, attr_campaign: null, opp_name: null, opp_value: null, opp_status: null, opp_pipeline: null, opp_stage: null,
});
const TOTALE = 150;
const CONTATTI = Array.from({ length: 25 }, (_, i) => contatto(i + 1));

/** Come MarketingContacts: i parametri stanno nell'indirizzo e i gestori sono quelli della pagina. */
function Pagina() {
  const { params, setParam } = useURLFilters({
    page: { key: "pagina", defaultValue: 1, serialize: String, deserialize: Number },
    pageSize: { key: "per_pagina", defaultValue: 25, serialize: String, deserialize: Number },
    sortField: { key: "ordina", defaultValue: "created_at" },
    sortDirection: { key: "dir", defaultValue: "desc" },
  });
  const posizione = useLocation();
  const setPage = (v: number) => setParam("page", Math.max(1, Math.floor(v)));
  const setPageSize = (v: number) => setParam("pageSize", v);
  const setSortField = (v: SortField) => setParam("sortField", v);
  const setSortDirection = (v: SortDirection) => setParam("sortDirection", v);
  return (
    <>
      <output data-testid="url">{posizione.search}</output>
      <ContactsTable
        contacts={CONTATTI}
        totalCount={TOTALE}
        selectedIds={new Set()}
        onToggleSelect={() => undefined}
        onToggleAll={() => undefined}
        onEdit={() => undefined}
        onDelete={() => undefined}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        sortField={params.sortField as SortField}
        sortDirection={params.sortDirection as SortDirection}
        onSort={(f, d) => { setSortField(f); setSortDirection(d); setPage(1); }}
        visibleColumns={new Set<string>(DEFAULT_VISIBLE)}
      />
    </>
  );
}
const disegna = (iniziale = "/contatti") => render(<MemoryRouter initialEntries={[iniziale]}><Pagina /></MemoryRouter>);
const url = () => new URLSearchParams(screen.getByTestId("url").textContent ?? "");

beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.hasPointerCapture = vi.fn(); HTMLElement.prototype.releasePointerCapture = vi.fn(); });
afterEach(cleanup);

const scegliRighe = (valore: string) => {
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name: valore }));
};

describe("Contatti: righe per pagina", () => {
  it("parte da 25 righe e 6 pagine", () => {
    disegna();
    expect(screen.getByRole("combobox")).toHaveTextContent("25");
    expect(screen.getByText("Pagina 1 di 6")).toBeInTheDocument();
  });

  it("scegliere 50 cambia le righe per pagina: 3 pagine, e il menu dice 50", () => {
    disegna();
    scegliRighe("50");
    expect(screen.getByText("Pagina 1 di 3")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("50");
    expect(url().get("per_pagina")).toBe("50");
  });

  it("scegliere 100 lascia 2 pagine", () => {
    disegna();
    scegliRighe("100");
    expect(screen.getByText("Pagina 1 di 2")).toBeInTheDocument();
  });

  it("da pagina 4 cambiare la misura riporta a pagina 1 (non resta su una pagina che non c'è più)", () => {
    disegna("/contatti?pagina=4");
    expect(screen.getByText("Pagina 4 di 6")).toBeInTheDocument();
    scegliRighe("100");
    expect(screen.getByText("Pagina 1 di 2")).toBeInTheDocument();
    expect(url().has("pagina")).toBe(false);
  });

  it("tornare a 25 toglie il parametro dall'indirizzo (è la misura di partenza)", () => {
    disegna("/contatti?per_pagina=50");
    expect(screen.getByRole("combobox")).toHaveTextContent("50");
    scegliRighe("25");
    expect(url().has("per_pagina")).toBe(false);
    expect(screen.getByText("Pagina 1 di 6")).toBeInTheDocument();
  });

  it("Succ e Prec continuano a scorrere le pagine con la misura scelta", () => {
    disegna("/contatti?per_pagina=50");
    fireEvent.click(screen.getByRole("button", { name: "Succ" }));
    expect(screen.getByText("Pagina 2 di 3")).toBeInTheDocument();
    expect(url().get("per_pagina")).toBe("50");
    fireEvent.click(screen.getByRole("button", { name: "Prec" }));
    expect(screen.getByText("Pagina 1 di 3")).toBeInTheDocument();
  });
});

describe("Contatti: ordinare una colonna", () => {
  it("il clic su «Email» ordina per email, dal basso, e riporta a pagina 1", () => {
    disegna("/contatti?pagina=3");
    const intestazione = screen.getByRole("columnheader", { name: /Email/ });
    fireEvent.click(within(intestazione).getByText("Email"));
    expect(url().get("ordina")).toBe("email");
    expect(url().get("dir")).toBe("asc");
    expect(url().has("pagina")).toBe(false);
  });

  it("un secondo clic sulla stessa colonna inverte la direzione", () => {
    disegna();
    const intestazione = () => screen.getByRole("columnheader", { name: /Email/ });
    fireEvent.click(within(intestazione()).getByText("Email"));
    fireEvent.click(within(intestazione()).getByText("Email"));
    expect(url().get("ordina")).toBe("email");
    // «desc» è la direzione di partenza: non si scrive nell'indirizzo, ma l'ordine è davvero invertito
    expect(url().has("dir")).toBe(false);
  });

  it("un terzo clic la riporta a crescente", () => {
    disegna();
    const clic = () => fireEvent.click(within(screen.getByRole("columnheader", { name: /Email/ })).getByText("Email"));
    clic(); clic(); clic();
    expect(url().get("dir")).toBe("asc");
  });

  it("ordinare non fa perdere la misura della pagina scelta prima", () => {
    disegna("/contatti?per_pagina=100");
    fireEvent.click(within(screen.getByRole("columnheader", { name: /Email/ })).getByText("Email"));
    expect(url().get("per_pagina")).toBe("100");
    expect(url().get("ordina")).toBe("email");
  });
});
