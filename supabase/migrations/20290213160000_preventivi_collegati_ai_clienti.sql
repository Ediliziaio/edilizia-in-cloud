-- I preventivi già fatti, collegati ai loro clienti e committenti (10/11/2026).
--
-- Dal 20290213150000 un preventivo si lega al profilo (cliente o committente) con quotes.customer_id, e le
-- schede cliente e committente lo leggono così. I preventivi fatti prima non hanno il legame: qui lo si scrive
-- SOLO quando l'abbinamento è certo e unico dentro la stessa azienda.
--
-- Regole (un preventivo con customer_id vuoto e non cancellato, un profilo cliente della sua azienda):
--   · stessa P.IVA       quotes.client_vat_number   = profiles.vat_number   o anagrafiche_native.partita_iva
--   · stesso cod. fiscale quotes.client_fiscal_code = profiles.fiscal_code  o anagrafiche_native.codice_fiscale
--   · stessa email        quotes.client_email       = profiles.email        o anagrafiche_native.email
--                         (la stessa che usa scheda_cliente: minuscole, senza spazi; mai il segnaposto
--                         @no-email.ediliziaincloud.local, che non è un indirizzo)
-- P.IVA: solo cifre, senza «IT», 11 cifre e non tutte zero. Codice fiscale: 16 caratteri nel formato giusto
-- oppure 11 cifre (le società). Valori vuoti o malformati non abbinano niente.
--
-- Non si collega:
--   · se le regole portano a più di un profilo (es. la stessa email su sette clienti di prova);
--   · se il preventivo ha un contatto CRM (contact_id) che è di un ALTRO profilo: i due legami si
--     contraddirebbero. Il contatto da solo non collega (non è tra le regole), ma può impedire.
-- Profilo cliente = ruolo 'customer' e nessun ruolo da staff, non cancellato.
--
-- Contati il 10/11/2026 (sola lettura): 299 preventivi senza cliente; 102 si collegano, tutti per email
-- (Demo Azienda 2: 96, Dimora Torino: 3, Holzbau Brugger: 2, New Habitat: 1); 2 ambigui (Demo Azienda:
-- PREV-2026-0001 e 0002, email contatto@esempio.it su sette profili); nessuno ha P.IVA o codice fiscale
-- scritti nel preventivo; nessun contatto CRM in contrasto.
--
-- Il legame non cambia il preventivo: niente updated_at nuovo, niente version + 1 (un editor aperto non
-- deve vedersi rifiutare il salvataggio), niente riga di registro «Preventivo modificato» per ognuno. Per
-- questo l'UPDATE gira con session_replication_role = replica (come demo_scenario_applica e
-- rapportino_costo_recupera), e i controlli che i trigger farebbero sono scritti qui:
--   · trg_quotes_cliente_stessa_azienda → il profilo è scelto tra quelli della stessa azienda (join su
--     company_id) e la verifica finale annulla tutto se una sola riga collegata non torna;
--   · la chiave esterna su profiles → il profilo viene da una select su profiles, e la verifica finale la
--     ricontrolla.
-- Poche righe (un centinaio): un UPDATE solo, con lock_timeout e statement_timeout. Se fallisce per timeout,
-- la si rilancia: tocca solo i customer_id ancora vuoti.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temporary table tmp_preventivi_clienti on commit drop as
with clienti as (
  select p.id, p.company_id, p.email, p.vat_number, p.fiscal_code, p.marketing_contact_id
    from public.profiles p
   where p.deleted_at is null and p.company_id is not null
     and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'customer')
     and not exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role <> 'customer')
),
chiavi_profilo as (
  select c.id as profilo_id, c.company_id, 'piva' as regola, c.vat_number as v from clienti c
  union all select c.id, c.company_id, 'cf', c.fiscal_code from clienti c
  union all select c.id, c.company_id, 'email', c.email from clienti c
  union all select c.id, c.company_id, 'contatto', c.marketing_contact_id::text from clienti c
  union all select c.id, c.company_id, 'piva', a.partita_iva
              from clienti c join public.anagrafiche_native a on a.cliente_id = c.id and a.company_id = c.company_id
  union all select c.id, c.company_id, 'cf', a.codice_fiscale
              from clienti c join public.anagrafiche_native a on a.cliente_id = c.id and a.company_id = c.company_id
  union all select c.id, c.company_id, 'email', a.email
              from clienti c join public.anagrafiche_native a on a.cliente_id = c.id and a.company_id = c.company_id
),
da_collegare as (
  select q.id, q.company_id, q.client_vat_number, q.client_fiscal_code, q.client_email, q.contact_id
    from public.quotes q
   where q.customer_id is null and q.deleted_at is null and q.company_id is not null
),
chiavi_preventivo as (
  select q.id as quote_id, q.company_id, 'piva' as regola, q.client_vat_number as v from da_collegare q
  union all select q.id, q.company_id, 'cf', q.client_fiscal_code from da_collegare q
  union all select q.id, q.company_id, 'email', q.client_email from da_collegare q
  union all select q.id, q.company_id, 'contatto', q.contact_id::text from da_collegare q
),
-- La stessa normalizzazione per i due lati.
norm_profilo as (
  select k.profilo_id, k.company_id, k.regola, case k.regola
      when 'piva' then (select n from (select regexp_replace(regexp_replace(upper(k.v), '[^A-Z0-9]', '', 'g'), '^IT(?=[0-9]{11}$)', '') as n) s
                         where n ~ '^[0-9]{11}$' and n !~ '^0+$')
      when 'cf' then (select n from (select regexp_replace(upper(k.v), '[^A-Z0-9]', '', 'g') as n) s
                       where n ~ '^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$'
                          or (n ~ '^[0-9]{11}$' and n !~ '^0+$'))
      when 'email' then (select n from (select lower(btrim(k.v)) as n) s
                          where n ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and n not like '%@no-email.ediliziaincloud.local')
      else k.v end as valore
    from chiavi_profilo k
),
norm_preventivo as (
  select k.quote_id, k.company_id, k.regola, case k.regola
      when 'piva' then (select n from (select regexp_replace(regexp_replace(upper(k.v), '[^A-Z0-9]', '', 'g'), '^IT(?=[0-9]{11}$)', '') as n) s
                         where n ~ '^[0-9]{11}$' and n !~ '^0+$')
      when 'cf' then (select n from (select regexp_replace(upper(k.v), '[^A-Z0-9]', '', 'g') as n) s
                       where n ~ '^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$'
                          or (n ~ '^[0-9]{11}$' and n !~ '^0+$'))
      when 'email' then (select n from (select lower(btrim(k.v)) as n) s
                          where n ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and n not like '%@no-email.ediliziaincloud.local')
      else k.v end as valore
    from chiavi_preventivo k
),
abbinamenti as (
  select distinct qp.quote_id, qp.company_id, qp.regola, pp.profilo_id
    from norm_preventivo qp
    join norm_profilo pp on pp.company_id = qp.company_id and pp.regola = qp.regola and pp.valore = qp.valore
   where qp.valore is not null and pp.valore is not null
),
per_preventivo as (
  select a.quote_id, a.company_id, count(distinct a.profilo_id) as profili, min(a.profilo_id::text)::uuid as profilo_id
    from abbinamenti a
   where a.regola <> 'contatto'
   group by a.quote_id, a.company_id
)
select pp.quote_id, pp.company_id, pp.profilo_id
  from per_preventivo pp
 where pp.profili = 1
   and not exists (select 1 from abbinamenti c
                    where c.quote_id = pp.quote_id and c.regola = 'contatto' and c.profilo_id <> pp.profilo_id);

set local session_replication_role = replica;

update public.quotes q
   set customer_id = t.profilo_id
  from tmp_preventivi_clienti t
 where q.id = t.quote_id
   and q.company_id = t.company_id
   and q.customer_id is null
   and q.deleted_at is null;

set local session_replication_role = origin;

-- Verifica: ogni preventivo collegato punta a un profilo che esiste ed è della sua azienda. Se no, si annulla tutto.
do $$
declare
  v_rotti int;
  v_collegati int;
begin
  select count(*) into v_rotti
    from public.quotes q
   where q.customer_id is not null
     and not exists (select 1 from public.profiles p where p.id = q.customer_id and p.company_id = q.company_id);
  if v_rotti > 0 then
    raise exception 'preventivi_collegati_ai_clienti: % preventivi legati a un profilo di un''altra azienda o inesistente', v_rotti;
  end if;
  select count(*) into v_collegati
    from public.quotes q join tmp_preventivi_clienti t on t.quote_id = q.id and q.customer_id = t.profilo_id;
  raise notice 'preventivi_collegati_ai_clienti: % preventivi collegati', v_collegati;
end $$;
