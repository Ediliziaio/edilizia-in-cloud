-- Backup dell'area super admin, a blocchi.
--
-- Il backup settimanale (company-backup + admin_esporta_azienda) saltava
-- l'azienda della piattaforma, in due punti: il filtro della funzione e un
-- RAISE in admin_esporta_azienda («non si esporta con questo strumento»). Il
-- motivo è il peso: ~96.000 contatti, ~90.000 attività, ~58.000 invii in coda
-- e ~57.000 iscrizioni ai flussi, circa 170 MB in tabella — un JSON unico
-- non sta nella memoria di una edge function.
--
-- Il 19/09/2026 è costato caro: 20 automazioni cancellate per sbaglio e
-- nessuna copia da cui ripartire. Adesso l'area super admin si salva a pezzi:
-- un file per tabella, le tabelle grandi divise in blocchi, e un indice.
--
-- Qui le due funzioni che servono alla edge function:
-- - admin_tabelle_con_dati(azienda): quali tabelle del catalogo di backup
--   hanno righe di quell'azienda, e quante;
-- - admin_esporta_blocco(azienda, tabella, dopo, limite): un blocco di righe,
--   in ordine di id, dal cursore «dopo» in avanti (paginazione per chiave:
--   niente OFFSET, che su 96.000 righe rileggerebbe tutto a ogni blocco).
-- Tutte e due riservate al super admin o al servizio, come admin_esporta_azienda.

create or replace function public.admin_tabelle_con_dati(p_company_id uuid)
returns table (tabella text, righe bigint)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_tabella text;
  v_n bigint;
begin
  if not public.is_super_admin(auth.uid()) and current_user <> 'service_role'
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Riservato al super admin' using errcode = '42501';
  end if;

  for v_tabella in select t.tabella from public.admin_tabelle_da_esportare() t order by t.tabella loop
    execute format('select count(*) from public.%I where company_id = $1', v_tabella) into v_n using p_company_id;
    if v_n > 0 then
      tabella := v_tabella;
      righe := v_n;
      return next;
    end if;
  end loop;
end
$$;

create or replace function public.admin_esporta_blocco(
  p_company_id uuid,
  p_tabella    text,
  p_dopo       text default null,
  p_limite     int  default 5000
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_tipo_id text;
  v_righe   jsonb;
  v_n       int;
  v_ultimo  text;
begin
  if not public.is_super_admin(auth.uid()) and current_user <> 'service_role'
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Riservato al super admin' using errcode = '42501';
  end if;
  if not exists (select 1 from public.admin_tabelle_da_esportare() t where t.tabella = p_tabella) then
    raise exception 'La tabella % non è nel catalogo del backup', p_tabella;
  end if;
  if p_limite is null or p_limite < 1 or p_limite > 20000 then
    raise exception 'Limite % fuori misura (1-20000)', p_limite;
  end if;

  select format_type(a.atttypid, a.atttypmod) into v_tipo_id
    from pg_attribute a
   where a.attrelid = ('public.' || quote_ident(p_tabella))::regclass
     and a.attname = 'id' and not a.attisdropped;

  if v_tipo_id is null then
    -- Senza colonna id (tabelle di collegamento, piccole): un blocco solo.
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb), count(*) from public.%I t where t.company_id = $1', p_tabella)
      into v_righe, v_n using p_company_id;
    return jsonb_build_object('righe', v_righe, 'n', v_n, 'ultimo', null, 'finito', true);
  end if;

  execute format($f$
    with blocco as (
      select * from public.%1$I t
      where t.company_id = $1 and ($2::text is null or t.id > $2::%2$s)
      order by t.id
      limit $3
    )
    select coalesce(jsonb_agg(to_jsonb(b) order by b.id), '[]'::jsonb),
           count(*),
           (select b2.id::text from blocco b2 order by b2.id desc limit 1)
      from blocco b
  $f$, p_tabella, v_tipo_id)
    into v_righe, v_n, v_ultimo using p_company_id, p_dopo, p_limite;

  return jsonb_build_object('righe', v_righe, 'n', v_n, 'ultimo', v_ultimo, 'finito', v_n < p_limite);
end
$$;

revoke all on function public.admin_tabelle_con_dati(uuid) from public, anon;
revoke all on function public.admin_esporta_blocco(uuid, text, text, int) from public, anon;
grant execute on function public.admin_tabelle_con_dati(uuid) to authenticated, service_role;
grant execute on function public.admin_esporta_blocco(uuid, text, text, int) to authenticated, service_role;
