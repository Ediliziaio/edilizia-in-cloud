-- 10 € di credito gratuito a OGNI azienda nuova, anche in prova (deciso da Florin il 27/10/2026).
-- Dimora Torino, senza abbonamento e con il portafoglio a zero, non poteva mandare nemmeno un'email di firma: ogni
-- invio costa 0,0012 € e non c'era credito. Ora ogni azienda nasce con 10 € nel portafoglio unico (company_credit_pool),
-- così prova subito preventivi, firme ed email. Quando i 10 € finiscono, ogni strumento risponde «credito esaurito» e
-- il popup chiede di aggiungere la carta e ricaricare; con una carta salvata parte la ricarica automatica (5 € / 25 €).
-- Una volta sola per azienda (se il registro ha già l'omaggio non lo rimette) e senza mai bloccare la creazione
-- dell'azienda. Le aziende già esistenti non cambiano.
-- Idempotente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.omaggio_benvenuto_crediti()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if exists (select 1 from public.company_credit_pool_ledger l
              where l.company_id = new.id and l.service = 'omaggio_benvenuto') then
    return new;
  end if;
  perform public.pool_ricarica(
    new.id, 'omaggio_benvenuto', 10,
    'Omaggio di benvenuto: 10 € per provare la piattaforma',
    jsonb_build_object('tipo', 'omaggio_benvenuto')
  );
  return new;
exception when others then
  -- La creazione dell'azienda non si ferma mai per un omaggio non riuscito.
  raise warning 'omaggio_benvenuto_crediti non riuscito per l''azienda %: %', new.id, sqlerrm;
  return new;
end;
$function$;

revoke all on function public.omaggio_benvenuto_crediti() from public, anon, authenticated;

drop trigger if exists trg_omaggio_benvenuto_crediti on public.companies;
-- Il nome viene dopo trg_init_*: i conti email/AI/WhatsApp da specchiare esistono già quando parte l'omaggio.
create trigger trg_omaggio_benvenuto_crediti
  after insert on public.companies
  for each row execute function public.omaggio_benvenuto_crediti();
