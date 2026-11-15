-- Preventivatori → commessa: le rate a misura non svuotano più il piano (15/11/2026).
--
-- Dall'11/11 il piano di pagamento dei preventivatori (lib/preventivi/pianoPagamento.ts) può avere rate
-- «a misura»: si pagano sull'avanzamento misurato dal SAL, hanno percentuale zero e si dividono la quota che
-- le rate fisse lasciano sotto il 100%. rate_da_piano_preventivo, che trasforma il piano del preventivo nelle
-- rate della commessa (converti_modulo_commessa_atomic), voleva invece percentuali che fanno 100 e scartava le
-- righe a zero: con una rata a misura restituiva un elenco vuoto e la commessa nasceva SENZA RATE. Non conosceva
-- nemmeno «al X% dei lavori», «a fase completata» e «al collaudo», e perdeva termine di pagamento e «a misura»:
-- gli stessi difetti già corretti il 12/11 per la strada del computo (20290313170000).
--
-- Ora, per i piani a righe dei preventivatori:
--  - con almeno una rata a misura le percentuali fisse stanno sotto il 100 e il resto si divide fra le rate a
--    misura, che arrivano in commessa con importo_da_misurare = true (l'importo è una previsione: lo fissa il SAL);
--  - senza rate a misura resta la regola di prima: le percentuali fanno 100;
--  - termine_giorni e termine_fine_mese passano alla commessa;
--  - gli eventi ammessi sono quelli della tabella delle rate (meno «stato commessa», che un preventivo non sa).
-- I piani vecchi («tranche» e l'elenco con «when») non cambiano.

set local lock_timeout = '3s';

create or replace function public.rate_da_piano_preventivo(p_piano jsonb, p_totale_lordo numeric)
 returns jsonb
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare
  righe jsonb;
  r jsonb;
  n integer;
  pos integer := 0;
  somma numeric := 0;
  totale numeric := round(coalesce(p_totale_lordo, 0), 2);
  resto numeric;
  importo numeric;
  pct numeric;
  etichetta text;
  testo text;
  evento text;
  numero integer;
  a_misura boolean;
  quante_a_misura integer := 0;
  quota_a_misura numeric := 0;
  giorni integer;
  esito jsonb := '[]'::jsonb;
  ammessi constant text[] := array['data_fissa', 'firma_contratto', 'accettazione_preventivo', 'merce_magazzino',
    'consegna_cantiere', 'inizio_lavori', 'data_posa', 'sal_numero', 'sal_percentuale', 'fase_completata',
    'fine_lavori', 'collaudo', 'fattura_acconto', 'fattura_saldo'];
begin
  if p_piano is null or totale <= 0 then return '[]'::jsonb; end if;
  if jsonb_typeof(p_piano) = 'object' and jsonb_typeof(p_piano->'righe') = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object('label', x->>'nome', 'percent', x->>'percent',
             'evento', x->>'evento', 'numero', x->>'numero',
             'a_misura', coalesce(x->>'aMisura', 'false'),
             'termine_giorni', x->>'termineGiorni', 'termine_fine_mese', coalesce(x->>'termineFineMese', 'false')) order by i), '[]')
      into righe from jsonb_array_elements(p_piano->'righe') with ordinality a(x, i) where jsonb_typeof(x) = 'object';
  elsif jsonb_typeof(p_piano) = 'object' and jsonb_typeof(p_piano->'tranche') = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object('label', x->>'label', 'percent', x->>'pct') order by i), '[]')
      into righe from jsonb_array_elements(p_piano->'tranche') with ordinality a(x, i) where jsonb_typeof(x) = 'object';
  elsif jsonb_typeof(p_piano) = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(nullif(x->>'label', ''), x->>'when'),
             'percent', x->>'percentuale', 'quando', x->>'when') order by i), '[]')
      into righe from jsonb_array_elements(p_piano) with ordinality a(x, i) where jsonb_typeof(x) = 'object';
  else
    return '[]'::jsonb;
  end if;

  for r in select value from jsonb_array_elements(righe) loop
    begin
      pct := round(coalesce(nullif(r->>'percent', ''), '0')::numeric, 2);
    exception when others then
      return '[]'::jsonb;
    end;
    if pct < 0 or pct > 100 then return '[]'::jsonb; end if;
    if coalesce(r->>'a_misura', 'false') = 'true' then
      quante_a_misura := quante_a_misura + 1;
    else
      somma := somma + pct;
    end if;
  end loop;

  if quante_a_misura > 0 then
    -- Le rate fisse lasciano una quota: la dividono le rate a misura.
    if somma > 100.005 or 100 - somma <= 0.005 then return '[]'::jsonb; end if;
    quota_a_misura := 100 - somma;
  elsif abs(somma - 100) > 0.01 then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(x order by i), '[]') into righe
    from jsonb_array_elements(righe) with ordinality a(x, i)
   where coalesce(nullif(x->>'percent', ''), '0')::numeric > 0 or coalesce(x->>'a_misura', 'false') = 'true';
  n := jsonb_array_length(righe);
  if n = 0 or n > 12 then return '[]'::jsonb; end if;

  resto := totale;
  for r in select value from jsonb_array_elements(righe) loop
    pos := pos + 1;
    a_misura := coalesce(r->>'a_misura', 'false') = 'true';
    pct := case when a_misura then quota_a_misura / quante_a_misura else round(coalesce(nullif(r->>'percent', ''), '0')::numeric, 2) end;
    if pos = n then importo := greatest(0, resto);
    else importo := round(totale * pct / 100, 2); resto := resto - importo; end if;
    etichetta := left(coalesce(nullif(btrim(r->>'label'), ''), 'Rata ' || pos), 80);
    evento := r->>'evento';
    if evento is null or evento <> all (ammessi) then
      testo := lower(concat_ws(' ', r->>'label', r->>'quando'));
      evento := case
        when testo ~ 'firma|contratto|ordine' then 'firma_contratto'
        when testo ~ 'accettazion' then 'accettazione_preventivo'
        when testo ~ 'collaudo' then 'collaudo'
        when testo ~ 'fine lavori|fine dei lavori|ultimazion|saldo' then 'fine_lavori'
        when testo ~ 'inizio|avvio|apertura' then 'inizio_lavori'
        when testo ~ 'consegna' then 'consegna_cantiere'
        when testo ~ 'posa' then 'data_posa'
        else 'data_fissa' end;
    end if;
    numero := null;
    if evento = 'sal_numero' then
      begin
        numero := least(greatest(coalesce(nullif(r->>'numero', '')::integer, pos), 1), 99);
      exception when others then
        numero := pos;
      end;
    end if;
    begin
      giorni := least(greatest(coalesce(nullif(r->>'termine_giorni', '')::integer, 0), 0), 365);
    exception when others then
      giorni := 0;
    end;
    esito := esito || jsonb_build_object(
      'position', pos - 1,
      'label', etichetta,
      'type', case when etichetta ~* 'finanziam' then 'financing' when pos = n then 'balance' else 'deposit' end,
      'amount', importo,
      'is_paid', false,
      'trigger_evento', evento,
      'trigger_numero', numero,
      'giorni_preavviso', 7,
      'importo_da_misurare', a_misura,
      'termine_giorni', giorni,
      'termine_fine_mese', coalesce(r->>'termine_fine_mese', 'false') = 'true');
  end loop;
  return esito;
end $function$;
