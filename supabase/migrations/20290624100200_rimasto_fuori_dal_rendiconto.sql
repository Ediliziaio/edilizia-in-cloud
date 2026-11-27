-- «Rimasto fuori dal rendiconto»: una rete di sicurezza per tutte le sorgenti
-- ────────────────────────────────────────────────────────────────────────────
-- 27/11/2026. Lotto 0 di docs/piano-rendiconto-da-rapportini-verifica.md
--
-- Prima esisteva una sola vista, `v_appalto_rapportini_da_rendicontare`,
-- costruita su `appalto_righe_da_rapportino_calcola`, che calcola SOLO le ore
-- delle persone. Quindi un rapportino con 9 ore di camion e nessuna ora uomo
-- valorizzabile non compariva da nessuna parte: per un'impresa che fattura il
-- trasporto è la voce che pesa. Caso vero del 23/11 su un’impresa in appalto:
-- un camion a tre assi per 9 ore, con la `tariffa_id` del
-- mezzo non impostata, né rendicontato né elencato.
--
-- Qui nasce `rapportino_rimasto_fuori(uuid)`: una riga per ogni cosa che un
-- rapportino approvato ha prodotto e che NON è diventata una riga di
-- rendiconto, col motivo. Quattro sorgenti: manodopera, voci libere, mezzi,
-- materiali. La vista le unisce, e a schermo il riquadro legge la vista: così
-- la pagina e la funzione che crea le righe raccontano la stessa verità.
--
-- Perché la manodopera resta solo sulle commesse d'appalto: la regola la
-- decide già `appalto_righe_da_rapportino_calcola`, che esce da sé su «a
-- corpo» e fuori appalto. Su una commessa cliente le ore stanno dentro il
-- prezzo concordato — elencarle tutte sarebbe rumore, non un avviso. Su
-- quell’impresa sono 79 rapportini con presenze.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ───────────────────────────────────────────────────────────────────────────
-- 1. La riga di rendiconto può venire da un mezzo (la popola il Lotto 6).
--    Serve già qui, perché la rete di sicurezza deve poter dire «questo mezzo
--    è già rendicontato» senza indovinarlo dalla descrizione.
--    `authenticated` ha il GRANT a livello di tabella: una colonna nuova è
--    già coperta, non serve un GRANT per colonna.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.appalto_rendiconto_righe
  add column if not exists mezzo_id uuid references public.mezzi(id) on delete set null;

