-- Riepilogo IVA ricostruito dalle righe (20281230104000): stesso risultato, 6
-- volte più veloce.
--
-- Misurato il 07/11/2026 su Innovasol (4.575 ricevute, tutte senza riepilogo):
-- la versione in SQL con CTE e finestra impiegava 2,95 secondi, perché una
-- funzione SQL che non si può incorporare nella query viene ripianificata a ogni
-- riga. Il registro acquisti di un anno era passato da 0,1 a 3,1 secondi. In
-- PL/pgSQL il piano resta in cache: 0,46 secondi sull'intero storico.
--
-- Regole invariate:
-- - se una riga non ha l'aliquota, o le righe non tornano coi totali del documento
--   (tolleranza 5 centesimi), niente riepilogo: si userà il totale;
-- - il resto degli arrotondamenti va sull'aliquota con più IVA, così il riepilogo
--   somma esattamente al totale del documento.

create or replace function public.iva_riepilogo_da_righe(p_righe jsonb, p_imponibile numeric, p_iva numeric)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  x jsonb; k text; g jsonb := '{}'::jsonb; al numeric; na text; im numeric; iv numeric;
  s_imp numeric := 0; s_iva numeric := 0;
begin
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then return null; end if;
  for x in select value from jsonb_array_elements(p_righe) loop
    if not coalesce(btrim(x ->> 'aliquota_iva') ~ '^-?[0-9]+(\.[0-9]+)?$', false) then return null; end if;
    al := btrim(x ->> 'aliquota_iva')::numeric;
    na := nullif(coalesce(x ->> 'natura', x ->> 'natura_iva'), '');
    im := coalesce(public.num_da_json(x ->> 'imponibile'), 0);
    iv := coalesce(public.num_da_json(x ->> 'imposta'), 0);
    s_imp := s_imp + im;
    s_iva := s_iva + iv;
    k := public.iva_aliquota_testo(al) || '|' || coalesce(na, '');
    g := jsonb_set(g, array[k], jsonb_build_object(
           'aliquota', public.iva_aliquota_testo(al), 'natura', na,
           'imponibile', coalesce((g -> k ->> 'imponibile')::numeric, 0) + im,
           'imposta', coalesce((g -> k ->> 'imposta')::numeric, 0) + iv,
           'n', al));
  end loop;
  if abs(s_imp - coalesce(p_imponibile, 0)) >= 0.05 or abs(s_iva - coalesce(p_iva, 0)) >= 0.05 then return null; end if;
  return public.iva_riepilogo_chiudi(g, coalesce(p_imponibile, 0) - s_imp, coalesce(p_iva, 0) - s_iva);
end $$;

create or replace function public.iva_riepilogo_da_invoice_lines(p_invoice uuid, p_imponibile numeric, p_iva numeric)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  l record; k text; g jsonb := '{}'::jsonb; trovate int := 0; s_imp numeric := 0; s_iva numeric := 0;
begin
  for l in select tax_rate, nullif(tax_nature, '') as natura, coalesce(line_net, 0) as net, coalesce(line_tax, 0) as tax
             from public.invoice_lines where invoice_id = p_invoice loop
    if l.tax_rate is null then return null; end if;
    trovate := trovate + 1;
    s_imp := s_imp + l.net;
    s_iva := s_iva + l.tax;
    k := public.iva_aliquota_testo(l.tax_rate) || '|' || coalesce(l.natura, '');
    g := jsonb_set(g, array[k], jsonb_build_object(
           'aliquota', public.iva_aliquota_testo(l.tax_rate), 'natura', l.natura,
           'imponibile', coalesce((g -> k ->> 'imponibile')::numeric, 0) + l.net,
           'imposta', coalesce((g -> k ->> 'imposta')::numeric, 0) + l.tax,
           'n', l.tax_rate));
  end loop;
  if trovate = 0 then return null; end if;
  if abs(s_imp - coalesce(p_imponibile, 0)) >= 0.05 or abs(s_iva - coalesce(p_iva, 0)) >= 0.05 then return null; end if;
  return public.iva_riepilogo_chiudi(g, coalesce(p_imponibile, 0) - s_imp, coalesce(p_iva, 0) - s_iva);
end $$;

-- Dai gruppi {chiave: {aliquota, natura, imponibile, imposta, n}} all'elenco
-- ordinato per aliquota e natura, col resto degli arrotondamenti sul gruppo con
-- più IVA (a parità, più imponibile).
create or replace function public.iva_riepilogo_chiudi(p_gruppi jsonb, p_resto_imp numeric, p_resto_iva numeric)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  k text;
begin
  -- In PL/pgSQL anche questa: una funzione SQL con finestra si ripianificherebbe a ogni documento.
  select key into k from jsonb_each(p_gruppi)
   order by abs((value ->> 'imposta')::numeric) desc, abs((value ->> 'imponibile')::numeric) desc, key
   limit 1;
  if k is null then return null; end if;
  return (
    select jsonb_agg(jsonb_build_object(
             'aliquota', value ->> 'aliquota',
             'natura', value -> 'natura',
             'imponibile', round((value ->> 'imponibile')::numeric + case when key = k then p_resto_imp else 0 end, 2),
             'imposta', round((value ->> 'imposta')::numeric + case when key = k then p_resto_iva else 0 end, 2),
             'fonte', 'righe')
           order by (value ->> 'n')::numeric, coalesce(value ->> 'natura', ''))
      from jsonb_each(p_gruppi));
end $$;

revoke all on function public.iva_riepilogo_chiudi(jsonb, numeric, numeric) from public, anon;
grant execute on function public.iva_riepilogo_chiudi(jsonb, numeric, numeric) to authenticated, service_role;
