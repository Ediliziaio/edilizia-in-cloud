import React, { type ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
const shared = vi.hoisted(() => ({ props: null as any, pdf: vi.fn(async (_payload: unknown) => "blob:local") }));
vi.mock("@/components/shared/PdfBlobLivePreviewPanel", () => ({ PdfBlobLivePreviewPanel: (props: unknown): null => { shared.props = props; return null; } }));
vi.mock("@/hooks/useBagniPDF", () => ({ renderBgnPreviewBlobUrl: shared.pdf }));
vi.mock("@/hooks/useClimatizzazionePDF", () => ({ renderClmPreviewBlobUrl: shared.pdf }));
vi.mock("@/hooks/useElettricoPDF", () => ({ renderElePreviewBlobUrl: shared.pdf }));
vi.mock("@/hooks/usePavimentiPDF", () => ({ renderPavPreviewBlobUrl: shared.pdf }));
vi.mock("@/hooks/usePiscinePDF", () => ({ renderPisPreviewBlobUrl: shared.pdf }));
vi.mock("@/hooks/useRistrutturazionePDF", () => ({ renderRstPreviewBlobUrl: shared.pdf }));
vi.mock("@/hooks/useTettiPDF", () => ({ renderTetPreviewBlobUrl: shared.pdf }));
vi.mock("@/hooks/useTermoidraulicoPDF", () => ({ renderIdrPreviewBlobUrl: shared.pdf }));
import { BagniLivePreviewPanel } from "@/components/bagni/BagniLivePreviewPanel";
import { ClimatizzazioneLivePreviewPanel } from "@/components/climatizzazione/ClimatizzazioneLivePreviewPanel";
import { ElettricoLivePreviewPanel } from "@/components/elettrico/ElettricoLivePreviewPanel";
import { PavimentiLivePreviewPanel } from "@/components/pavimenti/PavimentiLivePreviewPanel";
import { PiscineLivePreviewPanel } from "@/components/piscine/PiscineLivePreviewPanel";
import { RistrutturazioneLivePreviewPanel } from "@/components/ristrutturazione/RistrutturazioneLivePreviewPanel";
import { TettiLivePreviewPanel } from "@/components/tetti/TettiLivePreviewPanel";
import { TermoidraulicoLivePreviewPanel } from "@/components/termoidraulico/TermoidraulicoLivePreviewPanel";

afterEach(() => { cleanup(); shared.pdf.mockClear(); });
const cases = [
  ["bagni", BagniLivePreviewPanel, "completo", "sanitari"],
  ["climatizzazione", ClimatizzazioneLivePreviewPanel, "monosplit", "multisplit"],
  ["elettrico", ElettricoLivePreviewPanel, "completo", "adeguamento"],
  ["pavimenti", PavimentiLivePreviewPanel, "sovrapposizione", "resina"],
  ["piscine", PiscineLivePreviewPanel, "nuova", "impianti"],
  ["ristrutturazione", RistrutturazioneLivePreviewPanel, "completa", "parziale"],
  ["tetti", TettiLivePreviewPanel, "rifacimento", "ripasso"],
  ["termoidraulico", TermoidraulicoLivePreviewPanel, "caldaia", "ibrido"],
] as const;

describe("all eight edile preview wrappers forward semantic section without regenerating", () => {
  it.each(cases)("%s retains content/module identity and forwards activeSection", async (_name, Original, first, second) => {
    const Component = Original as unknown as ComponentType<Record<string, unknown>>;
    const template = { id: "local-test", default_iva_pct: 22 };
    const { rerender } = render(<Component companyId="qa" template={template} moduleId={first} activeSection="page_controlli" />);
    expect(shared.props.activeSection).toBe("page_controlli");
    const key = shared.props.depsKey, renderer = shared.props.renderBlobUrl;
    rerender(<Component companyId="qa" template={template} moduleId={first} activeSection="page_diario" />);
    expect(shared.props.activeSection).toBe("page_diario");
    expect(shared.props.depsKey).toBe(key);
    expect(shared.props.renderBlobUrl).toBe(renderer);
    await shared.props.renderBlobUrl();
    const firstPayload = shared.pdf.mock.calls[0]?.[0];
    rerender(<Component companyId="qa" template={template} moduleId={second} activeSection="page_diario" />);
    expect(shared.props.depsKey).not.toBe(key);
    expect(shared.props.renderBlobUrl).not.toBe(renderer);
    await shared.props.renderBlobUrl();
    expect(shared.pdf.mock.calls[1]?.[0]).not.toEqual(firstPayload);
    expect(template).toEqual({ id: "local-test", default_iva_pct: 22 });
  });
});
