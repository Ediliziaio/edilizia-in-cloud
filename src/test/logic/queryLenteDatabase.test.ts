/**
 * Le migrazioni che alleggeriscono le query più pesanti del database: le funzioni delle regole (12/10/2026, già
 * applicata), e poi — censite di nuovo e applicate il 27/10/2026 — il kanban delle opportunità, le regole delle
 * commesse e le due viste economiche.
 *
 * Il risultato è stato confrontato riga per riga in produzione, in transazioni annullate. Qui si tiene ferma la
 * forma, perché un ritocco non riporti indietro il costo senza che nessuno se ne accorga, e perché l'impronta
 * «nuova» scritta nelle guardie resti quella del corpo che il file scrive davvero: se le due si separano, la
 * migrazione non è più rilanciabile e nessuno lo vedrebbe.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const grezzo = (nome: string) => readFileSync(resolve(process.cwd(), `supabase/migrations/${nome}`), "utf8");
const leggi = (nome: string) => grezzo(nome).replace(/--.*$/gm, "");

const FILE_FUNZIONI = "20281012200000_funzioni_delle_regole_in_plpgsql.sql";
const FILE_KANBAN = "20281027150000_kanban_opportunita_leggero.sql";
const FILE_REGOLE = "20281027160000_regole_commesse_compatte.sql";
const FILE_ESPOSIZIONE = "20281027160100_vista_esposizione_per_commessa.sql";
const FILE_MARGINALITA = "20281027160200_vista_marginalita_per_commessa.sql";

const funzioni = leggi(FILE_FUNZIONI);
const kanban = leggi(FILE_KANBAN);
const regole = leggi(FILE_REGOLE);
const esposizione = leggi(FILE_ESPOSIZIONE);
const marginalita = leggi(FILE_MARGINALITA);

const definizione = (sql: string, nome: string) =>
  sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${nome}\\([\\s\\S]*?\\n\\$function\\$;`))![0];
const intestazione = (def: string) => def.slice(0, def.indexOf("AS $function$"));
/** Il corpo come lo salva PostgreSQL (prosrc): il testo fra i due $function$. */
const impronteCorpi = (nome: string) =>
  Object.fromEntries([...grezzo(nome).matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/g)]
    .map((m) => [m[1], createHash("md5").update(m[2], "utf8").digest("hex")]));
/** Coppie [censita, nuova] della guardia: per ogni firma, la seconda impronta. */
const impronteNuoveGuardia = (sql: string) =>
  [...sql.matchAll(/'public\.(\w+)\([^']*\)',\s*jsonb_build_array\('[0-9a-f]{32}', '([0-9a-f]{32})'\)/g)].map((m) => [m[1], m[2]]);

describe("ogni migrazione non aspetta i lock e si ferma se qualcuno ha cambiato quello che sostituisce", () => {
  it.each([
    ["kanban", kanban], ["regole delle commesse", regole],
    ["vista esposizione", esposizione], ["vista marginalità", marginalita],
  ])("%s", (_nome, sql) => {
    expect(sql).toMatch(/set local lock_timeout = '3s';/);
    expect(sql).toMatch(/set local statement_timeout = '\d+s';/);
    expect(sql).toMatch(/raise exception '[^']*censimento del 27\/10\/2026/);
  });
});