create index if not exists appalto_rendiconto_mezzo_idx
  on public.appalto_rendiconto_righe (mezzo_id) where mezzo_id is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Che cosa è rimasto fuori, e perché
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.rapportino_rimasto_fuori(p_rapportino_id uuid)
 returns table(
   sorgente text,
   riferimento_id uuid,
   descrizione text,
   quantita numeric,
   unita text,
   vendita_proposta numeric,
   motivo text)
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare v_r record;
begin
  select cr.order_id, cr.company_id, cr.data_lavoro, cr.approvato, cr.annullato_at,
         cr.mezzi_usati, cr.materiali_usati
    into v_r
    from public.campo_rapportini cr
   where cr.id = p_rapportino_id;
  if not found or not coalesce(v_r.approvato, false) or v_r.annullato_at is not null then
    return;
  end if;
  if not exists (select 1 from public.orders o where o.id = v_r.order_id and o.deleted_at is null) then
    return;
  end if;

  -- ── Manodopera ────────────────────────────────────────────────────────
  -- La seconda condizione del NOT EXISTS tiene conto delle righe scritte a
  -- mano dall'ufficio per la stessa persona e lo stesso giorno: se qualcuno
  -- ha già fatturato quella giornata, il riquadro non deve insistere.
  -- `voce_libera_id is null and mezzo_id is null` è quello che tiene la
  -- manodopera separata: senza, una voce libera dello stesso rapportino
  -- (employee_id nullo, maggiorazione 0) avrebbe nascosto gli avvisi
  -- «ditta esterna» e «persona senza scheda dipendente», che escono
  -- anch'essi con employee_id nullo.
  return query
  select 'manodopera'::text,
         c.employee_id,
         coalesce(c.persona, 'Manodopera')::text,
         c.quantita,
         'ora'::text,
         null::numeric,
         c.motivo
    from public.appalto_righe_da_rapportino_calcola(p_rapportino_id) c
   where not exists (
     select 1
       from public.appalto_rendiconto_righe rr
      where (rr.rapportino_id = p_rapportino_id
             and rr.voce_libera_id is null
             and rr.mezzo_id is null
             and rr.employee_id is not distinct from c.employee_id
             and rr.maggiorazione_pct = coalesce(c.maggiorazione_pct, 0))
         or (rr.rapportino_id is null
             and rr.order_id = v_r.order_id
             and rr.data = v_r.data_lavoro
             and c.employee_id is not null
             and rr.employee_id = c.employee_id));

  -- ── Voci libere ───────────────────────────────────────────────────────
  -- Dal 27/11 una voce con un prezzo diventa SEMPRE una riga (qualunque tipo
  -- di commessa). Quindi qui resta chi non ha un prezzo: ed è il caso vero,
  -- non un'ipotesi.
  return query
  select 'voce_libera'::text,
         v.id,
         v.descrizione,
         v.quantita,
         v.unita,
         v.vendita_proposta,
         case
           when coalesce(v.vendita_unitaria, 0) <= 0
             then 'Prezzo di vendita non indicato: mettilo sulla voce, oppure scrivi la riga a mano'
           else 'Voce con un prezzo ma senza riga di rendiconto: riapprova il rapportino'
         end
    from public.rapportino_voci_libere v
   where v.rapportino_id = p_rapportino_id
     and not exists (
       select 1 from public.appalto_rendiconto_righe rr where rr.voce_libera_id = v.id);

  -- ── Mezzi ─────────────────────────────────────────────────────────────
  -- Il prezzo proposto esce dalla regola unica del listino
  -- (`private.prezzo_voce_commessa_raw`: eccezione di cantiere → listino del
  -- committente → listino generale), non da un calcolo nuovo.
  -- Un mezzo già scritto a mano come voce di trasporto (quelle con l'oggetto
  -- `viaggio`, che è come quell'impresa registra i trasporti oggi) non si elenca
  -- due volte.
  return query
  with usati as (
    select case when m->>'mezzo_id' ~* '^[0-9a-f-]{36}$' then (m->>'mezzo_id')::uuid end as mezzo_id,
           coalesce(nullif(btrim(m->>'nome'), ''), 'Mezzo') as nome,
           case when m->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' then replace(m->>'ore', ',', '.')::numeric end as ore
      from jsonb_array_elements(
             case when jsonb_typeof(v_r.mezzi_usati) = 'array' then v_r.mezzi_usati else '[]'::jsonb end) m
  ), con_prezzo as (
    select u.*,
           mz.id as mezzo_vero,
           mz.tariffa_id,
           nullif((private.prezzo_voce_commessa_raw(v_r.order_id, mz.tariffa_id, v_r.data_lavoro)->>'prezzo')::numeric, 0) as prezzo
      from usati u
      left join public.mezzi mz on mz.id = u.mezzo_id
  )
  select 'mezzo'::text,
         p.mezzo_id,
         p.nome,
         p.ore,
         'ora'::text,
         p.prezzo,
         case
           when p.mezzo_vero is null then 'Mezzo non più in anagrafica: scrivi la riga a mano'
           when p.tariffa_id is null then 'Il mezzo non ha una voce di listino per la vendita: impostala sulla scheda del mezzo, oppure scrivi la riga a mano'
           when p.prezzo is null then 'Prezzo del mezzo da definire nel listino'
           when coalesce(p.ore, 0) <= 0 then 'Ore del mezzo non indicate nel rapportino'
         end
    from con_prezzo p
   where not exists (
       select 1 from public.rapportino_voci_libere v
        where v.rapportino_id = p_rapportino_id
          and v.viaggio is not null
          and (nullif(btrim(v.viaggio->>'mezzo'), '') is null
               or p.nome ilike '%' || btrim(v.viaggio->>'mezzo') || '%'))
     and not exists (
       select 1 from public.appalto_rendiconto_righe rr
        where rr.rapportino_id = p_rapportino_id
          and rr.mezzo_id is not null
          and rr.mezzo_id is not distinct from p.mezzo_id);

  -- ── Materiali ─────────────────────────────────────────────────────────
  -- In quell'impresa questo campo è sempre vuoto (0 rapportini su 104: il materiale
  -- lo scrivono nelle voci libere). Resta perché altre aziende lo usano, e
  -- perché un materiale segnato e mai fatturato è lo stesso problema.
  return query
  with usati as (
    select coalesce(nullif(btrim(m->>'nome'), ''), 'Materiale') as nome,
           case when m->>'quantita' ~ '^[0-9]+([.,][0-9]+)?$' then replace(m->>'quantita', ',', '.')::numeric end as q,
           coalesce(nullif(btrim(m->>'unita'), ''), 'cad') as unita
      from jsonb_array_elements(
             case when jsonb_typeof(v_r.materiali_usati) = 'array' then v_r.materiali_usati else '[]'::jsonb end) m
  )
  select 'materiale'::text, null::uuid, u.nome, u.q, u.unita, null::numeric,
         'I materiali segnati in cantiere non si valorizzano da soli: aggiungili come voce del rapportino, oppure scrivi la riga a mano'::text
    from usati u;
end;
$function$;

revoke all on function public.rapportino_rimasto_fuori(uuid) from public, anon;
grant execute on function public.rapportino_rimasto_fuori(uuid) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. La vista che legge la pagina
-- ───────────────────────────────────────────────────────────────────────────
-- I controlli di permesso stanno nel WHERE, come nella vista che sostituisce:
-- la funzione è SECURITY DEFINER perché deve leggere le presenze, quindi il
-- filtro per chi guarda va messo qui e non può essere dimenticato.

drop view if exists public.v_rapportini_da_rendicontare;

create view public.v_rapportini_da_rendicontare as
select cr.id as rapportino_id,
       cr.company_id,
       cr.order_id,
       cr.data_lavoro,
       cr.user_id,
       f.sorgente,
       f.riferimento_id,
       f.descrizione,
       f.quantita,
       f.unita,
       f.vendita_proposta,
       f.motivo
  from public.campo_rapportini cr
  join public.orders o on o.id = cr.order_id and o.deleted_at is null
  cross join lateral public.rapportino_rimasto_fuori(cr.id) f
 where cr.approvato
   and cr.annullato_at is null
   and public.puo_vedere_commessa(cr.order_id)
   and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', cr.company_id);

revoke all on public.v_rapportini_da_rendicontare from public, anon;
grant select on public.v_rapportini_da_rendicontare to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Via la vista vecchia
-- ───────────────────────────────────────────────────────────────────────────
-- Non la usa nessun altro (cercato in src/ e supabase/), e lasciarla in piedi
-- sarebbe pericoloso: da quando le righe da voce libera hanno `rapportino_id`
-- valorizzato, il suo NOT EXISTS può NASCONDERE gli avvisi di manodopera che
-- escono con employee_id nullo («ditta esterna», «persona senza scheda»).
drop view if exists public.v_appalto_rapportini_da_rendicontare;
