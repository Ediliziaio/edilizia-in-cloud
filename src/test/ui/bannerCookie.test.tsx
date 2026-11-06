import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BannerCookie, apriPreferenzeCookie } from "@/components/legal/BannerCookie";

const indice = readFileSync("index.html", "utf8");

function sulSito(scelta: unknown = null) {
  const salva = vi.fn();
  Object.defineProperty(window, "location", { value: { ...window.location, hostname: "www.ediliziaincloud.com" }, configurable: true });
  (window as unknown as { eicConsensoCookie: unknown }).eicConsensoCookie = { scelta, salva };
  return salva;
}
afterEach(() => { cleanup(); delete (window as unknown as { eicConsensoCookie?: unknown }).eicConsensoCookie; });

describe("Consenso ai cookie (Garante, 10/06/2021)", () => {
  it("nessun tracciamento parte prima del consenso", () => {
    // Consent Mode con tutto negato, prima di ogni altro script di tracciamento.
    expect(indice.indexOf("gtag('consent', 'default'")).toBeLessThan(indice.indexOf("GTM-PGLNPBW9"));
    expect(indice).toMatch(/quando\('analitici', function \(\) \{\s+if \(document\.readyState === 'complete'\) \{ setTimeout\(loadGTM/);
    expect(indice).toMatch(/quando\('marketing', function \(\) \{\s+window\.__EIC_PIXEL_ENABLED = true;/);
    expect(indice).toContain("window.eicConsensoCookie.quando('analitici',function(){var i=new Image();i.src=\"https://clientium.it");
    expect(readFileSync("src/main.tsx", "utf8")).toContain('.eicConsensoCookie?.quando("marketing", initFacebookClickTracker)');
  });

  it("alla prima visita: accetta e rifiuta con lo stesso peso, la X vale rifiuto", () => {
    const salva = sulSito();
    render(<MemoryRouter initialEntries={["/"]}><BannerCookie /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Accetta tutti" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rifiuta" }));
    expect(salva).toHaveBeenCalledWith(false, false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("personalizza: statistiche e marketing spenti di partenza, si sceglie per categoria", () => {
    const salva = sulSito();
    render(<MemoryRouter initialEntries={["/"]}><BannerCookie /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Personalizza" }));
    const caselle = screen.getAllByRole("checkbox");
    expect(caselle.every((c) => !(c as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(caselle[0]);
    fireEvent.click(screen.getByRole("button", { name: "Salva le scelte" }));
    expect(salva).toHaveBeenCalledWith(true, false);
  });

  it("scelta già fatta: niente banner; «Preferenze cookie» lo riapre; nell'app non compare", () => {
    sulSito({ v: 1, il: Date.now(), analitici: true, marketing: false });
    const { unmount } = render(<MemoryRouter initialEntries={["/"]}><BannerCookie /></MemoryRouter>);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => apriPreferenzeCookie());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    unmount();
    sulSito();
    render(<MemoryRouter initialEntries={["/azienda/attivita"]}><BannerCookie /></MemoryRouter>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