describe("kanban delle opportunità", () => {
  it("le prime schede di ogni colonna con una ricerca per colonna e LIMIT", () => {
    const def = definizione(kanban, "opportunita_kanban");
    expect(def).toMatch(/cross join lateral \(/);
    expect(def).toMatch(/where o\.stage_id = f\.fase/);
    expect(def).toMatch(/limit \$4\) x/);
    expect(def).not.toMatch(/partition by o\.stage_id/);
  });

  it("l'impronta «nuova» della guardia è quella del corpo scritto nel file", () => {
    expect(kanban.match(/'[0-9a-f]{32}'/g)).toHaveLength(8);
    const corpi = impronteCorpi(FILE_KANBAN);
    const nuove = impronteNuoveGuardia(kanban);
    expect(nuove.map(([n]) => n).sort()).toEqual(["contatti_seguiti_da_me", "opportunita_kanban", "opportunita_ordine_sql", "opportunita_schede"]);
    for (const [nome, impronta] of nuove) expect(corpi[nome], nome).toBe(impronta);
  });

  it("l'ordinamento non scrive nulls first/last: le colonne sono NOT NULL e lo controlla la migrazione", () => {
    expect(definizione(kanban, "opportunita_ordine_sql")).not.toMatch(/nulls (first|last)/);
    expect(kanban).toMatch(/attname in \('created_at', 'updated_at'\)\s+and not attnotnull/);
  });

  it("le schede restano INVOKER (regole RLS di chi legge) e tengono il piano in cache", () => {
    const testa = intestazione(definizione(kanban, "opportunita_schede"));
    expect(testa).toMatch(/LANGUAGE plpgsql/);
    expect(testa).not.toMatch(/SECURITY DEFINER/);
    expect(testa).toMatch(/SET plan_cache_mode TO 'force_generic_plan'/);
  });

  it("una lettura per tabella: profili, appuntamenti e attività una volta sola", () => {
    const def = definizione(kanban, "opportunita_schede");
    expect(def.match(/from public\.profiles p/g)).toHaveLength(1);
    expect(def.match(/from public\.appointments a/g)).toHaveLength(1);
    expect(def.match(/from public\.marketing_contact_activities a/g)).toHaveLength(1);
  });

  it("contatti_seguiti_da_me: plpgsql, SECURITY DEFINER, stesse quattro strade nei due rami", () => {
    const def = definizione(kanban, "contatti_seguiti_da_me");
    expect(intestazione(def)).toMatch(/LANGUAGE plpgsql/);
    expect(intestazione(def)).toMatch(/SECURITY DEFINER/);
    for (const colonna of ["assigned_to = v_io", "call_center_id = v_io", "follower_id = v_io", "assigned_to = any \\(v_squadra\\)"]) {
      expect(def.match(new RegExp(`o\\.${colonna}`, "g")), colonna).toHaveLength(2);
    }
  });
});

