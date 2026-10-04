import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FotoGrid } from "@/components/foto-cantiere/FotoGrid";
import type { FotoCantiere } from "@/hooks/useFotoCantiere";

vi.mock("@/components/foto-cantiere/FotoAIQualityBadge", () => ({ FotoAIQualityBadge: (): null => null }));
afterEach(cleanup);

const foto = (i: number, giorno = "2026-09-30", gps = false): FotoCantiere => ({
  id: `f${i}`, company_id: "c", order_id: "o", uploaded_by: "u", storage_path: `p/${i}.jpg`, thumbnail_path: null,
  latitudine: gps ? 40.6 : null, longitudine: gps ? 14.8 : null, accuracy_meters: gps ? 12 : null,
  taken_at: `${giorno}T10:${String(i).padStart(2, "0")}:00Z`, server_timestamp: `${giorno}T10:00:00Z`,
  descrizione: `Foto numero ${i}`, tags: [], created_at: `${giorno}T10:00:00Z`,
});
const getSignedUrl = vi.fn(async (path: string) => `https://example.test/${path}`);
const draw = (lista: FotoCantiere[]) => render(<FotoGrid foto={lista} isLoading={false} onElimina={vi.fn()} getSignedUrl={getSignedUrl} />);

describe("Griglia foto cantiere", () => {
  it("con poche foto è una griglia sola, senza titoli per giorno", () => {
    draw([foto(1, "2026-09-30"), foto(2, "2026-09-25"), foto(3, "2026-08-01")]);
    expect(screen.getAllByRole("figure")).toHaveLength(3);
    expect(screen.queryByRole("heading", { level: 4 })).toBeNull();
  });

  it("con molte foto le raggruppa per giorno, dal più recente", () => {
    const molte = Array.from({ length: 14 }, (_, i) => foto(i + 1, i < 8 ? "2026-09-30" : "2026-09-25"));
    draw(molte);
    const titoli = screen.getAllByRole("heading", { level: 4 }).map(h => h.textContent ?? "");
    expect(titoli).toHaveLength(2);
    expect(titoli[0]).toMatch(/30 settembre 2026/i);
    expect(titoli[0]).toMatch(/8 foto/);
    expect(titoli[1]).toMatch(/25 settembre 2026/i);
  });

  it("apre la foto in grande e scorre con le frecce senza uscire dai limiti", async () => {
    draw([foto(1), foto(2), foto(3)]);
    // la più recente (10:03) è la prima della griglia
    fireEvent.click(await screen.findByRole("button", { name: "Apri la foto: Foto numero 3" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("1 di 3");
    expect(screen.queryByRole("button", { name: "Foto precedente" })).toBeNull();
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("2 di 3"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("3 di 3"));
    expect(screen.queryByRole("button", { name: "Foto successiva" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("2 di 3"));
  });

  it("dice se la foto ha il GPS e permette di aprire la posizione", async () => {
    draw([foto(1, "2026-09-30", true)]);
    expect(screen.getByText("GPS")).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: /Apri la foto/ }));
    const link = await screen.findByRole("link", { name: /Apri la posizione sulla mappa/ });
    expect(link).toHaveAttribute("href", expect.stringContaining("40.6,14.8"));
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("senza foto mostra un invito, non un grande vuoto", () => {
    draw([]);
    expect(screen.getByText("Nessuna foto caricata")).toBeVisible();
  });
});
