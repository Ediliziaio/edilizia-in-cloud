// src/test/logic/rapportinoApplicaAvanzamentoMigrazione.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281007141000_rapportino_applica_avanzamento.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");
const funzione = codice.match(/create or replace function public\.fn_rapportino_applica_avanzamento\(\)[\s\S]*?\n\$\$;/)![0];

describe("migrazione rapportino_applica_avanzamento", () => {
  it("non aspetta i lock e non cambia lo schema", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).not.toMatch(/create table|alter table/i);
  });

  it("scatta solo al passaggio ad «approvato», come il costo della manodopera", () => {
    expect(codice).toMatch(/create trigger trg_rapportino_applica_avanzamento\s+after update of stato on public\.campo_rapportini/);
    expect(funzione).toMatch(/if not \(new\.stato = 'approvato' and old\.stato is distinct from 'approvato'\) then\s+return new;/);
  });

  it("lavora solo sulle fasi di QUESTA commessa", () => {
    expect(funzione).toMatch(/where id = v_fase and order_id = new\.order_id;/);
  });

  it("una voce rotta si salta da sola e non ferma l'approvazione", () => {
    expect(funzione).toMatch(/exception when others then\s+raise warning/);
  });

  it("le sottofasi si segnano solo «fatte»; per una fase con sottofasi non si applica una percentuale", () => {
    expect(funzione).toMatch(/set fatta = true/);
    expect(funzione).not.toMatch(/set fatta = false/);
    expect(funzione).toMatch(/continue when exists \(select 1 from public\.order_work_subphases s where s\.phase_id = v_fase\);/);
  });

  it("una fase libera sale e non scende (GREATEST), e si scrivono solo percentuale e stato", () => {
    expect(funzione).toMatch(/greatest\(coalesce\(f\.percentuale, 0\), v_dichiarata\)/);
    const aggiornamento = funzione.match(/update public\.order_work_phases\s+set ([^;]+?)\s+where id = v_fase;/)![1];
    expect(aggiornamento).toBe("percentuale = v_nuova, status = v_stato, updated_at = now()");
  });

  it("la funzione è chiusa: la usa solo il trigger", () => {
    expect(funzione).toMatch(/security definer\s+set search_path = public/);
    expect(codice).toContain("revoke all on function public.fn_rapportino_applica_avanzamento() from public, anon, authenticated;");
  });
});
