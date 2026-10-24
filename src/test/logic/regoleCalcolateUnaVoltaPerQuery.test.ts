/**
 * Regole di accesso calcolate una volta per query (13/10/2026): su sei tabelle i
 * controlli che dipendono solo da chi legge (ruolo, permesso, azienda, email)
 * passano dentro una sottoquery, così il database li valuta una volta sola
 * invece che a ogni riga. Il risultato è stato confrontato in produzione per
 * 180 identità; qui si tiene ferma la forma della migrazione: il testo di ogni
 * regola è proprio quello verificato (la sua impronta è quella «nuova» della
 * guardia) e nessuna di quelle funzioni torna a essere chiamata riga per riga.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FILE = "20281013120000_regole_calcolate_una_volta_per_query.sql";
const grezzo = readFileSync(resolve(process.cwd(), `supabase/migrations/${FILE}`), "utf8");
// Senza le righe di commento: i testi delle regole non contengono «--».
const sql = grezzo
  .split("\n")
  .filter((riga) => !riga.trimStart().startsWith("--"))
  .join("\n");

const md5 = (testo: string) => createHash("md5").update(testo, "utf8").digest("hex");

/**
 * Il testo fra la parentesi aperta in posizione `aperta` e quella che la chiude.
 * Le parentesi dentro le stringhe fra apici e dentro i nomi fra virgolette non contano.
 */
function finoAllaChiusa(testo: string, aperta: number): { dentro: string; chiusa: number } {
  let profondita = 0;
  let apici = false;
  let virgolette = false;
  for (let i = aperta; i < testo.length; i++) {
    const c = testo[i];
    if (apici) {
      if (c === "'") apici = false;
      continue;
    }
    if (virgolette) {
      if (c === '"') virgolette = false;
      continue;
    }
    if (c === "'") apici = true;
    else if (c === '"') virgolette = true;
    else if (c === "(") profondita++;
    else if (c === ")") {
      profondita--;
      if (profondita === 0) return { dentro: testo.slice(aperta + 1, i), chiusa: i };
    }
  }
  throw new Error(`parentesi aperta in ${aperta} senza chiusura`);
}

type Regola = { chiave: string; tabella: string; nome: string; using: string | null; check: string | null };

/** Le istruzioni `alter policy <nome> on public.<tabella> using (…) with check (…);`, nell'ordine del file. */
function regoleModificate(): Regola[] {
  const regole: Regola[] = [];
  for (const m of sql.matchAll(/alter policy ("(?:[^"]|"")+"|\w+) on public\.(\w+)\n/g)) {
    const nome = m[1].startsWith('"') ? m[1].slice(1, -1).replace(/""/g, '"') : m[1];
    const tabella = m[2];
    let pos = m.index! + m[0].length;
    let using: string | null = null;
    let check: string | null = null;
    if (sql.startsWith("  using (", pos)) {
      const { dentro, chiusa } = finoAllaChiusa(sql, pos + "  using ".length);
      using = dentro;
      pos = chiusa + 1;
      if (sql.startsWith("\n", pos)) pos += 1;
    }
    if (sql.startsWith("  with check (", pos)) {
      const { dentro, chiusa } = finoAllaChiusa(sql, pos + "  with check ".length);
      check = dentro;
      pos = chiusa + 1;
    }
    expect(sql[pos], `fine dell'istruzione per ${nome} su ${tabella}`).toBe(";");
    regole.push({ chiave: `${tabella}|${nome}`, tabella, nome, using, check });
  }
  return regole;
}

/** La guardia: per ogni regola [impronta censita, impronta nuova]. */
function guardia(): Map<string, [string, string]> {
  const blocco = sql.slice(sql.indexOf("v_regole constant jsonb"), sql.indexOf("v_chiave text;"));
  return new Map(
    [...blocco.matchAll(/'([a-z_]+\|[^']+)', jsonb_build_array\('([0-9a-f]{32})', '([0-9a-f]{32})'\)/g)].map(
      (m) => [m[1], [m[2], m[3]]] as [string, [string, string]],
    ),
  );
}

