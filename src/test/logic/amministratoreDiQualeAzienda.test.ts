/**
 * Amministratore DI QUALE azienda (26/09/2026).
 *
 * Il ruolo company_admin sta in user_roles senza azienda: l'azienda di un
 * amministratore è profiles.company_id, più gli accessi multi-azienda attivi
 * da amministratore. Molte policy e funzioni chiedevano solo «ha il ruolo?».
 * Provato in transazioni annullate con due aziende demo: l'amministratore di A,
 * entrato in B con un accesso da staff senza permessi, in B vedeva 45
 * preventivi su 45, 92 fatture, 3.030 timbrature, 25 profili HR, la prima nota,
 * il magazzino; has_permission gli diceva sì a tutto. E 15 policy non
 * guardavano nessuna azienda: uno staff qualsiasi si assegnava a una commessa
 * di un'altra azienda e la leggeva coi prezzi.
 *
 * Undici lotti: le funzioni nuove e le policy senza azienda (1), le quattro
 * funzioni centrali (2), le policy legate a un accesso di qualunque grado (3),
 * le 115 legate all'azienda attiva (4-10), le RPC (11).
 *
 * Tiene fermo:
 *   · aziende_amministrate / e_amministratore_di: accesso multi-azienda solo
 *     attivo, non scaduto e da amministratore; bloccato e anonimo → no;
 *   · nessuna policy dei lotti chiede più has_role(…, 'company_admin');
 *   · lotti piccoli, lock_timeout, guardia contro le modifiche di altre sessioni;
 *   · le funzioni centrali e le RPC usano e_amministratore_di;
 *   · il guardiano in fondo ferma una migrazione nuova che rimetta il ruolo di
 *     amministratore in una policy senza dire di quale azienda.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const CARTELLA = join(ROOT, "supabase/migrations");

const lotti = readdirSync(CARTELLA)
  .map((f) => ({ f, m: f.match(/^(\d{14})_amministratore_di_quale_azienda_(\d+)(?:_\w+)?\.sql$/) }))
  .filter((x) => x.m)
  .map((x) => ({
    nome: x.f,
    versione: x.m![1],
    numero: Number(x.m![2]),
    sql: readFileSync(join(CARTELLA, x.f), "utf8"),
  }))
  .sort((a, b) => a.numero - b.numero);

const presente = (n: number) => lotti.some((x) => x.numero === n);
// Un lotto non ancora pubblicato vale come file vuoto: i suoi blocchi sono saltati
// (describe.runIf), ma il loro corpo viene comunque letto.
const lotto = (n: number) =>
  lotti.find((x) => x.numero === n) ?? { nome: `lotto ${n}`, versione: "", numero: n, sql: "" };
// I lotti vanno online a tappe: ognuno si controlla quando il suo file c'è.
const TUTTI = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
// Le istruzioni senza i commenti, che raccontano anche com'era prima.
const codice = (sql: string) => sql.replace(/--.*$/gm, "");

/** ogni CREATE POLICY … ; con nome e testo */
function policy(sql: string): { nome: string; tabella: string; testo: string }[] {
  const out: { nome: string; tabella: string; testo: string }[] = [];
  const re = /CREATE POLICY ("[^"]+"|\w+) ON (\w+\.\w+)([\s\S]*?);\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codice(sql)))) out.push({ nome: m[1].replace(/"/g, ""), tabella: m[2], testo: m[3] });
  return out;
}

/** «company_admin» fuori dal grado di un accesso multi-azienda (access_role = 'company_admin') */
const ADMIN_SENZA_AZIENDA = (testo: string) =>
  testo.replace(/access_role(::text)?\s*=\s*'company_admin'(::text)?/g, "").includes("'company_admin'");

describe("i lotti ci sono tutti e in ordine", () => {
  it("numerati da 1 senza buchi, con versioni crescenti", () => {
    expect(lotti.length).toBeGreaterThan(0);
    expect(lotti.map((l) => l.numero)).toEqual(TUTTI.slice(0, lotti.length));
    const versioni = lotti.map((l) => l.versione);
    expect([...versioni].sort()).toEqual(versioni);
    expect(new Set(versioni).size).toBe(lotti.length);
  });

  it("ogni lotto non aspetta i lock", () => {
    for (const l of lotti) expect(codice(l.sql), l.nome).toContain("SET LOCAL lock_timeout = '3s';");
  });
});

