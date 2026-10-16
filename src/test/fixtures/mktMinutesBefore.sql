CREATE OR REPLACE FUNCTION public.mkt_minuti_lavorativi(p_da timestamp with time zone, p_a timestamp with time zone, p_orario jsonb DEFAULT NULL::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_orario jsonb := coalesce(p_orario, '{"lun_ven":["08:30","19:00"],"sab":["09:00","13:00"],"dom":null}'::jsonb);
  v_da timestamp := p_da AT TIME ZONE 'Europe/Rome';
  v_a timestamp := p_a AT TIME ZONE 'Europe/Rome';
  v_g date;
  v_fine date;
  v_fascia jsonb;
  v_apre timestamp; v_chiude timestamp;
  v_min numeric := 0;
  v_n integer := 0;
BEGIN
  IF p_da IS NULL OR p_a IS NULL OR v_a <= v_da THEN RETURN 0; END IF;
  v_g := v_da::date;
  v_fine := least(v_a::date, v_da::date + 92);
  WHILE v_g <= v_fine LOOP
    v_fascia := CASE extract(isodow FROM v_g)::int
                  WHEN 6 THEN v_orario->'sab'
                  WHEN 7 THEN v_orario->'dom'
                  ELSE v_orario->'lun_ven' END;
    IF v_fascia IS NOT NULL AND jsonb_typeof(v_fascia) = 'array' AND jsonb_array_length(v_fascia) = 2 THEN
      v_apre := v_g + (v_fascia->>0)::time;
      v_chiude := v_g + (v_fascia->>1)::time;
      IF v_chiude > v_apre THEN
        v_min := v_min + greatest(0, extract(epoch FROM (least(v_a, v_chiude) - greatest(v_da, v_apre))) / 60);
      END IF;
    END IF;
    v_g := v_g + 1;
    v_n := v_n + 1;
  END LOOP;
  RETURN round(v_min)::integer;
END $function$
