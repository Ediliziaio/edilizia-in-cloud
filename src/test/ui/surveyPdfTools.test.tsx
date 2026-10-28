import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { SurveyPdfTools } from "@/components/sopralluoghi/SurveyPdfTools";
import { makeSurveyDetail } from "../fixtures/surveyDetail";
const mock = vi.hoisted(() => ({
  render: vi.fn(),
  download: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@/lib/surveys/reportPdf", () => ({ renderSurveyPdf: mock.render }));
vi.mock("@/lib/preventivi/quotePdfDownload", () => ({
  downloadQuotePdf: mock.download,
}));
vi.mock("sonner", () => ({ toast: { success: mock.success } }));
vi.mock("@/components/shared/PdfBlobLivePreviewPanel", () => ({
  PdfBlobLivePreviewPanel: () => <p>Anteprima pronta</p>,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.render.mockResolvedValue(
    new Blob(["%PDF-test"], { type: "application/pdf" }),
  );
});
afterEach(cleanup);
describe("Azioni PDF in testata", () => {
  it("su telefono usa un solo accesso PDF e conserva l’anteprima", async () => {
    render(
      <SurveyPdfTools detail={makeSurveyDetail()} companyName="Demo" compact />,
    );
    expect(
      screen.queryByRole("button", { name: "Scarica PDF" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    expect(await screen.findByText("Anteprima pronta")).toBeVisible();
  });
  it("passa il marchio aziendale al renderer e rigenera se cambia il logo, non per un oggetto equivalente", async () => {
    const detail = makeSurveyDetail(),
      brand = {
        companyId: "company1",
        logoUrl: "https://example.test/logo.png",
        address: "Via Test 1",
      };
    const v = render(
      <SurveyPdfTools detail={detail} companyName="Demo" brand={brand} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Scarica PDF" }));
    await waitFor(() => expect(mock.render).toHaveBeenCalledOnce());
    expect(mock.render.mock.calls[0][3]).toEqual(brand);
    v.rerender(
      <SurveyPdfTools
        detail={detail}
        companyName="Demo"
        brand={{ ...brand }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Scarica PDF" }));
    await waitFor(() => expect(mock.download).toHaveBeenCalledTimes(2));
    expect(mock.render).toHaveBeenCalledOnce();
    v.rerender(
      <SurveyPdfTools
        detail={detail}
        companyName="Demo"
        brand={{ ...brand, logoUrl: "https://example.test/new-logo.png" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Scarica PDF" }));
    await waitFor(() => expect(mock.render).toHaveBeenCalledTimes(2));
  });
  it("non genera all’apertura, scarica su richiesta e riusa il PDF dello stesso snapshot", async () => {
    render(<SurveyPdfTools detail={makeSurveyDetail()} companyName="Demo" />);
    expect(mock.render).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Scarica PDF" }));
    await waitFor(() => expect(mock.download).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Scarica PDF" }));
    await waitFor(() => expect(mock.download).toHaveBeenCalledTimes(2));
    expect(mock.render).toHaveBeenCalledTimes(1);
    expect(mock.download.mock.calls[0][1]).toMatch(/SOP-TEST-001.*\.pdf$/);
  });
  it("se fallisce non scarica e permette un nuovo tentativo", async () => {
    mock.render.mockRejectedValueOnce(new Error("PDF non disponibile"));
    render(<SurveyPdfTools detail={makeSurveyDetail()} companyName="Demo" />);
    fireEvent.click(screen.getByRole("button", { name: "Scarica PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "PDF non disponibile",
    );
    expect(mock.download).not.toHaveBeenCalled();
    expect(mock.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Scarica PDF" }));
    await waitFor(() => expect(mock.download).toHaveBeenCalledTimes(1));
  });
  it("aggiorna il PDF se cambiano le misure anche senza variazione della data in testata", async () => {
    const detail = makeSurveyDetail();
    const v = render(<SurveyPdfTools detail={detail} companyName="Demo" />);
    fireEvent.click(screen.getByRole("button", { name: "Scarica PDF" }));
    await waitFor(() => expect(mock.download).toHaveBeenCalledTimes(1));
    const updated = {
      ...detail,
      elements: [
        {
          ...detail.elements[0],
          values: { ...detail.elements[0].values, larghezza: 135 },
        },
      ],
    };
    v.rerender(<SurveyPdfTools detail={updated} companyName="Demo" />);
    fireEvent.click(screen.getByRole("button", { name: "Scarica PDF" }));
    await waitFor(() => expect(mock.download).toHaveBeenCalledTimes(2));
    expect(mock.render).toHaveBeenCalledTimes(2);
    expect(mock.render.mock.calls[1][0].elements[0].values.larghezza).toBe(135);
  });
  it("impedisce doppio click e download tardivi dopo la chiusura", async () => {
    let resolve!: (blob: Blob) => void;
    mock.render.mockReturnValue(
      new Promise<Blob>((r) => {
        resolve = r;
      }),
    );
    const v = render(
      <SurveyPdfTools detail={makeSurveyDetail()} companyName="Demo" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Scarica PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Preparo PDF…" }));
    await waitFor(() => expect(mock.render).toHaveBeenCalledTimes(1));
    v.unmount();
    resolve(new Blob(["PDF"]));
    await new Promise((r) => setTimeout(r, 0));
    expect(mock.download).not.toHaveBeenCalled();
  });
  it("blocca entrambe le azioni finché le modifiche non sono salvate", () => {
    render(
      <SurveyPdfTools
        detail={makeSurveyDetail()}
        companyName="Demo"
        disabled
      />,
    );
    expect(
      screen.getByRole("button", { name: "Anteprima PDF" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Scarica PDF" })).toBeDisabled();
  });
  it("apre l’anteprima nel pannello senza lasciare il sopralluogo", async () => {
    render(<SurveyPdfTools detail={makeSurveyDetail()} companyName="Demo" />);
    fireEvent.click(screen.getByRole("button", { name: "Anteprima PDF" }));
    expect(await screen.findByText("Anteprima pronta")).toBeVisible();
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "PDF · SOP-TEST-001",
    );
  });
});
