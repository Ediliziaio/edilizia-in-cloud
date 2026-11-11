import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ClipboardList } from "lucide-react";
import { OperationalSummary, OperationalSummaryMetric } from "@/components/shared/OperationalSummary";
afterEach(cleanup);
describe("Riepilogo operativo condiviso", () => {
  it("mantiene le azioni dei numeri e la selezione accessibile", () => {
    const click = vi.fn();
    render(<OperationalSummary label="Riepilogo assistenza" title="Gli interventi da seguire" icon={ClipboardList}><OperationalSummaryMetric label="Urgenti" value={3} onClick={click} active tone="amber" /><OperationalSummaryMetric label="Totale" value={10} /></OperationalSummary>);
    const action = screen.getByRole("button", { name: "Urgenti 3" });
    expect(action.tagName).toBe("BUTTON"); expect(action).toHaveAttribute("aria-pressed", "true"); fireEvent.click(action); expect(click).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Totale 10" })).not.toBeInTheDocument();
  });
  it("non presenta il caricamento come zero e impedisce filtri incompleti", () => {
    const click = vi.fn(); render(<OperationalSummaryMetric label="In ritardo" value={0} isLoading onClick={click} />);
    expect(screen.getByRole("status", { name: "Caricamento In ritardo" })).toBeVisible(); expect(screen.queryByText("0")).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("button")); expect(click).not.toHaveBeenCalled();
  });
  it("non mostra importi o conteggi quando la lettura fallisce", () => {
    render(<OperationalSummary label="Riepilogo DDT" title="Ricezioni" icon={ClipboardList} error><OperationalSummaryMetric label="Attesi" value={0} /></OperationalSummary>);
    expect(screen.getByRole("alert")).toHaveTextContent("Riepilogo non disponibile"); expect(screen.queryByText("Attesi")).not.toBeInTheDocument();
  });
});