describe("regole delle commesse", () => {
  it("tocca solo le due regole rimaste come erano: le altre tre le ha già riscritte il 13/10", () => {
    expect(regole.match(/alter policy/g)).toHaveLength(1);
    expect(regole).toMatch(/alter policy oca_select on public\.order_campo_assignments/);
    expect(regole).not.toMatch(/cr_select|order_work_phases_lettura_public|Staff can manage order work phases/);
  });

  it("assegnazioni di cantiere: azienda e ruoli dalle funzioni, senza sottoquery su profiles e user_roles", () => {
    const testo = regole.match(/alter policy oca_select on public\.order_campo_assignments[\s\S]*?\n  \);/)![0];
    expect(testo).not.toMatch(/from public\.profiles|from public\.user_roles/);
    expect(testo).toMatch(/\(select public\.get_user_company_id\(\(select auth\.uid\(\)\)\)\)/);
    expect(testo).toMatch(/'company_admin'::public\.app_role[\s\S]*'company_staff'::public\.app_role[\s\S]*'super_admin'::public\.app_role/);
  });

  it("prende prima i lock sulle tabelle che tocca, per non incastrarsi tenendo fermo auth", () => {
    expect(regole).toMatch(/lock table public\.order_campo_assignments, public\.order_work_subphases in access exclusive mode;/);
  });

  it("sottofasi: l'ufficio inserisce, modifica ed elimina; in lettura vale sottofasi_lettura", () => {
    expect(regole).toMatch(/drop policy if exists sottofasi_ufficio on public\.order_work_subphases;/);
    const nuove = [...regole.matchAll(/create policy (\w+) on public\.order_work_subphases\s+for (\w+) to authenticated/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(nuove).toEqual(["sottofasi_ufficio_inserisce:insert", "sottofasi_ufficio_modifica:update", "sottofasi_ufficio_elimina:delete"]);
    // In ognuna: il permesso di modificare le commesse, l'azienda della fase e la commessa visibile.
    for (const nome of ["sottofasi_ufficio_inserisce", "sottofasi_ufficio_modifica", "sottofasi_ufficio_elimina"]) {
      const inizio = regole.indexOf(`create policy ${nome}`);
      const testo = regole.slice(inizio, regole.indexOf(");\n", inizio));
      expect(testo, nome).toContain("(select public.has_permission((select auth.uid()), 'can_edit_orders'::text))");
      expect(testo, nome).toContain("public.get_order_company_id(f.order_id) = (select public.get_user_company_id((select auth.uid())))");
      expect(testo, nome).toContain("public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)");
    }
  });

  it("controlla da sé che le tre regole dicano quello che diceva sottofasi_ufficio", () => {
    expect(regole).toMatch(/if v_dopo is distinct from v_prima then/);
    expect(regole).toMatch(/raise exception 'La regola % non dice quello che diceva sottofasi_ufficio/);
  });
});

describe("viste economiche", () => {
  it("restano security_invoker", () => {
    expect(marginalita).toMatch(/create or replace view public\.v_ordine_marginalita\s+with \(security_invoker = true\) as/);
    expect(esposizione).toMatch(/create or replace view public\.v_ordine_esposizione\s+with \(security_invoker = on\) as/);
  });

  it("l'esposizione calcola tutto sulla commessa, senza raggruppamenti su tutte", () => {
    expect(esposizione).not.toMatch(/group by/i);
    expect(esposizione.match(/\.order_id = o\.id/g)!.length).toBeGreaterThanOrEqual(5);
    expect(esposizione.match(/^\s+offset 0$/gm)).toHaveLength(2);
  });

  it("la marginalità calcola ogni importo sulla commessa, e chiama le funzioni con la commessa", () => {
    expect(marginalita.match(/\.order_id = o\.id/g)!.length).toBeGreaterThanOrEqual(12);
    expect(marginalita).toMatch(/from marginalita_costo_oda\(o\.id\) co\(order_id, importo\)/);
    expect(marginalita.match(/oda_copertura_righe\(o\.id\)/g)!.length).toBe(3);
    expect(marginalita.match(/^\s+offset 0$/gm)).toHaveLength(1);
  });

  it("le due funzioni con la commessa hanno lo stesso corpo di quelle senza, più il filtro", () => {
    for (const nome of ["marginalita_costo_oda", "oda_copertura_righe"]) {
      const def = marginalita.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${nome}\\(p_order_id uuid\\)[\\s\\S]*?\\n\\$function\\$;`))![0];
      expect(intestazione(def), nome).toMatch(/STABLE SECURITY DEFINER/);
      expect(intestazione(def), nome).toMatch(/SET search_path TO 'public'/);
      expect(def, nome).toMatch(/order_id = p_order_id/);
      // Il filtro sulle aziende di chi guarda non si perde per strada.
      expect(def, nome).toMatch(/public\.user_can_access_company\(c\.id\)/);
    }
    expect(marginalita).toMatch(/revoke all on function public\.marginalita_costo_oda\(uuid\) from public;/);
    expect(marginalita).toMatch(/revoke all on function public\.oda_copertura_righe\(uuid\) from public;/);
  });

  it("l'unico raggruppamento rimasto è quello dei costi ripartiti, che stanno nel JSON", () => {
    const raggruppamenti = marginalita.match(/group by/gi)!;
    // Due dentro le funzioni (per ordine d'acquisto e per riga di commessa), uno per i costi ripartiti, uno per
    // i rientri sulle righe coperte e uno per il magazzino: nessuno su tutte le commesse.
    expect(raggruppamenti.length).toBe(5);
    expect(marginalita).toMatch(/group by ripartite\.order_id/);
    expect(marginalita).not.toMatch(/group by (wm\.order_id|a\.order_id|x\.order_id|q\.order_id|r\.order_id|oe\.order_id|osp\.order_id|ov\.order_id)/);
  });

  it("le colonne della marginalità sono quelle di prima, nello stesso ordine", () => {
    const marg = marginalita.slice(marginalita.indexOf("create or replace view public.v_ordine_marginalita"), marginalita.indexOf("from orders o"));
    const colonne = [...marg.matchAll(/ as (\w+),?\n/g)].map((m) => m[1]);
    expect(colonne).toEqual([
      "preventivo_contratto", "variazioni_approvate", "preventivo_totale", "cliente_nome", "costo_acquisti",
      "costo_errori", "consuntivo", "margine", "margine_perc", "costo_manodopera", "costo_provvigioni",
      "costo_diretto", "costo_materiali_magazzino", "movimenti_magazzino_senza_costo", "percentuale_avanzamento",
      "costo_rimborsi_km", "rimborsi_km_da_approvare", "numero_rimborsi_km_da_approvare",
    ]);
  });

  it("le colonne dell'esposizione sono quelle di prima, nello stesso ordine", () => {
    const corpo = esposizione.slice(esposizione.indexOf("create or replace view public.v_ordine_esposizione"));
    const colonne = [...corpo.matchAll(/ as (\w+),?\n/g)].map((m) => m[1]);
    expect(colonne.slice(0, 3)).toEqual(["saldo", "incassato", "uscite_pagate"]);
  });
});
