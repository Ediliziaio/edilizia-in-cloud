-- L'avanzamento dichiarato in un rapportino si applica all'approvazione, DAL DATABASE (07/10/2026).
--
-- Oggi l'applicazione la fa solo il browser dell'ufficio (OrdineRapportiniCampo:
-- per ogni fase dichiarata nuova = max(attuale, dichiarata), ≥100 chiude). Un rapportino
-- approvato per un'altra strada (l'assistente Silvio via WhatsApp o web, una chiamata
-- diretta) cambia stato e basta: le percentuali restano dov'erano. In produzione oggi
-- nessuno dei 15 rapportini approvati così dichiara fasi, quindi non è ancora successo
-- niente; ma è la stessa trappola delle ore, che il database risolve già «per OGNI
-- strada» (fn_rapportino_costo_manodopera).
--
-- Cosa fa. Quando un rapportino passa a «approvato» (la stessa condizione del costo):
--   · per una fase che il rapportino dichiara con le sottofasi spuntate
--     (fasi_lavorate[].sottofasi_fatte): le segna «fatte» (la fase si ricalcola da sola);
--   · per una fase con sottofasi senza spunte (un rapportino scritto prima): niente, la
--     percentuale la decidono le sottofasi;
--   · per le altre fasi: la regola di sempre, solo in salita, ≥100 chiude, >0 apre.
-- Le voci che non riguardano questa commessa o non si leggono si saltano una per una:
-- un errore qui NON ferma l'approvazione (resta un avviso nel registro del database).
-- Il browser dell'ufficio continua a fare la sua parte: ripetere la stessa regola è
-- innocuo (stesso risultato), e così la migrazione non tocca il codice dell'approvazione.

set local lock_timeout = '3s';

create or replace function public.fn_rapportino_applica_avanzamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_fase uuid;
  f public.order_work_phases%rowtype;
  v_dichiarata integer;
  v_nuova integer;
  v_stato text;
begin
  if not (new.stato = 'approvato' and old.stato is distinct from 'approvato') then
    return new;
  end if;
  if jsonb_typeof(new.fasi_lavorate) is distinct from 'array' then
    return new;
  end if;

  for v in select value from jsonb_array_elements(new.fasi_lavorate) loop
    begin
      v_fase := (v->>'phase_id')::uuid;
      select * into f from public.order_work_phases where id = v_fase and order_id = new.order_id;
      continue when not found;

      if jsonb_typeof(v->'sottofasi_fatte') = 'array' then
        -- Le spunte del capocantiere diventano «fatte»; la fase si ricalcola da sola.
        update public.order_work_subphases s
           set fatta = true
         where s.phase_id = v_fase and not s.fatta
           and s.id::text in (select lower(x) from jsonb_array_elements_text(v->'sottofasi_fatte') as t(x));
        continue;
      end if;

      -- Fase con sottofasi (anche in un rapportino scritto prima): la percentuale la decidono loro.
      continue when exists (select 1 from public.order_work_subphases s where s.phase_id = v_fase);

      v_dichiarata := least(100, greatest(0, round(coalesce(nullif(v->>'percentuale', '')::numeric, 0))))::integer;
      v_nuova := greatest(coalesce(f.percentuale, 0), v_dichiarata);
      v_stato := case when v_nuova >= 100 then 'completata'
                      when v_nuova > 0 and f.status <> 'completata' then 'in_corso'
                      else f.status end;
      if v_nuova is distinct from f.percentuale or v_stato is distinct from f.status then
        update public.order_work_phases
           set percentuale = v_nuova, status = v_stato, updated_at = now()
         where id = v_fase;
      end if;
    exception when others then
      raise warning 'fn_rapportino_applica_avanzamento (rapportino %): %', new.id, sqlerrm;
    end;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_rapportino_applica_avanzamento on public.campo_rapportini;
create trigger trg_rapportino_applica_avanzamento
  after update of stato on public.campo_rapportini
  for each row execute function public.fn_rapportino_applica_avanzamento();

revoke all on function public.fn_rapportino_applica_avanzamento() from public, anon, authenticated;
