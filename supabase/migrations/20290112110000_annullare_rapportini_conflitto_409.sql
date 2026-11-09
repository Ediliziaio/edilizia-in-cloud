-- Il conflitto di versione dell'annullamento risponde PT409, come tutte le altre RPC:
-- con il codice di serializzazione PostgREST ritenterebbe la chiamata da solo
-- (vedi 20281216150000_conflitti_http_senza_retry). Cambia solo il codice d'errore.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

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
    raise exception 'Il rapportino è cambiato: aggiorna la pagina prima di annullarlo.' using errcode = 'PT409';
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
