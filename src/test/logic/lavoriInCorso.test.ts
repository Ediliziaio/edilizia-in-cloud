/**
 * I lavori in corso su ordinazione (09/11/2026).
 *
 * La voce 02 del conto economico era zero con un commento che diceva «stub».
 * Adesso c'è, e la parte delicata non è il calcolo: è quando NON si calcola.
 * Questo test sorveglia le tre prudenze, perché sono quelle che un domani
 * qualcuno toglierebbe «per far vedere un numero».
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  serveLavoriInCorso,
  spiegaVariazione,
} from "@/components/controllo-gestione/ui/LavoriInCorsoCard";
import type { LavoriInCorso } from "@/hooks/controlloGestione/useLavoriInCorso";

const ROOT = join(__dirname, "../../..");
const leggi = (f: string) => readFileSync(join(ROOT, f), "utf8");
const sql = leggi("supabase/migrations/20290116160000_lavori_in_corso_su_ordinazione.sql");
const sqlTabella = leggi("supabase/migrations/20290116150000_rimanenze_lavori_tabella.sql");

describe("Il lavoro eseguito, commessa per commessa", () => {
  it("lo misura dalle fasi: importo venduto per avanzamento", () => {
    expect(sql).toContain("coalesce(f.importo_venduto, 0)");
    expect(sql).toContain("least(greatest(coalesce(f.percentuale, 0), 0), 100) / 100.0");
  });

  it("ha un ripiego dichiarato quando le fasi non hanno importi", () => {
    expect(sql).toContain("case when fs.importi > 0 then 'fasi_importi' else 'fasi_percentuale' end as base");
  });

  it("senza avanzamento la commessa resta fuori: non sapere non è zero", () => {
    expect(sql).toContain("and (fs.importi > 0 or fs.pct_max > 0)");
  });

  it("lascia fuori cancellate, bozze e commesse senza valore", () => {
    expect(sql).toContain("o.deleted_at is null");
    expect(sql).toContain("coalesce(o.status, '') <> 'bozza'");
    expect(sql).toContain("coalesce(o.total_amount, 0) > 0");
  });

  it("il fatturato è al netto delle note di credito e delle cancellate", () => {
    expect(sql).toContain("case when i.document_type = 'credit_note' then -1 else 1 end");
    expect(sql).toContain("i.deleted_at is null");
  });

  it("distingue il lavoro in corso dagli acconti presi dal cliente", () => {
    expect(sql).toContain("greatest(q.maturato - q.fatturato, 0), 2) as lavori_in_corso");
    expect(sql).toContain("greatest(q.fatturato - q.maturato, 0), 2) as anticipi");
  });

  it("si legge col permesso di chi chiede", () => {
    expect(sql).toContain("alter view public.v_cg_lavori_in_corso set (security_invoker = on)");
  });
});

describe("La variazione che entra nel conto economico", () => {
  it("è zero finché la rimanenza iniziale non è registrata", () => {
    const fn = sql.slice(
      sql.indexOf("create or replace function public.cg_variazione_lavori_in_corso"),
    );
    expect(fn).toMatch(/if v_inizio is null then\s+return 0;/);
  });

  it("per un anno chiuso senza rimanenza finale registrata non inventa niente", () => {
    const fn = sql.slice(
      sql.indexOf("create or replace function public.cg_variazione_lavori_in_corso"),
    );
    // Il valore di oggi vale solo per l'anno in corso.
    expect(fn).toContain("if p_anno = extract(year from current_date)::integer then");
    expect(fn).toMatch(/else\s+return 0;\s+end if;/);
  });

  it("sostituisce solo quella riga del conto economico, e si ferma se è cambiata", () => {
    expect(sql).toContain("v_var_rim_lic := 0; v_var_rim_mag := 0;");
    expect(sql).toContain(
      "v_var_rim_lic := public.cg_variazione_lavori_in_corso(v_company_id, p_anno); v_var_rim_mag := 0;",
    );
    expect(sql).toMatch(/raise exception 'La riga delle rimanenze è cambiata/);
  });

  it("girare due volte non fa danni", () => {
    expect(sql).toMatch(/if position\(v_nuovo in v_def\) > 0 then\s+return;/);
  });

  it("non è chiamabile dal browser: la usano le funzioni del conto economico", () => {
    expect(sql).toMatch(
      /revoke all on function public\.cg_variazione_lavori_in_corso\(uuid, integer\) from public, anon, authenticated/,
    );
  });
});

describe("La rimanenza registrata", () => {
  it("una riga per esercizio, non di più", () => {
    expect(sqlTabella).toContain("unique (company_id, esercizio)");
  });

  it("dice se l'ha scritta una persona o il calcolo", () => {
    expect(sqlTabella).toContain("check (fonte in ('manuale', 'calcolata'))");
  });

  it("ogni azienda vede solo la sua", () => {
    expect(sqlTabella).toContain("alter table public.cg_rimanenze_lavori enable row level security");
    const policy = sqlTabella.match(/company_id = \(select public\.get_my_company_id\(\)\)/g);
    expect(policy?.length).toBeGreaterThanOrEqual(4);
    expect(sqlTabella).toContain("utente_e_cliente_esterno()");
  });

  it("non accetta un importo negativo", () => {
    expect(sql).toContain("raise exception 'la rimanenza non può essere negativa'");
  });

  it("senza importo registra quello calcolato, e lo dichiara", () => {
    expect(sql).toContain("v_fonte := 'calcolata'");
  });
});

describe("Che cosa dice la pagina", () => {
  const base: LavoriInCorso = {
    anno: 2026,
    commesse_misurate: 4,
    maturato: 5_912_449,
    fatturato: 4_360_910,
    lavori_in_corso: 1_585_449,
    anticipi: 33_910,
    commesse_senza_avanzamento: 1,
    valore_senza_avanzamento: 500_000,
    rimanenza_registrata: null,
    rimanenza_iniziale: null,
    variazione_nel_ce: 0,
  };

  it("si mostra quando c'è un lavoro in corso o un acconto", () => {
    expect(serveLavoriInCorso(base)).toBe(true);
    expect(serveLavoriInCorso({ ...base, lavori_in_corso: 0, anticipi: 1000 })).toBe(true);
  });

  it("tace quando non c'è niente da dire", () => {
    expect(serveLavoriInCorso({ ...base, lavori_in_corso: 0, anticipi: 0 })).toBe(false);
    expect(serveLavoriInCorso({ ...base, commesse_misurate: 0 })).toBe(false);
    expect(serveLavoriInCorso(null)).toBe(false);
  });

  it("senza rimanenza iniziale spiega che cosa manca, e perché", () => {
    const t = spiegaVariazione(base, 2026);
    expect(t).toContain("31/12/2025");
    expect(t).toContain("gonfierebbe il margine");
  });

  it("con la rimanenza iniziale dice di quanto entra, in positivo e in negativo", () => {
    const su = spiegaVariazione(
      { ...base, rimanenza_iniziale: 1_000_000, variazione_nel_ce: 585_449 }, 2026);
    expect(su).toContain("variazione positiva");
    const giu = spiegaVariazione(
      { ...base, rimanenza_iniziale: 2_000_000, variazione_nel_ce: -414_551 }, 2026);
    expect(giu).toContain("variazione negativa");
    expect(giu).toContain("fatturato più lavoro");
  });

  it("variazione a zero: lo dice invece di tacere", () => {
    const t = spiegaVariazione({ ...base, rimanenza_iniziale: 1_585_449, variazione_nel_ce: 0 }, 2026);
    expect(t).toContain("è zero");
  });
});
