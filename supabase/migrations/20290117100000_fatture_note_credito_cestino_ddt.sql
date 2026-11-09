-- Fatturazione: limiti delle note di credito, ripristino dal cestino, DDT fatturato.
--
-- Provato su Demo Azienda 2 in transazione annullata (09/11/2026):
--   • due note totali su una fattura da 1.220 € passavano: 2.440 € stornati;
--   • una nota senza righe si emetteva dalla pagina di dettaglio;
--   • «Ripristina» dal cestino era sempre rifiutato: le bozze cestinate sono
--     «annullata» e il trigger di protezione vieta annullata → bozza.
--
-- Le funzioni si correggono sul testo vivo: se il punto di aggancio non c'è più la
-- migrazione si ferma, invece di riscrivere una funzione cambiata nel frattempo.

do $migrazione$
declare
  d text := pg_get_functiondef('public.documento_emetti(uuid)'::regprocedure);
  t text := pg_get_functiondef('public.documenti_fiscali_proteggi_emessi()'::regprocedure);

  a1 text := $x$ = 0 and v_doc.tipo <> 'nota_credito' then raise exception 'Il documento deve avere almeno una riga'$x$;
  a2 text := $x$v_prefisso text; v_altra record;$x$;
  a3 text := $x$  v_data := coalesce(v_doc.data_emissione, v_oggi);$x$;
  a4 text := $x$  return jsonb_build_object('id', v_doc.id, 'numero', v_numero, 'numero_progressivo', v_prog, 'anno', v_anno);$x$;
  t1 text := $x$  IF NOT public.documento_fiscale_e_immutabile(OLD.tipo, OLD.stato) THEN$x$;
begin
  if position('v_stornabile' in d) = 0 then
    if position(a1 in d) = 0 or position(a2 in d) = 0 or position(a3 in d) = 0 or position(a4 in d) = 0 then
      raise exception 'documento_emetti è cambiata: rivedere la migrazione';
    end if;
    d := replace(d, a1, $x$ = 0 then raise exception 'Il documento deve avere almeno una riga'$x$);
    d := replace(d, a2, a2 || $x$ v_fattura public.documenti_fiscali%rowtype; v_stornabile numeric;$x$);
    d := replace(d, a3, $x$  -- Una nota non può stornare più di quanto resta della fattura: il blocco sulla
  -- fattura mette in fila due note emesse nello stesso momento.
  if v_doc.tipo = 'nota_credito' and v_doc.documento_correlato_id is not null then
    select * into v_fattura from public.documenti_fiscali
     where id = v_doc.documento_correlato_id and deleted_at is null for update;
    if found then
      v_stornabile := coalesce(v_fattura.totale_da_pagare, v_fattura.totale_documento, 0)
                      - public.documento_stornato_totale(v_fattura.id);
      if abs(coalesce(v_doc.totale_da_pagare, v_doc.totale_documento, 0)) > v_stornabile + 0.01 then
        raise exception 'Questa nota di credito (% €) supera quanto resta da stornare sulla fattura % (% €).',
          abs(coalesce(v_doc.totale_da_pagare, v_doc.totale_documento, 0)), v_fattura.numero, greatest(v_stornabile, 0)
          using errcode = '22023';
      end if;
    end if;
  end if;

$x$ || a3);
    d := replace(d, a4, $x$  -- La fattura nata da un DDT lo chiude solo quando è emessa: una bozza abbandonata no.
  update public.documenti_fiscali set ddt_fatturato = true, updated_at = now()
   where company_id = v_doc.company_id and tipo = 'ddt' and ddt_fattura_id = v_doc.id;

$x$ || a4);
    execute d;
  end if;

  if position('fatturazione.ripristino' in t) = 0 then
    if position(t1 in t) = 0 then
      raise exception 'documenti_fiscali_proteggi_emessi è cambiata: rivedere la migrazione';
    end if;
    t := replace(t, t1, $x$  -- Una bozza finita nel cestino torna bozza: lo fa solo documento_ripristina.
  IF OLD.stato = 'annullata' AND NEW.stato = 'bozza'
     AND coalesce(current_setting('fatturazione.ripristino', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

$x$ || t1);
    execute t;
  end if;
end
$migrazione$;

create or replace function public.documento_ripristina(p_documento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c_fiscali constant text[] := array['fattura','fattura_pa','nota_credito','nota_debito','autofattura','fattura_riepilogativa'];
  v_doc public.documenti_fiscali%rowtype;
begin
  if auth.uid() is null then
    raise exception 'documento_ripristina: serve un utente autenticato' using errcode = '42501';
  end if;
  select * into v_doc from public.documenti_fiscali where id = p_documento_id for update;
  if not found then
    raise exception 'Documento non trovato' using errcode = 'P0002';
  end if;
  if public.user_can_access_company(v_doc.company_id) is not true
     or public.puo_gestire_documento_fiscale(v_doc.company_id, v_doc.tipo) is not true then
    raise exception 'Non hai il permesso di gestire i documenti fiscali (serve «Fatturazione»).' using errcode = '42501';
  end if;
  if v_doc.deleted_at is null then
    return jsonb_build_object('id', v_doc.id, 'stato', v_doc.stato);
  end if;

  if v_doc.stato <> 'annullata' then
    update public.documenti_fiscali set deleted_at = null, updated_at = now() where id = v_doc.id;
    return jsonb_build_object('id', v_doc.id, 'stato', v_doc.stato);
  end if;

  -- Annullata con un numero fiscale: è stata emessa, torna solo con una nuova fattura.
  if v_doc.tipo = any (c_fiscali) and v_doc.numero not like 'Bozza %' then
    raise exception 'Il documento % è stato annullato con il suo numero: resta nell''archivio, non torna in bozza.', v_doc.numero
      using errcode = '22023';
  end if;

  perform set_config('fatturazione.ripristino', 'on', true);
  update public.documenti_fiscali set stato = 'bozza', deleted_at = null, updated_at = now() where id = v_doc.id;
  perform set_config('fatturazione.ripristino', 'off', true);
  return jsonb_build_object('id', v_doc.id, 'stato', 'bozza');
end;
$$;

revoke all on function public.documento_ripristina(uuid) from public, anon;
grant execute on function public.documento_ripristina(uuid) to authenticated, service_role;
