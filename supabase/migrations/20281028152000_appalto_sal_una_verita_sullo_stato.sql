-- ════════════════════════════════════════════════════════════════════════════
-- Lo stato di fatturazione sta sul documento, non anche su ogni riga
-- ════════════════════════════════════════════════════════════════════════════
-- Correzione a `appalto_sal_stato` (20281028150000). Portando un rendiconto a
-- «fatturato», il trigger scriveva `stato='fatturata'` su tutte le sue righe. Ma
-- le righe sono CONGELATE proprio perche' il rendiconto non e' piu' in bozza:
-- il congelamento bloccava il sistema stesso, e il passaggio a fatturato
-- falliva con «La riga e' nel rendiconto n. 1 (approvato)».
--
-- Si poteva aprire un'eccezione nel congelamento per quella sola transizione.
-- Ma il difetto vero e' che lo stato di fatturazione era scritto in DUE posti:
-- sul rendiconto e su ogni sua riga. Due copie dello stesso fatto divergono —
-- e qui avevano gia' iniziato a litigare fra loro. Lo stato di fatturazione di
-- una riga si legge dal suo rendiconto (`sal_id` → `appalto_sal.stato`), che e'
-- l'unico posto che lo sa.
--
-- Il congelamento resta assoluto: nessuna eccezione, nessuna scorciatoia.
-- Trovato provando il passaggio bozza → inviato → approvato → fatturato.
--
-- Idempotente. Nessuna riga scritta.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.appalto_sal_stato()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  new.updated_at := now();
  if new.stato is distinct from old.stato then
    if old.stato = 'fatturato' then
      raise exception 'Un rendiconto fatturato non cambia piu'' stato' using errcode = '42501';
    end if;
    if old.stato = 'approvato' and new.stato in ('bozza', 'inviato') then
      raise exception 'Un rendiconto approvato non torna indietro: e'' la prova di quello che hai fatturato' using errcode = '42501';
    end if;
    if new.stato = 'inviato' and new.inviato_at is null then
      new.inviato_at := now();
    end if;
    if new.stato = 'approvato' then
      new.approvato_da := auth.uid();
      new.approvato_at := now();
    end if;
    -- Niente propagazione sulle righe: lo stato del documento sta sul documento.
  end if;
  return new;
end;
$fn$;
revoke all on function public.appalto_sal_stato() from public, anon, authenticated;

comment on column public.appalto_rendiconto_righe.stato is
  '"bozza" = da controllare. "confermata" = l''ufficio l''ha vista. "in_sal" = e'' entrata in un rendiconto al committente, e da quel momento non si tocca piu''. Se quel rendiconto sia stato mandato, approvato o fatturato lo dice il rendiconto (`sal_id`), non la riga: lo stesso fatto scritto in due posti divergerebbe.';
