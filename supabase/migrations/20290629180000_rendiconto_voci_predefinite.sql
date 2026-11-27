-- Rendiconto giornaliero: l'editor sa già voce, unità e prezzo di persone, ditte e mezzi
-- ─────────────────────────────────────────────────────────────────────────────────────
-- 27/11/2026, dal collaudo nel browser. L'editor leggeva `orders.tariffa_manodopera_id`
-- con una GET: il client riscrive OGNI lettura di `orders` su `orders_visibili`
-- (lib/orders/protectedOrderRequests.ts), e quella vista non ha la colonna. Risultato:
-- 400 «column orders_visibili.tariffa_manodopera_id does not exist» a ogni apertura, e
-- l'editor che non conosce la voce delle ore.
--
-- Non è solo l'etichetta «prezzo da definire»: senza la voce l'editor non sa nemmeno la sua
-- UNITÀ. Una persona o un mezzo con la voce a giornata, aggiunti a mano con 8 ore, finivano
-- salvati come 8 GIORNATE (8 × 248 € invece di 248 €), perché salva mette l'unità della voce
-- e tiene la quantità scritta. Le righe nate dal rapportino erano già a posto (20290629170000);
-- questa chiude la stessa falla sulla strada manuale.
--
-- Una sola chiamata all'apertura dell'editor dà tutto: voce, unità, prezzo e fonte per la
-- manodopera della commessa, per ogni mezzo e per ogni ditta dell'azienda che hanno una voce.
-- Niente costi: la legge anche chi ha solo «Venduto e importi».
-- Idempotente.

create or replace function public.rendiconto_voci_predefinite(p_order_id uuid, p_data date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_o record;
  v_data date := coalesce(p_data, current_date);
  v_man jsonb;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(p_order_id) then
    raise exception 'Non hai il permesso di vedere questa commessa' using errcode = '42501';
  end if;
  select o.id, o.company_id, o.tariffa_manodopera_id into v_o
    from public.orders o where o.id = p_order_id and o.deleted_at is null;
  if not found then return '{}'::jsonb; end if;
  if not coalesce((private.office_order_rights(p_order_id)->>'amounts')::boolean, false) then
    return '{}'::jsonb;
  end if;

  select case when v_o.tariffa_manodopera_id is null then null
              else (private.prezzo_voce_commessa_raw(p_order_id, v_o.tariffa_manodopera_id, v_data)
                    - 'costo_unitario') || jsonb_build_object('listino_voce_id', v_o.tariffa_manodopera_id) end
    into v_man;

  return jsonb_build_object(
    'data', v_data,
    'manodopera', v_man,
    'mezzi', coalesce((
      select jsonb_agg(jsonb_build_object('mezzo_id', m.id, 'listino_voce_id', m.tariffa_id)
                       || ((private.prezzo_voce_commessa_raw(p_order_id, m.tariffa_id, v_data)) - 'costo_unitario'))
        from public.mezzi m
       where m.company_id = v_o.company_id and m.deleted_at is null and m.tariffa_id is not null), '[]'::jsonb),
    'ditte', coalesce((
      select jsonb_agg(jsonb_build_object('subappaltatore_id', s.id, 'listino_voce_id', s.tariffa_id)
                       || ((private.prezzo_voce_commessa_raw(p_order_id, s.tariffa_id, v_data)) - 'costo_unitario'))
        from public.subappaltatori s
       where s.company_id = v_o.company_id and coalesce(s.is_active, true) and s.tariffa_id is not null), '[]'::jsonb));
end;
$function$;

revoke all on function public.rendiconto_voci_predefinite(uuid, date) from public, anon;
grant execute on function public.rendiconto_voci_predefinite(uuid, date) to authenticated;
