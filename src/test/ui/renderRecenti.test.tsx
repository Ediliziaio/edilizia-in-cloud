import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RecentRendersPanel } from "@/components/render/RecentRendersPanel";
import { recentRenderImage, type RecentRender } from "@/lib/render/recentRenders";

const modules = [{ id: "stanza", title: "Stanza / Interni" }, { id: "bagno", title: "Bagno" }];
const item = (id: string, patch: Partial<RecentRender> = {}): RecentRender => ({
  id, status: "completed", result_url: null, result_urls: [`https://example.test/${id}.png`],
  created_at: "2026-11-10T08:00:00Z", render_type: "stanza", created_by: null, contact_id: null, opportunity_id: null,
  meta: { createdByName: null, contactName: null, opportunityName: null }, ...patch,
});
const show = (items: RecentRender[]) => render(<MemoryRouter><RecentRendersPanel items={items} modules={modules} isLoading={false} isFetching={false} error={null} onRefresh={vi.fn()} onNewRender={vi.fn()} /></MemoryRouter>);

describe("Render recenti: risultati, sessioni e progetti corretti", () => {
  it("mostra i risultati salvati nell’array e non scambia l’anteprima con un’altra sessione", () => {
    show([item("bagno-1", { render_type: "bagno" }), item("stanza-2")]);
    const bathroom = screen.getByRole("link", { name: /Apri render Bagno/ });
    expect(bathroom).toHaveAttribute("href", "/azienda/render/bagno/gallery/bagno-1");
    expect(bathroom.querySelector("img")).toHaveAttribute("src", "https://example.test/bagno-1.png");
    expect(recentRenderImage(item("a", { result_url: "", result_urls: ["", "https://example.test/valida.png"] }))).toBe("https://example.test/valida.png");
  });

  it("rende raggiungibili anche i risultati oltre i primi sedici", () => {
    show(Array.from({ length: 29 }, (_, index) => item(`stanza-${index + 1}`)));
    expect(screen.getAllByRole("link", { name: /Apri render/ })).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: /Successivi/ }));
    fireEvent.click(screen.getByRole("button", { name: /Successivi/ }));
    expect(screen.getAllByRole("link", { name: /Apri render/ })).toHaveLength(5);
    expect(screen.getAllByRole("link", { name: /Apri render/ }).at(-1)).toHaveAttribute("href", "/azienda/render/stanza/gallery/stanza-29");
    expect(screen.getByRole("button", { name: /Successivi/ })).toBeDisabled();
  });

  it("mostra prima i risultati pronti e include coda ed elaborazione nella lavorazione", () => {
    show([item("finito"), item("coda", { status: "pending" }), item("avviato", { status: "processing" }), item("fallito", { status: "failed" })]);
    expect(screen.getAllByRole("link", { name: /Apri render/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /In lavorazione/ }));
    const links = screen.getAllByRole("link", { name: /Apri render/ });
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/azienda/render/stanza/gallery/coda", "/azienda/render/stanza/gallery/avviato"]);
  });

  it("cerca stanza e progetto insieme e conserva il collegamento alla versione d’origine", () => {
    show([item("villa", { planOrigin: { planId: "p1", roomName: "Camera ospiti", projectTitle: "Villa Città", version: 3, projectPath: "/azienda/planimetrie/p1?livello=pt&ambito=fatto" } }), item("senza-progetto")]);
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca nei render recenti" }), { target: { value: "camera citta" } });
    expect(screen.getAllByRole("link", { name: /Apri render/ })).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Apri planimetria Villa Città/ })).toHaveAttribute("href", "/azienda/planimetrie/p1?livello=pt&ambito=fatto");
    fireEvent.click(screen.getByRole("button", { name: "Vista elenco" }));
    expect(screen.getByRole("link", { name: /Apri render Camera ospiti/ })).toHaveAttribute("href", "/azienda/render/stanza/gallery/villa");
  });

  it("se l’immagine non si carica mantiene aperta la sessione con un fallback leggibile", () => {
    show([item("inaccessibile")]);
    fireEvent.error(screen.getByRole("img", { name: /Render Stanza/ }));
    expect(screen.getByText("Anteprima non disponibile")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Apri render/ })).toHaveAttribute("href", "/azienda/render/stanza/gallery/inaccessibile");
  });
});