describe.runIf(presente(1))("lotto 1 · le funzioni nuove", () => {
  const sql = codice(lotto(1).sql);
  const corpo = (nome: string) => {
    const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}(`);
    expect(i, nome).toBeGreaterThanOrEqual(0);
    return sql.slice(i, sql.indexOf("$$;", i));
  };

  it.each(["aziende_amministrate", "e_amministratore_di"])(
    "%s: definer, search_path fisso, accesso solo attivo e da amministratore, bloccato escluso",
    (nome) => {
      const c = corpo(nome);
      expect(c).toContain("SECURITY DEFINER");
      expect(c).toContain("SET search_path TO 'public'");
      expect(c).toContain("r.role = 'company_admin'::public.app_role");
      expect(c).toContain("m.access_role = 'company_admin'");
      expect(c).toContain("m.status = 'active'");
      expect(c).toContain("(m.expires_at IS NULL OR m.expires_at > now())");
      expect(c).toContain("NOT coalesce(p.is_blocked, false)");
      expect(c).toContain("auth.uid()");
      // nessun ruolo globale da solo: il ruolo vale per l'azienda del profilo
      expect(c).not.toMatch(/has_role\(/);
    },
  );

  it("GRANT espliciti; anon perché stanno in policy col ruolo public, e dichiarate", () => {
    for (const firma of ["aziende_amministrate()", "e_amministratore_di(uuid)", "allegato_personale_azienda(text)"]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${firma} FROM PUBLIC, anon;`);
    }
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.aziende_amministrate() TO anon, authenticated, service_role;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.e_amministratore_di(uuid) TO anon, authenticated, service_role;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.allegato_personale_azienda(text) TO authenticated, service_role;");
    expect(sql).toMatch(/INSERT INTO public\.funzioni_pubbliche_di_proposito[\s\S]*'aziende_amministrate'[\s\S]*'e_amministratore_di'/);
  });
});

