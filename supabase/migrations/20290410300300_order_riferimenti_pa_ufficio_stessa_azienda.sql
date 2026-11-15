-- 15/11/2026, guardiano degli accessi: un riferimento PA punta solo a un ufficio della
-- sua azienda.
--
-- Prima: order_riferimenti_pa.ufficio_id ha la chiave esterna verso anagrafica_uffici_pa
-- (20290410230000), e la chiave esterna si controlla senza regole d'accesso. Un utente
-- di un'altra azienda, col permesso di modificare le commesse della SUA azienda, poteva
-- salvare su un suo riferimento l'ufficio PA di un'altra azienda (bastava l'id). Provato
-- in una transazione annullata: inserimento e modifica riusciti. Gli effetti: il suo
-- riferimento resta legato a un ente altrui (il lotto 5 porterà l'ufficio nell'XML
-- della fattura), e quando l'altra azienda cancella l'ufficio la cancellazione scrive
-- sulla riga dell'altra azienda (on delete set null). Il 15/11 nessuna riga ha
-- ufficio_id: niente da ripulire.
--
-- Dopo: il trigger order_riferimenti_pa_normalizza, che già prende company_id dalla
-- commessa, rifiuta un ufficio che non sia della stessa azienda. Il messaggio è lo
-- stesso per «non esiste» e «è di un altro»: non dice se un id esiste altrove.
--
-- Devono continuare a funzionare (provati prima/dopo nella stessa transazione
-- annullata): il membro con «modifica commesse» sulla sua commessa con l'ufficio della
-- sua azienda, il titolare, il super admin, il service role, una funzione definer con
-- i claims dell'utente, il riferimento senza ufficio.
--
-- Idempotente. Funzione di trigger: nessun EXECUTE da concedere.

set local lock_timeout = '3s';

create or replace function public.order_riferimenti_pa_normalizza()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.cig := nullif(upper(regexp_replace(coalesce(new.cig, ''), '\s', '', 'g')), '');
  new.cup := nullif(upper(regexp_replace(coalesce(new.cup, ''), '\s', '', 'g')), '');
  new.codice_univoco_ufficio := nullif(upper(regexp_replace(coalesce(new.codice_univoco_ufficio, ''), '\s', '', 'g')), '');
  new.numero := nullif(btrim(new.numero), '');
  new.cig_motivo_esclusione := case when new.cig_non_dovuto then nullif(btrim(new.cig_motivo_esclusione), '') else null end;
  select o.company_id into new.company_id from public.orders o where o.id = new.order_id;
  if new.company_id is null then
    raise exception 'Commessa % inesistente', new.order_id;
  end if;
  -- L'ufficio è della stessa azienda della commessa. La chiave esterna da sola non basta:
  -- si controlla senza regole d'accesso.
  if new.ufficio_id is not null and not exists (
       select 1 from public.anagrafica_uffici_pa u
        where u.id = new.ufficio_id and u.company_id = new.company_id) then
    raise exception 'Ufficio PA non trovato tra quelli di questa azienda' using errcode = '23503';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.order_riferimenti_pa_normalizza() from public, anon, authenticated;
