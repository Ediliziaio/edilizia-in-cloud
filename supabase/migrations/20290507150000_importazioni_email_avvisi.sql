-- Importazioni: email senza maiuscole e avvisi nella campanella (23/11/2026).
--
-- 1. contatti_per_email: i contatti dell'azienda con quelle email, senza guardare
--    maiuscole e spazi. La usa l'importazione subito, così trova «Mario@X.it» anche se
--    nel file c'è «mario@x.it», come già fa il giro a scaglioni. Security invoker:
--    valgono le regole di riga di chi la chiama.
-- 2. Quando un'importazione a scaglioni finisce, o viene messa in pausa perché chi
--    l'ha creata non ha più il permesso, gli arriva un avviso nella campanella.

create or replace function public.contatti_per_email(p_company_id uuid, p_emails text[])
returns table (id uuid, email text, tags text[])
language sql stable security invoker set search_path = public
as $$
  select c.id, c.email, c.tags
    from marketing_contacts c
   where c.company_id = p_company_id
     and c.deleted_at is null
     and lower(c.email) = any (select lower(btrim(e)) from unnest(p_emails) e where btrim(e) <> '');
$$;
revoke all on function public.contatti_per_email(uuid, text[]) from public, anon;
grant execute on function public.contatti_per_email(uuid, text[]) to authenticated;

create or replace function public._avvisa_importazione(j public.importazioni_programmate, p_motivo text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_cosa text := case when j.oggetto = 'contatti' then 'contatti' else 'opportunità' end;
  v_file text := coalesce('«' || nullif(j.nome_file, '') || '»', 'del file');
  v_url text := case when j.oggetto = 'contatti' then '/azienda/marketing/contatti' else '/azienda/marketing/opportunita' end;
  v_titolo text;
  v_testo text;
begin
  if j.creata_da is null then return; end if;
  if p_motivo = 'finita' then
    v_titolo := 'Importazione finita';
    v_testo := format('L''importazione %s è finita: %s %s nuovi, %s aggiornati', v_file, j.creati, v_cosa, j.aggiornati)
      || case when j.saltati > 0 then format(', %s saltati', j.saltati) else '' end
      || case when j.errori > 0 then format('. %s righe da correggere: le scarichi dalla pagina', j.errori) else '' end
      || '.';
  else
    v_titolo := 'Importazione messa in pausa';
    v_testo := format('L''importazione %s si è fermata perché il tuo utente non ha più il permesso di importare %s. Chiedi all''amministratore.', v_file, v_cosa);
  end if;
  insert into notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  values (j.company_id, j.creata_da, 'importazione', v_titolo, v_testo, 'importazione_programmata', j.id, v_url);
exception when others then
  null; -- l'avviso non deve mai fermare il giro
end;
$$;
revoke all on function public._avvisa_importazione(public.importazioni_programmate, text) from public, anon, authenticated;

create or replace function public.importazioni_programmate_esegui()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  j public.importazioni_programmate;
  r record;
  a jsonb;
  v_ora timestamp;
  v_ids uuid[];
  v_esito text;
  v_contatto uuid;
  v_fatte int; v_creati int; v_aggiornati int; v_saltati int; v_errori int;
  v_righe_totali int := 0;
  v_errore_auto text;
  v_permesso boolean;
  v_dopo public.importazioni_programmate;
begin
  for j in
    select * from importazioni_programmate
     where stato = 'attiva' and prossimo_giro <= now()
     order by prossimo_giro
     for update skip locked
  loop
    -- Chi l'ha programmata deve poterlo fare ancora: si guarda coi suoi permessi di adesso.
    perform set_config('request.jwt.claims', jsonb_build_object('sub', j.creata_da, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', coalesce(j.creata_da::text, ''), true);
    v_permesso := j.creata_da is not null and public.puo_gestire_importazione(j.company_id, j.oggetto);
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    if not v_permesso then
      update importazioni_programmate
         set stato = 'in_pausa',
             ultimo_errore = 'Messa in pausa: chi l''ha programmata non ha più il permesso di importare'
       where id = j.id;
      perform public._avvisa_importazione(j, 'pausa_permesso');
      continue;
    end if;

    v_ora := now() at time zone 'Europe/Rome';
    if not (extract(isodow from v_ora)::smallint = any(j.giorni)) then continue; end if;
    if j.fascia_da is not null and j.fascia_a is not null
       and not (v_ora::time >= j.fascia_da and v_ora::time < j.fascia_a) then continue; end if;

    v_ids := '{}'; v_fatte := 0; v_creati := 0; v_aggiornati := 0; v_saltati := 0; v_errori := 0;
    v_errore_auto := null;

    for r in
      select * from importazioni_programmate_righe
       where importazione_id = j.id and stato = 'in_attesa'
       order by ordine
       limit j.per_giro
       for update skip locked
    loop
      begin
        if j.oggetto = 'contatti' then
          select t.esito, t.contatto into v_esito, v_contatto
            from public._importa_contatto_programmato(
              j.company_id, j.creata_da, j.modalita, r.dati->'contatto',
              array(select jsonb_array_elements_text(coalesce(r.dati->'forme', '[]'::jsonb))),
              r.dati->'custom') t;
        else
          select t.esito, t.contatto into v_esito, v_contatto
            from public._importa_opportunita_programmata(j, r.dati) t;
        end if;
        update importazioni_programmate_righe
           set stato = case when v_esito = 'saltato' then 'saltata' else 'fatta' end,
               esito = v_esito, contatto_id = v_contatto, elaborata_at = now()
         where id = r.id;
        if v_esito = 'creato' then v_creati := v_creati + 1;
        elsif v_esito = 'aggiornato' then v_aggiornati := v_aggiornati + 1;
        else v_saltati := v_saltati + 1; end if;
        if v_contatto is not null and v_esito <> 'saltato' then v_ids := v_ids || v_contatto; end if;
      exception when others then
        update importazioni_programmate_righe
           set stato = 'errore', esito = left(sqlerrm, 300), elaborata_at = now()
         where id = r.id;
        v_errori := v_errori + 1;
      end;
      v_fatte := v_fatte + 1;
    end loop;

    if cardinality(v_ids) > 0 then
      for a in select * from jsonb_array_elements(j.automazioni) loop
        begin
          perform public._iscrivi_al_flusso_azienda(j.company_id, (a->>'id')::uuid,
                    array(select distinct x from unnest(v_ids) x), 'contact');
        exception when others then
          v_errore_auto := 'Automazione «' || coalesce(a->>'nome', '') || '»: i contatti di un giro non sono entrati';
        end;
      end loop;
    end if;

    update importazioni_programmate set
      fatte = fatte + v_fatte,
      creati = creati + v_creati,
      aggiornati = aggiornati + v_aggiornati,
      saltati = saltati + v_saltati,
      errori = errori + v_errori,
      ultimo_errore = coalesce(v_errore_auto, ultimo_errore),
      stato = case when exists (select 1 from importazioni_programmate_righe
                                 where importazione_id = j.id and stato = 'in_attesa')
                   then stato else 'completata' end,
      prossimo_giro = now() + make_interval(mins => j.ogni_minuti),
      updated_at = now()
    where id = j.id
    returning * into v_dopo;
    if v_dopo.stato = 'completata' then
      perform public._avvisa_importazione(v_dopo, 'finita');
    end if;

    v_righe_totali := v_righe_totali + v_fatte;
    exit when v_righe_totali >= 3000;
  end loop;
  return v_righe_totali;
end;
$$;
revoke all on function public.importazioni_programmate_esegui() from public, anon, authenticated;
