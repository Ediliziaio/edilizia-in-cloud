import { beforeEach, expect, it, vi } from "vitest";
import { leggiModalitaCommesse } from "@/lib/finanziamenti/leggiModalitaCommesse";
const mock = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), in: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mock.from, rpc: mock.rpc } }));
const rows = [{ id: "commessa", payment_type: "financing", financing_cost: 300 }];
beforeEach(() => { vi.clearAllMocks(); mock.rpc.mockResolvedValue({data:[{id:"commessa"}],error:null}); mock.from.mockReturnValue(mock); mock.select.mockReturnValue(mock); mock.eq.mockReturnValue(mock); });
it("aggiunge la modalità senza perdere il resto della commessa e limita l'azienda", async () => {
  mock.in.mockResolvedValue({ data: [{ id: "commessa", financing_cost_mode: "separato" }], error: null });
  expect(await leggiModalitaCommesse("azienda", rows)).toMatchObject([{ ...rows[0], financing_cost_mode: "separato" }]);
  expect(mock.eq).toHaveBeenCalledWith("company_id", "azienda");
});
it("mantiene lo storico solo se la colonna non è stata ancora distribuita", async () => {
  mock.in.mockResolvedValue({ data: null, error: { code: "42703", message: "column orders.financing_cost_mode does not exist" } });
  expect(await leggiModalitaCommesse("azienda", rows)).toMatchObject(rows);
});
it.each([
  { data: null, error: { code: "42501", message: "permission denied" } },
  { data: [], error: null },
  { data: [{ id: "commessa", financing_cost_mode: "sconosciuto" }], error: null },
])("non presenta calcoli storici come validi quando la lettura fallisce", async result => {
  mock.in.mockResolvedValue(result);
  await expect(leggiModalitaCommesse("azienda", rows)).rejects.toThrow();
});
it("non legge modalità finanziarie inutili e aggiorna comunque incassi e crediti", async () => {
  expect(await leggiModalitaCommesse("azienda", [{ ...rows[0], financing_cost: 0 }])).toHaveLength(1);
  expect(mock.from).not.toHaveBeenCalled();
});
