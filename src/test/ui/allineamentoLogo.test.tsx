import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LogoAlignmentControl } from "@/components/shared/LogoAlignmentControl";
import type { AllineamentoLogo } from "../../../supabase/functions/_shared/dimensioniLogo";
afterEach(cleanup);
function Editor({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState<AllineamentoLogo>("left");
  return <><LogoAlignmentControl value={value} onChange={setValue} disabled={disabled} /><output aria-label="Allineamento scelto">{value}</output></>;
}
describe("scelta dell'allineamento del logo", () => {
  it("propone sinistra e consente di scegliere centro e destra", () => {
    render(<Editor />);
    expect(screen.getByRole("radio", { name: "Sinistra" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Centro" }));
    expect(screen.getByLabelText("Allineamento scelto")).toHaveTextContent("center");
    fireEvent.click(screen.getByRole("radio", { name: "Destra" }));
    expect(screen.getByRole("radio", { name: "Destra" })).toBeChecked();
  });
  it("rispetta la sola lettura", () => {
    render(<Editor disabled />);
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Centro" }));
    expect(screen.getByRole("radio", { name: "Sinistra" })).toBeChecked();
  });
});