describe.runIf(presente(1))("lotto 1 · le policy che non guardavano nessuna azienda", () => {
  const pol = policy(lotto(1).sql);
  const di = (nome: string) => {
    const p = pol.find((x) => x.nome === nome);
    expect(p, nome).toBeDefined();
    return p!.testo;
  };

  it("sedici policy, ognuna rilanciabile", () => {
    expect(pol).toHaveLength(16);
    for (const p of pol) {
      const nome = /\s/.test(p.nome) ? `"${p.nome}"` : p.nome;
      expect(codice(lotto(1).sql)).toContain(`DROP POLICY IF EXISTS ${nome} ON ${p.tabella};`);
    }
  });

  it("assegnazioni di cantiere: nell'azienda della commessa, e solo nella propria", () => {
    for (const nome of ["oca_insert", "oca_delete"]) {
      expect(di(nome)).toContain("TO authenticated");
      expect(di(nome)).toContain("public.get_user_company_id(( SELECT auth.uid() AS uid))");
      expect(di(nome)).not.toContain("'super_admin'::public.app_role]"); // il super admin ha il suo ramo
    }
    expect(di("oca_insert")).toContain("(company_id = public.get_order_company_id(order_id))");
  });

  it("rapportini: l'azienda è quella della commessa, anche in modifica", () => {
    expect(di("cr_insert")).toContain("(company_id = public.get_order_company_id(order_id))");
    expect(di("cr_update")).toMatch(/WITH CHECK \(\s*\(\(company_id = public\.get_order_company_id\(order_id\)\)/);
  });

  it("canali, permessi personali e formazione: l'amministratore della loro azienda", () => {
    expect(di("user_messaging_channels_lettura_authenticated")).toContain(
      "(company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))",
    );
    for (const nome of ["user_permissions_admin_cud", "user_permissions_select", "literacy_admin_write", "literacy_self_or_admin"]) {
      expect(di(nome)).toContain("(public.get_user_company_id(user_id) IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))");
    }
  });

  it("storage: loghi nella cartella dell'azienda, allegati del personale del dipendente o della squadra", () => {
    for (const nome of ["branding_insert_admin", "branding_update_admin", "branding_delete_admin"]) {
      expect(di(nome)).toContain("(storage.foldername(name))[1] IN ( SELECT (unnest(public.aziende_amministrate()))::text AS unnest)");
    }
    for (const nome of ["Company admins can upload personnel attachments", "Company admins can delete personnel attachments"]) {
      expect(di(nome)).toContain("TO authenticated");
      expect(di(nome)).toContain("(public.allegato_personale_azienda(name) IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))");
    }
  });

  it("dove resta un elenco di ruoli, è legato all'azienda del profilo", () => {
    for (const p of pol.filter((x) => ADMIN_SENZA_AZIENDA(x.testo))) {
      expect(p.testo, p.nome).toMatch(/get_user_company_id\(|FROM public\.profiles/);
      expect(p.testo, p.nome).not.toMatch(/has_role\([^)]*\)[^)]*'company_admin'/);
    }
  });
});

describe.runIf(presente(2))("lotto 2 · le quattro funzioni centrali", () => {
  const sql = codice(lotto(2).sql);

  it("richiede il lotto 1 e si ferma se una funzione è cambiata", () => {
    expect(sql).toContain("to_regprocedure('public.e_amministratore_di(uuid)') IS NULL");
    expect(sql).toContain("cambiata dopo il censimento");
  });

  const corpo = (f: string) => sql.split(`CREATE OR REPLACE FUNCTION public.${f}(`)[1]?.split("$function$;")[0] ?? "";

  it("nessuna dice più sì al solo ruolo di amministratore", () => {
    for (const f of ["has_permission", "check_staff_visibility", "can_see_order", "solo_assegnati_attivo"]) {
      expect(corpo(f), f).toContain("public.e_amministratore_di(");
    }
    // can_see_order e solo_assegnati_attivo guardano sempre chi chiama: il ruolo nudo sparisce
    for (const f of ["can_see_order", "solo_assegnati_attivo"]) {
      expect(corpo(f), f).not.toContain("'company_admin'");
    }
    // has_permission e check_staff_visibility: il ruolo resta solo per un ALTRO utente
    for (const f of ["has_permission", "check_staff_visibility"]) {
      const volte = corpo(f).match(/has_role\(_user_id, 'company_admin'::app_role\)/g) ?? [];
      expect(volte, f).toHaveLength(1);
      expect(corpo(f), f).toMatch(/ELSIF has_role\(_user_id, 'company_admin'::app_role\) THEN/);
      expect(corpo(f), f).not.toMatch(/OR has_role\(_user_id, 'company_admin'::app_role\)/);
    }
  });

  it("has_permission: lo staff entrato con un accesso da staff prende i permessi di QUESTA azienda", () => {
    const c = corpo("has_permission");
    expect(c).toContain("m.access_role = 'company_staff'");
    expect(c).toContain("m.company_id = _company");
    expect(c).toContain("m.status = 'active'");
    expect(c).toContain("(m.expires_at IS NULL OR m.expires_at > now())");
    expect(c).toContain("NOT public.utente_bloccato()");
  });
});

describe.runIf(presente(3))("lotto 3 · le policy legate a un accesso di qualunque grado", () => {
  const pol = policy(lotto(3).sql);

  it("quattordici policy, tutte con l'azienda della riga fra quelle amministrate", () => {
    expect(pol).toHaveLength(14);
    for (const p of pol) {
      expect(p.testo, p.nome).toContain("(company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))");
      expect(ADMIN_SENZA_AZIENDA(p.testo), p.nome).toBe(false);
    }
  });
});

describe.runIf(presente(10))("lotti 4-10 · le policy legate all'azienda attiva", () => {
  const e = lotti.filter((l) => l.numero >= 4 && l.numero <= 10);
  const tutte = e.flatMap((l) => policy(l.sql).map((p) => ({ ...p, lotto: l.numero })));

  it("115 policy, al massimo 18 per lotto, una tabella sempre in un lotto solo", () => {
    expect(tutte).toHaveLength(115);
    for (const l of e) expect(policy(l.sql).length, l.nome).toBeLessThanOrEqual(18);
    const lottoDi = new Map<string, number>();
    for (const p of tutte) {
      if (p.tabella === "storage.objects") continue;
      expect(lottoDi.get(p.tabella) ?? p.lotto, p.tabella).toBe(p.lotto);
      lottoDi.set(p.tabella, p.lotto);
    }
  });

  it("ognuna chiede l'amministratore dell'azienda in cui si lavora, una volta per richiesta", () => {
    for (const p of tutte) {
      expect(p.testo, p.nome).toContain("( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)");
      expect(p.testo, p.nome).toMatch(/get_my_company_id\(\)/);
      expect(ADMIN_SENZA_AZIENDA(p.testo), p.nome).toBe(false);
    }
  });

  it("ogni lotto ha la guardia contro le modifiche di altre sessioni", () => {
    for (const l of e) {
      expect(codice(l.sql), l.nome).toContain("cambiata dopo il censimento");
      expect(codice(l.sql), l.nome).toContain("PERFORM set_config('search_path', '', true);");
    }
  });
});

describe.runIf(presente(11))("lotto 11 · le RPC", () => {
  const sql = codice(lotto(11).sql);
  const ritocchi = [...sql.matchAll(/SELECT pg_temp\.ritocca\(\s*'([^']+)', '([0-9a-f]{32})',\s*\$v\$([\s\S]*?)\$v\$,\s*\$n\$([\s\S]*?)\$n\$\);/g)];

  it("diciassette funzioni, un pezzo contato una volta ciascuna", () => {
    expect(ritocchi).toHaveLength(17);
    expect(sql).toContain("compare % volte invece di una");
    expect(sql).toContain("cambiata dopo il censimento");
  });

  it("ogni pezzo nuovo usa e_amministratore_di e non il ruolo da solo", () => {
    for (const [, firma, , vecchio, nuovo] of ritocchi) {
      expect(vecchio, firma).toContain("company_admin");
      expect(nuovo, firma).toContain("public.e_amministratore_di(");
    }
  });

  it("cedolini, richieste HR e proposte di Silvio: l'azienda è quella di cui si parla", () => {
    const nuovo = (f: string) => ritocchi.find((r) => r[1].startsWith(`public.${f}(`))![4];
    expect(nuovo("cedolino_visibile_a_chi_chiede")).toContain("e_amministratore_di(e.company_id)");
    expect(nuovo("hr_update_richiesta_stato")).toContain("e_amministratore_di(v_req.company_id)");
    for (const f of ["silvio_tool_approve_proposal_with_edits", "silvio_tool_batch_approve_proposals", "silvio_tool_reject_proposal", "silvio_tool_undo_executed_action"]) {
      expect(nuovo(f), f).toContain("e_amministratore_di(p_company_id)");
    }
  });
});

describe("guardiano", () => {
  const ULTIMA = lotti.length ? lotti[lotti.length - 1].versione : "99999999999999";

  it("nessuna migrazione nuova rimette il ruolo di amministratore in una policy senza dire di quale azienda", () => {
    const nuove = readdirSync(CARTELLA).filter((f) => /^\d{14}_.*\.sql$/.test(f) && f.slice(0, 14) > ULTIMA);
    const colpevoli = nuove.flatMap((f) =>
      policy(readFileSync(join(CARTELLA, f), "utf8"))
        .filter((p) => ADMIN_SENZA_AZIENDA(p.testo))
        .map((p) => `${f}: ${p.nome}`),
    );
    expect(colpevoli, "usare e_amministratore_di(azienda) o company_id IN (SELECT unnest(aziende_amministrate()))").toEqual([]);
  });

  it("il guardiano riconosce il ruolo nudo e lascia passare il grado dell'accesso", () => {
    expect(ADMIN_SENZA_AZIENDA("(company_id = get_my_company_id()) AND has_role(auth.uid(), 'company_admin'::app_role)")).toBe(true);
    expect(ADMIN_SENZA_AZIENDA("ur.role = ANY (ARRAY['company_admin'::public.app_role])")).toBe(true);
    expect(ADMIN_SENZA_AZIENDA("(mca.access_role = 'company_admin'::text) AND (mca.status = 'active'::text)")).toBe(false);
    expect(ADMIN_SENZA_AZIENDA("( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)")).toBe(false);
  });
});
