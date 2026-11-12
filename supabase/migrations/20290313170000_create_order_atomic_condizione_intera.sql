-- La commessa nuova nasce con la condizione intera delle sue rate (12/11/2026).
--
-- `create_order_atomic` è la via da cui nasce una commessa (anche da preventivo) e inseriva
-- le rate senza soglia, fase, termine di pagamento e senza il flag «importo da misurare»:
-- una rata «al 30% dei lavori» arrivava senza la sua percentuale e restava senza data attesa.
--
-- La funzione è lunga 17 KB e qui ne cambiano sei righe: invece di riscriverla a mano
-- (e rischiare di perdere pezzi per strada) si prende la sua definizione dal catalogo e si
-- sostituisce il solo INSERT delle rate. Se il pezzo non si trova più — perché qualcuno l'ha
-- già cambiata — la migrazione si ferma e non tocca niente.
do $mig$
declare
  v_def text := pg_get_functiondef('public.create_order_atomic(jsonb,jsonb,jsonb,uuid,jsonb)'::regprocedure);
  v_col_vecchie constant text := E'giorni_preavviso, trigger_numero\n      ) VALUES (';
  v_col_nuove   constant text := E'giorni_preavviso, trigger_numero, trigger_soglia, trigger_fase, termine_giorni, termine_fine_mese, importo_da_misurare\n      ) VALUES (';
  v_val_vecchi  constant text := E'NULLIF(v_inst->>''trigger_numero'', '''')::integer\n      );';
  v_val_nuovi   constant text := E'NULLIF(v_inst->>''trigger_numero'', '''')::integer,\n        NULLIF(v_inst->>''trigger_soglia'', '''')::numeric,\n        NULLIF(btrim(v_inst->>''trigger_fase''), ''''),\n        LEAST(GREATEST(COALESCE((v_inst->>''termine_giorni'')::integer, 0), 0), 365),\n        COALESCE((v_inst->>''termine_fine_mese'')::boolean, false),\n        COALESCE((v_inst->>''importo_da_misurare'')::boolean, false)\n      );';
begin
  if position(v_col_nuove in v_def) > 0 then
    raise notice 'create_order_atomic ha già le colonne nuove: non la tocco.';
    return;
  end if;
  if position(v_col_vecchie in v_def) = 0 or position(v_val_vecchi in v_def) = 0 then
    raise exception 'L''INSERT delle rate in create_order_atomic non è quello atteso: la migrazione si ferma senza toccare niente.'
      using errcode = '22023';
  end if;
  v_def := replace(v_def, v_col_vecchie, v_col_nuove);
  v_def := replace(v_def, v_val_vecchi, v_val_nuovi);
  execute v_def;
end $mig$;
