-- Silvio, «fatturato necessario il mese prossimo»: i subappaltatori fuori dagli stipendi
-- (15/11/2026, decisione del titolare: chi in anagrafica ha il ruolo «subappaltatore» non è un
-- dipendente e lo paga la sua fattura; vedi eSubappaltatore in src/lib/costoPersonale.ts).
--
-- Patch sul testo della funzione già in produzione: si aggiunge la condizione alle due letture
-- di employees (conteggio e somma degli stipendi). Idempotente: se la condizione c'è già, non
-- cambia niente.
do $$
declare
  v_def text;
  v_nuova text;
  v_cond constant text := 'AND COALESCE(is_active, true) = true AND lower(coalesce(role_type, '''')) <> ''subappaltatore''';
begin
  select pg_get_functiondef('public.silvio_tool_revenue_needed_next_month(uuid,date,numeric)'::regprocedure) into v_def;
  if position('subappaltatore' in v_def) > 0 then
    return;
  end if;
  v_nuova := replace(v_def, 'AND COALESCE(is_active, true) = true;', v_cond || ';');
  if v_nuova = v_def then
    raise exception 'Testo della funzione cambiato: patch non applicabile';
  end if;
  execute v_nuova;
end
$$;
