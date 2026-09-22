import { describe, it, expect } from "vitest";
import { mittenteDelCalendario, type DominioEmail } from "../../../supabase/functions/_shared/mittenteCalendarioRegola";

const AZ = "00000000-0000-0000-0000-000000000001";
const mkt: DominioEmail = { domain: "mkt.ediliziaincloud.com", is_active: true, ee_spf_verified: true, ee_dkim_verified: true };

describe("mittente delle email dell'appuntamento", () => {
  it("nome e indirizzo del calendario, se il dominio è verificato", () => {
    const m = mittenteDelCalendario(
      { company_id: AZ, mittente_nome: "Filippo di EdiliziaInCloud", mittente_email: "flo@mkt.ediliziaincloud.com" },
      [mkt],
    );
    expect(m).toEqual({ from: "Filippo di EdiliziaInCloud <flo@mkt.ediliziaincloud.com>", email: "flo@mkt.ediliziaincloud.com", dominio: "mkt.ediliziaincloud.com" });
  });

  it("maiuscole e spazi nell'indirizzo non contano", () => {
    const m = mittenteDelCalendario({ company_id: AZ, mittente_nome: null, mittente_email: "  Flo@MKT.EdiliziaInCloud.com " }, [mkt]);
    expect(m?.from).toBe("flo@mkt.ediliziaincloud.com");
  });

  it("dominio non verificato, disattivato o di un'altra azienda: resta il mittente di sempre", () => {
    const cal = { company_id: AZ, mittente_nome: "Filippo", mittente_email: "flo@mkt.ediliziaincloud.com" };
    expect(mittenteDelCalendario(cal, [{ ...mkt, ee_dkim_verified: false }])).toBeNull();
    expect(mittenteDelCalendario(cal, [{ ...mkt, is_active: false }])).toBeNull();
    expect(mittenteDelCalendario(cal, [{ ...mkt, domain: "mkt.marketingedile.com" }])).toBeNull();
    expect(mittenteDelCalendario(cal, [])).toBeNull();
  });

  it("indirizzo vuoto o storto: nessun mittente proprio", () => {
    expect(mittenteDelCalendario({ company_id: AZ, mittente_email: "" }, [mkt])).toBeNull();
    expect(mittenteDelCalendario({ company_id: AZ, mittente_email: "flo@" }, [mkt])).toBeNull();
    expect(mittenteDelCalendario({ company_id: AZ, mittente_email: "Filippo <flo@mkt.ediliziaincloud.com>" }, [mkt])).toBeNull();
  });

  it("il nome non può rompere l'intestazione", () => {
    const m = mittenteDelCalendario({ company_id: AZ, mittente_nome: 'Filippo "EiC" <spam>', mittente_email: "flo@mkt.ediliziaincloud.com" }, [mkt]);
    expect(m?.from).toBe("Filippo EiC spam <flo@mkt.ediliziaincloud.com>");
  });
});
