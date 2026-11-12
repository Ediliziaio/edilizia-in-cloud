-- Commessa cliente spegnibile per azienda.
--
-- Chi fa solo operazioni immobiliari (compra un terreno, costruisce, vende) non
-- ha commesse per un cliente: la scheda «Commessa cliente» nella finestra
-- «Nuova Commessa» era l'unica sempre presente, e non si poteva togliere.
-- Diventa l'ultimo interruttore di Impostazioni → Commesse generali.
--
-- L'invariante: non si può restare senza alcun modo di creare una commessa.
-- Spegnere la commessa cliente richiede almeno un tipo di generale acceso, e
-- spegnere l'ultimo tipo di generale richiede la commessa cliente accesa.
-- Le unità di una generale (`/azienda/ordini/nuovo?generale=…`) non sono
-- commesse cliente e restano create come prima.

alter table public.company_commesse_generali_settings
  add column if not exists commessa_cliente_attiva boolean not null default true;

comment on column public.company_commesse_generali_settings.commessa_cliente_attiva is
  'false = l''azienda non lavora su commessa per clienti: la scheda non compare in «Nuova Commessa» e la pagina di creazione rimanda all''elenco. Le unità di una commessa generale restano permesse.';

-- Riga ridondante, tenuta perché è stata applicata: questa tabella ha il GRANT
-- a livello di TABELLA (`authenticated=r`, da 20281030270000), che copre anche
-- le colonne aggiunte dopo. Non è come `campo_rapportini` o
-- `ai_whatsapp_numbers`, dove il GRANT è per colonna e una colonna nuova va
-- aggiunta a mano: qui un `grant select (colonna)` non restringe niente.
grant select (commessa_cliente_attiva) on public.company_commesse_generali_settings to authenticated;

create or replace function public.commesse_generali_commessa_cliente_salva(
  p_company_id uuid,
  p_attiva boolean
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_modelli text[];
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di cambiare queste impostazioni.' using errcode = '42501';
  end if;
  if p_attiva is null then
    raise exception 'Scelta non valida.' using errcode = '22023';
  end if;

  insert into public.company_commesse_generali_settings
    (company_id, modelli_attivi, commessa_cliente_attiva, updated_by, updated_at)
  values (p_company_id, '{}', p_attiva, auth.uid(), now())
  on conflict (company_id) do update
    set commessa_cliente_attiva = excluded.commessa_cliente_attiva,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning modelli_attivi into v_modelli;

  -- Dopo la scrittura, nella stessa transazione: se non resta niente da creare
  -- si annulla tutto.
  if not p_attiva and coalesce(array_length(v_modelli, 1), 0) = 0 then
    raise exception 'Prima accendi un tipo di commessa generale: senza la commessa cliente non resterebbe nessun modo di creare una commessa.'
      using errcode = '23514';
  end if;

  return p_attiva;
end;
$$;

revoke all on function public.commesse_generali_commessa_cliente_salva(uuid, boolean) from public;
revoke all on function public.commesse_generali_commessa_cliente_salva(uuid, boolean) from anon;
grant execute on function public.commesse_generali_commessa_cliente_salva(uuid, boolean) to authenticated;

-- L'altra metà dell'invariante: spegnere l'ultimo tipo di generale mentre la
-- commessa cliente è spenta lascerebbe l'azienda senza niente.
create or replace function public.commesse_generali_impostazioni_salva(p_company_id uuid, p_modelli text[])
 returns text[]
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ammessi constant text[] := array['appalto', 'sviluppo', 'compravendita'];
  v_modelli text[];
  v_cliente boolean;
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di cambiare queste impostazioni.' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_modelli, '{}')) m where m <> all (v_ammessi)) then
    raise exception 'Scelta non valida.' using errcode = '22023';
  end if;
  select coalesce(array_agg(m order by array_position(v_ammessi, m)), '{}')
    into v_modelli
    from (select distinct m from unnest(coalesce(p_modelli, '{}')) m) s;

  insert into public.company_commesse_generali_settings (company_id, modelli_attivi, updated_by, updated_at)
  values (p_company_id, v_modelli, auth.uid(), now())
  on conflict (company_id) do update
    set modelli_attivi = excluded.modelli_attivi, updated_by = excluded.updated_by, updated_at = now()
  returning commessa_cliente_attiva into v_cliente;

  if coalesce(array_length(v_modelli, 1), 0) = 0 and not coalesce(v_cliente, true) then
    raise exception 'Prima riaccendi la commessa cliente: spegnendo anche l''ultimo tipo di commessa generale non resterebbe nessun modo di creare una commessa.'
      using errcode = '23514';
  end if;

  return v_modelli;
end;
$function$;