/** Il controllo finale: per ogni regola l'impronta che deve avere dopo la modifica. */
function controlloFinale(): Map<string, string> {
  const blocco = sql.slice(sql.indexOf("v_nuove constant jsonb"));
  return new Map([...blocco.matchAll(/'([a-z_]+\|[^']+)', '([0-9a-f]{32})'/g)].map((m) => [m[1], m[2]] as [string, string]));
}

/** Toglie le sottoquery «( SELECT f(…) AS f)»: resta solo ciò che si valuta riga per riga. */
function senzaSottoqueryAvvolte(testo: string): string {
  let fuori = testo;
  for (;;) {
    const i = fuori.search(/\( SELECT [a-z_.]+\(/);
    if (i < 0) return fuori;
    const { chiusa } = finoAllaChiusa(fuori, i);
    fuori = fuori.slice(0, i) + "«valore»" + fuori.slice(chiusa + 1);
  }
}

const FUNZIONI_DI_CHI_LEGGE = [
  "has_role",
  "has_permission",
  "get_user_company_id",
  "get_my_company_id",
  "get_effective_company_id",
  "utente_e_cliente_esterno",
  "get_auth_email",
  "is_super_admin",
  "e_amministratore_di",
];

const TABELLE_ATTESE: Record<string, number> = {
  prima_nota_entries: 5,
  appointments: 2,
  order_statuses: 3,
  order_external_teams: 3,
  employees: 3,
  staff_permissions: 3,
};

describe("regole calcolate una volta per query", () => {
  const regole = regoleModificate();
  const impronte = guardia();
  const finali = controlloFinale();

  it("aspetta al massimo 3 secondi i lock e confronta i testi con lo stesso search_path del censimento", () => {
    const primoBlocco = sql.indexOf("do $$");
    expect(sql.indexOf("set local lock_timeout = '3s';")).toBeGreaterThanOrEqual(0);
    expect(sql.indexOf("set local lock_timeout = '3s';")).toBeLessThan(primoBlocco);
    expect(sql.indexOf('set local search_path = "$user", public, extensions;')).toBeGreaterThanOrEqual(0);
    expect(sql.indexOf('set local search_path = "$user", public, extensions;')).toBeLessThan(primoBlocco);
  });

  it("cambia 19 regole su sei tabelle, quelle misurate", () => {
    expect(regole).toHaveLength(19);
    const perTabella: Record<string, number> = {};
    for (const r of regole) perTabella[r.tabella] = (perTabella[r.tabella] ?? 0) + 1;
    expect(perTabella).toEqual(TABELLE_ATTESE);
  });

  it("prima di cambiare, ogni regola deve avere l'impronta censita o già quella nuova", () => {
    expect(impronte.size).toBe(19);
    for (const [chiave, [censita, nuova]] of impronte) expect(censita, chiave).not.toBe(nuova);
    expect(sql).toMatch(/if not \(v_regole -> v_chiave\) \? v_impronta then/);
    expect(sql).toMatch(/raise exception 'Regola % su % non trovata'/);
    expect(sql).toMatch(/raise exception 'Regola % su % cambiata dopo il censimento del 13\/10\/2026/);
  });

  it("il testo scritto nel file è quello verificato: la sua impronta è quella nuova della guardia", () => {
    for (const r of regole) {
      const attesa = impronte.get(r.chiave);
      expect(attesa, r.chiave).toBeDefined();
      expect(md5(`${r.using ?? ""}|${r.check ?? ""}`), r.chiave).toBe(attesa![1]);
    }
  });

  it("il controllo finale rilegge le stesse regole e si aspetta le stesse impronte nuove", () => {
    expect([...finali.keys()].sort()).toEqual([...impronte.keys()].sort());
    expect(regole.map((r) => r.chiave).sort()).toEqual([...impronte.keys()].sort());
    for (const [chiave, impronta] of finali) expect(impronta, chiave).toBe(impronte.get(chiave)![1]);
    expect(sql).toMatch(/if v_impronta is distinct from v_nuove ->> v_chiave then\s+raise exception/);
  });

  it("nessuna funzione che dipende solo da chi legge resta chiamata riga per riga", () => {
    const nuda = new RegExp(`(?<![\\w.])(${FUNZIONI_DI_CHI_LEGGE.join("|")})\\(`);
    for (const r of regole) {
      for (const testo of [r.using, r.check]) {
        if (testo === null) continue;
        expect(senzaSottoqueryAvvolte(testo), r.chiave).not.toMatch(nuda);
      }
    }
  });

  it("le funzioni che leggono la riga restano dove sono", () => {
    const testi = regole.map((r) => `${r.using ?? ""} ${r.check ?? ""}`).join("\n");
    expect(testi).toContain("user_can_read_accountant_company(company_id)");
    expect(testi).toContain("check_staff_visibility(( SELECT auth.uid() AS uid), assigned_to)");
    expect(testi).toContain("cliente_contatto_ha_mia_email(contact_id)");
  });

  it("tocca solo USING e WITH CHECK: nessuna regola nuova, tolta, rinominata o con altri ruoli", () => {
    expect(sql).not.toMatch(/\b(create|drop) policy\b/i);
    expect(sql).not.toMatch(/\brename to\b/i);
    for (const m of sql.matchAll(/alter policy [^\n]+\n/g)) expect(m[0]).not.toMatch(/\bto\s+(authenticated|anon|public)\b/i);
  });

  it("le tabelle della commessa restano alla migrazione 20281012200200", () => {
    for (const tabella of ["orders", "order_work_phases", "order_work_subphases", "order_campo_assignments", "campo_rapportini"]) {
      expect(regole.some((r) => r.tabella === tabella), tabella).toBe(false);
      expect([...impronte.keys()].some((k) => k.startsWith(`${tabella}|`)), tabella).toBe(false);
    }
  });

  it("staff_permissions, la tabella più letta dalle funzioni delle regole, viene per ultima", () => {
    const ordine = [...new Set(regole.map((r) => r.tabella))];
    expect(ordine).toEqual(["prima_nota_entries", "appointments", "order_statuses", "order_external_teams", "employees", "staff_permissions"]);
    expect(sql.lastIndexOf("alter policy")).toBeLessThan(sql.indexOf("v_nuove constant jsonb"));
  });

  it("prende le sei tabelle tutte insieme, dopo la guardia e prima del primo ALTER, nello stesso ordine", () => {
    const m = sql.match(/lock table ([\s\S]*?)\s+in access exclusive mode;/);
    expect(m).not.toBeNull();
    const tabelle = m![1].split(",").map((t) => t.trim().replace(/^public\./, ""));
    expect(tabelle).toEqual([...new Set(regole.map((r) => r.tabella))]);
    expect(m!.index!).toBeGreaterThan(sql.indexOf("end $$;"));
    expect(m!.index!).toBeLessThan(sql.indexOf("alter policy"));
  });
});

/**
 * I testi delle 19 regole come erano al censimento del 13/10/2026 (pg_get_expr con
 * search_path "$user", public, extensions): [USING, WITH CHECK]. La loro impronta è
 * quella «censita» della guardia, così il confronto è con la regola vera.
 */
const CENSITI: Record<string, [string | null, string | null]> = {
  "prima_nota_entries|prima_nota_entries_lettura_authenticated": [
    "(user_can_read_accountant_company(company_id) OR ((company_id = get_my_company_id()) AND (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) OR ( SELECT e_amministratore_di(get_my_company_id()) AS e_amministratore_di) OR has_permission(( SELECT auth.uid() AS uid), 'can_view_prima_nota'::text))))",
    null,
  ],
  "prima_nota_entries|prima_nota_super_admin": [
    "has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)",
    null,
  ],
  "prima_nota_entries|prima_nota_tenant_delete": [
    "((company_id = get_my_company_id()) AND (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) OR ( SELECT e_amministratore_di(get_my_company_id()) AS e_amministratore_di)))",
    null,
  ],
  "prima_nota_entries|prima_nota_tenant_insert": [
    null,
    "((company_id = get_my_company_id()) AND (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) OR ( SELECT e_amministratore_di(get_my_company_id()) AS e_amministratore_di) OR has_permission(( SELECT auth.uid() AS uid), 'can_view_prima_nota'::text)))",
  ],
  "prima_nota_entries|prima_nota_tenant_update": [
    "((company_id = get_my_company_id()) AND (has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) OR ( SELECT e_amministratore_di(get_my_company_id()) AS e_amministratore_di) OR has_permission(( SELECT auth.uid() AS uid), 'can_view_prima_nota'::text)))",
    null,
  ],
  "appointments|appointments_lettura_authenticated": [
    "((( SELECT has_permission(( SELECT auth.uid() AS uid), 'can_view_calendar'::text) AS has_permission) AND (company_id = ( SELECT get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id)) AND check_staff_visibility(( SELECT auth.uid() AS uid), assigned_to) AND (NOT ( SELECT utente_e_cliente_esterno() AS utente_e_cliente_esterno)) AND ((order_id IS NOT NULL) OR (created_by = ( SELECT auth.uid() AS uid)) OR (assigned_to = ( SELECT auth.uid() AS uid)) OR ( SELECT has_permission(( SELECT auth.uid() AS uid), 'can_view_sopralluoghi'::text) AS has_permission))) OR ((assigned_to = ( SELECT auth.uid() AS uid)) AND (company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (NOT ( SELECT utente_e_cliente_esterno() AS utente_e_cliente_esterno))) OR ((contact_id IS NOT NULL) AND (EXISTS ( SELECT 1\n   FROM marketing_contacts mc\n  WHERE ((mc.id = appointments.contact_id) AND (mc.email = get_auth_email()))))))",
    null,
  ],
  "appointments|cliente_legge_propri_appuntamenti": [
    "(((get_auth_email() IS NOT NULL) AND (lower(COALESCE(booking_email, ''::text)) = lower(get_auth_email()))) OR cliente_contatto_ha_mia_email(contact_id))",
    null,
  ],
  "order_statuses|Company admins can manage their order statuses": [
    "(( SELECT has_role(( SELECT auth.uid() AS uid), 'company_admin'::app_role) AS has_role) AND (company_id = ( SELECT get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id)) AND (NOT utente_e_cliente_esterno()))",
    null,
  ],
  "order_statuses|Customers can view their company order statuses": [
    "((company_id = ( SELECT get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id)) AND (NOT utente_e_cliente_esterno()))",
    null,
  ],
  "order_statuses|Staff can view their company order statuses": [
    "(has_permission(( SELECT auth.uid() AS uid), 'can_view_orders'::text) AND (company_id = ( SELECT get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id)) AND (NOT utente_e_cliente_esterno()))",
    null,
  ],
  "order_external_teams|Company admins can manage their order external teams": [
    "(has_role(( SELECT auth.uid() AS uid), 'company_admin'::app_role) AND (EXISTS ( SELECT 1\n   FROM orders o\n  WHERE ((o.id = order_external_teams.order_id) AND (o.company_id = get_user_company_id(( SELECT auth.uid() AS uid)))))))",
    null,
  ],
  "order_external_teams|Staff can view order external teams if permitted": [
    "(has_permission(( SELECT auth.uid() AS uid), 'can_view_orders'::text) AND (EXISTS ( SELECT 1\n   FROM orders o\n  WHERE ((o.id = order_external_teams.order_id) AND (o.company_id = get_user_company_id(( SELECT auth.uid() AS uid)))))))",
    null,
  ],
  "order_external_teams|Super admins can manage all order external teams": [
    "has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)",
    null,
  ],
  "employees|Company admins can manage their employees": [
    "(has_role(( SELECT auth.uid() AS uid), 'company_admin'::app_role) AND (company_id = get_user_company_id(( SELECT auth.uid() AS uid))))",
    null,
  ],
  "employees|Super admins can manage all employees": [
    "has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)",
    null,
  ],
  "employees|employees_lettura_public": [
    "((user_id = ( SELECT auth.uid() AS uid)) OR (has_permission(( SELECT auth.uid() AS uid), 'can_view_employees'::text) AND (company_id = get_user_company_id(( SELECT auth.uid() AS uid)))))",
    null,
  ],
  "staff_permissions|Company admins can manage staff permissions": [
    "(has_role(( SELECT auth.uid() AS uid), 'company_admin'::app_role) AND (company_id = get_user_company_id(( SELECT auth.uid() AS uid))))",
    "(has_role(( SELECT auth.uid() AS uid), 'company_admin'::app_role) AND (company_id = get_user_company_id(( SELECT auth.uid() AS uid))) AND (EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.id = staff_permissions.user_id) AND ((p.company_id = staff_permissions.company_id) OR (EXISTS ( SELECT 1\n           FROM multi_company_access mca\n          WHERE ((mca.user_id = p.id) AND (mca.company_id = staff_permissions.company_id)))))))))",
  ],
  "staff_permissions|Super admins can manage all staff permissions": [
    "has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)",
    "(has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AND (EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE (p.id = staff_permissions.user_id))))",
  ],
  "staff_permissions|staff_permissions_delete_admin": [
    "((has_role(( SELECT auth.uid() AS uid), 'company_admin'::app_role) AND (company_id = get_user_company_id(( SELECT auth.uid() AS uid)))) OR has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role))",
    null,
  ],
};

/** Toglie gli involucri «( SELECT f(…) AS f)», dal più interno: resta la chiamata. */
function senzaInvolucri(testo: string): string {
  for (;;) {
    let tolto = false;
    for (const m of testo.matchAll(/\( SELECT ([a-z_]+(?:\.[a-z_]+)?)\(/g)) {
      const { dentro, chiusa } = finoAllaChiusa(testo, m.index!);
      const mm = dentro.match(/^ SELECT ([\s\S]*) AS ([a-z_]+)$/);
      if (!mm || mm[2] !== m[1].split(".").pop()) continue;
      if (/\( SELECT [a-z_.]+\(/.test(mm[1])) continue; // prima quelli interni
      testo = testo.slice(0, m.index!) + mm[1] + testo.slice(chiusa + 1);
      tolto = true;
      break;
    }
    if (!tolto) return testo;
  }
}

describe("regole calcolate una volta per query: stessa regola di prima", () => {
  const regole = regoleModificate();
  const impronte = guardia();

  it("il testo censito ha proprio l'impronta censita della guardia", () => {
    expect(Object.keys(CENSITI).sort()).toEqual([...impronte.keys()].sort());
    for (const [chiave, [u, c]] of Object.entries(CENSITI)) {
      expect(md5(`${u ?? ""}|${c ?? ""}`), chiave).toBe(impronte.get(chiave)![0]);
    }
  });

  it("ogni regola nuova è quella censita con le sole sottoquery in più", () => {
    for (const r of regole) {
      const [u, c] = CENSITI[r.chiave];
      expect(r.using === null, r.chiave).toBe(u === null);
      expect(r.check === null, r.chiave).toBe(c === null);
      if (u !== null) expect(senzaInvolucri(r.using!), r.chiave).toBe(senzaInvolucri(u));
      if (c !== null) expect(senzaInvolucri(r.check!), r.chiave).toBe(senzaInvolucri(c));
    }
  });
});
