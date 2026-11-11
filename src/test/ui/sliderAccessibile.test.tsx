import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Slider } from "@/components/ui/slider";
beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("assegna nome, descrizione e valore parlato al controllo effettivo", () => {
  render(<><span id="growth-label">Crescita annua</span><p id="growth-help">Percentuale prevista</p><Slider aria-labelledby="growth-label" aria-describedby="growth-help" aria-valuetext="8%" value={[8]} /></>);
  const slider = screen.getByRole("slider", { name: "Crescita annua" });
  expect(slider).toHaveAccessibleDescription("Percentuale prevista");
  expect(slider).toHaveAttribute("aria-valuetext", "8%");
});
it("conserva la variazione da tastiera e lo stato disabilitato", () => {
  const changed = vi.fn();
  function Harness() {
    const [value, setValue] = useState([8]);
    return <Slider aria-label="Margine" value={value} min={0} max={30} step={1} onValueChange={next => { changed(next); setValue(next); }} />;
  }
  const view = render(<Harness />);
  const slider = screen.getByRole("slider", { name: "Margine" });
  slider.focus();
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(changed).toHaveBeenCalledWith([9]);
  expect(slider).toHaveAttribute("aria-valuenow", "9");
  view.rerender(<Slider aria-label="Margine" value={[9]} disabled />);
  expect(screen.getByRole("slider", { name: "Margine" })).not.toHaveAttribute("tabindex", "0");
});
