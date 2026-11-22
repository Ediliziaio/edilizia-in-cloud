import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import CampoInvii from "@/pages/campo/CampoInvii";
import { changeFormControl } from "@/test/helpers/changeFormControl";
import type { RicevutaCampo, SyncItem } from "@/lib/campo/sync-queue";

const dati = vi.hoisted(() => ({ voci: [] as SyncItem[], ricevute: [] as RicevutaCampo[] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "operaio" }, effectiveCompany: { id: "azienda" } }) }));
vi.mock("@/hooks/campo/useCampoAssignments", () => ({ useCampoAssignments: () => ({ data: [
  { order_id: "a", order: { description: "Via Roma" } }, { order_id: "b", order: { description: "Via Milano" } },
] }) }));
vi.mock("@/hooks/campo/useRapportiniSospesi", () => ({ useRapportiniSospesi: () => ({ data: [] as never[] }) }));
vi.mock("@/lib/campo/sync-queue", async originale => {
  const modulo = await originale<typeof import("@/lib/campo/sync-queue")>();
  return { ...modulo, syncQueue: { ...modulo.syncQueue, getAll: async () => dati.voci,
    getRicevute: async () => dati.ricevute, on: () => () => {} } };
});

afterEach(() => localStorage.clear());

it("mostra gli invii della persona e il cantiere corretto, insieme a bozze e ricevute", async () => {
  const voce = (patch: Partial<SyncItem>): SyncItem => ({ type: "documento_ddt", id: "bolla", status: "pending",
    payload: { user_id: "operaio", company_id: "azienda", order_id: "b", fileNames: ["bolla-12.jpg"] },
    updatedAt: 10, createdAt: 10, retryCount: 0, ...patch });
  dati.voci = [voce({}), voce({ id: "prelievo", type: "prelievo", status: "failed", lastError: "Controlla la quantità",
    payload: { user_id: "operaio", company_id: "azienda", order_id: "a" } }), voce({ id: "altro",
    payload: { user_id: "altro", company_id: "azienda", order_id: "a", fileNames: ["non-visibile.jpg"] } })];
  dati.ricevute = [{ id: "ricevuto", tipo: "rapportino", orderId: "a", companyId: "azienda", userId: "operaio", data: Date.UTC(2026, 10, 22) }];
  localStorage.setItem("campo-draft:rapportino:azienda:operaio:a:2026-11-22:daily", JSON.stringify({ data: { descrizione: "Bozza" } }));
  render(<MemoryRouter><CampoInvii /></MemoryRouter>);
  expect(await screen.findByRole("link", { name: "Bolla · bolla-12.jpg Via Milano" })).toHaveAttribute("href", "/campo/ddt?order=b&invio=bolla");
  expect(within(screen.getByRole("region", { name: "Da controllare" })).getByRole("link")).toHaveAttribute("href", "/campo/magazzino?tab=prelievi");
  expect(within(screen.getByRole("region", { name: "Bozze" })).getByRole("link")).toHaveAttribute("href", "/campo/lavoro/a/rapportino?data=2026-11-22");
  expect(screen.getByRole("region", { name: "Inviati da questo telefono" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /non-visibile\.jpg/ })).not.toBeInTheDocument();
  changeFormControl(screen.getByRole("combobox", { name: "Filtra per cantiere" }), { target: { value: "b" } });
  expect(screen.getByRole("link", { name: "Bolla · bolla-12.jpg Via Milano" })).toBeInTheDocument();
  expect(screen.queryByText("Controlla la quantità")).not.toBeInTheDocument();
});
