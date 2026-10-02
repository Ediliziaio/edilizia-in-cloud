-- Eliminare una bozza di fattura libera il suo numero (02/10/2026, Renova).
--
-- Da quando la bozza nasce col numero vero (20281001150000), «Elimina» dall'editor
-- annullava la bozza TENENDOSI il numero: il contatore restava al più alto e la
-- fattura dopo saltava un numero (FPR 74 nel cestino, la successiva FPR 75).
-- La numerazione deve essere continua: quel numero è di chi lo emette dopo.
--
-- documento_elimina_bozza(id): per le bozze dei documenti fiscali
--   · la bozza va nel cestino (annullata + deleted_at) come prima, ma con un
--     segnaposto «Bozza XXXXXXXX» al posto del numero: l'indice unico
--     (azienda, tipo, numero, anno) non la vede più e le regole della serie
--     escludono già i «Bozza …»;
--   · il contatore torna al numero più alto ancora in uso nell'anno, quindi la
--     prossima fattura prende il numero liberato.
-- Le fatture emesse non si toccano (si stornano con una nota di credito).
--
-- Una tantum: la bozza FPR 74/26 di Renova, annullata prima di questa funzione,
-- è stata liberata a mano nello stesso modo.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.documento_elimina_bozza(p_documento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c_fiscali constant text[] := array['fattura','fattura_pa','nota_credito','nota_debito','autofattura','fattura_riepilogativa'];
  c_serie_ft constant text[] := array['fattura','fattura_pa','nota_debito','autofattura','fattura_riepilogativa'];
  v_doc      public.documenti_fiscali%rowtype;
  v_ana      public.anagrafica_azienda%rowtype;
  v_serie    text[];
  v_massimo  integer;
  v_ora      timestamptz := now();
  v_liberato boolean := false;
begin
  if auth.uid() is null then
    raise exception 'documento_elimina_bozza: serve un utente autenticato' using errcode = '42501';
  end if;
  select * into v_doc from public.documenti_fiscali where id = p_documento_id for update;
  if not found then
    raise exception 'Documento non trovato' using errcode = 'P0002';
  end if;
  if public.user_can_access_company(v_doc.company_id) is not true then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  if not public.puo_gestire_documento_fiscale(v_doc.company_id, v_doc.tipo) then
    raise exception 'Non hai il permesso di gestire i documenti fiscali (serve «Fatturazione»).' using errcode = '42501';
  end if;
  if v_doc.stato <> 'bozza' and v_doc.stato <> 'annullata' then
    raise exception 'I documenti emessi non possono essere eliminati. Emetti una nota di credito per stornare la fattura.'
      using errcode = '22023';
  end if;

  perform set_config('fatturazione.emissione', 'on', true);
  if v_doc.tipo = any (c_fiscali) and v_doc.numero not like 'Bozza %' then
    update public.documenti_fiscali
       set stato = 'annullata', deleted_at = coalesce(deleted_at, v_ora), updated_at = v_ora,
           numero = 'Bozza ' || upper(left(replace(id::text, '-', ''), 8))
     where id = v_doc.id;

    -- Il contatore della serie torna al più alto numero ancora in uso.
    select * into v_ana from public.anagrafica_azienda a where a.company_id = v_doc.company_id for update;
    if found and (v_doc.tipo = any (c_serie_ft) or (v_doc.tipo = 'nota_credito' and coalesce(v_ana.nc_serie_condivisa, false))) then
      v_serie := c_serie_ft || case when coalesce(v_ana.nc_serie_condivisa, false) then array['nota_credito'] else array[]::text[] end;
      if v_ana.anno_corrente_fattura = v_doc.anno then
        select coalesce(max(d.numero_progressivo), 0) into v_massimo
          from public.documenti_fiscali d
         where d.company_id = v_doc.company_id and d.anno = v_doc.anno
           and d.tipo = any (v_serie) and d.numero not like 'Bozza %';
        if v_massimo < coalesce(v_ana.ultimo_numero_fattura, 0) then
          update public.anagrafica_azienda set ultimo_numero_fattura = v_massimo where company_id = v_doc.company_id;
          v_liberato := true;
        end if;
      end if;
    end if;
  else
    update public.documenti_fiscali
       set stato = 'annullata', deleted_at = coalesce(deleted_at, v_ora), updated_at = v_ora
     where id = v_doc.id;
  end if;
  perform set_config('fatturazione.emissione', 'off', true);

  return jsonb_build_object('id', v_doc.id, 'numero_liberato', v_liberato);
end;
$function$;

revoke all on function public.documento_elimina_bozza(uuid) from public, anon;
grant execute on function public.documento_elimina_bozza(uuid) to authenticated;
