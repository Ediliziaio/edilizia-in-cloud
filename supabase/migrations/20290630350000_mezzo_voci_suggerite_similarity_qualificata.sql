-- `similarity` va qualificata: con `search_path = ''` niente si trova da sé
-- ────────────────────────────────────────────────────────────────────────
-- 28/11/2026. `mezzo_voci_suggerite` usa `similarity` di pg_trgm, che su questo progetto è
-- installata in `public`. Con `set search_path = ''` la funzione non la trovava:
--
--     ERROR 42883: function similarity(text, text) does not exist
--
-- Qui è `public.similarity`, e la funzione è quella definitiva: propone le voci del committente e
-- quelle generali di tipo nolo o altro che somigliano al nome del mezzo, oltre 0,12 di somiglianza,
-- le più somiglianti per prime. Provata su «MAN CAMION 3 ASSI · HE749NF»: la prima è «Camion 3 assi
-- - a freddo» (35 euro l'ora, somiglianza 0,54).
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

create or replace function public.mezzo_voci_suggerite(p_order uuid, p_mezzo uuid, p_limite integer default 6)
returns table (
  listino_voce_id uuid,
  appalto_tariffa_id uuid,
  descrizione text,
  unita text,
  prezzo numeric,
  fonte text,
  somiglianza real
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare o record; m record; v_nome text;
begin
  select x.id, x.company_id, x.customer_id, x.appalto_contratto_id into o
    from public.orders x where x.id = p_order and x.deleted_at is null;
  if not found then return; end if;
  if (select auth.uid()) is null
     or not (public.has_permission_for_company((select auth.uid()), 'can_view_orders', o.company_id)
             or public.user_assigned_to_order(p_order)) then
    return;
  end if;
  select z.id, z.nome, z.targa into m from public.mezzi z where z.id = p_mezzo and z.company_id = o.company_id;
  if not found then return; end if;
  v_nome := private.nome_confrontabile(m.nome);
  if v_nome is null then return; end if;

  return query
    select null::uuid, at.id, at.descrizione, at.unita_misura, at.prezzo_unitario, 'committente'::text,
           public.similarity(private.nome_confrontabile(at.descrizione), v_nome) as somiglianza
      from public.appalto_tariffe at
      join public.appalto_contratti c on c.id = at.contratto_id and c.company_id = o.company_id
     where at.attivo
       and (c.id = o.appalto_contratto_id
            or (o.customer_id is not null and c.committente_id = o.customer_id and c.attivo))
       and public.similarity(private.nome_confrontabile(at.descrizione), v_nome) > 0.12
    union all
    select ta.id, null::uuid, ta.nome, ta.unita, ta.prezzo_vendita, 'generale'::text,
           public.similarity(private.nome_confrontabile(ta.nome), v_nome) as somiglianza
      from public.tariffe_aziendali ta
     where ta.company_id = o.company_id and coalesce(ta.attivo, true)
       and ta.tipo in ('nolo', 'altro')
       and public.similarity(private.nome_confrontabile(ta.nome), v_nome) > 0.12
     order by 7 desc, 3
     limit coalesce(p_limite, 6);
end;
$function$;

revoke all on function public.mezzo_voci_suggerite(uuid, uuid, integer) from public, anon;
grant execute on function public.mezzo_voci_suggerite(uuid, uuid, integer) to authenticated;

comment on function public.mezzo_voci_suggerite(uuid, uuid, integer) is
  'Le voci di listino che somigliano al nome del mezzo: prima quelle del committente, poi quelle generali di tipo nolo. Propone, non applica.';
