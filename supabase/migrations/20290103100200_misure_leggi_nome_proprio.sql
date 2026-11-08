-- Le misure della riga lette con un nome solo: misure_leggi. Il nome misure_normalizza è del sopralluogo,
-- e serve a un'altra cosa. Vale anche il rilievo a quantità (mq, ml, pezzi).
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Le misure sempre con gli stessi nomi, in millimetri: larghezza, altezza, profondita, mq, ml, metri, pezzi.
-- `quantita` (il rilievo a mq, ml o pezzi) prende il nome dalla forma della riga.
create or replace function public.misure_leggi(p jsonb, p_forma text default null)
 returns jsonb
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case when p is null or jsonb_typeof(p) <> 'object' then null else
    nullif(jsonb_strip_nulls(jsonb_build_object(
      'larghezza', public.misura_num(coalesce(p->>'larghezza_mm', p->>'larghezza', p->>'l', p->>'L', p->>'width')),
      'altezza', public.misura_num(coalesce(p->>'altezza_mm', p->>'altezza', p->>'h', p->>'H', p->>'height')),
      'profondita', public.misura_num(coalesce(p->>'profondita_mm', p->>'profondita', p->>'profondità', p->>'p', p->>'P', p->>'depth')),
      'mq', public.misura_num(coalesce(p->>'mq', p->>'superficie', case when p_forma = 'mq' then p->>'quantita' end)),
      'ml', public.misura_num(coalesce(p->>'ml', case when p_forma = 'ml' then p->>'quantita' end)),
      'metri', public.misura_num(coalesce(p->>'metri', p->>'m', case when p_forma = 'm' then p->>'quantita' end)),
      'pezzi', public.misura_num(coalesce(p->>'pezzi', p->>'pz', case when p_forma = 'pz' or p_forma is null then p->>'quantita' end))
    )), '{}'::jsonb)
  end;
$function$;

create or replace function public.riga_misure_ordine(oi public.order_items)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare
  misure jsonb;
  fonte text;
  dettagli text;
  colore text;
  apertura text;
  etichetta text;
  testo_misure text;
  forma text;
begin
  if oi.gruppo_id is null and oi.measure_status is null then
    return null;
  end if;
  forma := to_jsonb(oi)->>'misura_forma';
  misure := public.misure_leggi(oi.misure_da_ordinare, forma);
  if misure is not null then
    fonte := 'da_ordinare';
  else
    misure := public.misure_leggi(oi.misure_rilevate, forma);
    if misure is not null then
      fonte := 'rilevate';
    else
      misure := public.misure_leggi(oi.misure_preventivo, forma);
      fonte := case when misure is not null then 'provvisorie' else 'nessuna' end;
    end if;
  end if;

  if jsonb_typeof(oi.axis_selections) = 'object' then
    select v into colore from jsonb_each_text(oi.axis_selections) a(k, v)
     where k ~* '(colore|colour|ral)' and nullif(btrim(v), '') is not null limit 1;
    select v into apertura from jsonb_each_text(oi.axis_selections) a(k, v)
     where k ~* 'apertura' and nullif(btrim(v), '') is not null limit 1;
  end if;

  dettagli := nullif(btrim(concat_ws(' · ', nullif(btrim(oi.description), ''), nullif(btrim(oi.specifiche), ''))), '');
  if dettagli is not null and nullif(btrim(oi.riferimento), '') is not null
     and left(lower(dettagli), length(btrim(oi.riferimento)) + 3) = lower(btrim(oi.riferimento)) || ' · ' then
    dettagli := nullif(btrim(substr(dettagli, length(btrim(oi.riferimento)) + 4)), '');
  end if;
  if apertura is null then
    apertura := substring(dettagli from '(?i)(anta[ -]?ribalta|alzante[ -]?scorrevole|scorrevole|vasistas|wasistas|bilico|a libro|battente|fisso)');
  end if;

  etichetta := case fonte
    when 'da_ordinare' then 'misure definitive'
    when 'rilevate' then case when oi.measure_status = 'confermato' then 'misure rilevate e confermate' else 'misure rilevate, non ancora confermate' end
    when 'provvisorie' then 'misure provvisorie'
    else 'misure da definire'
  end;
  testo_misure := public.misure_testo_breve(misure);

  return jsonb_strip_nulls(jsonb_build_object(
    'riferimento', nullif(btrim(oi.riferimento), ''),
    'misure', misure,
    'misure_fonte', fonte,
    'misura_tipo', oi.misura_tipo,
    'colore', colore,
    'apertura', apertura,
    'misure_testo', concat_ws(E'\n',
      concat_ws(' — ',
        'Rif. ' || nullif(btrim(oi.riferimento), ''),
        testo_misure,
        case oi.misura_tipo when 'foro' then 'misura foro' when 'telaio' then 'misura telaio' when 'finita' then 'misura finita' end,
        etichetta),
      nullif(concat_ws(' · ', 'Colore: ' || colore, 'Apertura: ' || apertura), ''),
      dettagli)
  ));
end;
$function$;

revoke all on function public.misure_leggi(jsonb, text) from public, anon;
revoke all on function public.riga_misure_ordine(public.order_items) from public, anon, authenticated;
