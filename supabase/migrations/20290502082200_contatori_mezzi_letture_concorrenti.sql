begin;

-- I trigger BEFORE scattano in ordine alfabetico. La preparazione assegna
-- l’azienda dal mezzo prima che il POS calcoli la chiave condivisa.
alter trigger pos_segnalazioni_mezzo_blocca on public.mezzi_segnalazioni
  rename to trg_mezzi_segnalazione_riesame_pos;

-- Concorrenza e letture in ritardo. Il confronto va fatto nell’UPDATE che
-- acquisisce la riga, così anche la data resta quella dell’ultimo incremento.
create or replace function public.mezzi_segnalazione_avvisa()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mezzo record;
  v_chi text;
  v_titolo text;
begin
  if new.contatore is not null then
    update public.mezzi
       set contatore = new.contatore,
           contatore_aggiornato_il = (new.created_at at time zone 'Europe/Rome')::date
     where id = new.mezzo_id
       and company_id = new.company_id
       and (contatore is null or contatore < new.contatore);
  end if;

  if new.tipo = 'km' then
    return new;
  end if;

  select id, company_id, nome, targa
    into v_mezzo
    from public.mezzi
   where id = new.mezzo_id and company_id = new.company_id;

  select nullif(trim(coalesce(hp.nome, '') || ' ' || coalesce(hp.cognome, '')), '')
    into v_chi from public.hr_profili hp where hp.id = new.hr_profilo_id;

  v_titolo := case new.tipo
                when 'guasto' then 'Guasto segnalato'
                when 'danno' then 'Danno segnalato'
                when 'smarrito' then 'Attrezzo non trovato'
                when 'rubato' then 'Furto segnalato'
                else 'Segnalazione'
              end
              || ': ' || v_mezzo.nome || coalesce(' (' || v_mezzo.targa || ')', '');

  insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  select v_mezzo.company_id, destinatari.user_id, 'mezzo_segnalazione', v_titolo,
         left(coalesce(v_chi || ': ', '') || coalesce(nullif(trim(new.descrizione), ''), 'senza descrizione'), 300),
         'mezzo', new.mezzo_id, '/azienda/mezzi/' || new.mezzo_id
    from (
      select p.id as user_id
        from public.profiles p
        join public.user_roles ur on ur.user_id = p.id and ur.role = 'company_admin'
       where p.company_id = v_mezzo.company_id
      union
      select sp.user_id
        from public.staff_permissions sp
       where sp.company_id = v_mezzo.company_id and sp.can_edit_mezzi
    ) destinatari
   where destinatari.user_id is distinct from new.created_by;

  return new;
end;
$function$;

commit;
