import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import SettingsCreditsRedirect from "@/pages/azienda/settings/SettingsCreditsRedirect";

afterEach(cleanup);
function Destinazione() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output>{location.pathname}{location.search}{location.hash}</output><button onClick={() => navigate(-1)}>Indietro</button></>;
}
it.each(["", "?payment=success", "?payment=cancelled", "?payment=success&session_id=cs_test&tab=pagamenti#storico"])("il vecchio indirizzo crediti%s apre la scheda canonica e conserva il ritorno Stripe", async query => {
  render(<MemoryRouter initialEntries={["/prima", `/azienda/impostazioni/crediti${query}`]} initialIndex={1}>
    <Routes><Route path="/azienda/impostazioni/crediti" element={<SettingsCreditsRedirect />} /><Route path="*" element={<Destinazione />} /></Routes>
  </MemoryRouter>);
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("/azienda/impostazioni/abbonamento?"));
  const url = new URL(screen.getByRole("status").textContent!, "https://example.test");
  expect(url.searchParams.get("tab")).toBe("portafoglio");
  const old = new URL(`/azienda/impostazioni/crediti${query}`, "https://example.test");
  for (const [key, value] of old.searchParams) if (key !== "tab") expect(url.searchParams.get(key)).toBe(value);
  expect(url.hash).toBe(old.hash);
  fireEvent.click(screen.getByRole("button", { name: "Indietro" }));
  expect(screen.getByRole("status")).toHaveTextContent("/prima");
});
