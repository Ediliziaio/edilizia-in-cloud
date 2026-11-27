-- Rendiconto giornaliero: si vede quali rapportini ci sono dentro, e si possono riprendere
-- ───────────────────────────────────────────────────────────────────────────────────────
-- 27/11/2026, dal collaudo. Un rapportino entra nel rendiconto del giorno e resta segnato come
-- «già preso» (rendiconto_giornaliero_rapportini). Se poi l'ufficio salva il foglio senza le sue
-- righe — tolte per errore, o perché stava sistemando — quel rapportino non torna più: né
-- «Crea dai rapportini» né il rendiconto del giorno lo ripropongono, e l'unico modo era
-- annullare tutto il rendiconto. Lavoro vero che non arriva mai al committente: nei dati di
-- prova 14 rapportini erano in questo stato, 12 dentro rendiconti già confermati.
--
-- Qui non si cambia la regola (togliere una riga resta una scelta dell'ufficio, e non la
-- rimettiamo a sorpresa): si rende visibile e si dà il comando per riprendere.
--  * rendiconto_giornaliero_rapportini_dentro(id): quali rapportini sono dentro e con quante righe;
--  * rendiconto_giornaliero_riprendi(id, rapportino): sulla bozza, slega il rapportino e ne
--    riprende le voci.
-- In più: la ricerca nel listino del committente calcolava il prezzo di TUTTE le voci del
-- contratto prima di tagliare col limite (44 ms, 5.000 buffer): ora taglia prima.
-- Idempotente.

-- 1. Chi c'è dentro ─────────────────────────────────────────────────────────────────────────
create or replace function public.rendiconto_giornaliero_rapportini_dentro(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare v_rg record;
begin
  select g.id, g.order_id, g.data into v_rg from public.rendiconti_giornalieri g where g.id = p_id;
  if not found then return '[]'::jsonb; end if;
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(v_rg.order_id) then
    raise exception 'Non hai il permesso di vedere questa commessa' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'rapportino_id', cr.id,
             'autore', btrim(concat_ws(' ', e.first_name, e.last_name)),
             'descrizione', nullif(btrim(cr.descrizione_lavori), ''),
             'stato', cr.stato,
             'ritirato', cr.stato = 'rifiutato' or cr.annullato_at is not null,
             'righe', (select count(*) from public.appalto_rendiconto_righe r
                        where r.rendiconto_giornaliero_id = p_id and r.da_rapportino_id = cr.id))
           order by cr.created_at)
      from public.rendiconto_giornaliero_rapportini l
      join public.campo_rapportini cr on cr.id = l.rapportino_id
      left join public.employees e on e.user_id = cr.user_id and e.company_id = cr.company_id
     where l.rendiconto_giornaliero_id = p_id), '[]'::jsonb);
end;
$function$;

-- 2. Riprendere le voci di un rapportino ────────────────────────────────────────────────────
create or replace function public.rendiconto_giornaliero_riprendi(p_id uuid, p_rapportino_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare v_rg record;
begin
  select g.id, g.order_id, g.data, g.stato, g.numero into v_rg
    from public.rendiconti_giornalieri g where g.id = p_id;
  if not found then raise exception 'Rendiconto inesistente' using errcode = '23514'; end if;
  perform private.rendiconto_giornaliero_puo_scrivere(v_rg.order_id);
  if v_rg.stato <> 'bozza' then
    raise exception 'Il rendiconto n. % è %: riaprilo per riprendere le voci', v_rg.numero, v_rg.stato
      using errcode = '23514';
  end if;
  if not exists (select 1 from public.rendiconto_giornaliero_rapportini l
                  where l.rendiconto_giornaliero_id = p_id and l.rapportino_id = p_rapportino_id) then
    raise exception 'Questo rapportino non è in questo rendiconto' using errcode = '23514';
  end if;
  -- Le righe ancora dentro restano: si riprende solo quello che manca.
  delete from public.appalto_rendiconto_righe
   where rendiconto_giornaliero_id = p_id and da_rapportino_id = p_rapportino_id;
  delete from public.rendiconto_giornaliero_rapportini where rapportino_id = p_rapportino_id;
  return public.rendiconto_giornaliero_del_giorno(v_rg.order_id, v_rg.data);
end;
$function$;

-- 3. Ricerca nel listino del committente: il limite prima del calcolo del prezzo ─────────────
create or replace function public.rendiconto_listino_committente(p_order_id uuid, p_data date, p_testo text default '', p_limite integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare v_testo text := btrim(coalesce(p_testo, '')); v_out jsonb; v_costi boolean;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(p_order_id) then
    raise exception 'Non hai il permesso di vedere questa commessa' using errcode = '42501';
  end if;
  if not coalesce((private.office_order_rights(p_order_id)->>'amounts')::boolean, false) then
    return '[]'::jsonb;
  end if;
  v_costi := coalesce((private.office_order_rights(p_order_id)->>'costs')::boolean, false);
  select coalesce(jsonb_agg(z.p order by y.ord, y.descr), '[]'::jsonb) into v_out
    from (
      select at.id, at.tipo, at.tariffa_id is not null as collegata,
             case when v_testo <> '' and lower(coalesce(at.codice, '')) = lower(v_testo) then 0 else 1 end as ord,
             lower(at.descrizione) as descr
        from public.orders o
        join public.appalto_contratti c on c.company_id = o.company_id
         and (c.id = o.appalto_contratto_id
              or (o.appalto_contratto_id is null and o.customer_id is not null and c.committente_id = o.customer_id and c.attivo
                  and c.valido_dal <= coalesce(p_data, current_date)
                  and (c.valido_al is null or c.valido_al >= coalesce(p_data, current_date))))
        join public.appalto_tariffe at on at.contratto_id = c.id and at.attivo
       where o.id = p_order_id
         and (v_testo = '' or at.descrizione ilike '%' || v_testo || '%' or coalesce(at.codice, '') ilike '%' || v_testo || '%')
       order by ord, descr
       limit greatest(1, least(coalesce(p_limite, 30), 100))
    ) y
   cross join lateral (
     select case when v_costi then x.v else x.v - 'costo_unitario' end as p
       from (select private.prezzo_tariffa_committente(p_order_id, y.id, p_data)
                    || jsonb_build_object('tipo', y.tipo, 'collegata', y.collegata) as v) x
   ) z
   where z.p is not null;
  return v_out;
end;
$function$;

revoke all on function public.rendiconto_giornaliero_rapportini_dentro(uuid) from public, anon;
revoke all on function public.rendiconto_giornaliero_riprendi(uuid, uuid) from public, anon;
grant execute on function public.rendiconto_giornaliero_rapportini_dentro(uuid) to authenticated;
grant execute on function public.rendiconto_giornaliero_riprendi(uuid, uuid) to authenticated;
