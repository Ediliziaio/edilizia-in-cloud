-- Spostamento appuntamento: UN SOLO messaggio «spostato», mai una nuova «conferma».
--
-- Prima: al cambio di data/ora il trigger azzerava conferma_inviata_at, così
-- appuntamenti-promemoria rimandava una «conferma» col nuovo orario → doppia
-- conferma contraddittoria (incidente Bonadiman, 28/09/2026: due «confermato»,
-- 12:00 e 17:00, nessun «spostato»).
--
-- Ora: al cambio di data/ora il trigger segna riprogrammato_at e NON tocca più
-- conferma_inviata_at. appuntamenti-promemoria vede riprogrammato_at > conferma
-- e manda un solo «spostato», poi ricalcola i promemoria dalla nuova data.
-- La pagina pubblica (public-booking-gestisci) continua a funzionare: timbra
-- lei conferma_inviata_at nello stesso UPDATE, quindi il trigger non segna
-- riprogrammato_at e non parte un «spostato» doppio.

alter table public.appointments
  add column if not exists riprogrammato_at timestamptz;

comment on column public.appointments.riprogrammato_at is
  'Quando l''appuntamento è stato spostato (data/ora cambiate) da un update che non ha comunicato lui il nuovo orario. appuntamenti-promemoria manda un solo «spostato» e lo azzera.';

create or replace function public.appuntamento_spostato_riarma_messaggi()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.appointment_date is distinct from old.appointment_date
     or new.appointment_time is distinct from old.appointment_time then
    new.reminder_24h_at := null;
    new.reminder_1h_at := null;
    new.reminder_5m_at := null;
    -- Se questo stesso UPDATE non sta già comunicando il nuovo orario (la pagina
    -- pubblica timbra conferma_inviata_at e manda «spostato» da sé), segna lo
    -- spostamento: la conferma resta, parte UN SOLO «spostato».
    if new.conferma_inviata_at is not distinct from old.conferma_inviata_at then
      new.riprogrammato_at := now();
    end if;
  end if;
  return new;
end;
$function$;
