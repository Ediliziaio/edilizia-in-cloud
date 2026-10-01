/**
 * Amministratore DI QUALE azienda, nelle funzioni del server (26/09/2026).
 *
 * Il ruolo company_admin sta in user_roles senza azienda: vale per l'azienda
 * del profilo. In un'azienda raggiunta con un accesso multi-azienda vale il
 * grado di quell'accesso. requireCompanyAccess(…, { allowedRoles }) guardava i
 * ruoli globali e poi solo se si poteva entrare nell'azienda: l'amministratore
 * di A, entrato in B come staff, in B attivava Telnyx e comprava numeri,
 * creava account di dipendenti e venditori con password e permessi a scelta,
 * creava e convertiva clienti, approvava POS in sola lettura, e Silvio lo
 * trattava da titolare (chat, azioni, bot Telegram).
 *
 * E telnyx-proxy: l'account Telnyx è uno per tutta la piattaforma, ma
 * list_numbers lo elencava a chiunque avesse fatto login e release_number
 * rilasciava il numero di qualunque azienda a qualunque amministratore.
 *
 * Tiene fermo:
 *   · la regola (_shared/amministraAzienda.ts), provata con un client finto:
 *     azienda del profilo col ruolo, accesso attivo e non scaduto da
 *     amministratore, bloccato → niente;
 *   · i chiamanti usano quella regola e non più allowedRoles con company_admin;
 *   · auth.ts non cambia (toccarlo ripubblica tutte le funzioni che lo importano);
 *   · il guardiano in fondo ferma un requireCompanyAccess nuovo con allowedRoles
 *     che contenga company_admin.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import {
  amministraAzienda,
  gradoAccessoMultiAzienda,
  ruoliNellAzienda,
} from "../../../supabase/functions/_shared/amministraAzienda";

const ROOT = join(__dirname, "../../..");
const FUNZIONI = join(ROOT, "supabase/functions");
const leggi = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ── client finto: tabelle in memoria, .select().eq()…maybeSingle() / await ──
type Riga = Record<string, unknown>;
function clientFinto(tabelle: Record<string, Riga[]>) {
  return {
    from(tabella: string) {
      const filtri: Array<[string, unknown]> = [];
      const righe = () => (tabelle[tabella] ?? []).filter((r) => filtri.every(([c, v]) => r[c] === v));
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => {
          filtri.push([c, v]);
          return q;
        },
        maybeSingle: async () => ({ data: righe()[0] ?? null, error: null as string | null }),
        then: (ok: (x: { data: Riga[]; error: string | null }) => unknown) =>
          Promise.resolve({ data: righe(), error: null as string | null }).then(ok),
      };
      return q;
    },
  };
}

const A = "azienda-a";
const B = "azienda-b";
const ADESSO = new Date("2026-09-26T12:00:00Z");

function mondo(extra: Partial<Record<string, Riga[]>> = {}) {
  return clientFinto({
    profiles: [
      { id: "admin-a", company_id: A, is_blocked: false },
      { id: "staff-a", company_id: A, is_blocked: false },
      { id: "bloccato", company_id: A, is_blocked: true },
      { id: "super", company_id: null, is_blocked: false },
    ],
    user_roles: [
      { user_id: "admin-a", role: "company_admin" },
      { user_id: "staff-a", role: "company_staff" },
      { user_id: "bloccato", role: "company_admin" },
      { user_id: "super", role: "super_admin" },
    ],
    multi_company_access: [],
    ...extra,
  });
}

const accesso = (user: string, company: string, ruolo: string, status = "active", scadenza: string | null = null) => ({
  user_id: user,
  company_id: company,
  access_role: ruolo,
  status,
  expires_at: scadenza,
});

describe("la regola: ruoli nell'azienda e amministratore di QUELL'azienda", () => {
  it("l'amministratore della propria azienda lo è lì", async () => {
    const db = mondo();
    expect(await amministraAzienda(db, "admin-a", A, ADESSO)).toBe(true);
    expect(await ruoliNellAzienda(db, "admin-a", A, ADESSO)).toEqual(["company_admin"]);
  });

  it("entrato in B come staff, in B è staff e basta (il caso del buco)", async () => {
    const db = mondo({ multi_company_access: [accesso("admin-a", B, "company_staff")] });
    expect(await amministraAzienda(db, "admin-a", B, ADESSO)).toBe(false);
    expect(await ruoliNellAzienda(db, "admin-a", B, ADESSO)).toEqual(["company_staff"]);
  });

  it("senza accesso a B, in B non ha ruoli", async () => {
    const db = mondo();
    expect(await ruoliNellAzienda(db, "admin-a", B, ADESSO)).toEqual([]);
    expect(await amministraAzienda(db, "admin-a", B, ADESSO)).toBe(false);
  });

  it("entrato in B da amministratore, in B è amministratore", async () => {
    const db = mondo({ multi_company_access: [accesso("staff-a", B, "company_admin")] });
    expect(await amministraAzienda(db, "staff-a", B, ADESSO)).toBe(true);
    // e nella propria resta staff
    expect(await amministraAzienda(db, "staff-a", A, ADESSO)).toBe(false);
  });

  it("accesso sospeso, invitato o scaduto: niente", async () => {
    for (const a of [
      accesso("staff-a", B, "company_admin", "suspended"),
      accesso("staff-a", B, "company_admin", "invited"),
      accesso("staff-a", B, "company_admin", "active", "2026-09-25T00:00:00Z"),
    ]) {
      const db = mondo({ multi_company_access: [a] });
      expect(await amministraAzienda(db, "staff-a", B, ADESSO), JSON.stringify(a)).toBe(false);
      expect(await gradoAccessoMultiAzienda(db, "staff-a", B, ADESSO)).toBeNull();
    }
    const valido = mondo({ multi_company_access: [accesso("staff-a", B, "company_admin", "active", "2026-10-01T00:00:00Z")] });
    expect(await amministraAzienda(valido, "staff-a", B, ADESSO)).toBe(true);
  });

  it("l'utente bloccato non ha ruoli, nemmeno nella sua azienda", async () => {
    const db = mondo();
    expect(await ruoliNellAzienda(db, "bloccato", A, ADESSO)).toEqual([]);
    expect(await amministraAzienda(db, "bloccato", A, ADESSO)).toBe(false);
  });

  it("il super admin resta super admin dappertutto, ma non diventa amministratore di un'azienda", async () => {
    const db = mondo();
    expect(await ruoliNellAzienda(db, "super", B, ADESSO)).toEqual(["super_admin"]);
    expect(await amministraAzienda(db, "super", B, ADESSO)).toBe(false);
  });

  it("senza utente o senza azienda: niente", async () => {
    const db = mondo();
    expect(await ruoliNellAzienda(db, "", A, ADESSO)).toEqual([]);
    expect(await amministraAzienda(db, "admin-a", "", ADESSO)).toBe(false);
  });
});

describe("il file della regola non importa niente", () => {
  it("così i test la eseguono e toccarla non ripubblica mezzo server", () => {
    const sorgente = leggi("supabase/functions/_shared/amministraAzienda.ts");
    expect(sorgente).not.toMatch(/^import /m);
  });
});

describe("i chiamanti usano la regola", () => {
  const conAllowedAdmin = /requireCompanyAccess\([^)]*allowedRoles[^\]]*company_admin/s;

  it.each([
    "telnyx-attiva-azienda",
    "telnyx-acquista-numero",
    "silvio-daily-briefing",
    "silvio-memory-extract",
    "convert-contact-to-customer",
  ])("%s: requireCompanyAccess senza allowedRoles + richiediAmministratoreAzienda", (nome) => {
    const s = leggi(`supabase/functions/${nome}/index.ts`);
    expect(s).toContain('from "../_shared/amministraAzienda.ts"');
    expect(s).toContain("richiediAmministratoreAzienda(");
    expect(s).not.toMatch(conAllowedAdmin);
  });

  it("creazione di dipendenti e venditori: amministratore dell'azienda della scheda", () => {
    const dip = leggi("supabase/functions/create-employee-user/index.ts");
    expect(dip).toContain("amministraAzienda(supabaseAdmin, caller.id, employee.company_id)");
    expect(dip).not.toContain("aziendaAccessibile(");
    const ven = leggi("supabase/functions/create-salesperson-user/index.ts");
    expect(ven).toContain("amministraAzienda(supabaseAdmin, caller.id, salesperson.company_id)");
    expect(ven).not.toContain("aziendaAccessibile(");
  });

  it("clienti: il ruolo che salta i permessi è quello in QUESTA azienda", () => {
    const s = leggi("supabase/functions/create-customer/index.ts");
    expect(s).toContain("const ruoliQui = await ruoliNellAzienda(supabaseAdmin, userId, companyId);");
    expect(s).toContain('if (ruoliQui.includes("company_admin")) return { ok: true, ruolo: "company_admin" };');
    expect(s).not.toContain('if (ruoli.includes("company_admin"))');
  });

  it("Silvio: chat, azioni e bot Telegram con i ruoli dell'azienda", () => {
    const chat = leggi("supabase/functions/silvio-chat/index.ts");
    expect(chat).toContain("ruoliNellAzienda(supabaseAdmin, userId, companyId)");
    expect(chat).toContain("const roleList: string[] = ruoliAzienda;");
    // Nessun ruolo in quest'azienda (bloccato, accesso revocato) → 403, non il
    // ripiego a company_staff che faceva entrare il bloccato.
    expect(chat).toMatch(/if \(roleList\.length === 0\) \{[\s\S]{0,160}?403/);
    const azioni = leggi("supabase/functions/silvio-execute-action/index.ts");
    expect(azioni).toContain("const ruoli = await ruoliNellAzienda(supabaseAdmin, userId, proposal.company_id);");
    expect(azioni).toContain("primaryRole = pickPrimaryRole(ruoli);");
    expect(azioni).not.toMatch(conAllowedAdmin);
    expect(azioni).not.toContain("allowedRoles: effectiveAllowedRoles");
    const bot = leggi("supabase/functions/telegram-bot-processor/index.ts");
    expect(bot).toContain("getUserRole(supabase, mapping.user_id, mapping.company_id)");
    expect(bot).toContain("await ruoliNellAzienda(supabase, userId, companyId)");
    // Nessun ruolo (bloccato, accesso revocato) → "guest" (solo strumenti
    // aperti a tutti), non il ripiego a company_staff.
    expect(bot).toContain('? ruoloPrincipaleSilvio(ruoli) : "guest"');
  });

  it("POS in sola lettura: l'eccezione è per l'amministratore di questa azienda", () => {
    const s = leggi("supabase/functions/genera-pos/index.ts");
    expect(s).toContain("const admin = superAdmin || (await amministraAzienda(db, userId, companyId));");
  });

  it("modelli di permessi: l'azienda dal corpo della richiesta solo al super admin", () => {
    const s = leggi("supabase/functions/manage-permission-template/index.ts");
    expect(s).toContain('const companyId = profile?.company_id || (ruolo === "super_admin" ? body.company_id : null);');
  });
});

describe("telnyx-proxy: i numeri della piattaforma", () => {
  const s = leggi("supabase/functions/telnyx-proxy/index.ts");
  const blocco = (caso: string, dopo: string) => s.slice(s.indexOf(`case "${caso}"`), s.indexOf(`case "${dopo}"`));

  it("l'elenco completo solo al super admin e alle chiamate di servizio", () => {
    const b = blocco("list_numbers", "release_number");
    expect(b).toContain("if (!isServiceCall && !(userId && await isSuperAdmin(adminClient, userId))) {");
    expect(b.indexOf("isSuperAdmin(")).toBeLessThan(b.indexOf("telnyxFetch("));
  });

  it("si rilascia un numero solo da amministratore della SUA azienda, prima di chiamare Telnyx", () => {
    const b = blocco("release_number", "send_sms");
    expect(b).toContain('.from("virtual_phone_numbers").select("company_id").eq("telnyx_phone_id", payload.phone_number_id)');
    expect(b).toContain('.from("ai_agent_phone_numbers").select("company_id").eq("telnyx_phone_id", payload.phone_number_id)');
    const controllo = b.indexOf("amministraAzienda(adminClient, userId, aziendaDelNumero)");
    expect(controllo).toBeGreaterThan(-1);
    expect(controllo).toBeLessThan(b.indexOf("telnyxFetch("));
    // un numero che non è di nessuna azienda (o di più d'una) non si rilascia
    expect(b).toContain("if (proprietarie.length !== 1) {");
    expect(b).not.toContain("isCompanyAdmin(");
  });
});

describe("guardiano", () => {
  function sorgentiFunzioni(): Array<{ file: string; testo: string }> {
    const out: Array<{ file: string; testo: string }> = [];
    const gira = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = join(dir, nome);
        if (statSync(p).isDirectory()) gira(p);
        else if (nome.endsWith(".ts")) out.push({ file: relative(ROOT, p), testo: readFileSync(p, "utf8") });
      }
    };
    gira(FUNZIONI);
    return out;
  }

  // requireCompanyAccess guarda i ruoli GLOBALI di user_roles: un allowedRoles
  // lì (col ruolo scritto o passato per variabile) è il buco. Il gate per
  // azienda passa da richiediAmministratoreAzienda / ruoliNellAzienda. Quindi
  // NESSUN allowedRoles in requireCompanyAccess, in nessuna forma.
  const conAllowedRoles = (args: string) => /allowedRoles/.test(args);

  it("nessun requireCompanyAccess passa allowedRoles (né scritto né per variabile)", () => {
    const colpevoli = sorgentiFunzioni()
      .filter((f) => !f.file.endsWith("_shared/auth.ts"))
      .flatMap((f) =>
        [...f.testo.matchAll(/requireCompanyAccess\(([^;]*?)\);/gs)]
          .filter((m) => conAllowedRoles(m[1]))
          .map(() => f.file),
      );
    expect(colpevoli, "allowedRoles guarda il ruolo globale: usare richiediAmministratoreAzienda / ruoliNellAzienda").toEqual([]);
  });

  it("il guardiano riconosce sia la forma scritta sia quella per variabile", () => {
    const scritta = 'await requireCompanyAccess(db, u, c, cors, { allowedRoles: ["company_admin"] });';
    const variabile = 'await requireCompanyAccess(db, u, c, cors, { allowedRoles: effectiveAllowedRoles });';
    const buona = 'const a = await requireCompanyAccess(db, u, String(x), cors);';
    const prendi = (s: string) => [...s.matchAll(/requireCompanyAccess\(([^;]*?)\);/gs)].some((m) => conAllowedRoles(m[1]));
    expect(prendi(scritta)).toBe(true);
    expect(prendi(variabile)).toBe(true);
    expect(prendi(buona)).toBe(false);
  });
});
