-- ============================================================================
-- SAL: collegamento alla rata + firma committente + vista subappaltatori
-- GIÀ APPLICATA sul live (08/08/2026 via Management API).
-- ============================================================================
-- Il modello voluto: le rate nascono dagli importi del contratto quando si
-- carica la commessa, e OGNI VERBALE SAL certifica la rata corrispondente.
-- Prima sal_records e order_installments non si conoscevano, il link di firma
-- nel PDF puntava a /firma-sal/:token che non esisteva, e signed_at non veniva
-- scritto da nessun punto del codice.

-- 1) SAL ↔ rata + stato firmato + autore
alter table public.sal_records
  add column if not exists installment_id uuid references public.order_installments(id) on delete set null;
alter table public.sal_records alter column created_by set default auth.uid();
alter table public.sal_records drop constraint if exists sal_records_stato_check;
alter table public.sal_records add constraint sal_records_stato_check
  check (stato in ('bozza','emesso','approvato','firmato'));
create index if not exists idx_sal_records_installment on public.sal_records(installment_id);

-- 2) RPC pubbliche per /firma-sal/:token (niente edge function nuova: 499/500)
create or replace function public.sal_view_by_token(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tok record; v_sal record; v_azienda text; v_commessa text; v_voci jsonb; v_rata text;
begin
  select * into v_tok from sal_signature_tokens where token = p_token;
  if v_tok is null then return jsonb_build_object('valid', false, 'reason', 'token_invalid'); end if;
  if v_tok.expires_at < now() and v_tok.signed_at is null then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  select * into v_sal from sal_records where id = v_tok.sal_id;
  select name into v_azienda from companies where id = v_tok.company_id;
  select order_code into v_commessa from orders where id = v_sal.order_id;
  select label into v_rata from order_installments where id = v_sal.installment_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'descrizione', descrizione,
           'importo_contrattuale', importo_contrattuale,
           'percentuale_avanzamento', percentuale_avanzamento,
           'importo_sal', importo_sal) order by created_at), '[]'::jsonb)
    into v_voci from sal_voci where sal_id = v_sal.id;
  return jsonb_build_object(
    'valid', true,
    'gia_firmato', v_tok.signed_at is not null,
    'firmato_da', v_tok.signed_by_name,
    'firmato_il', v_tok.signed_at,
    'numero_sal', v_sal.numero_sal,
    'data_emissione', v_sal.data_emissione,
    'importo_totale', v_sal.importo_totale,
    'note', v_sal.note,
    'azienda', v_azienda,
    'commessa', v_commessa,
    'rata', v_rata,
    'voci', v_voci);
end $$;

create or replace function public.sal_sign_with_token(p_token uuid, p_nome text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tok record;
begin
  if coalesce(trim(p_nome), '') = '' or length(trim(p_nome)) < 2 then
    return jsonb_build_object('success', false, 'reason', 'nome_mancante');
  end if;
  select * into v_tok from sal_signature_tokens
    where token = p_token and signed_at is null and expires_at >= now()
    for update;
  if v_tok is null then
    return jsonb_build_object('success', false, 'reason', 'token_non_firmabile');
  end if;
  update sal_signature_tokens
     set signed_at = now(), signed_by_name = trim(p_nome)
   where id = v_tok.id;
  update sal_records set stato = 'firmato' where id = v_tok.sal_id;
  return jsonb_build_object('success', true);
end $$;

revoke all on function public.sal_view_by_token(uuid) from public;
revoke all on function public.sal_sign_with_token(uuid, text) from public;
grant execute on function public.sal_view_by_token(uuid) to anon, authenticated;
grant execute on function public.sal_sign_with_token(uuid, text) to anon, authenticated;

-- 3) Vista subappaltatori: due bug in una. (a) il join contratti non filtrava
--    per commessa: un sub su 2 cantieri sommava i SAL dell'altro; (b) il doppio
--    LEFT JOIN su sal_subappaltatori E ritenute_garanzia faceva fan-out
--    cartesiano: 2 SAL x 2 ritenute = tutte le somme raddoppiate. Stesse
--    colonne di prima, aggregazioni spostate in LATERAL.
create or replace view public.v_subappaltatori_dashboard as
 SELECT ss.id,
    ss.company_id,
    ss.order_id,
    ss.ragione_sociale,
    ss.tipo_lavori,
    ss.responsabile,
    ss.telefono,
    ss.piva,
    ss.email,
    ss.pec,
    ss.indirizzo,
    ss.note,
    ss.campo_subappaltatore_id,
    sc.user_id AS campo_user_id,
    sc.user_email AS campo_user_email,
    COALESCE(sc.is_active, false) AS campo_is_active,
    ss.durc_scadenza,
    cs.id AS contratto_id,
    cs.importo_contrattuale,
    cs.ritenuta_garanzia_pct,
    cs.stato AS stato_contratto,
    COALESCE(sal.tot_lordo, 0::numeric) AS totale_sal_lordo,
    COALESCE(sal.tot_netto, 0::numeric) AS totale_sal_netto,
    COALESCE(rg.in_corso, 0::numeric) AS ritenute_in_corso,
    COALESCE(rg.svincolate, 0::numeric) AS ritenute_svincolate,
    COALESCE(cs.importo_contrattuale, 0::numeric) - COALESCE(sal.tot_lordo, 0::numeric) AS residuo_contrattuale,
    ss.codice_fiscale
   FROM subappaltatori_sicurezza ss
     LEFT JOIN subappaltatori sc ON sc.id = ss.campo_subappaltatore_id
     LEFT JOIN contratti_subappalto cs
       ON cs.subappaltatore_id = ss.id AND cs.order_id = ss.order_id
     LEFT JOIN LATERAL (
       SELECT sum(s2.importo_lordo) AS tot_lordo, sum(s2.importo_netto) AS tot_netto
       FROM sal_subappaltatori s2 WHERE s2.contratto_id = cs.id
     ) sal ON true
     LEFT JOIN LATERAL (
       SELECT sum(r2.importo) FILTER (WHERE r2.stato = 'trattenuta') AS in_corso,
              sum(r2.importo) FILTER (WHERE r2.stato = 'svincolata') AS svincolate
       FROM ritenute_garanzia r2 WHERE r2.contratto_id = cs.id
     ) rg ON true;
