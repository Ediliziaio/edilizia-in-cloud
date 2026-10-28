import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: m.rpc, functions: { invoke: m.invoke } },
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canViewMezzi: true, canEditMezzi: true }),
}));
import {
  preparaVerbaleTecnico,
  leggiVerbaliTecniciMezzo,
  urlVerbaleTecnico,
} from "@/hooks/useVerbaliTecniciMezzo";
const id = "11111111-1111-4111-8111-111111111111",
  doc = "22222222-2222-4222-8222-222222222222",
  intervento = "33333333-3333-4333-8333-333333333333";
const fonte = () => ({
  company_id: "azienda",
  mezzo_id: "mezzo",
  manutenzione_id: intervento,
  file_name: "TEST.pdf",
  tipo: "verifica",
  data: "2026-11-01",
  impronta: "a".repeat(64),
});
const url =
  "https://esempio.supabase.co/storage/v1/object/sign/mezzi-documenti/azienda/mezzo/TEST.pdf?token=TEST";
const registro = () => ({
  company_id: "azienda",
  mezzo_id: "mezzo",
  registrazioni: [
    {
      id,
      documento_id: doc,
      manutenzione_id: intervento,
      fonte_impronta: "a".repeat(64),
      titolo: "TEST",
      categoria: "verifica_periodica",
      registrato_il: "2026-10-27T10:00:00Z",
      registrato_da: id,
      disponibile: true,
    },
  ],
});
beforeEach(() => {
  m.rpc.mockReset();
  m.invoke.mockReset();
  vi.stubEnv("VITE_SUPABASE_URL", "https://esempio.supabase.co");
});
afterEach(() => vi.unstubAllEnvs());
describe("Fonti e registro dei verbali tecnici", () => {
  it("prepara dall’identità dell’intervento, senza inviare un path scelto dal client", async () => {
    m.invoke.mockResolvedValue({
      data: {
        ok: true,
        fonte: { ...fonte(), costo: 9999, path: "PRIVATO" },
        url,
      },
      error: null,
    });
    const r = await preparaVerbaleTecnico("azienda", "mezzo", intervento);
    expect(m.invoke).toHaveBeenCalledWith("mezzi-verbali", {
      body: {
        azione: "prepara",
        company_id: "azienda",
        mezzo_id: "mezzo",
        manutenzione_id: intervento,
      },
    });
    expect(JSON.stringify(r)).not.toMatch(/9999|PRIVATO/);
  });
  it.each(["azienda", "mezzo", "intervento", "impronta"])(
    "rifiuta una foto incoerente: %s",
    async (campo) => {
      const f = fonte();
      if (campo === "azienda") f.company_id = "altra";
      if (campo === "mezzo") f.mezzo_id = "altro";
      if (campo === "intervento") f.manutenzione_id = "altro";
      if (campo === "impronta") f.impronta = "non verificata";
      m.invoke.mockResolvedValue({
        data: { ok: true, fonte: f, url },
        error: null,
      });
      await expect(
        preparaVerbaleTecnico("azienda", "mezzo", intervento),
      ).rejects.toThrow();
    },
  );
  it.each([
    "https://estraneo.example/test.pdf",
    "javascript:alert(1)",
    "https://esempio.supabase.co/storage/v1/object/sign/mezzi-documenti/altra/privato.pdf",
  ])("rifiuta link fuori ambito: %s", (u) =>
    expect(() => urlVerbaleTecnico(u, "azienda", "mezzo")).toThrow(),
  );
  it("minimizza il registro e richiede azienda e macchina", async () => {
    const q = registro();
    m.rpc.mockResolvedValue({
      data: {
        ...q,
        origine_path: "PRIVATO",
        registrazioni: [
          {
            ...q.registrazioni[0],
            copia_path: "PRIVATO",
            parametri: { costo: 9999 },
          },
        ],
      },
      error: null,
    });
    const r = await leggiVerbaliTecniciMezzo("azienda", "mezzo");
    expect(m.rpc).toHaveBeenCalledWith("mezzi_verbali_tecnici_elenco", {
      _company: "azienda",
      _mezzo: "mezzo",
    });
    expect(JSON.stringify(r)).not.toMatch(/PRIVATO|9999|parametri/);
  });
  it.each(["azienda", "mezzo", "documento", "limite"])(
    "rifiuta un registro incoerente: %s",
    async (campo) => {
      const q = registro();
      if (campo === "azienda") q.company_id = "altra";
      if (campo === "mezzo") q.mezzo_id = "altro";
      if (campo === "documento") q.registrazioni[0].documento_id = "invalido";
      if (campo === "limite")
        q.registrazioni = Array.from({ length: 201 }, () => ({
          ...q.registrazioni[0],
        }));
      m.rpc.mockResolvedValue({ data: q, error: null });
      await expect(
        leggiVerbaliTecniciMezzo("azienda", "mezzo"),
      ).rejects.toThrow();
    },
  );
  it("non presenta un errore del registro come assenza di copie", async () => {
    m.rpc.mockResolvedValue({
      data: null,
      error: { message: "Registro non disponibile" },
    });
    await expect(leggiVerbaliTecniciMezzo("azienda", "mezzo")).rejects.toThrow(
      "Registro non disponibile",
    );
  });
});
