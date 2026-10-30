import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confrontaImpronta, idVerificaValido, improntaSha256, leggiEsitoVerifica } from "@/lib/sicurezza/posVerifica";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import VerificaPos from "@/pages/public/VerificaPos";

const ID = "3f9a1c2e-0b7d-4e6a-9c1d-5b2e8a7f4d10";
const base = { trovata: true, impresa: "Edil Rossi S.r.l.", cantiere: "Via Mazzini 14, Como (CO)", revisione: 1, emesso_il: "2026-10-30T10:00:00+00:00", pdf_sha256: "a".repeat(64), stato: "in_vigore", revisione_in_vigore: 1, in_vigore_dal: "2026-10-30T10:00:00+00:00" };
const apri = (id = ID) => render(<MemoryRouter initialEntries={[`/verifica-pos/${id}`]}><Routes><Route path="/verifica-pos/:id" element={<VerificaPos />} /></Routes></MemoryRouter>);

beforeEach(() => { rpc.mockReset(); });
afterEach(cleanup);

describe("pagina pubblica di verifica del POS", () => {
  it("una revisione in vigore lo dice e mostra solo ciò che è già stampato sul documento", async () => {
    rpc.mockResolvedValue({ data: base, error: null });
    apri();
    expect(await screen.findByText("Questa è la revisione in vigore.")).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("pos_verifica_pubblica", { p_emissione: ID });
    expect(screen.getByText("Edil Rossi S.r.l.")).toBeTruthy();
    expect(screen.getByText("Via Mazzini 14, Como (CO)")).toBeTruthy();
    expect(screen.getByText("30 ottobre 2026")).toBeTruthy();
    // nessun nome di persona: la funzione non lo restituisce e la pagina non lo chiede
    expect(screen.queryByText(/approvat/i)).toBeNull();
  });

  it("una copia superata avvisa e dice quale revisione la sostituisce", async () => {
    rpc.mockResolvedValue({ data: { ...base, revisione: 0, stato: "superata", revisione_in_vigore: 2, in_vigore_dal: "2026-11-02T08:00:00+00:00" }, error: null });
    apri();
    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toContain("Questa copia non è più in vigore");
    expect(avviso.textContent).toContain("revisione 2");
    expect(avviso.textContent).toContain("2 novembre 2026");
  });

  it("un POS archiviato non si presenta come operativo", async () => {
    rpc.mockResolvedValue({ data: { ...base, stato: "archiviata" }, error: null });
    apri();
    expect((await screen.findByRole("alert")).textContent).toContain("archiviato");
  });

  it("un codice sconosciuto, o una risposta strana, è «nessun POS»: mai uno stato inventato", async () => {
    rpc.mockResolvedValue({ data: { trovata: false }, error: null });
    apri();
    expect((await screen.findByRole("alert")).textContent).toContain("Nessun POS emesso con questo codice");
    cleanup();
    rpc.mockResolvedValue({ data: { trovata: true, stato: "approvato_per_sempre" }, error: null });
    apri();
    expect((await screen.findByRole("alert")).textContent).toContain("Nessun POS emesso con questo codice");
  });

  it("un identificativo non valido non interroga il server", () => {
    apri("non-un-uuid");
    expect(screen.getByRole("alert").textContent).toContain("non è valido");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("se il server non risponde lo dice, senza dare esiti", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    apri();
    expect((await screen.findByRole("alert")).textContent).toContain("Riprova fra poco");
    expect(screen.queryByText("Questa è la revisione in vigore.")).toBeNull();
  });

  it("il PDF ricevuto si confronta con l'impronta emessa, nel browser", async () => {
    const bytes = new TextEncoder().encode("PDF DI PROVA");
    const impronta = await improntaSha256(bytes.buffer as ArrayBuffer);
    rpc.mockResolvedValue({ data: { ...base, pdf_sha256: impronta }, error: null });
    apri();
    const campo = (await screen.findByLabelText(/Hai ricevuto il PDF/)) as HTMLInputElement;
    const file = (contenuto: Uint8Array) => Object.assign(new File([contenuto as BlobPart], "pos.pdf", { type: "application/pdf" }), { arrayBuffer: async () => contenuto.buffer as ArrayBuffer });
    fireEvent.change(campo, { target: { files: [file(bytes)] } });
    expect(await screen.findByText("Il file che hai scelto è identico al PDF emesso.")).toBeTruthy();
    fireEvent.change(campo, { target: { files: [file(new TextEncoder().encode("PDF MODIFICATO"))] } });
    await waitFor(() => expect(screen.getByText(/NON è identico al PDF emesso/)).toBeTruthy());
  });
});

describe("funzioni di verifica", () => {
  it("l'impronta è uno SHA-256 in esadecimale, e un confronto senza impronta registrata non afferma nulla", async () => {
    expect(await improntaSha256(new TextEncoder().encode("abc").buffer as ArrayBuffer)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(confrontaImpronta("ABC123", "abc123")).toBe("uguale");
    expect(confrontaImpronta("abc123", "abc124")).toBe("diverso");
    expect(confrontaImpronta("abc123", null)).toBe("non_verificabile");
    expect(confrontaImpronta("abc123", "")).toBe("non_verificabile");
  });

  it("legge la risposta con prudenza", () => {
    expect(leggiEsitoVerifica(null)).toEqual({ trovata: false });
    expect(leggiEsitoVerifica("x")).toEqual({ trovata: false });
    expect(leggiEsitoVerifica({ trovata: false })).toEqual({ trovata: false });
    expect(leggiEsitoVerifica({ trovata: true, stato: "boh" })).toEqual({ trovata: false });
    const e = leggiEsitoVerifica({ ...base, impresa: "  ", revisione: "1", pdf_sha256: 5 });
    expect(e).toMatchObject({ trovata: true, stato: "in_vigore", impresa: null, pdf_sha256: null, revisione: undefined, revisione_in_vigore: 1 });
  });

  it("riconosce gli identificativi validi", () => {
    expect(idVerificaValido(ID)).toBe(true);
    expect(idVerificaValido(ID.toUpperCase())).toBe(true);
    for (const x of [undefined, "", "abc", `${ID}x`, `${ID}/..`]) expect(idVerificaValido(x)).toBe(false);
  });
});
