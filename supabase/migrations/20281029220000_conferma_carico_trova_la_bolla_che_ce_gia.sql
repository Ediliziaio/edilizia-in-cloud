-- ════════════════════════════════════════════════════════════════════════════
-- La conferma di un carico si attacca alla bolla che c'è già
-- ════════════════════════════════════════════════════════════════════════════
-- Correzione di un guasto introdotto oggi stesso, 29/10/2026, dalle fasi 1-3 di
-- docs/piano-ddt-bolle-fatture.md. Trovato ragionando sui flussi, non da un
-- errore in produzione: lì non sarebbe emerso finché non capitava.
--
-- Come nasce. `conferma_carico_ddt` è il punto dove una bolla letta dalla posta
-- o fotografata su WhatsApp diventa merce in giacenza. Prima di inserire la
-- bolla ne cercava una già esistente, ma SOLO fra quelle dello stesso ordine
-- d'acquisto:
--
--     where purchase_order_id = v_c.purchase_order_id
--       and numero_ddt = coalesce(v_c.ddt_numero, 's.n.')
--
-- Finché l'ODA era obbligatorio quella ricerca copriva tutti i casi. Da oggi
-- non più: la fase 1 ha reso l'ordine facoltativo, quindi l'ufficio può aver
-- già caricato quella bolla SENZA ODA — e la fase «chi ha portato la merce» ha
-- aggiunto il vincolo unico (azienda, fornitore, numero). Risultato: la
-- ricerca non la trova, l'inserimento viene rifiutato dal vincolo, e
-- `unique_violation` non essendo gestita fa fallire TUTTA la conferma. Il
-- titolare avrebbe visto un errore di Postgres al posto del carico.
--
-- Che cosa cambia. La bolla si cerca per numero dentro l'azienda, accettando
-- sia quella dello stesso ordine sia quella che non ne ha ancora uno (e in quel
-- caso l'ordine glielo si aggancia). L'inserimento resta protetto: se un'altra
-- bolla dello stesso fornitore ha già quel numero, ci si attacca invece di
-- morire. Due registrazioni della stessa consegna diventano una.
--
-- Il corpo della funzione è lungo e nessun altro pezzo cambia: invece di
-- ricopiarlo — e rischiare di cambiare per sbaglio una riga che non si doveva
-- toccare — si sostituisce il solo blocco, con un controllo che fallisce se non
-- lo trova esattamente dov'era.
--
-- Idempotente: alla seconda esecuzione il blocco vecchio non c'è più e la
-- migrazione non fa nulla.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $migrazione$
declare
  v_def text;
  v_vecchio text;
  v_nuovo text;
  v_def_nuova text;
begin
  v_def := pg_get_functiondef('public.conferma_carico_ddt'::regproc);

  v_vecchio := $vecchio$    select id into v_ricezione from public.ddt_ricezione
     where purchase_order_id = v_c.purchase_order_id
       and numero_ddt = coalesce(v_c.ddt_numero, 's.n.')
     limit 1;
    if v_ricezione is null then
      insert into public.ddt_ricezione (company_id, purchase_order_id, numero_ddt, data_ricezione, stato, source, created_by, note)
      values (v_c.company_id, v_c.purchase_order_id, coalesce(v_c.ddt_numero, 's.n.'),
              v_data, 'ricevuto',
              case when v_c.email_id is null then 'whatsapp' else 'manual' end,
              v_utente, 'Da DDT confermato')
      returning id into v_ricezione;
    end if;$vecchio$;

  v_nuovo := $nuovo$    -- La stessa bolla puo' essere gia' nel sistema anche SENZA questo ordine:
    -- dal 29/10/2026 l'ufficio puo' caricarne una senza ODA. Si cerca per
    -- numero dentro l'azienda, preferendo quella dell'ordine, e ci si attacca.
    select id into v_ricezione from public.ddt_ricezione
     where company_id = v_c.company_id
       and upper(btrim(numero_ddt)) = upper(btrim(coalesce(v_c.ddt_numero, 's.n.')))
       and (purchase_order_id = v_c.purchase_order_id or purchase_order_id is null)
     order by case when purchase_order_id = v_c.purchase_order_id then 0 else 1 end,
              created_at
     limit 1;
    if v_ricezione is not null then
      -- se la bolla trovata non aveva l'ordine, adesso lo si aggancia
      update public.ddt_ricezione
         set purchase_order_id = coalesce(purchase_order_id, v_c.purchase_order_id)
       where id = v_ricezione;
    end if;
    if v_ricezione is null then
      begin
        insert into public.ddt_ricezione (company_id, purchase_order_id, numero_ddt, data_ricezione, stato, source, created_by, note)
        values (v_c.company_id, v_c.purchase_order_id, coalesce(v_c.ddt_numero, 's.n.'),
                v_data, 'ricevuto',
                case when v_c.email_id is null then 'whatsapp' else 'manual' end,
                v_utente, 'Da DDT confermato')
        returning id into v_ricezione;
      exception when unique_violation then
        -- Una bolla dello stesso fornitore ha gia' questo numero: ci si attacca
        -- invece di far fallire tutta la conferma del carico.
        select id into v_ricezione from public.ddt_ricezione
         where company_id = v_c.company_id
           and upper(btrim(numero_ddt)) = upper(btrim(coalesce(v_c.ddt_numero, 's.n.')))
         order by created_at
         limit 1;
      end;
    end if;$nuovo$;

  if position(v_vecchio in v_def) = 0 then
    if position('order by case when purchase_order_id = v_c.purchase_order_id' in v_def) > 0 then
      raise notice 'conferma_carico_ddt: correzione gia applicata, niente da fare';
      return;
    end if;
    raise exception 'conferma_carico_ddt: il blocco da sostituire non e piu quello atteso. Rileggere la funzione prima di rifare la correzione.';
  end if;

  v_def_nuova := replace(v_def, v_vecchio, v_nuovo);
  if v_def_nuova = v_def then
    raise exception 'conferma_carico_ddt: sostituzione non avvenuta';
  end if;
  execute v_def_nuova;
end $migrazione$;

-- Controllo: la funzione nuova deve cercare la bolla anche fuori dall'ordine.
do $$
begin
  if position('purchase_order_id is null' in pg_get_functiondef('public.conferma_carico_ddt'::regproc)) = 0 then
    raise exception 'conferma_carico_ddt: la correzione non e nel corpo della funzione';
  end if;
end $$;
