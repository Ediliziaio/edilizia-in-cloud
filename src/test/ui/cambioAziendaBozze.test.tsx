import { useState } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  auth: { user: { id: "utente" }, effectiveCompany: { id: "A" } },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => m.auth }));
import { CompanyPageOutlet } from "@/components/layouts/CompanyPageOutlet";
function Modulo() {
  const [testo, setTesto] = useState("");
  return (
    <label>
      Bozza
      <input value={testo} onChange={(e) => setTesto(e.target.value)} />
    </label>
  );
}
function App() {
  return (
    <MemoryRouter initialEntries={["/azienda/prova"]}>
      <Routes>
        <Route path="/azienda" element={<CompanyPageOutlet />}>
          <Route path="prova" element={<Modulo />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
beforeEach(() => {
  m.auth.user = { id: "utente" };
  m.auth.effectiveCompany = { id: "A" };
});
it("chiude le bozze della precedente azienda mentre un aggiornamento della stessa azienda le conserva", () => {
  const { rerender } = render(<App />);
  fireEvent.change(screen.getByLabelText("Bozza"), {
    target: { value: "dati azienda A" },
  });
  m.auth.effectiveCompany = { id: "A" };
  rerender(<App />);
  expect(screen.getByLabelText("Bozza")).toHaveValue("dati azienda A");
  m.auth.effectiveCompany = { id: "B" };
  rerender(<App />);
  expect(screen.getByLabelText("Bozza")).toHaveValue("");
});
it("anche un altro utente nella stessa azienda riceve un modulo nuovo", () => {
  const { rerender } = render(<App />);
  fireEvent.change(screen.getByLabelText("Bozza"), {
    target: { value: "bozza privata" },
  });
  m.auth.user = { id: "collega" };
  rerender(<App />);
  expect(screen.getByLabelText("Bozza")).toHaveValue("");
});
