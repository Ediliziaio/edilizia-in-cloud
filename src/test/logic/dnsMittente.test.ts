/**
 * Il DNS dei domini da cui spediamo (07/11/2026). Alcuni server rifiutavano le
 * nostre email con «Sender address rejected: Domain not found»: i sottodomini
 * mkt.* non avevano né MX né A. Si aggiunge solo ciò che manca.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DMARC_OSSERVAZIONE, pianoDnsMittente, type StatoDns } from "../../../supabase/functions/_shared/dnsMittente";

const sub = "mkt.ediliziaincloud.com";
const vuoto: StatoDns = { sottodominio: [], apice: [], dmarcSottodominio: [], dmarcApice: [] };
const mxApice = [
  { type: "MX", name: "ediliziaincloud.com", content: "aspmx.l.google.com", priority: 1 },
  { type: "MX", name: "ediliziaincloud.com", content: "alt1.aspmx.l.google.com", priority: 5 },
];

describe("MX del dominio mittente", () => {
  it("senza MX né indirizzo: si copiano gli MX del dominio principale, con le priorità", () => {
    const p = pianoDnsMittente(sub, { ...vuoto, apice: mxApice });
    expect(p.da_aggiungere.filter((r) => r.type === "MX")).toEqual([
      { type: "MX", name: sub, content: "aspmx.l.google.com", priority: 1 },
      { type: "MX", name: sub, content: "alt1.aspmx.l.google.com", priority: 5 },
    ]);
  });

  it("i TXT di SPF sul sottodominio non contano come indirizzo", () => {
    const p = pianoDnsMittente(sub, { ...vuoto, apice: mxApice, sottodominio: [{ type: "TXT", name: sub, content: "v=spf1 include:_spf.elasticemail.com ~all" }] });
    expect(p.da_aggiungere.some((r) => r.type === "MX")).toBe(true);
  });

  it("MX già presente: niente", () => {
    const p = pianoDnsMittente(sub, { ...vuoto, apice: mxApice, sottodominio: [{ type: "MX", name: sub, content: "mx.altro.it", priority: 10 }] });
    expect(p.da_aggiungere.some((r) => r.type === "MX")).toBe(false);
  });

  it("A o CNAME già presenti: basta per il controllo del mittente, e un CNAME non vuole altri record", () => {
    for (const t of ["A", "CNAME"]) {
      const p = pianoDnsMittente(sub, { ...vuoto, apice: mxApice, sottodominio: [{ type: t, name: sub, content: "1.2.3.4" }] });
      expect(p.da_aggiungere.some((r) => r.type === "MX"), t).toBe(false);
    }
  });

  it("nessun MX da copiare: non si inventa un server", () => {
    const p = pianoDnsMittente(sub, vuoto);
    expect(p.da_aggiungere.some((r) => r.type === "MX")).toBe(false);
    expect(p.note.join(" ")).toContain("va deciso a mano");
  });
});

describe("DMARC del dominio mittente", () => {
  it("ereditato dal dominio principale: non si tocca", () => {
    const p = pianoDnsMittente(sub, { ...vuoto, dmarcApice: [{ type: "TXT", name: "_dmarc.ediliziaincloud.com", content: "v=DMARC1; p=quarantine" }] });
    expect(p.da_aggiungere.some((r) => r.type === "TXT")).toBe(false);
  });

  it("già presente sul sottodominio: non si tocca", () => {
    const p = pianoDnsMittente(sub, { ...vuoto, dmarcSottodominio: [{ type: "TXT", name: `_dmarc.${sub}`, content: "\"v=DMARC1; p=none\"" }] });
    expect(p.da_aggiungere.some((r) => r.type === "TXT")).toBe(false);
  });

  it("assente ovunque: in sola osservazione, che non fa rifiutare niente", () => {
    const p = pianoDnsMittente(sub, vuoto);
    expect(p.da_aggiungere).toContainEqual({ type: "TXT", name: `_dmarc.${sub}`, content: DMARC_OSSERVAZIONE });
    expect(DMARC_OSSERVAZIONE).toContain("p=none");
  });
});

describe("email-platform-setup, azione dns_mittente", () => {
  const f = readFileSync(join(__dirname, "../../../supabase/functions/email-platform-setup/index.ts"), "utf8");
  const azione = f.slice(f.indexOf('if (action === "dns_mittente")'), f.indexOf('if (action === "account_info")'));

  it("senza applica=true legge soltanto", () => {
    expect(azione).toContain("const applica = body.applica === true;");
    const scritture = azione.slice(azione.indexOf("if (applica)"));
    expect(azione.indexOf('method: "POST"')).toBeGreaterThan(azione.indexOf("if (applica)"));
    expect(scritture).toContain('method: "POST"');
  });

  it("non cancella e non sovrascrive mai", () => {
    expect(azione).not.toMatch(/method: "(DELETE|PUT|PATCH)"/);
  });

  it("si entra col token di setup o con una chiamata interna", () => {
    expect(f).toContain("if (!chiamataInternaValida(req)) {");
  });
});
