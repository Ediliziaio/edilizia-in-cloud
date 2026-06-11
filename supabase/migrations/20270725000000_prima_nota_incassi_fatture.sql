-- INTEGRAZIONE INCASSI FATTURE → PRIMA NOTA.
-- Verificato su prod: registra_incasso_atomico / storna_incasso_atomico NON
-- scrivevano in prima_nota_entries → incassando una fattura da
-- /azienda/documenti la Prima Nota (e il suo saldo, usato anche dal
-- previsionale come saldo iniziale) non registrava nulla. Inoltre la UI
-- Prima Nota renderizza `e.documenti_fiscali` ma la tabella non aveva
-- alcuna FK verso documenti_fiscali (invoice_id punta a `invoices`,
-- billing piattaforma): il badge "Fatt. #N" era irraggiungibile.

-- 1) Colonne di collegamento
alter table public.prima_nota_entries
  add column if not exists documento_fiscale_id uuid references public.documenti_fiscali(id) on delete set null,
  -- ON DELETE CASCADE dal movimento di cassa: quando storna_incasso_atomico
  -- elimina il movimento, la registrazione prima nota si elimina da sola
  -- (simmetria garantita dal DB, zero codice nello storno).
  add column if not exists movimento_id uuid references public.movimenti_cassa_native(id) on delete cascade;

create index if not exists idx_pne_documento_fiscale on public.prima_nota_entries(documento_fiscale_id) where documento_fiscale_id is not null;
create index if not exists idx_pne_movimento on public.prima_nota_entries(movimento_id) where movimento_id is not null;

-- 2) registra_incasso_atomico: ora scrive anche la registrazione prima nota
create or replace function public.registra_incasso_atomico(
  p_company_id uuid,
  p_documento_id uuid,
  p_importo numeric,
  p_metodo text,
  p_data_movimento date,
  p_riferimento text default null::text,
  p_note text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_movimento_id  uuid;
  v_totale        numeric;
  v_pagato        numeric;
  v_nuovo_pagato  numeric;
  v_nuovo_stato   text;
  v_numero        text;
  v_tipo          text;
BEGIN
  -- Validate company ownership (defense-in-depth)
  IF NOT EXISTS (
    SELECT 1 FROM documenti_fiscali
    WHERE id = p_documento_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Documento non trovato o accesso negato';
  END IF;

  -- Lock the invoice row to prevent concurrent updates
  SELECT totale_da_pagare, importo_pagato, numero, tipo
    INTO v_totale, v_pagato, v_numero, v_tipo
    FROM documenti_fiscali
   WHERE id = p_documento_id
     AND company_id = p_company_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento non trovato';
  END IF;

  -- Insert movement
  INSERT INTO movimenti_cassa_native (
    company_id, documento_id, importo, tipo,
    metodo, data_movimento, riferimento, note
  ) VALUES (
    p_company_id, p_documento_id, p_importo, 'incasso',
    p_metodo, p_data_movimento, p_riferimento, p_note
  )
  RETURNING id INTO v_movimento_id;

  -- Recalculate invoice state atomically
  v_nuovo_pagato := v_pagato + p_importo;
  v_nuovo_stato  := CASE
    WHEN v_nuovo_pagato >= v_totale THEN 'pagata'
    ELSE 'parzialmente_pagata'
  END;

  UPDATE documenti_fiscali SET
    importo_pagato = v_nuovo_pagato,
    stato          = v_nuovo_stato,
    pagato_at      = CASE WHEN v_nuovo_stato = 'pagata' THEN now() ELSE NULL END,
    updated_at     = now()
  WHERE id = p_documento_id;

  -- Registrazione PRIMA NOTA (auto): incasso fattura → entrata.
  -- movimento_id ha ON DELETE CASCADE: lo storno del movimento la rimuove.
  INSERT INTO prima_nota_entries (
    company_id, direction, category, description, amount, entry_date,
    payment_method, reference_number, is_auto, auto_source,
    documento_fiscale_id, movimento_id, notes
  ) VALUES (
    p_company_id, 'entrata', 'Incassi fatture',
    'Incasso ' || CASE WHEN v_tipo = 'nota_credito' THEN 'NC' ELSE 'fattura' END || ' ' || COALESCE(v_numero, ''),
    p_importo, p_data_movimento,
    p_metodo, p_riferimento, true, 'incasso_fattura',
    p_documento_id, v_movimento_id, p_note
  );

  RETURN v_movimento_id;
END;
$function$;
