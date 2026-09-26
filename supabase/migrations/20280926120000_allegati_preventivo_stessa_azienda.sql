-- Le schede tecniche allegate a un preventivo sono della sua azienda (26/09/2026).
--
-- generate-quote-pdf unisce al PDF, col service role, i file dei materiali
-- collegati al preventivo (quote_pdf_attachments → quote_pdf_materials). La
-- policy di inserimento qpa_ins controlla che il preventivo sia dell'azienda,
-- non che lo sia il materiale: chi conosceva l'id di un materiale di un'altra
-- azienda poteva allegarlo al proprio preventivo e ritrovarsi il file nel PDF.
--
-- Un trigger, non una policy: vale per chiunque scriva (utenti, funzioni del
-- server, copie dei preventivi) e resta vero anche se le policy degli allegati
-- vengono riscritte. Legge le due aziende da SECURITY DEFINER, perché un
-- materiale di un'altra azienda l'utente non lo vede nemmeno.
--
-- Si scarica storage_path, non company_id: anche il file deve stare nella
-- cartella dell'azienda del preventivo (il 26/09 il materiale di un'azienda demo,
-- copiato da un'altra, puntava al file nella cartella di quella).
--
-- In più la RESTRICTIVE sul blocco utente, come le altre tabelle: il blocco
-- teneva solo perché le policy passano da quotes, e il censimento non vede
-- questa tabella perché non ha company_id.
--
-- Provato il 26/09 dal guardiano degli accessi con utenti veri, in transazioni
-- annullate: 41 casi, nessun uso legittimo bloccato. In produzione 0 allegati,
-- 2 materiali, nessun allegato che incroci due aziende: nessuna riga da correggere.

set local lock_timeout = '3s';

create or replace function public.allegato_preventivo_stessa_azienda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  azienda_preventivo uuid;
  azienda_materiale uuid;
  percorso_file text;
begin
  select q.company_id into azienda_preventivo from public.quotes q where q.id = new.quote_id;
  select m.company_id, m.storage_path into azienda_materiale, percorso_file
    from public.quote_pdf_materials m where m.id = new.material_id;
  if azienda_preventivo is null or azienda_materiale is null or azienda_materiale <> azienda_preventivo
     or split_part(coalesce(percorso_file, ''), '/', 1) is distinct from azienda_preventivo::text
     or position('..' in coalesce(percorso_file, '')) > 0 then
    raise exception 'La scheda tecnica non è di questa azienda: non si può allegare a questo preventivo.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.allegato_preventivo_stessa_azienda() is
  'Trigger di quote_pdf_attachments: il materiale allegato deve essere della stessa azienda del preventivo (generate-quote-pdf lo scarica col service role).';

-- Funzione di trigger: nessuno deve poterla chiamare, allo scatto il privilegio non si controlla.
revoke all on function public.allegato_preventivo_stessa_azienda() from public, anon, authenticated;

drop trigger if exists trg_allegato_preventivo_stessa_azienda on public.quote_pdf_attachments;
create trigger trg_allegato_preventivo_stessa_azienda
  before insert or update of quote_id, material_id on public.quote_pdf_attachments
  for each row execute function public.allegato_preventivo_stessa_azienda();

drop policy if exists blocco_utente_bloccato on public.quote_pdf_attachments;
create policy blocco_utente_bloccato on public.quote_pdf_attachments
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato()))
  with check (not (select public.utente_bloccato()));
