-- Rapportino trasporti → registro viaggi del mezzo (25/11/2026).
--
-- Chi scrive i trasporti nei rapportini (es. un'impresa con 38 mezzi e il registro viaggi vuoto) non li
-- vedeva né nella mappa Mezzi né nello storico del mezzo né nei km della commessa: il registro lo
-- riempiva solo chi apriva la scheda del mezzo. Ora un viaggio del rapportino col mezzo scelto
-- dall'elenco (viaggio.mezzoId) diventa, ad approvazione, un viaggio «inviato» nel registro di quel
-- mezzo: una riga per mezzo e rapportino, una tratta per voce (carico → scarico, km, ore mezzo),
-- attribuita alla commessa del rapportino.
--
-- - Un solo punto: private.rapportino_registro_viaggi(rapportino), idempotente. Lo chiamano i trigger
--   sul rapportino (stato, approvazione, annullamento) e sulle voci (correzioni dopo l'approvazione).
-- - Rapportino non più approvato (rifiutato, annullato, riaperto) o mezzo tolto: il viaggio passa ad
--   «annullato», non si cancella (il registro tiene la storia in mezzi_viaggi_eventi).
-- - Un viaggio già verificato dall'ufficio nel registro non si tocca più dal rapportino.
-- - Orari: il rapportino ha solo il giorno. Partenza alle 07:00 (ora italiana), durata = ore mezzo
--   delle tratte, almeno 30 minuti.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.mezzi_viaggi
  add column if not exists rapportino_id uuid references public.campo_rapportini(id) on delete set null;
create unique index if not exists mezzi_viaggi_rapportino_mezzo_uniq
  on public.mezzi_viaggi (rapportino_id, mezzo_id) where rapportino_id is not null;

create or replace function private.rapportino_registro_viaggi(p_rapportino uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.campo_rapportini;
  g record;
  v public.mezzi_viaggi;
  approvato boolean;
  autore uuid;
  minuti numeric;
  inizio timestamptz;
  fine timestamptz;
  tenuti uuid[] := '{}';
begin
  select * into r from public.campo_rapportini where id = p_rapportino;
  if not found then return; end if;
  approvato := r.annullato_at is null and (r.stato = 'approvato' or (r.stato is null and r.approvato is true));
  autore := coalesce((select auth.uid()), r.approvato_da, r.ufficio_created_by, r.user_id);

  if approvato and autore is not null and exists (select 1 from public.profiles p where p.id = autore) then
    for g in
      select mz.id mezzo_id,
        jsonb_agg(jsonb_build_object(
          'id', 'rapportino-' || vl.id::text,
          'da', left(coalesce(nullif(btrim(vl.viaggio->>'carico'), ''), 'Sede'), 250),
          'a', left(coalesce(nullif(btrim(vl.viaggio->>'scarico'), ''),
                 nullif(concat_ws(' · ', o.order_code, nullif(btrim(o.work_address), '')), ''), 'Cantiere'), 250),
          'order_id', r.order_id,
          'km', case when jsonb_typeof(vl.viaggio->'km') = 'number' and (vl.viaggio->>'km')::numeric between 0 and 10000
                     then (vl.viaggio->>'km')::numeric end,
          'minuti', case when jsonb_typeof(vl.viaggio->'oreMezzo') = 'number' and (vl.viaggio->>'oreMezzo')::numeric between 0 and 48
                         then round((vl.viaggio->>'oreMezzo')::numeric * 60) end,
          'destinazione', 'commessa',
          'fonte', 'dichiarati'
        ) order by vl.created_at, vl.id) tratte,
        count(*) quante
      from public.rapportino_voci_libere vl
      join public.mezzi mz
        on mz.id::text = vl.viaggio->>'mezzoId' and mz.company_id = r.company_id and mz.deleted_at is null
       and mz.contatore_unita = 'km' and mz.tipo in ('autovettura', 'furgone', 'autocarro', 'altro')
      join public.orders o on o.id = r.order_id and o.company_id = r.company_id
      where vl.rapportino_id = r.id
        and jsonb_typeof(vl.viaggio) = 'object'
        and (vl.viaggio->>'mezzoId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      group by mz.id
    loop
      if g.quante > 30 then continue; end if;
      select coalesce(sum((t->>'minuti')::numeric), 0) into minuti
        from jsonb_array_elements(g.tratte) t where jsonb_typeof(t->'minuti') = 'number';
      inizio := (r.data_lavoro + time '07:00') at time zone 'Europe/Rome';
      fine := inizio + make_interval(mins => least(greatest(minuti, 30), 47 * 60)::int);

      select * into v from public.mezzi_viaggi where rapportino_id = r.id and mezzo_id = g.mezzo_id for update;
      if found then
        tenuti := tenuti || v.id;
        if v.stato = 'verificato' then continue; end if;
        if v.stato = 'inviato' and v.tratte = g.tratte and v.partenza = inizio and v.arrivo = fine then continue; end if;
        update public.mezzi_viaggi
           set tratte = g.tratte, partenza = inizio, arrivo = fine, stato = 'inviato',
               versione = versione + 1, ultimo_token = gen_random_uuid(), updated_at = now()
         where id = v.id returning * into v;
      else
        insert into public.mezzi_viaggi (id, company_id, mezzo_id, created_by, partenza, arrivo, tratte, note,
                                         stato, ultimo_token, ultima_richiesta, rapportino_id)
        values (gen_random_uuid(), r.company_id, g.mezzo_id, autore, inizio, fine, g.tratte,
                'Dal rapportino del ' || to_char(r.data_lavoro, 'DD/MM/YYYY'),
                'inviato', gen_random_uuid(), '{}'::jsonb, r.id)
        returning * into v;
        tenuti := tenuti || v.id;
      end if;
      insert into public.mezzi_viaggi_eventi (company_id, viaggio_id, actor, versione, azione, motivo, fotografia)
      values (v.company_id, v.id, autore, v.versione, 'invia', 'Dal rapportino approvato',
              to_jsonb(v) - 'ultima_richiesta' - 'ultimo_token');
    end loop;
  end if;

  -- Quello che il rapportino non porta più: annullato, salvo i viaggi già verificati dall'ufficio.
  for v in
    select * from public.mezzi_viaggi
     where rapportino_id = r.id and stato in ('bozza', 'inviato') and not (id = any(tenuti))
     for update
  loop
    update public.mezzi_viaggi
       set stato = 'annullato', versione = versione + 1, ultimo_token = gen_random_uuid(), updated_at = now()
     where id = v.id returning * into v;
    insert into public.mezzi_viaggi_eventi (company_id, viaggio_id, actor, versione, azione, motivo, fotografia)
    values (v.company_id, v.id, coalesce(autore, v.created_by), v.versione, 'annulla', 'Rapportino non più approvato o viaggio tolto',
            to_jsonb(v) - 'ultima_richiesta' - 'ultimo_token');
  end loop;
end
$$;
revoke all on function private.rapportino_registro_viaggi(uuid) from public, anon, authenticated;

create or replace function private.rapportino_registro_viaggi_trg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'campo_rapportini' then
    perform private.rapportino_registro_viaggi(new.id);
  elsif tg_op = 'DELETE' then
    perform private.rapportino_registro_viaggi(old.rapportino_id);
  else
    perform private.rapportino_registro_viaggi(new.rapportino_id);
    if tg_op = 'UPDATE' and old.rapportino_id is distinct from new.rapportino_id then
      perform private.rapportino_registro_viaggi(old.rapportino_id);
    end if;
  end if;
  return null;
end
$$;
revoke all on function private.rapportino_registro_viaggi_trg() from public, anon, authenticated;

drop trigger if exists trg_rapportino_registro_viaggi on public.campo_rapportini;
create trigger trg_rapportino_registro_viaggi
  after update of stato, approvato, annullato_at on public.campo_rapportini
  for each row
  when (old.stato is distinct from new.stato or old.approvato is distinct from new.approvato
        or old.annullato_at is distinct from new.annullato_at)
  execute function private.rapportino_registro_viaggi_trg();

drop trigger if exists trg_voci_registro_viaggi on public.rapportino_voci_libere;
create trigger trg_voci_registro_viaggi
  after insert or update or delete on public.rapportino_voci_libere
  for each row
  execute function private.rapportino_registro_viaggi_trg();
