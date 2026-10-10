import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DelayConfigPanel } from "@/components/flow-builder/config-panels/DelayConfigPanel";
afterEach(cleanup);
describe("automation delay editor parity", () => {
  it("shows the worker's one-hour, every-day default", () => {
    render(<DelayConfigPanel config={{}} onChange={vi.fn()} onPatch={vi.fn()} />);
    expect(screen.getByRole("combobox").textContent).toContain("Ore");
    expect(screen.getByRole("spinbutton")).toHaveValue(1);
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(7);
  });
  it("changing duration writes its actual unit in one atomic patch", () => {
    const onChange = vi.fn(); const onPatch = vi.fn();
    render(<DelayConfigPanel config={{}} onChange={onChange} onPatch={onPatch} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "3" } });
    expect(onPatch).toHaveBeenCalledExactlyOnceWith({ delay_durata: 3, delay_unita: "ore" });
    expect(onChange).not.toHaveBeenCalled();
  });
  it("legacy catalog durations are shown without silently changing semantics", () => {
    render(<DelayConfigPanel config={{ giorni: 1, ore: 2, minuti: 30 }} onChange={vi.fn()} onPatch={vi.fn()} />);
    expect(screen.getByRole("spinbutton")).toHaveValue(1590);
    expect(screen.getByRole("combobox").textContent).toContain("Minuti");
  });
  it("switching to until persists the displayed default clock", () => {
    const onPatch = vi.fn();
    render(<DelayConfigPanel config={{}} onChange={vi.fn()} onPatch={onPatch} />);
    fireEvent.click(screen.getByRole("button", { name: "Fino a un orario" }));
    expect(onPatch).toHaveBeenCalledExactlyOnceWith({ delay_tipo: "fino_a", delay_orario: "09:00" });
  });
  it("the last enabled weekday cannot become the all-days empty-array fallback", () => {
    render(<DelayConfigPanel config={{ delay_giorni_settimana: [1] }} onChange={vi.fn()} onPatch={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Lun" })).toBeDisabled();
  });
});
