import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComputoDocumentChecks } from "@/components/computo/ComputoDocumentChecks";
import { getComputoDocumentReview, canConfirmComputoDocument } from "@/lib/computo/documentReview";
afterEach(cleanup);
const raw = { document_coverage: { complete: true, pages_inspected: 3, pages_total: 3 }, document_checks: { source_declared_total: 50, computed_total: 40, requires_review: true, warnings: ["Verifica totale"] } };
describe("document review stays simple and explicit", () => {
  it("shows page coverage, original totals and an actionable acknowledgement", () => {
    const change = vi.fn(), review = getComputoDocumentReview(raw);
    render(<ComputoDocumentChecks review={review} acknowledged={false} onAcknowledge={change} />);
    expect(screen.getByText("Pagine elaborate: 3/3")).toBeInTheDocument();
    expect(screen.getByText(/Totale dichiarato:.*50/)).toBeInTheDocument();
    expect(screen.getByText(/Somma importi estratti:.*40/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox")); expect(change).toHaveBeenCalledWith(true);
    expect(canConfirmComputoDocument(review, false)).toBe(false);
    expect(canConfirmComputoDocument(review, true)).toBe(true);
  });
  it("cannot acknowledge an incomplete reading as safe", () => {
    const review = getComputoDocumentReview({ ...raw, document_coverage: { complete: false, pages_inspected: 2, pages_total: 3 } });
    render(<ComputoDocumentChecks review={review} acknowledged onAcknowledge={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Lettura incompleta");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(canConfirmComputoDocument(review, true)).toBe(false);
  });
  it("does not report missing totals as zero and does not break older reviewed uploads", () => {
    const review = getComputoDocumentReview({ document_checks: { requires_review: true, warnings: ["Importo mancante", null] } });
    render(<ComputoDocumentChecks review={review} acknowledged={false} onAcknowledge={vi.fn()} />);
    expect(screen.getByText("Somma importi estratti: non verificabile")).toBeInTheDocument();
    expect(review.warnings).toEqual(["Importo mancante"]);
    expect(canConfirmComputoDocument(getComputoDocumentReview(null), false)).toBe(true);
  });
});
