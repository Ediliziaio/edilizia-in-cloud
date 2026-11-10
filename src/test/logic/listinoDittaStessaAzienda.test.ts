import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20290213200000_listino_ditta_revisione.sql"),
  "utf8",
);

// Il corpo di una funzione: da «function public.<nome>(» al delimitatore di chiusura.
const corpo = (nome: string, chiusura: string) => {
  const inizio = sql.indexOf(`function public.${nome}(`);
  expect(inizio).toBeGreaterThan(-1);
  const fine = sql.indexOf(chiusura, inizio);
  expect(fine).toBeGreaterThan(inizio);
  return sql.slice(inizio, fine);
};

describe("listino della ditta: squadra e voce della stessa azienda del prezzo", () => {
  it("le chiavi esterne composte legano squadra e voce all'azienda del prezzo", () => {
    expect(sql).toMatch(
      /foreign key \(company_id, external_team_id\)\s+references public\.external_teams \(company_id, id\)/,
    );
    expect(sql).toMatch(
      /foreign key \(company_id, tariffa_id\)\s+references public\.tariffe_aziendali \(company_id, id\)/,
    );
    // Idempotente: ogni vincolo si toglie prima di rimetterlo.
    for (const nome of ["tariffa_costi_varianti_squadra_stessa_azienda", "tariffa_costi_varianti_voce_stessa_azienda"]) {
      expect(sql).toContain(`drop constraint if exists ${nome}`);
      expect(sql).toContain(`add constraint ${nome}`);
    }
  });

  it("il costo previsto prende solo i prezzi dell'azienda della commessa", () => {
    const f = corpo("ditte_ricalcola_previsto", "$function$;");
    expect(f).toMatch(/join public\.orders o on o\.id = oet\.order_id/);
    expect(f).toMatch(/tv\.company_id = s\.company_id/);
    expect(f).toMatch(/e\.company_id = o\.company_id/);
  });

  it("la squadra ricollegata aggiorna solo le righe della sua azienda", () => {
    const f = corpo("squadra_anagrafica_al_listino", "$$;");
    expect(f).toMatch(/v\.company_id = new\.company_id/);
    expect(f).toMatch(/t\.company_id = new\.company_id/);
  });

  it("nessuna funzione resta aperta a chi non deve", () => {
    expect(sql).toMatch(/revoke all on function public\.ditte_ricalcola_previsto\(uuid\[\]\) from public, anon, authenticated/);
    expect(sql).toMatch(/revoke all on function public\.squadra_anagrafica_al_listino\(\) from public, anon, authenticated/);
    expect(sql).not.toMatch(/grant execute on function public\.ditte_ricalcola_previsto\(uuid\[\]\) to [^;]*authenticated/);
  });

  it("non tocca le regole di accesso (le policy bloccano auth)", () => {
    expect(sql).not.toMatch(/\b(create|drop|alter) policy\b/i);
    expect(sql).toMatch(/set local lock_timeout = '3s'/);
  });
});

describe("il listino della ditta ricalcola il previsto solo passando dai permessi", () => {
  it("listino_ditta_salva non chiama direttamente la funzione del service role", () => {
    const f = corpo("listino_ditta_salva", "$$;");
    expect(f).not.toMatch(/perform public\.ditte_ricalcola_previsto\(/);
    expect(f).toMatch(/perform public\.listino_ditta_ricalcola_previsto\(p_subappaltatore, v_fasi\)/);
  });
  it("il passaggio controlla listino e costi e resta chiuso ad anon", () => {
    const f = corpo("listino_ditta_ricalcola_previsto", "$$;");
    expect(f).toMatch(/can_edit_settings_pricing/);
    expect(f).toMatch(/can_view_costs/);
    expect(f).toMatch(/o\.company_id = v_azienda/);
    expect(sql).toMatch(/revoke all on function public\.listino_ditta_ricalcola_previsto\(uuid, uuid\[\]\) from public, anon/);
  });
});
