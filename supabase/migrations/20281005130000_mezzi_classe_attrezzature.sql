-- Mezzi e attrezzature (Fase A): la classe e le voci adatte agli attrezzi.
--
-- Fino a oggi un avvitatore era "un mezzo di tipo attrezzatura": stessa lista
-- dei furgoni, stessa scheda (km, telaio, assicurazione, bollo, revisione).
-- La classe è DERIVATA dal tipo (colonna generata): un solo posto dove si
-- decide, niente da tenere allineato. Tutto ciò che legge `mezzi` continua a
-- funzionare (assegnazioni, caricato-su, giornate dal campo, costi commessa).
-- Il ripristino dei backup salta già le colonne generate.

alter table public.mezzi
  add column if not exists classe text
  generated always as (case when tipo = 'attrezzatura' then 'attrezzatura' else 'mezzo' end) stored;

create index if not exists idx_mezzi_classe
  on public.mezzi(company_id, classe) where deleted_at is null;

-- Documenti con scadenza: per gli attrezzi contano garanzia, taratura degli
-- strumenti di misura, manuale/marcatura CE; per i ponteggi PiMUS e
-- autorizzazione ministeriale. La vista mezzi_scadenze prende già ogni
-- documento con data di scadenza: gli avvisi partono da soli.
alter table public.mezzi_documenti drop constraint if exists mezzi_documenti_categoria_chk;
alter table public.mezzi_documenti add constraint mezzi_documenti_categoria_chk
  check (categoria = any (array[
    'assicurazione','bollo','revisione','contratto','verifica_periodica','libretto',
    'garanzia','taratura','manuale_ce','pimus','autorizzazione_ministeriale','altro'
  ]::text[]));

-- Interventi: per gli attrezzi niente gomme e carrozzeria, ma manutenzione
-- ordinaria, sostituzione di parti, taratura, verifica prima dell'uso.
alter table public.mezzi_manutenzioni drop constraint if exists mezzi_manutenzioni_tipo_chk;
alter table public.mezzi_manutenzioni add constraint mezzi_manutenzioni_tipo_chk
  check (tipo = any (array[
    'tagliando','riparazione','gomme','carrozzeria',
    'manutenzione_ordinaria','sostituzione_parti','taratura','verifica','altro'
  ]::text[]));

-- Segnalazioni dal campo: per un attrezzo il caso più frequente è che non si
-- trovi più.
alter table public.mezzi_segnalazioni drop constraint if exists mezzi_segnalazioni_tipo_chk;
alter table public.mezzi_segnalazioni add constraint mezzi_segnalazioni_tipo_chk
  check (tipo = any (array['guasto','danno','km','smarrito','rubato','altro']::text[]));

-- L'avviso all'ufficio dà un titolo anche a smarrito e rubato (prima finivano
-- in un generico «Segnalazione»). Per il resto è la stessa funzione.
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
  select id, company_id, nome, targa, contatore into v_mezzo from public.mezzi where id = new.mezzo_id;

  if new.contatore is not null and (v_mezzo.contatore is null or v_mezzo.contatore < new.contatore) then
    update public.mezzi
       set contatore = new.contatore,
           contatore_aggiornato_il = (new.created_at at time zone 'Europe/Rome')::date
     where id = new.mezzo_id;
  end if;

  if new.tipo = 'km' then
    return new;
  end if;

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
