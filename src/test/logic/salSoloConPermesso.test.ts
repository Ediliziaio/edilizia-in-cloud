/**
 * SAL: li scrive solo chi ha «Ordini e Commesse» (23/10/2026; bozza del 07/10
 * che comprendeva anche le rate, poi chiuse da 20281019320000).
 *
 * Le policy di sal_records («sal_records_company_access») e sal_voci
 * («sal_voci_via_sal») erano FOR ALL e chiedevano solo di essere dell'azienda
 * della commessa (profilo o accesso multi-azienda): da PostgREST ogni utente
 * dell'azienda, anche l'operaio assegnato al cantiere o il cliente della
 * commessa, poteva segnare incassata o cancellare una rata, cambiarne
 * l'importo, e creare, cambiare o cancellare un verbale SAL. La migrazione
 * lascia la lettura com'è e chiede, per insert/update/delete, il permesso
 * can_edit_orders nell'azienda DELLA COMMESSA, entro il perimetro di chi
 * modifica («Solo i propri» = commesse assegnate) e non bloccato.
 *
 * Tiene fermo:
 *   · la regola sta in una funzione sola (puo_modificare_commessa), con
 *     has_permission_for_company e l'azienda della commessa, mai has_permission
 *     (che guarda l'azienda in cui si lavora);
 *   · le tre policy FOR ALL spariscono, la lettura resta quella di prima, le
 *     altre (super admin, cliente, commercialista, blocco) non si toccano;
 *   · sal_records resta nell'azienda della sua commessa, sal_voci passa dal SAL;
 *   · la migrazione è rilanciabile e con lock_timeout;
 *   · i due guardiani (azienda confrontata con <>, ruolo company_admin nudo);
 *   · nell'app scrivono rate e SAL cinque file soli: un nuovo punto va guardato.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SUFFISSO = "20281023100000_sal_scrittura_con_permesso.sql";

// Le istruzioni, senza i commenti (che raccontano anche com'era prima).
const carica = () => {
  const cartella = join(process.cwd(), "supabase/migrations");
  const file = readdirSync(cartella).find((f) => f.endsWith(SUFFISSO));
  expect(file, "migrazione sal_scrittura_con_permesso").toBeTruthy();
  return readFileSync(join(cartella, file!), "utf8").replace(/--.*$/gm, "");
};
let letto: string | undefined;
const codice = () => (letto ??= carica());

/** Spazi e a capo ridotti a uno, nessuno dentro le parentesi: si confronta il testo, non l'impaginazione. */
const norm = (s: string) => s.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();

interface Policy { nome: string; tabella: string; comando: string; ruoli: string; testo: string }
function policy(sql: string): Policy[] {
  const out: Policy[] = [];
  const re = /create\s+policy\s+("[^"]+"|\w+)\s+on\s+public\.(\w+)\s+(?:as\s+permissive\s+)?for\s+(\w+)\s+to\s+(\w+)([\s\S]*?);[ \t]*(?:\n|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    out.push({ nome: m[1].replace(/"/g, ""), tabella: m[2], comando: m[3].toLowerCase(), ruoli: m[4].toLowerCase(), testo: norm(m[5]) });
  }
  return out;
}
const della = (tabella: string) => policy(codice()).filter((p) => p.tabella === tabella);
const comando = (tabella: string, cmd: string) => {
  const p = della(tabella).find((x) => x.comando === cmd);
  expect(p, `${tabella}: policy ${cmd}`).toBeDefined();
  return p!;
};

const PUO = "public.puo_modificare_commessa";
// La stessa lettura di prima, riga per riga (pg_policies il 07/10/2026).
const AZIENDE_DELL_UTENTE =
  "company_id in (select profiles.company_id from public.profiles where profiles.id = (select auth.uid()) " +
  "union select multi_company_access.company_id from public.multi_company_access " +
  "where multi_company_access.user_id = (select auth.uid()) and multi_company_access.status = 'active'::text " +
  "and (multi_company_access.expires_at is null or multi_company_access.expires_at > now()))";

