import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FotoCard, fotoAppenaCaricata } from "@/components/foto-cantiere/FotoCard";
import type { FotoCantiere } from "@/hooks/useFotoCantiere";

/**
 * L'analisi AI di una foto parte da sola solo per quella appena caricata: partendo per ogni foto senza punteggio
 * a ogni apertura della galleria, si avrebbero tante chiamate AI a pagamento insieme.
 */
const badge = vi.hoisted(() => vi.fn());
vi.mock("@/components/foto-cantiere/FotoAIQualityBadge", () => ({ FotoAIQualityBadge: (props: unknown): null => { badge(props); return null; } }));
afterEach(() => { cleanup(); badge.mockClear(); });

const MIN = 60_000;
const foto = (createdAt: string): FotoCantiere => ({
  id: "f1", company_id: "c", order_id: "o", uploaded_by: "u", storage_path: "p/1.jpg", thumbnail_path: null,
  latitudine: null, longitudine: null, accuracy_meters: null, taken_at: createdAt, server_timestamp: createdAt,
  descrizione: null, tags: [], created_at: createdAt,
});

describe("quando l'analisi AI di una foto parte da sola", () => {
  const adesso = Date.parse("2026-10-06T10:00:00Z");

  it("la foto appena caricata sì", () => {
    expect(fotoAppenaCaricata("2026-10-06T09:59:30Z", adesso)).toBe(true);
    expect(fotoAppenaCaricata("2026-10-06T09:51:00Z", adesso)).toBe(true);
  });

  it("dopo dieci minuti no: le altre si analizzano a mano", () => {
    expect(fotoAppenaCaricata("2026-10-06T09:50:00Z", adesso)).toBe(false);
    expect(fotoAppenaCaricata("2026-09-01T09:00:00Z", adesso)).toBe(false);
    expect(adesso - Date.parse("2026-10-06T09:50:00Z")).toBe(10 * MIN);
  });

  it("una data illeggibile o nel futuro non fa partire niente", () => {
    expect(fotoAppenaCaricata("boh", adesso)).toBe(false);
    expect(fotoAppenaCaricata("2026-10-06T10:05:00Z", adesso)).toBe(false);
  });

  it("la scheda passa al badge il permesso giusto", () => {
    const getSignedUrl = vi.fn(async () => "https://example.test/x.jpg");
    render(<FotoCard foto={foto(new Date(Date.now() - 2 * MIN).toISOString())} onElimina={vi.fn()} getSignedUrl={getSignedUrl} />);
    expect(badge).toHaveBeenLastCalledWith(expect.objectContaining({ autoAnalyze: true }));
    cleanup();
    render(<FotoCard foto={foto("2026-01-01T10:00:00Z")} onElimina={vi.fn()} getSignedUrl={getSignedUrl} />);
    expect(badge).toHaveBeenLastCalledWith(expect.objectContaining({ autoAnalyze: false }));
  });
});
