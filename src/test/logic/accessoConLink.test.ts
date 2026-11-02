import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accountDaLinkValido, emailDaLink } from "../../../supabase/functions/_shared/accessoConLink";

const dip = "AAAAAAAA-1111-4111-8111-111111111111";
const buono = { email: emailDaLink(dip), employeeId: dip, aziendaProfilo: "c1", aziendaDipendente: "c1", ruoli: ["employee", "company_staff"], bloccato: false };
const fonte = (p: string) => readFileSync(p, "utf8").replace(/\s+/g, "").replaceAll('"', "'");

describe("il link apre solo l'account fatto per quel dipendente", () => {
  it("l'account giusto passa", () => expect(accountDaLinkValido(buono)).toBe(true));
  it("l'account del link di un altro dipendente no: un amministratore non può puntare il suo dipendente su un altro", () => {
    expect(accountDaLinkValido({ ...buono, email: emailDaLink("bbbbbbbb-1111-4111-8111-111111111111") })).toBe(false);
  });
  it("un account con email vera no", () => expect(accountDaLinkValido({ ...buono, email: "mario@azienda.it" })).toBe(false));
  it("un account di un'altra azienda no", () => expect(accountDaLinkValido({ ...buono, aziendaProfilo: "c2" })).toBe(false));
  it("un account promosso amministratore no", () => {
    expect(accountDaLinkValido({ ...buono, ruoli: ["employee", "company_admin"] })).toBe(false);
    expect(accountDaLinkValido({ ...buono, ruoli: ["super_admin"] })).toBe(false);
  });
  it("un account bloccato no", () => expect(accountDaLinkValido({ ...buono, bloccato: true })).toBe(false));
  it("senza email no", () => expect(accountDaLinkValido({ ...buono, email: null })).toBe(false));

  it.each(["supabase/functions/campo-link-entra/index.ts", "supabase/functions/campo-link-crea/index.ts"])("%s legge l'email vera dell'account e usa il controllo", (f) => {
    const c = fonte(f);
    expect(c).toContain("admin.auth.admin.getUserById(");
    expect(c).toContain("accountDaLinkValido(");
  });
  it("entrando genera il link sull'email dell'account verificato, non su quella del profilo", () => {
    const c = fonte("supabase/functions/campo-link-entra/index.ts");
    expect(c).not.toContain("email=profilo!.email!");
  });
  it("l'account nuovo non resta bloccato sul cambio password che non può fare", () => {
    expect(fonte("supabase/functions/campo-link-entra/index.ts")).toContain("must_change_password:false");
  });
});

describe("il token non finisce nelle statistiche", () => {
  it("/entra è una pagina di servizio per l'attribuzione", () => {
    expect(fonte("src/contexts/AnalyticsProvider.tsx")).toContain("'/entra'");
  });
  it("tutti gli elenchi di percorsi privati la conoscono", () => {
    for (const f of ["index.html", "src/App.tsx"]) {
      const righe = readFileSync(f, "utf8").split("\n").filter(r => /PRIVATE_[A-Z_]*PREFIXES\s*=\s*$|PRIVATE_[A-Z_]*PREFIXES\s*=\s*\/|^\s*\/\^\\\/\(app\|admin/.test(r) && r.includes("^"));
      expect(righe.length, f).toBeGreaterThan(0);
      for (const r of righe) expect(r, f).toMatch(/\|entra\|/);
    }
  });
});

describe("foto del ticket e squadra", () => {
  const ticket = readFileSync("supabase/migrations/20281113160000_campo_ticket_allegati.sql", "utf8");
  const squadra = readFileSync("supabase/migrations/20281113170000_campo_squadra_chiama_sollecita.sql", "utf8");
  it("la verifica del proprio ticket non dipende dal poterlo rileggere", () => {
    expect(ticket).toContain("security definer");
    expect(ticket).toContain("public.campo_ticket_mio(ticket_messages.ticket_id)");
    expect(ticket).toContain("revoke all on function public.campo_ticket_mio(uuid) from public, anon");
  });
  it("un operaio non vede telefoni né sollecita: l'ufficio vero sì, il capo sì", () => {
    expect(squadra).toContain("public.e_amministratore_di(v_company)");
    expect(squadra).toMatch(/public\.campo_e_ufficio\(v_company\)\s+and not exists \(select 1 from public\.user_roles ur where ur\.user_id = v_me and ur\.role in \('employee', 'subcontractor'\)\)/);
  });
});

describe("rimandare un rapportino respinto", () => {
  it("non timbra l'uscita di nascosto", () => {
    expect(fonte("src/pages/campo/CampoRapportino.tsx")).toContain("constchiudeGiornata=sessioneDaChiudere&&!oreNonMie&&!confermaCliente&&!daRifare;");
  });
});

