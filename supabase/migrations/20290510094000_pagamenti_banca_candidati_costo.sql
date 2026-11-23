-- ════════════════════════════════════════════════════════════════════════════
-- Pagamento di una fattura ricevuta: «c'è in banca», da collegare con un clic (23/11/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Impresa Vulcano: registrare un pagamento doveva essere facile. Ma se il
-- pagamento è già passato in banca, scriverlo a mano lo registra due volte —
-- il movimento arriva, la fattura risulta già pagata e il movimento resta lì
-- senza documento. Le proposte del motore (stesso fornitore, importo, data)
-- stavano solo nella Tesoreria, che chi registra i pagamenti non apre.
--
-- `pagamenti_banca_candidati_costo(costo)`: i movimenti in uscita, non ancora
-- collegati, per cui il motore ha proposto un documento di QUESTO costo — la
-- fattura ricevuta o una sua rata — come pagamento o come prova di un pagamento
-- già segnato, e SOLO quella: distinte RiBa e cumulativi di più fatture restano
-- in Tesoreria. Il pannello dei pagamenti li mostra sopra il modulo, e «Collega»
-- usa la conferma già esistente (bank_conferma_ripartizione) con le righe
-- proposte dal motore.
--
-- Chi non vede la Tesoreria riceve un elenco vuoto, non un errore: il pannello
-- dei pagamenti deve funzionare anche per lui. `puo_collegare` dice se può
-- confermare (permesso di riconciliare, non in sola lettura).
-- Uno scarto fatto da una persona su quel candidato non si ripropone.
--
-- Idempotente: CREATE OR REPLACE. Nasce chiusa: REVOKE da PUBLIC e anon.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pagamenti_banca_candidati_costo(p_costo uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.company_costs;
  ids uuid[];
  puo_collegare boolean := true;
  out jsonb;
begin
  select * into c from public.company_costs where id = p_costo;
  if c.id is null or auth.uid() is null or public.utente_bloccato() or not public.user_can_access_company(c.company_id)
     or not coalesce(public.puo_vedere_costi(auth.uid(), c.company_id), false) then
    raise exception 'Costo non disponibile' using errcode = '42501';
  end if;
  -- Senza la Tesoreria non si propone niente: non è un errore.
  begin
    perform private.bank_operativa_access(c.company_id, false);
  exception when others then
    return jsonb_build_object('candidati', '[]'::jsonb, 'puo_collegare', false);
  end;
  begin
    perform private.bank_operativa_access(c.company_id, true);
  exception when others then
    puo_collegare := false;
  end;

  select array_agg(x) into ids from (
    select f.id x from public.fatture_ricevute f where f.company_cost_id = c.id and f.company_id = c.company_id
    union
    select r.id from public.rate_fornitori r where r.company_cost_id = c.id and r.company_id = c.company_id
  ) z;
  if ids is null then
    return jsonb_build_object('candidati', '[]'::jsonb, 'puo_collegare', puo_collegare);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'transaction_id', t.id,
           'data', t.booking_date,
           'importo', abs(t.amount),
           'conto', coalesce(nullif(btrim(a.display_name), ''), private.tes_nome_conto(c.company_id, t.account_id), 'Banca'),
           'causale', nullif(left(btrim(regexp_replace(coalesce(t.description, ''), '\s+', ' ', 'g')), 120), ''),
           'chiave', cand->>'chiave',
           'forza', cand->>'forza',
           'prova', e.natura in ('gia_pagata'),
           'righe', (select jsonb_agg(jsonb_build_object('tipo', rr->>'tipo', 'id', rr->>'id', 'importo', round((rr->>'quota')::numeric, 2),
                                                          'titolo', rr->>'titolo', 'di_questo_costo', (rr->>'id')::uuid = any(ids)))
                       from jsonb_array_elements(cand->'righe') rr))
           order by t.booking_date desc, t.id), '[]'::jsonb)
    into out
    from public.tesoreria_esiti e
    join public.bank_transactions t on t.id = e.transaction_id and t.company_id = c.company_id
    left join public.bank_accounts a on a.id = t.account_id and a.company_id = c.company_id
    cross join lateral jsonb_array_elements(coalesce(e.risultato->'candidati', '[]'::jsonb)) cand
   where e.company_id = c.company_id and e.scartato_at is null
     and e.esito in ('proposta', 'scelta', 'automatico')
     and t.amount < 0 and t.chiuso_senza_documento is null
     and coalesce(t.reconciliation_status, 'pending') in ('pending', 'suggestion')
     and not ((cand->>'chiave') = any(coalesce(e.scartato_chiavi, '{}')))
     -- Solo proposte che riguardano QUESTA fattura e basta: una distinta RiBa o un cumulativo di più
     -- fatture comparirebbero nel pannello di ognuna, con un «Collega» che conferma tutto il resto.
     and e.natura not in ('riba_distinta', 'cumulativo')
     and jsonb_array_length(coalesce(cand->'righe', '[]'::jsonb)) > 0
     and not exists (select 1 from jsonb_array_elements(cand->'righe') rr
                      where not ((rr->>'id') ~ '^[0-9a-f-]{36}$' and (rr->>'id')::uuid = any(ids)))
     and not exists (select 1 from public.bank_reconciliations b where b.transaction_id = t.id and b.unmatched_at is null);

  return jsonb_build_object('candidati', out, 'puo_collegare', puo_collegare);
end $function$;

REVOKE ALL ON FUNCTION public.pagamenti_banca_candidati_costo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pagamenti_banca_candidati_costo(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.pagamenti_banca_candidati_costo(uuid) IS
  'Movimenti di banca in uscita, non collegati, che il motore propone come pagamento (o prova) di una fattura '
  'o rata di questo costo. Vuoto per chi non vede la Tesoreria.';
