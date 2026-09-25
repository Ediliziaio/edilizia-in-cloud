-- Censimento degli accessi: chi può entrare dove, senza scrivere niente.
-- Si lancia intero con execute_sql (MCP Supabase); restituisce una riga per
-- ogni cosa da guardare (sezione, oggetto, dettaglio, righe della tabella).
-- Zero righe = niente da segnalare.
--
-- Sezioni:
--   1 multi-azienda  sottoquery su multi_company_access senza stato o scadenza
--                    (riga dell'utente corrente = da correggere; riga di
--                    un'altra persona = da guardare, di solito è voluta:
--                    staff_permissions, profiles_lettura_authenticated)
--   2 senza blocco   tabelle con company_id senza la RESTRICTIVE
--                    blocco_utente_bloccato (profiles esclusa apposta: il
--                    login legge is_blocked da lì)
--   3 anon           funzioni aperte ad anon con motivo NON CLASSIFICATA
--   4 funzioni       SECURITY DEFINER che leggono multi_company_access senza
--                    la scadenza (da guardare: ruolo_principale_utente e
--                    request_quote_approval guardano un'altra persona, vanno bene)
--   5 per riga       policy che chiamano le funzioni d'accesso senza (SELECT …):
--                    girano una volta per riga (vedi memoria «RLS per riga»)
--
-- Il testo delle policy si legge con search_path vuoto: nomi completi
-- (public.multi_company_access, auth.uid()), come li scrive pg_dump.
set local search_path = '';

with policy_testi as (
  select c.relname as tabella, p.polname as policy, v.lato, v.testo
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  cross join lateral (values
    ('USING', pg_catalog.pg_get_expr(p.polqual, p.polrelid)),
    ('CHECK', pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid))
  ) as v(lato, testo)
  where c.relnamespace = 'public'::pg_catalog.regnamespace and v.testo is not null
),
multi_azienda as (
  -- Il WHERE di ogni sottoquery su multi_company_access, fino a fine riga:
  -- pg_get_expr lo scrive su una riga sola (se contiene altre sottoquery va a
  -- capo e finisce qui come «da guardare»).
  select t.tabella, t.policy, t.lato, m[1] as dove
  from policy_testi t,
       lateral pg_catalog.regexp_matches(
         t.testo, 'FROM public\.multi_company_access(?: [a-z_]+)?\s+WHERE ([^' || chr(10) || ']*)', 'g') as m
)
select '1 multi-azienda' as sezione,
       tabella || '.' || policy || ' [' || lato || ']' as oggetto,
       case when dove like '%.user_id = ( SELECT auth.uid() AS uid)%'
            then 'utente corrente: DA CORREGGERE'
            else 'riga di un''altra persona: da guardare' end
         || case when dove ~ '\.status = ' then ', ha lo stato' else ', senza stato' end
         || case when dove ~ '\.expires_at' then ', ha la scadenza' else ', senza scadenza' end as dettaglio,
       0::bigint as righe
from multi_azienda
where not (dove ~ '\.status = ''active''' and dove ~ '\.expires_at IS NULL')

union all
select '2 senza blocco', c.relname,
       case when c.relrowsecurity then 'RLS attiva, manca la RESTRICTIVE blocco_utente_bloccato'
            else 'RLS SPENTA' end,
       greatest(c.reltuples, 0)::bigint
from pg_catalog.pg_class c
where c.relnamespace = 'public'::pg_catalog.regnamespace and c.relkind in ('r', 'p')
  and c.relname <> 'profiles'
  and exists (select 1 from pg_catalog.pg_attribute a
               where a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped)
  and (not c.relrowsecurity
       or not exists (select 1 from pg_catalog.pg_policy p
                       where p.polrelid = c.oid and not p.polpermissive and p.polname = 'blocco_utente_bloccato'))

union all
select '3 anon', f.nome::text, f.motivo, 0::bigint
from public.v_funzioni_aperte_ad_anon f
where f.motivo like 'NON CLASSIFICATA%'

union all
select '4 funzioni', p.oid::pg_catalog.regprocedure::text,
       'SECURITY DEFINER, legge multi_company_access senza expires_at'
         || case when p.prosrc ~ 'status' then '' else ' né status' end,
       0::bigint
from pg_catalog.pg_proc p
where p.pronamespace = 'public'::pg_catalog.regnamespace and p.prosecdef
  and p.prosrc ~ 'multi_company_access' and p.prosrc !~ 'expires_at'

union all
-- Raggruppata per tabella, le 40 più grandi prima: è lì che una chiamata per
-- riga costa (una policy su 100 righe non si sente, su 100.000 sì).
select '5 per riga', s.tabella,
       s.chiamate || ' chiamate per riga in ' || s.lati || ' USING/CHECK, ~' || s.righe || ' righe'
         || case when s.uca then ', anche user_can_access_company(company_id)' else '' end,
       s.righe
from (
  select n.tabella,
         sum(n.nude)::int as chiamate,
         count(*) as lati,
         bool_or(n.uca) as uca,
         max(greatest(c.reltuples, 0))::bigint as righe
  from (
    select t.tabella,
           pg_catalog.regexp_count(t.testo, 'public\.(has_role|utente_e_cliente_esterno|utente_bloccato|get_user_company_id|get_my_company_id|get_effective_company_id|is_super_admin|has_permission)\(')
             - pg_catalog.regexp_count(t.testo, 'SELECT public\.(has_role|utente_e_cliente_esterno|utente_bloccato|get_user_company_id|get_my_company_id|get_effective_company_id|is_super_admin|has_permission)\(') as nude,
           t.testo ~ 'public\.user_can_access_company\(' as uca
    from policy_testi t
  ) n
  join pg_catalog.pg_class c on c.relname = n.tabella and c.relnamespace = 'public'::pg_catalog.regnamespace
  where n.nude > 0 or n.uca
  group by n.tabella
  order by max(greatest(c.reltuples, 0)) desc
  limit 40
) s

order by 1, 4 desc, 2;
