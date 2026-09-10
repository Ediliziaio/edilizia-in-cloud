import { describe, expect, it } from "vitest";
import { istruzioniDns } from "@/components/admin/outreach/outreachDns";

/**
 * Le istruzioni DNS mostrate sotto «record da configurare».
 *
 * Erano scritte per Elastic Email e basta: chi aveva caselle Register,
 * seguendole, avrebbe sostituito l'SPF con `include:_spf.elasticemail.com` —
 * l'include di Register sparisce e ogni email esce con spf=softfail. Il
 * provider si legge dagli host SMTP delle caselle del dominio.
 */
describe("istruzioniDns", () => {
  it("Register/SecureMail: l'SPF di Register, e la verità sul DKIM", () => {
    const d = istruzioniDns("thermodmr.it", ["authsmtp.securemail.pro", null, "authsmtp.securemail.pro"]);
    expect(d.provider).toContain("Register");
    expect(d.spf).toBe("v=spf1 include:spf.webapps.net ~all");
    expect(d.spf).not.toContain("elasticemail");
    expect(d.notaDkim).toMatch(/d=register\.it/);
  });

  it("Aruba", () => {
    expect(istruzioniDns("x.it", ["smtps.aruba.it"]).spf).toContain("_spf.aruba.it");
  });

  it("Google Workspace: SPF e selettore google", () => {
    const d = istruzioniDns("x.it", ["smtp.gmail.com"]);
    expect(d.spf).toContain("_spf.google.com");
    expect(d.dkimHost).toBe("google._domainkey.x.it");
  });

  it("Microsoft 365: due CNAME", () => {
    const d = istruzioniDns("x.it", ["smtp.office365.com"]);
    expect(d.spf).toContain("spf.protection.outlook.com");
    expect(d.dkimTipo).toBe("CNAME");
  });

  it("senza caselle SMTP resta Elastic Email, come prima", () => {
    expect(istruzioniDns("x.it", []).spf).toContain("_spf.elasticemail.com");
  });
});
