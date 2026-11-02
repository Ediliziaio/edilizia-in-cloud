import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20281107100000_moduli_cantiere.sql", "utf8");
const funzione = (nome: string) => {
  const inizio = sql.indexOf(`create or replace function public.${nome}(`);
  expect(inizio, nome).toBeGreaterThan(-1);
  return sql.slice(inizio, sql.indexOf("$$;", sql.indexOf("as $$", inizio)));
};

describe("moduli_cantiere: permessi", () => {
  it("la tabella ha la RLS e si legge con il permesso per azienda", () => {
    expect(sql).toContain("alter table public.moduli_cantiere enable row level security");
    const policy = sql.slice(sql.indexOf("create policy moduli_cantiere_lettura"), sql.indexOf("revoke insert, update, delete on public.moduli_cantiere"));
    expect(policy).toContain("has_permission_for_company");
    expect(policy).toContain("can_view_settings_orders");
    expect(policy).not.toMatch(/\bhas_permission\(/);
  });
  it("non si scrive direttamente sulla tabella", () => {
    expect(sql).toContain("revoke insert, update, delete on public.moduli_cantiere from authenticated, anon");
    expect(sql).not.toMatch(/create policy[^;]*on public\.moduli_cantiere for (insert|update|delete|all)/);
  });
  it("il salvataggio controlla permesso, sola lettura e azienda", () => {
    const f = funzione("moduli_cantiere_salva");
    expect(f).toContain("can_edit_settings_orders");
    expect(f).toContain("utente_sola_lettura");
    expect(f).toContain("assert_company_access");
    expect(f).toContain("company_id = p_company_id and tipo = p_tipo");
  });
  it("il salvataggio rifiuta il cambio di tipo e la sparizione di un campo con dati", () => {
    const f = funzione("moduli_cantiere_salva");
    expect(f).toContain("il tipo non si cambia");
    expect(f).toContain("non si sposta tra rapportino e fase");
    expect(f).toContain("si può solo archiviare");
    expect(f).toContain("errcode = '22023'");
  });
  it("il conteggio dei dati è protetto da permesso", () => {
    expect(funzione("moduli_cantiere_uso")).toContain("can_view_settings_orders");
    expect(sql).toContain("revoke all on function public.moduli_cantiere_conta_uso(uuid, text) from public, anon, authenticated");
  });
  it("ogni funzione è negata a public e anon", () => {
    for (const f of ["modulo_rapportino_per_ordine(uuid)", "moduli_cantiere_uso(uuid, text)", "moduli_cantiere_salva(uuid, uuid, text, text, jsonb, boolean)"]) {
      expect(sql).toContain(`revoke all on function public.${f} from public, anon`);
      expect(sql).toContain(`grant execute on function public.${f} to authenticated`);
    }
  });
  it("il modulo di una commessa è quello dell'azienda della commessa", () => {
    const f = funzione("modulo_rapportino_per_ordine");
    expect(f).toContain("select company_id into v_company from public.orders");
    expect(f).toContain("campo_lavoro_su_commessa");
    expect(f).toContain("m.company_id = v_company");
  });
});

describe("campi_extra", () => {
  it("è un elenco di dimensione limitata, vuoto per i rapportini di oggi", () => {
    expect(sql).toContain("add column if not exists campi_extra jsonb not null default '[]'::jsonb");
    expect(sql).toContain("jsonb_typeof(campi_extra) = 'array' and pg_column_size(campi_extra) <= 32768");
  });
});

describe("ufficio_crea_rapportini", () => {
  const f = funzione("ufficio_crea_rapportini");
  it("salva i campi propri controllandone il formato", () => {
    expect(f).toContain("v_campi := coalesce(r->'campi_extra', '[]'::jsonb)");
    expect(f).toContain("meteo, campi_extra)");
    expect(f).toMatch(/end,\s+v_campi\);/);
  });
  it("conserva tutto ciò che faceva prima", () => {
    for (const parte of ["can_edit_orders", "can_view_giornale_lavori", "check_staff_visibility", "v_presenze", "v_foto", "v_materiali", "v_mezzi", "ufficio_created_by", "unique_violation"]) {
      expect(f, parte).toContain(parte);
    }
  });
});