describe("migrazione sal_scrittura_con_permesso", () => {
  it("non aspetta i lock ed è rilanciabile", () => {
    const c = codice();
    expect(c).toContain("set local lock_timeout = '3s';");
    expect(c).toContain("create or replace function public.puo_modificare_commessa(p_order_id uuid)");
    const create = policy(c);
    expect(create).toHaveLength(8);
    for (const p of create) {
      const nome = /\s/.test(p.nome) ? `"${p.nome}"` : p.nome;
      expect(c, p.nome).toContain(`drop policy if exists ${nome} on public.${p.tabella};`);
    }
  });

  describe("la regola: «Ordini e Commesse» nell'azienda della commessa, nel proprio perimetro, non bloccato", () => {
    const corpo = () => {
      const c = codice();
      const i = c.indexOf("create or replace function public.puo_modificare_commessa(");
      expect(i).toBeGreaterThanOrEqual(0);
      return norm(c.slice(i, c.indexOf("$$;", i)));
    };

    it("è una funzione definer con search_path vuoto, ferma sul valore", () => {
      const f = corpo();
      for (const pezzo of ["returns boolean", "language sql", "stable", "security definer", "set search_path = ''"]) {
        expect(f, pezzo).toContain(pezzo);
      }
    });

    it("il permesso è can_edit_orders nell'azienda della commessa, mai has_permission", () => {
      const f = corpo();
      expect(f).toContain("public.has_permission_for_company((select auth.uid()), 'can_edit_orders', o.company_id)");
      expect(f).toContain("from public.orders o where o.id = p_order_id");
      // has_permission guarda l'azienda in cui l'utente sta lavorando: un
      // amministratore di un'altra azienda messo sulla commessa passerebbe.
      expect(f).not.toMatch(/public\.has_permission\(/);
      expect(f).not.toContain("get_effective_company_id");
      expect(f).not.toContain("get_my_company_id");
    });

    it("«Solo i propri» e l'utente bloccato restano fuori, come per le commesse", () => {
      const f = corpo();
      expect(f).toContain("public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)");
      expect(f).toContain("not (select public.utente_bloccato())");
      // Senza commessa, o commessa che non c'è: no.
      expect(f).toContain("coalesce((select");
      expect(f).toContain(", false)");
    });

    it("la chiamano le policy (authenticated), non gli anonimi", () => {
      const c = norm(codice());
      expect(c).toContain(`revoke all on function ${PUO}(uuid) from public, anon;`);
      expect(c).toContain(`grant execute on function ${PUO}(uuid) to authenticated, service_role;`);
      expect(c).not.toMatch(/grant execute on function public\.puo_modificare_commessa\(uuid\) to [^;]*anon/);
    });
  });

  describe("le due policy FOR ALL spariscono: resta la lettura, più una policy per insert, update e delete", () => {
    it("toglie le due vecchie, non ne ricrea nessuna FOR ALL e non tocca le rate", () => {
      const c = codice();
      // le rate le ha chiuse 20281019320000: qui riaprirebbero la lettura ai clienti esterni
      expect(c).not.toMatch(/public\.order_installments/);
      expect(c).toContain("drop policy if exists sal_records_company_access on public.sal_records;");
      expect(c).toContain("drop policy if exists sal_voci_via_sal on public.sal_voci;");
      expect(policy(c).filter((p) => p.comando === "all")).toEqual([]);
      expect(c).not.toMatch(/for\s+all/i);
    });

    it.each(["sal_records", "sal_voci"])("%s: una policy per comando, e nient'altro", (t) => {
      const p = della(t);
      expect(p.map((x) => x.comando).sort()).toEqual(["delete", "insert", "select", "update"]);
      for (const x of p.filter((y) => y.comando !== "select")) expect(x.ruoli, x.nome).toBe("authenticated");
    });
  });

  describe("sal_records", () => {
    it("legge chi è dell'azienda del verbale (profilo o accesso multi-azienda attivo), com'era", () => {
      const s = comando("sal_records", "select");
      expect(s.ruoli).toBe("public");
      expect(s.testo).toBe(`using (${AZIENDE_DELL_UTENTE})`);
    });

    it("scrive chi può modificare la commessa, e il verbale resta nell'azienda della sua commessa", () => {
      const AZIENDA = "company_id = public.get_order_company_id(order_id)";
      expect(comando("sal_records", "insert").testo).toBe(`with check (${AZIENDA} and ${PUO}(order_id))`);
      expect(comando("sal_records", "update").testo).toBe(
        `using (${PUO}(order_id)) with check (${AZIENDA} and ${PUO}(order_id))`,
      );
      expect(comando("sal_records", "delete").testo).toBe(`using (${PUO}(order_id))`);
    });
  });

  describe("sal_voci", () => {
    it("legge chi è dell'azienda del verbale, com'era", () => {
      const s = comando("sal_voci", "select");
      expect(s.ruoli).toBe("public");
      expect(s.testo).toBe(`using (sal_id in (select sal_records.id from public.sal_records where sal_records.${AZIENDE_DELL_UTENTE}))`);
    });

    it("scrive chi può modificare la commessa del verbale", () => {
      const VIA_SAL = `exists (select 1 from public.sal_records s where s.id = sal_voci.sal_id and ${PUO}(s.order_id))`;
      expect(comando("sal_voci", "insert").testo).toBe(`with check (${VIA_SAL})`);
      expect(comando("sal_voci", "update").testo).toBe(`using (${VIA_SAL}) with check (${VIA_SAL})`);
      expect(comando("sal_voci", "delete").testo).toBe(`using (${VIA_SAL})`);
    });
  });

  it("non tocca super admin, cliente, commercialista, blocco, grant, trigger e tabelle", () => {
    const c = codice();
    for (const nome of [
      "Super admins can manage all installments",
      "customer_view_own_installments",
      "order_installments_accountant_select",
      "blocco_utente_bloccato",
      "sal_records_superadmin",
      "sal_voci_superadmin",
    ]) {
      expect(c, nome).not.toContain(nome);
    }
    expect(c).not.toMatch(/alter\s+table|create\s+trigger|create\s+or\s+replace\s+trigger|grant\s+\w+\s+on\s+table|create\s+table/i);
  });

  it("tutto in public: nessun nome senza schema", () => {
    const c = codice();
    expect(c).not.toMatch(/\bon\s+(order_installments|sal_records|sal_voci)\b/);
  });
});

describe("guardiani", () => {
  // I due guardiani guardano anche questa migrazione (è più nuova di entrambi): qui la regola, per dirlo in chiaro.
  it("l'azienda non si confronta con <> o != (con un NULL il confronto lascia passare)", () => {
    const trappola = /(<>|!=)\s*\(?\s*(select\s+)?(public\.)?(get_my_company_id|get_effective_company_id|get_user_company_id)\s*\(/i;
    expect(codice().split("\n").filter((riga) => trappola.test(riga))).toEqual([]);
  });

  it("nessuna policy chiede il ruolo company_admin da solo", () => {
    for (const p of policy(codice())) {
      expect(p.testo.replace(/access_role(::text)?\s*=\s*'company_admin'(::text)?/g, ""), p.nome).not.toContain("'company_admin'");
    }
  });
});

describe("nell'app scrivono rate e SAL sei file soli", () => {
  const file: string[] = [];
  const cammina = (cartella: string) => {
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
      const percorso = resolve(cartella, voce.name);
      if (voce.isDirectory()) {
        if (voce.name !== "test" && voce.name !== "node_modules") cammina(percorso);
      } else if (/\.(ts|tsx)$/.test(voce.name) && !/\.test\.tsx?$/.test(voce.name)) {
        file.push(percorso);
      }
    }
  };
  cammina(resolve(process.cwd(), "src"));
  const relativo = (p: string) => p.replace(`${process.cwd()}/`, "");
  // .from("tabella") o .from("tabella" as never), poi insert/update/upsert/delete.
  const SCRITTURA = /\.from\(\s*["'](?:order_installments|sal_records|sal_voci)["'](?:\s+as\s+\w+)?\s*\)\s*\.(?:update|insert|upsert|delete)\(/;

  it("solo questi file scrivono order_installments, sal_records e sal_voci", () => {
    const scrivono = file.filter((p) => SCRITTURA.test(readFileSync(p, "utf8"))).map(relativo).sort();
    // Un file nuovo qui: da oggi la scrittura riesce solo a chi ha «Ordini e
    // Commesse» (e alle funzioni SECURITY DEFINER, al service role, al super
    // admin). Se il file è dell'ufficio deve chiedere canEditOrders, altrimenti
    // l'utente vede il bottone e poi non succede niente (un update fermato
    // dalla RLS non dà errore: tocca 0 righe); se è di chi non ha quel permesso
    // (cantiere, cliente) la scrittura va fatta da una funzione con un
    // controllo suo, come acconto_incassa e collega_rata_fattura.
    expect(scrivono).toEqual([
      "src/components/fatture/AbbinaFattureCommesseDialog.tsx",
      "src/components/orders/RiconciliaRateBancaDialog.tsx",
      "src/components/orders/SalTab.tsx",
      // la bozza del SAL, chiamata solo da SalTab dopo canEditOrders
      "src/lib/orders/saveSalDraft.ts",
      "src/pages/azienda/CreateLavoroAppaltatore.tsx",
      "src/pages/azienda/OrderDetail.tsx",
    ]);
  });

  it("l'app di cantiere (campo) e il portale cliente non le scrivono", () => {
    const fuori = file
      .map(relativo)
      .filter((p) => /^src\/pages\/(campo|cliente)\//.test(p) || /^src\/components\/(campo|cliente)\//.test(p))
      .filter((p) => SCRITTURA.test(readFileSync(resolve(process.cwd(), p), "utf8")));
    expect(fuori).toEqual([]);
  });
});
