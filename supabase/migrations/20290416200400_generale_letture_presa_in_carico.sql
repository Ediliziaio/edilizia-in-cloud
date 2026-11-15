-- Commessa generale dai documenti: correzioni della revisione finale (docs/piano-commessa-generale-da-documenti.md).
--
-- 1. Una lettura la porta avanti UN motore alla volta. Prima «avvia» leggeva lo stato e poi lo
--    scriveva: con due schede aperte partivano due catene, ogni gruppo dell'estrazione si pagava
--    due volte e i dati si sovrascrivevano. Ora:
--    - `generale_lettura_avvia` passa lo stato in un solo UPDATE (o non lo passa);
--    - ogni giro prende la lettura con `generale_lettura_prendi` (lease di 3 minuti, rinnovato a
--      ogni passo, intestato al motore del giro); chi non la prende si ferma.
-- 2. Una pagina presa da giri morti tre volte diventa «illeggibile»: la lettura finisce sempre.
-- 3. La stima conta i gruppi veri: per file, a 28.000 caratteri (come `gruppiDiPagine`), con
--    3.000 caratteri per ogni pagina ancora da leggere con l'OCR.
-- 4. «Includi questa pagina»: una pagina esclusa per dati personali si rilegge su richiesta.
-- Nessuna scrittura di righe esistenti: solo colonne nuove e funzioni.

set local lock_timeout = '3s';

alter table public.generale_letture add column if not exists motore uuid;
alter table public.generale_letture add column if not exists lease_fino timestamptz;
alter table public.generale_lettura_pagine add column if not exists includi boolean not null default false;

-- ─── Avvio atomico (solo service role: lo chiama l'edge function dopo il controllo dei permessi) ───
create or replace function public.generale_lettura_avvia(p_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  update public.generale_letture l
     set stato = case when exists (select 1 from public.generale_lettura_pagine p
                                    where p.lettura_id = l.id and p.stato in ('in_coda', 'in_lettura'))
                      then 'in_lettura' else 'estrazione' end,
         errore = null, avviata_at = coalesce(l.avviata_at, now()), motore = null, lease_fino = null, updated_at = now()
   where l.id = p_id
     and (l.stato in ('preparata', 'in_pausa', 'errore')
          or (l.stato in ('in_lettura', 'estrazione') and (l.lease_fino is null or l.lease_fino < now()) and l.updated_at < now() - interval '3 minutes'))
  returning l.stato;
$$;
revoke all on function public.generale_lettura_avvia(uuid) from public, anon, authenticated;
grant execute on function public.generale_lettura_avvia(uuid) to service_role;

-- ─── Presa in carico della lettura da parte di un giro ─────────────────────────
create or replace function public.generale_lettura_prendi(p_id uuid, p_motore uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_preso boolean;
begin
  update public.generale_letture
     set motore = p_motore, lease_fino = now() + interval '3 minutes', updated_at = now()
   where id = p_id and stato in ('in_lettura', 'estrazione')
     and (motore = p_motore or motore is null or lease_fino is null or lease_fino < now())
  returning true into v_preso;
  return coalesce(v_preso, false);
end $$;
revoke all on function public.generale_lettura_prendi(uuid, uuid) from public, anon, authenticated;
grant execute on function public.generale_lettura_prendi(uuid, uuid) to service_role;

-- ─── Pagine: tetto ai tentativi anche per i giri morti ─────────────────────────
create or replace function public.generale_lettura_prendi_pagine(p_id uuid, p_quante integer)
returns setof public.generale_lettura_pagine
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.generale_lettura_pagine
     set stato = 'illeggibile', motivo = 'Lettura interrotta tre volte: ricarica la pagina.', lease_fino = null, updated_at = now()
   where lettura_id = p_id and stato = 'in_lettura' and lease_fino < now() and tentativi >= 3;
  return query
  update public.generale_lettura_pagine g
     set stato = 'in_lettura', lease_fino = now() + interval '3 minutes', tentativi = g.tentativi + 1, updated_at = now()
   where (g.lettura_id, g.file_id, g.numero) in (
     select lettura_id, file_id, numero from public.generale_lettura_pagine
      where lettura_id = p_id
        and (stato = 'in_coda' or (stato = 'in_lettura' and lease_fino < now() and tentativi < 3))
      order by file_id, numero
      limit greatest(1, least(p_quante, 20))
      for update skip locked)
  returning g.*;
end $$;
revoke all on function public.generale_lettura_prendi_pagine(uuid, integer) from public, anon, authenticated;
grant execute on function public.generale_lettura_prendi_pagine(uuid, integer) to service_role;

-- ─── Stima: gruppi veri, per file, a 28.000 caratteri ─────────────────────────
create or replace function public.generale_lettura_stima(p_id uuid)
returns numeric
language sql stable
set search_path = public
as $$
  with per_file as (
    select file_id,
           count(*) filter (where stato in ('in_coda', 'in_lettura')) as da_ocr,
           coalesce(sum(length(testo)) filter (where stato in ('testo', 'ocr')), 0)
             + 3000 * count(*) filter (where stato in ('in_coda', 'in_lettura')) as caratteri
      from public.generale_lettura_pagine where lettura_id = p_id
     group by file_id
  )
  select round(coalesce(sum(0.015 * da_ocr + 0.05 * case when caratteri > 0 then ceil(caratteri / 28000.0) else 0 end), 0), 4)
    from per_file;
$$;
revoke all on function public.generale_lettura_stima(uuid) from public, anon;
grant execute on function public.generale_lettura_stima(uuid) to authenticated, service_role;

-- ─── «Includi questa pagina» ───────────────────────────────────────────────────
-- La pagina torna da leggere (OCR, anche se era testo nativo: il browser ha caricato la pagina a
-- parte) e l'estrazione riparte da capo, perché i gruppi cambiano. Il popup dice il costo.
create or replace function public.generale_lettura_includi_pagina(p_id uuid, p_file text, p_numero integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_company uuid; v_stato text;
begin
  select company_id, stato into v_company, v_stato from public.generale_letture where id = p_id for update;
  if v_company is null or auth.uid() is null
     or public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company) is not true then
    raise exception 'Lettura non trovata' using errcode = '42501';
  end if;
  if v_stato in ('usata', 'annullata') then
    raise exception 'Questa lettura è chiusa: caricane una nuova.' using errcode = '22023';
  end if;
  update public.generale_lettura_pagine
     set stato = 'in_coda', includi = true, tentativi = 0, motivo = 'Inclusa a mano', lease_fino = null, updated_at = now()
   where lettura_id = p_id and file_id = p_file and numero = p_numero and stato = 'esclusa' and percorso is not null;
  if not found then
    raise exception 'Pagina non trovata o non rileggibile.' using errcode = 'P0002';
  end if;
  update public.generale_letture
     set stato = 'in_pausa', errore = 'Pagina inclusa a mano: premi «Riprendi» per leggerla e rifare l''estrazione.',
         gruppi_fatti = 0, gruppi_totali = null, dati = '{}'::jsonb, avvisi = '[]'::jsonb, finita_at = null,
         motore = null, lease_fino = null, updated_at = now()
   where id = p_id;
end $$;
revoke all on function public.generale_lettura_includi_pagina(uuid, text, integer) from public, anon;
grant execute on function public.generale_lettura_includi_pagina(uuid, text, integer) to authenticated;
