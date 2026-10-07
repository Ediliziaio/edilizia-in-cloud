-- ============================================================================
-- Rapportini: nuova opzione «ore_proprie» (07/10/2026)
-- ============================================================================
-- Chi scrive il racconto del cantiere aveva due scelte: 'ognuno' (ogni operaio
-- scrive tutto) e 'capo' (lo scrive il capocantiere, gli operai timbrano e
-- basta). Mancava la via di mezzo richiesta dalle imprese medie: il racconto lo
-- fa il capocantiere, ma OGNI OPERAIO manda le SUE ore. È il flusso 'ore_proprie'.
--
-- Qui si allarga solo cosa il database ACCETTA (CHECK della tabella e
-- validazione del salvataggio): nessuna azienda cambia comportamento finché un
-- amministratore non sceglie la nuova opzione. Retro-compatibile e idempotente.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── Il CHECK della colonna accetta anche 'ore_proprie' ───────────────────────
alter table public.campo_regole_azienda
  drop constraint if exists campo_regole_azienda_chi_compila_check;
alter table public.campo_regole_azienda
  add constraint campo_regole_azienda_chi_compila_check
  check (chi_compila in ('ognuno', 'capo', 'ore_proprie'));

-- ── Il salvataggio accetta anche 'ore_proprie' (resto invariato) ─────────────
create or replace function public.campo_regole_azienda_salva(
  p_company_id uuid,
  p_chi_compila text,
  p_ore_dalle text,
  p_avviso_minuti integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception using errcode = '42501', message = 'Non puoi cambiare queste impostazioni.';
  end if;
  if p_chi_compila not in ('ognuno', 'capo', 'ore_proprie') then
    raise exception using errcode = '22023', message = 'Scelta non valida: chi compila il rapportino.';
  end if;
  if p_ore_dalle not in ('capo', 'timbrature') then
    raise exception using errcode = '22023', message = 'Scelta non valida: da dove vengono le ore.';
  end if;
  if p_avviso_minuti is not null and (p_avviso_minuti < 5 or p_avviso_minuti > 480) then
    raise exception using errcode = '22023', message = 'Lo scostamento va da 5 minuti a 8 ore.';
  end if;

  insert into public.campo_regole_azienda as r (company_id, chi_compila, ore_dalle, avviso_scostamento_minuti, aggiornato_il, aggiornato_da)
  values (p_company_id, p_chi_compila, p_ore_dalle, p_avviso_minuti, now(), auth.uid())
  on conflict (company_id) do update
     set chi_compila = excluded.chi_compila,
         ore_dalle = excluded.ore_dalle,
         avviso_scostamento_minuti = excluded.avviso_scostamento_minuti,
         aggiornato_il = now(),
         aggiornato_da = auth.uid();

  return public.campo_regole_azienda_leggi(p_company_id);
end;
$$;
