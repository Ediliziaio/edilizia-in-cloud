import { beforeEach, expect, it, vi } from "vitest";
import { arruolaPagine, chiaveArruolamento, cursoreArruolamento } from "@/components/admin/outreach/enrollPages";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));

beforeEach(() => {
  localStorage.clear();
  invoke.mockReset();
});

it("continua dopo una pagina di soli esclusi e usa il protocollo di arruolamento con conferma", async () => {
  const criteri = { sequence_id: "sequenza", tag: "lista" };
  const chiave = chiaveArruolamento("azienda", criteri);
  invoke.mockResolvedValueOnce({
    data: { enrolled: 0, valutati: 500, skipped_optout: 500, altri: true, next_cursor: "posizione-500" },
    error: null,
  });
  await arruolaPagine(criteri, { chiave, quanti: 20, maxGiri: 1 });
  expect(cursoreArruolamento(chiave)).toBe("posizione-500");
  expect(invoke.mock.calls[0][1].body).not.toHaveProperty("sequence_id");
  expect(invoke).toHaveBeenNthCalledWith(1, "outreach-enroll", {
    body: { sequence_ref: "sequenza", tag: "lista", quanti: 20, after: null },
  });

  invoke.mockResolvedValueOnce({
    data: { enrolled: 20, valutati: 21, altri: false, skipped_already: 1, next_cursor: null },
    error: null,
  });
  expect(await arruolaPagine(criteri, { chiave, quanti: 20 })).toMatchObject({
    enrolled: 20, valutati: 21, altri: false, skipped_already: 1,
  });
  expect(invoke).toHaveBeenNthCalledWith(2, "outreach-enroll", {
    body: { sequence_ref: "sequenza", tag: "lista", quanti: 20, after: "posizione-500" },
  });
  expect(cursoreArruolamento(chiave)).toBeNull();
});
