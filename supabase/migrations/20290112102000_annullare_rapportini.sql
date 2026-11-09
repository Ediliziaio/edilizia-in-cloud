-- Annullare un rapportino, anche approvato, con motivo.
--
-- Si riusa lo stato «rifiutato»: tutte le letture già non lo contano, e uscendo da
-- «approvato» i trigger esistenti stornano costo, ore e avanzamento. `annullato_at`
-- distingue un rapportino annullato da uno da correggere: non si riapre, non si riapprova
-- e non occupa più la giornata, così l'operaio può rifarlo.
-- Nessuna cancellazione fisica.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.campo_rapportini
  add column if not exists annullato_at timestamptz,
  add column if not exists annullato_da uuid references auth.users(id) on delete set null;

drop index if exists public.ux_campo_rapportini_tipo_giorno;
create unique index ux_campo_rapportini_tipo_giorno
  on public.campo_rapportini (user_id, order_id, data_lavoro, (
    case when (coalesce(lavoro_completato, false) or (nullif(btrim(firma_cliente_url), '') is not null))
         then 'cliente' else 'giornaliero' end))
  where annullato_at is null;

create or replace function public.campo_rapportino_ufficio_non_riapprova()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.annullato_at is not null and new.stato is distinct from old.stato then
    raise exception 'Questo rapportino è stato annullato e non si può riaprire. Scrivine uno nuovo.'
      using errcode = '23514';
  end if;
  if old.ufficio_employee_id is not null and old.stato = 'rifiutato' and new.stato = 'approvato' then
    raise exception 'Queste ore sono state annullate dall''ufficio. Per rimetterle inseriscile di nuovo da «Ore e persone».'
      using errcode = '23514';
  end if;
  return new;
end
$$;

create or replace function public.campo_rapportino_annulla(p_id uuid, p_updated_at timestamptz, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.campo_rapportini;
  v_assegnato uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into r from public.campo_rapportini where id = p_id for update;
  if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Rapportino non disponibile.' using errcode = '42501';
  end if;
  perform public.assert_company_access(r.company_id);
  select assigned_to into v_assegnato from public.orders where id = r.order_id and deleted_at is null;
  if not found or r.company_id is distinct from public.get_effective_company_id()
     or public.has_permission_for_company(auth.uid(), 'can_edit_orders', r.company_id) is not true
     or public.has_permission_for_company(auth.uid(), 'can_view_orders', r.company_id) is not true
     or public.check_staff_visibility(auth.uid(), v_assegnato) is not true
     or public.campo_e_ufficio(r.company_id) is not true then
    raise exception 'Non hai il permesso di annullare questo rapportino.' using errcode = '42501';
  end if;
  if r.annullato_at is not null then return; end if;
  if v_motivo is null then raise exception 'Scrivi il motivo dell''annullamento.' using errcode = '22023'; end if;
  if r.updated_at is distinct from p_updated_at then
    raise exception 'Il rapportino è cambiato: aggiorna la pagina prima di annullarlo.' using errcode = '40001';
  end if;
  if exists (select 1 from public.appalto_rendiconto_righe a where a.rapportino_id = p_id and a.stato <> 'bozza') then
    raise exception 'Non si può annullare: è già in un rendiconto non più in bozza.' using errcode = '23514';
  end if;
  if exists (select 1 from public.giornale_lavori g
              where g.order_id = r.order_id and g.stato = 'firmata' and p_id = any(g.source_rapportini_ids)) then
    raise exception 'Non si può annullare: è riportato in una pagina firmata del giornale dei lavori.' using errcode = '23514';
  end if;
  update public.campo_rapportini
     set stato = 'rifiutato', approvato = false, motivo_rifiuto = v_motivo, pdf_url = null,
         annullato_at = now(), annullato_da = auth.uid()
   where id = p_id;
end
$$;
revoke all on function public.campo_rapportino_annulla(uuid, timestamptz, text) from public, anon;
grant execute on function public.campo_rapportino_annulla(uuid, timestamptz, text) to authenticated, service_role;

create or replace function public.ordine_conteggi_viste(p_order_id uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'lavorazioni',     (select count(*) from public.order_work_phases        where order_id = p_order_id),
    'rapportini',      (select count(*) from public.campo_rapportini         where order_id = p_order_id and annullato_at is null),
    'giornale',        (select count(*) from public.giornale_lavori          where order_id = p_order_id),
    'verbali',         (select count(*) from public.order_acceptance_reports where order_id = p_order_id),
    'ordini_acquisto', (select count(*) from public.purchase_orders          where order_id = p_order_id)
  )
$function$;
