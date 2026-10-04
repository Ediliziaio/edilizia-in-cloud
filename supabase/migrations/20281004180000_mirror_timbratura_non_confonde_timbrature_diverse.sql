-- ============================================================================
-- Una timbratura non è «la copia» di un'altra solo perché è vicina nel tempo
-- ============================================================================
-- Provando la timbratura a un tocco sul telefono: cambio di cantiere (uscita +
-- entrata) e, un minuto dopo, «Fine giornata». Il Personale NON ha registrato
-- l'uscita finale: il trigger di copia (mirror_campo_timbratura_su_hr) considera
-- doppia ogni timbratura dello stesso tipo entro due minuti da una già presente,
-- e l'ha agganciata all'uscita del cambio. Giornata senza uscita = ore sbagliate
-- nel cedolino, e nessuno se ne accorge.
--
-- Il confronto serve per un solo caso: una timbratura nata PRIMA nel registro del
-- Personale (terminale, QR) e poi arrivata anche dal campo. Una timbratura del
-- Personale già legata a un'altra timbratura del campo è un'altra timbratura:
-- si considera la stessa solo se è un doppio tocco (entro 5 secondi).
--
-- Idempotente. Cambia solo la funzione: nessuna riga esistente viene modificata.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.mirror_campo_timbratura_su_hr()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_profilo uuid;
  v_esistente uuid;
  v_nuova uuid;
begin
  if new.hr_timbratura_id is not null then
    return new;
  end if;

  v_profilo := public.hr_profilo_da_user(new.user_id, new.company_id);
  if v_profilo is null then
    return new;
  end if;

  select ht.id into v_esistente
    from hr_timbrature ht
   where ht.profilo_id = v_profilo
     and ht.tipo = new.tipo
     and ht."timestamp" between new.timestamp_evento - interval '2 minutes'
                            and new.timestamp_evento + interval '2 minutes'
     -- già legata a un'altra timbratura del campo: è un'altra timbratura, non una copia
     -- (a meno che sia un doppio tocco)
     and (not exists (select 1 from campo_timbrature c where c.hr_timbratura_id = ht.id)
          or abs(extract(epoch from (ht."timestamp" - new.timestamp_evento))) <= 5)
   order by abs(extract(epoch from (ht."timestamp" - new.timestamp_evento)))
   limit 1;

  if v_esistente is not null then
    new.hr_timbratura_id := v_esistente;
    select ht.posizione_esito, ht.distanza_mt, ht.riferimento_tipo, ht.riferimento_id,
           coalesce(new.sede_id, ht.sede_id)
      into new.posizione_esito, new.distanza_mt, new.riferimento_tipo, new.riferimento_id,
           new.sede_id
      from hr_timbrature ht
     where ht.id = v_esistente;
    return new;
  end if;

  insert into hr_timbrature (company_id, profilo_id, tipo, "timestamp", lat, lng, fonte, note, order_id, sede_id)
  values (new.company_id, v_profilo, new.tipo, new.timestamp_evento,
          new.gps_lat, new.gps_lng, coalesce(new.fonte, 'app'), new.note, new.order_id, new.sede_id)
  returning id, posizione_esito, distanza_mt, riferimento_tipo, riferimento_id, sede_id
  into v_nuova, new.posizione_esito, new.distanza_mt, new.riferimento_tipo, new.riferimento_id, new.sede_id;

  new.hr_timbratura_id := v_nuova;
  return new;
end $function$;
