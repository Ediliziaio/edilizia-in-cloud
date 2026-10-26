/**
 * L'editor del piano di posa in Fase 5 (25/10/2026): si disegna solo su richiesta, i moduli sono in scala e
 * cambiano coi comandi, e si può togliere il piano. Preventivo emesso: solo lettura.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));

import { FvPianoTetto } from "@/components/fotovoltaico/FvPianoTetto";

afterEach(() => { cleanup(); invoke.mockReset(); });

const vista = (provider = "google") => invoke.mockResolvedValue({ data: { dataUrl: "data:image/png;base64,AAAA", provider }, error: null });
const RIF = { corto: 1.134, lungo: 1.722, stimato: true };
const PIANO = { x: 0, y: 0, rot: 0, cols: 4, unita: "m" as const, orient: "v" as const, modulo: RIF };
const monta = (extra: Partial<Parameters<typeof FvPianoTetto>[0]> = {}) => {
  const onChange = vi.fn();
  const view = render(<FvPianoTetto lat={42.56} lng={12.64} moduli={12} kwp={6} piano={null} onChange={onChange} modificabile modulo={RIF} {...extra} />);
  return { onChange, ...view };
};

describe("FvPianoTetto", () => {
  it("chiede la stessa vista del PDF: zoom 20, 640 × 400", async () => {
    vista();
    monta();
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("maps-proxy", { body: { action: "staticmap", lat: 42.56, lng: 12.64, zoom: 20, w: 640, h: 400 } });
  });

  it("senza piano non disegna niente: c'è il pulsante, e premuto parte dal piano iniziale", async () => {
    vista();
    const { onChange, container } = monta();
    const tasto = await screen.findByRole("button", { name: "Disegna il piano sul tetto" });
    expect(container.querySelectorAll("rect[fill='rgba(37,99,235,0.78)']")).toHaveLength(0);
    fireEvent.click(tasto);
    expect(onChange).toHaveBeenCalledWith({ x: 0, y: 0, rot: 0, cols: 5, unita: "m", orient: "v", modulo: RIF });
  });

  it("col piano disegnato ci sono i 12 moduli e i comandi cambiano rotazione, colonne e posa", async () => {
    vista();
    const { onChange, container } = monta({ piano: PIANO });
    await screen.findByRole("img", { name: /Piano di posa/ });
    expect(container.querySelectorAll("rect[fill='rgba(37,99,235,0.78)']")).toHaveLength(12);
    fireEvent.change(screen.getByLabelText("Rotazione dei moduli"), { target: { value: "25" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...PIANO, rot: 25 });
    fireEvent.change(screen.getByLabelText("Moduli per fila"), { target: { value: "6" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...PIANO, cols: 6 });
    fireEvent.click(screen.getByRole("button", { name: "In orizzontale" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...PIANO, orient: "o" });
  });

  it("«Togli il piano» lo azzera, e «Riporta al centro» azzera solo lo spostamento", async () => {
    vista();
    const { onChange } = monta({ piano: { ...PIANO, x: 5, y: -2 } });
    fireEvent.click(await screen.findByRole("button", { name: /Riporta al centro/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...PIANO, x: 0, y: 0 });
    fireEvent.click(screen.getByRole("button", { name: /Togli il piano/ }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("se i moduli escono dalla vista lo dice", async () => {
    vista();
    monta({ piano: { ...PIANO, x: 45 } });
    expect((await screen.findByRole("alert")).textContent).toContain("escono dalla vista");
  });

  it("un vecchio piano in percentuale non è un piano: si ripropone il pulsante", async () => {
    vista();
    monta({ piano: { x: 5, y: -3, rot: 12, cols: 4 } });
    expect(await screen.findByRole("button", { name: "Disegna il piano sul tetto" })).toBeTruthy();
  });

  it("preventivo emesso: si vede il piano ma non si cambia (niente comandi di modifica)", async () => {
    vista();
    monta({ piano: PIANO, modificabile: false });
    await screen.findByRole("img", { name: /Piano di posa/ });
    expect(screen.queryByRole("button", { name: /Togli il piano/ })).toBeNull();
    expect((screen.getByLabelText("Rotazione dei moduli") as HTMLInputElement).disabled).toBe(true);
  });

  it("se la vista non è di Google la scala è indicativa, e lo dice", async () => {
    vista("here");
    monta({ piano: PIANO });
    expect((await screen.findByText(/non arriva da Google/)).textContent).toContain("non entra nel PDF");
  });

  it("senza vista satellitare niente editor (come la vista della Fase 4)", async () => {
    invoke.mockResolvedValue({ data: { error: "static_map_unavailable" }, error: null });
    const { container } = monta();
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("senza moduli scelti chiede di sceglierli", () => {
    vista();
    monta({ moduli: 0 });
    expect(screen.getByText(/Scegli il numero dei pannelli/)).toBeTruthy();
  });

  it("il piano parte con le misure del pannello scelto, scritte nel testo; se cambia pannello le misure seguono", async () => {
    vista();
    const scheda = { corto: 1.134, lungo: 2.278, stimato: false };
    const { onChange } = monta({ piano: PIANO, modulo: scheda });
    await screen.findByRole("img", { name: /Piano di posa/ });
    expect(onChange).toHaveBeenCalledWith({ ...PIANO, modulo: scheda });
  });

  it("col pannello già quello del piano non si riscrive niente, e dice se le misure sono stimate dalla potenza", async () => {
    vista();
    const { onChange } = monta({ piano: PIANO });
    expect(await screen.findByText(/misure stimate dalla potenza/)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("con le misure della scheda tecnica non c'è la dicitura «stimate»", async () => {
    vista();
    const scheda = { corto: 1.134, lungo: 2.278, stimato: false };
    monta({ piano: { ...PIANO, modulo: scheda }, modulo: scheda });
    await screen.findByRole("img", { name: /Piano di posa/ });
    expect(screen.queryByText(/misure stimate dalla potenza/)).toBeNull();
    expect(screen.getByText(/1,13 × 2,28 m l'uno/)).toBeTruthy();
  });

  it("preventivo emesso: le misure non si riscrivono nemmeno se il pannello è cambiato", async () => {
    vista();
    const { onChange } = monta({ piano: PIANO, modificabile: false, modulo: { corto: 1.134, lungo: 2.278, stimato: false } });
    await screen.findByRole("img", { name: /Piano di posa/ });
    expect(onChange).not.toHaveBeenCalled();
  });
});
