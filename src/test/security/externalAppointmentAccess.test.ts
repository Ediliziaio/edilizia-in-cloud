import { describe, expect, it, vi } from "vitest";
import { canMutateExternalAppointment } from "../../../supabase/functions/_shared/externalAppointmentAccess";

function fixture(options: { readonly?: boolean; external?: boolean; visible?: boolean; permission?: boolean; error?: boolean; status?: string; creator?: string } = {}) {
  const filters: Record<string, string> = {};
  const query = { eq: (key: string, value: string) => { filters[key] = value; return query; }, maybeSingle: async () => ({ data: options.visible === false ? null : { id: "apt-a", created_by: options.creator ?? "other", status: options.status ?? "confermato" }, error: null as null }) };
  const caller = { rpc: vi.fn(async (name: string) => ({ data: name === "utente_sola_lettura" ? options.readonly === true : options.external === true, error: options.error ? new Error("offline") : null })), from: vi.fn(() => ({ select: () => query })) };
  const admin = { rpc: vi.fn(async () => ({ data: options.permission !== false, error: null as null })) };
  return { caller, admin, filters, run: (action = "update-event") => canMutateExternalAppointment(caller, admin, "user-a", "company-a", "apt-a", action) };
}
describe("calendari esterni: autorizzazione delle modifiche", () => {
  it.each([{ readonly: true }, { external: true }, { visible: false }, { permission: false }, { error: true }])("nega prima di usare le credenziali esterne: %j", async options => {
    const f = fixture(options); expect(await f.run()).toBe(false);
  });
  it("ammette il collega autorizzato solo dopo una lettura sotto RLS e nell'azienda richiesta", async () => {
    const f = fixture(); expect(await f.run()).toBe(true);
    expect(f.filters).toEqual({ id: "apt-a", company_id: "company-a" });
    expect(f.admin.rpc).toHaveBeenCalledWith("has_permission_for_company", expect.objectContaining({ _user_id: "user-a", _company_id: "company-a" }));
  });
  it("permette al creatore di sincronizzare il proprio appuntamento visibile", async () => {
    expect(await fixture({ permission: false, creator: "user-a" }).run()).toBe(true);
  });
  it("non elimina il calendario di un appuntamento ancora attivo", async () => {
    expect(await fixture().run("delete-event")).toBe(false);
    expect(await fixture({ status: "annullato" }).run("delete-event")).toBe(true);
  });
  it("non ricrea un evento già annullato", async () => {
    expect(await fixture({ status: "annullato" }).run("push-event")).toBe(false);
  });
});
