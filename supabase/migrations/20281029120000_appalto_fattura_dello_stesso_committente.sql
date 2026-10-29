-- ════════════════════════════════════════════════════════════════════════════
-- La fattura agganciata a un rendiconto dev'essere di QUEL committente
-- ════════════════════════════════════════════════════════════════════════════
-- Trovato il 29/10/2026 camminando il flusso. «Collega una fattura già fatta»
-- apriva l'elenco di TUTTE le fatture dell'azienda — comprese quelle di altri
-- clienti — e `appalto_sal_collega_fattura` controllava l'azienda, il tipo e
-- che la fattura non fosse gia' agganciata altrove, ma non a chi fosse
-- intestata. Si poteva quindi agganciare al rendiconto di Costruzioni Alpine
-- la fattura di un condominio, senza un errore da nessuna parte.
--
-- Non e' un dettaglio di ordine: `appalto_conti_committente` legge fatturato,
-- incassato e da incassare proprio da quel legame. Una fattura sbagliata
-- sposta soldi veri da un committente all'altro nella pagina su cui il
-- titolare decide con chi continuare a lavorare.
--
-- Il controllo guarda prima l'anagrafica (`anagrafiche_native.cliente_id`, il
-- legame vero), e dove manca confronta la partita IVA o il codice fiscale
-- dello snapshot. Quando il documento non dice niente di riconoscibile NON
-- blocca: i documenti vecchi non hanno l'anagrafica, e rifiutarli renderebbe
-- impossibile sistemare uno storico. Ferma una differenza certa, non il
-- silenzio.
--
-- Il resto della funzione e' identico a 20281028160000.
-- Nessuna riga scritta. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.appalto_sal_collega_fattura(p_sal_id uuid, p_documento_id uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_sal record; v_doc record; v_cliente_doc uuid;
  v_piva_comm text; v_cf_comm text; v_piva_doc text; v_cf_doc text;
begin
  select id, company_id, committente_id, stato, numero
    into v_sal from public.appalto_sal where id = p_sal_id;
  if v_sal.id is null then
    raise exception 'Rendiconto inesistente' using errcode = '23503';
  end if;
  if auth.uid() is null
     or public.utente_bloccato()
     or public.utente_e_cliente_esterno()
     or public.utente_sola_lettura(v_sal.company_id)
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_sal.company_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_sal.company_id) then
    raise exception 'Non puoi agganciare la fattura di questo rendiconto' using errcode = '42501';
  end if;
  if v_sal.stato = 'bozza' then
    raise exception 'Il rendiconto n. % e'' ancora in bozza: le sue righe non sono congelate, non si fattura',
      v_sal.numero using errcode = '42501';
  end if;

  select id, company_id, stato, tipo, numero, anagrafica_id, cliente_snapshot
    into v_doc from public.documenti_fiscali
   where id = p_documento_id and deleted_at is null;
  if v_doc.id is null then
    raise exception 'Documento inesistente' using errcode = '23503';
  end if;
  if v_doc.company_id is distinct from v_sal.company_id then
    raise exception 'Il documento e'' di un''altra azienda' using errcode = '42501';
  end if;
  if v_doc.tipo not in ('fattura', 'fattura_pa', 'fattura_riepilogativa', 'fattura_accompagnatoria',
                        'fattura_differita_b', 'acconto_fattura', 'parcella', 'acconto_parcella',
                        'reverse_charge_interno', 'proforma') then
    raise exception 'Un documento di tipo "%" non puo'' fatturare un rendiconto', v_doc.tipo
      using errcode = '23514';
  end if;

  -- ── La fattura dev'essere INTESTATA A QUESTO COMMITTENTE ──────────────────
  select a.cliente_id into v_cliente_doc
    from public.anagrafiche_native a where a.id = v_doc.anagrafica_id;

  if v_cliente_doc is not null and v_cliente_doc is distinct from v_sal.committente_id then
    raise exception 'Quella fattura e'' intestata a un altro cliente: il rendiconto n. % e'' di un altro committente',
      v_sal.numero using errcode = '42501';
  end if;

  if v_cliente_doc is null then
    select nullif(btrim(p.vat_number), ''), nullif(btrim(p.fiscal_code), '')
      into v_piva_comm, v_cf_comm
      from public.profiles p where p.id = v_sal.committente_id;
    v_piva_doc := nullif(btrim(coalesce(v_doc.cliente_snapshot->>'partita_iva', '')), '');
    v_cf_doc   := nullif(btrim(coalesce(v_doc.cliente_snapshot->>'codice_fiscale', '')), '');
    -- Solo quando SI PUO' confrontare: una differenza certa ferma, il silenzio no.
    if v_piva_doc is not null and v_piva_comm is not null
       and upper(v_piva_doc) <> upper(v_piva_comm)
       and (v_cf_doc is null or v_cf_comm is null or upper(v_cf_doc) <> upper(v_cf_comm)) then
      raise exception 'Quella fattura ha la partita IVA % e il committente ha la %: non e'' la sua',
        v_piva_doc, v_piva_comm using errcode = '42501';
    end if;
  end if;

  update public.appalto_sal set documento_fiscale_id = p_documento_id where id = p_sal_id;

  if v_doc.stato not in ('bozza', 'annullata') and v_sal.stato <> 'fatturato' then
    update public.appalto_sal set stato = 'fatturato' where id = p_sal_id;
  end if;
exception
  when unique_violation then
    raise exception 'Quella fattura e'' gia'' agganciata a un altro rendiconto: lo stesso incasso non si conta due volte'
      using errcode = '23505';
end;
$fn$;

revoke all on function public.appalto_sal_collega_fattura(uuid, uuid) from public, anon;
grant execute on function public.appalto_sal_collega_fattura(uuid, uuid) to authenticated, service_role;

comment on function public.appalto_sal_collega_fattura(uuid, uuid) is
  'Aggancia una fattura a un rendiconto non in bozza. Deve essere della stessa azienda, di un tipo che fattura, non gia'' agganciata altrove, e intestata allo STESSO committente: altrimenti il suo incasso finirebbe nei conti di un committente che non l''ha mai ricevuta.';
