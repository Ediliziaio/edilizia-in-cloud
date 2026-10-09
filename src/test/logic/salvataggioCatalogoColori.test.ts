import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { CHIAVE_CATALOGO_COLORI, catalogoVuoto } from "@/lib/serramenti/catalogoColori";

const mock = vi.hoisted(() => ({
  company: "demo-2" as string | null,
  read: vi.fn(), write: vi.fn(), from: vi.fn(), invalidate: vi.fn(), cache: vi.fn(), log: vi.fn(),
  filters: [] as { operation: string; column: string; value: unknown }[],
  patches: [] as Record<string, unknown>[],
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mock.invalidate }),
  useMutation: (options: { mutationFn: (args: unknown) => Promise<unknown> }) => ({ mutateAsync: options.mutationFn }),
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => mock.company }));
vi.mock("@/lib/serramenti/cacheListino", () => ({ invalidaListinoNelPreventivatore: mock.cache }));
vi.mock("@/lib/velocity/sentry", () => ({ captureVelocityError: mock.log }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mock.from } }));
import { useFamilyMutations } from "@/hooks/useFamilyMutations";

beforeEach(() => {
  vi.clearAllMocks();
  mock.company = "demo-2"; mock.filters = []; mock.patches = [];
  mock.read.mockResolvedValue({ data: { custom_field_values: { altro: "modifica recente" }, updated_at: "revision-2" }, error: null });
  mock.write.mockResolvedValue({ data: { id: "family" }, error: null });
  mock.from.mockImplementation(() => {
    let operation = "read";
    const builder = {
      select: () => builder,
      update: (patch: Record<string, unknown>) => { operation = "write"; mock.patches.push(patch); return builder; },
      eq: (column: string, value: unknown) => { mock.filters.push({ operation, column, value }); return builder; },
      single: () => operation === "read" ? mock.read() : mock.write(),
    };
    return builder;
  });
});
afterEach(cleanup);
const save = () => renderHook(() => useFamilyMutations()).result.current.saveColorCatalog.mutateAsync({ id: "family", catalogo: catalogoVuoto(), expected: null });

describe("salvataggio isolato del catalogo colori", () => {
  it("usa l'azienda sia in lettura sia in scrittura e preserva gli altri campi aggiornati", async () => {
    await expect(save()).resolves.toBe("family");
    expect(mock.filters).toEqual(expect.arrayContaining([
      { operation: "read", column: "company_id", value: "demo-2" },
      { operation: "write", column: "company_id", value: "demo-2" },
      { operation: "read", column: "id", value: "family" },
      { operation: "write", column: "id", value: "family" },
      { operation: "write", column: "updated_at", value: "revision-2" },
    ]));
    expect(mock.patches[0]).toEqual({ custom_field_values: { altro: "modifica recente", [CHIAVE_CATALOGO_COLORI]: catalogoVuoto() } });
  });
  it("senza azienda non esegue nessuna richiesta", async () => {
    mock.company = null;
    await expect(save()).rejects.toThrow(/Azienda/);
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("non sovrascrive colori modificati da un altro editor", async () => {
    mock.read.mockResolvedValue({ data: { custom_field_values: { [CHIAVE_CATALOGO_COLORI]: catalogoVuoto() }, updated_at: "revision-2" }, error: null });
    await expect(save()).rejects.toThrow(/altro editor/);
    expect(mock.write).not.toHaveBeenCalled();
    expect(mock.patches).toHaveLength(0);
  });
  it("se la revisione cambia tra lettura e scrittura chiede di ricaricare", async () => {
    mock.write.mockResolvedValue({ data: null, error: { code: "PGRST116", message: "0 rows" } });
    await expect(save()).rejects.toThrow(/cambiato durante/);
  });
  it("un prodotto non accessibile non può essere aggiornato", async () => {
    mock.read.mockResolvedValue({ data: null, error: { message: "not found" } });
    await expect(save()).rejects.toThrow("not found");
    expect(mock.write).not.toHaveBeenCalled();
  });
});
