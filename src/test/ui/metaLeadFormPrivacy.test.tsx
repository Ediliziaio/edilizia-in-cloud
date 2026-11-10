import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MetaLeadFormBuilder, META_FORM_DEFAULTS } from "@/components/ads/MetaLeadFormBuilder";
import { isValidHttpsUrl } from "@/lib/ads/httpsUrl";

afterEach(cleanup);
function Form() {
  const [value, onChange] = useState(META_FORM_DEFAULTS);
  return <MetaLeadFormBuilder value={value} onChange={onChange} />;
}
it.each(["", "https://", "https://x", "http://example.com/privacy", "/privacy"])("rifiuta il formato incompleto o non HTTPS: %s", (url) => {
  expect(isValidHttpsUrl(url)).toBe(false);
});
it("rimuove il falso esito positivo e permette di correggere il dominio senza perdere il disclaimer", () => {
  render(<Form />);
  fireEvent.click(screen.getByRole("button", { name: "3. Privacy" }));
  const url = screen.getByRole("textbox", { name: "URL Privacy Policy *" });
  fireEvent.change(screen.getByRole("textbox", { name: "Disclaimer custom (opzionale)" }), { target: { value: "Testo locale" } });
  fireEvent.change(url, { target: { value: "https://" } });
  expect(url).toHaveAttribute("aria-invalid", "true");
  expect(screen.queryByText("✓ Privacy ok")).not.toBeInTheDocument();
  expect(screen.queryByText("✓ Formato URL valido")).not.toBeInTheDocument();
  expect(url).toHaveAccessibleDescription("Inserisci un URL HTTPS completo con un dominio valido.");
  fireEvent.change(url, { target: { value: "https://example.invalid/privacy" } });
  expect(url).toHaveAttribute("aria-invalid", "false");
  expect(screen.getByText("✓ Privacy ok")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Disclaimer custom (opzionale)" })).toHaveValue("Testo locale");
});
