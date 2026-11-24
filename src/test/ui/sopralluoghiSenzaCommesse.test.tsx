import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SopralluoghiListRedirect } from "@/routes/company/SopralluoghiListRedirect";

/** Chi non vede le Commesse apre la bacheca da sola invece di finire su una pagina negata. */
const s = vi.hoisted(() => ({ canViewOrders: true }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewOrders: s.canViewOrders }) }));
vi.mock("@/pages/azienda/sopralluoghi/SopralluoghiList", () => ({ default: () => <p>Bacheca sopralluoghi</p> }));
afterEach(cleanup);

const apri = () => render(<MemoryRouter initialEntries={["/azienda/sopralluoghi?sop_tipo=commerciali"]}><Routes>
  <Route path="/azienda/sopralluoghi" element={<SopralluoghiListRedirect />} />
  <Route path="/azienda/ordini" element={<p>Commesse</p>} />
</Routes></MemoryRouter>);

it("chi vede le Commesse va nella loro scheda", () => {
  s.canViewOrders = true;
  apri();
  expect(screen.getByText("Commesse")).toBeTruthy();
});

it("chi non le vede apre la bacheca da sola", async () => {
  s.canViewOrders = false;
  apri();
  expect(await screen.findByText("Bacheca sopralluoghi")).toBeTruthy();
});
