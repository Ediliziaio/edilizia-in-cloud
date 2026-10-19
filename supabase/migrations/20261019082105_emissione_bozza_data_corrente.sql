-- Emissione ordinaria: una bozza senza numero prende la data del giorno italiano.
-- Nessuna rinumerazione delle emesse; nessun reset dei contatori, invio o modifica
-- delle scadenze di pagamento. Data e numero si confermano nella stessa transazione.
-- Riusa il motore di emissione esistente (lock contatore, serie, cronologia, audit).
-- L'ingresso distinto conserva il flusso storico per recuperi già numerati e per
-- installazioni che applicano ancora le vecchie migrazioni di documento_emetti.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function public.documento_emetti_oggi(p_documento_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_doc public.documenti_fiscali%rowtype;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  if auth.uid() is null then
    raise exception 'Serve un utente autenticato' using errcode = '42501';
  end if;
  -- Lettura e scrittura soggette alle RLS del chiamante, non privilegi elevati.
  select * into v_doc from public.documenti_fiscali
    where id = p_documento_id and deleted_at is null for update;
  if not found then
    raise exception 'Documento non trovato' using errcode = 'P0002';
  end if;
  if public.user_can_access_company(v_doc.company_id) is not true
     or public.puo_gestire_documento_fiscale(v_doc.company_id, v_doc.tipo) is not true then
    raise exception 'Non hai il permesso di emettere questo documento' using errcode = '42501';
  end if;
  if v_doc.stato <> 'bozza' then
    raise exception 'Solo i documenti in bozza possono essere emessi' using errcode = '22023';
  end if;

  if v_doc.numero like 'Bozza %' and v_doc.tipo = any(array[
    'fattura','fattura_pa','nota_credito','nota_debito','autofattura','fattura_riepilogativa'
  ]) then
    update public.documenti_fiscali set data_emissione = v_oggi
      where id = v_doc.id;
    if not found then
      raise exception 'Data di emissione non aggiornata: accesso negato' using errcode = '42501';
    end if;
  end if;

  -- Se fallisce, Postgres annulla ANCHE l'aggiornamento della data e il contatore.
  -- Il successivo invio allo SDI usa questi dati definitivi, non ricalcola la data.
  return public.documento_emetti(p_documento_id);
end;
$function$;

revoke all on function public.documento_emetti_oggi(uuid) from public, anon;
grant execute on function public.documento_emetti_oggi(uuid) to authenticated;
