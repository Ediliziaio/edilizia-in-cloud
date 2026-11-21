create or replace function public.contabilita_cespite_imposta(
  p_cespite uuid, p_conto_bene uuid, p_conto_fondo uuid, p_conto_ammortamento uuid,
  p_fondo_iniziale numeric, p_fondo_iniziale_anno int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cespiti;
  v_nuovo public.cespiti;
  f public.fatture_ricevute;
  v_conti jsonb;
  v_bene uuid;
  v_fondo uuid;
  v_amm uuid;
  v_riferimento text;
  v_anno int;
  v_generare boolean := false;
begin
  select * into c from public.cespiti where id = p_cespite;
  if not found then raise exception 'Cespite non trovato' using errcode = 'P0002'; end if;
  if not public.contabilita_puo_scrivere(c.company_id) and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || c.company_id, 0));
  select * into strict c from public.cespiti where id = p_cespite for update;
  v_nuovo := c;
  v_nuovo.conto_bene_id := p_conto_bene;
  v_nuovo.conto_fondo_id := p_conto_fondo;
  v_nuovo.conto_ammortamento_id := p_conto_ammortamento;
  v_conti := public.contabilita_conti_per_ruolo(c.company_id);
  v_bene := (public.contabilita_cespite_conti(v_nuovo, v_conti)->>'bene')::uuid;
  v_fondo := (public.contabilita_cespite_conti(v_nuovo, v_conti)->>'fondo')::uuid;
  v_amm := (public.contabilita_cespite_conti(v_nuovo, v_conti)->>'ammortamento')::uuid;

  if (v_bene, v_fondo, v_amm) is distinct from (
    (public.contabilita_cespite_conti(c, v_conti)->>'bene')::uuid,
    (public.contabilita_cespite_conti(c, v_conti)->>'fondo')::uuid,
    (public.contabilita_cespite_conti(c, v_conti)->>'ammortamento')::uuid
  ) and public.contabilita_documento_registrato(c.company_id, 'cessione_cespite', c.id) then
    raise exception 'Annulla la cessione prima di cambiare i conti del cespite' using errcode = '22023';
  end if;
  if v_fondo is distinct from (public.contabilita_cespite_conti(c, v_conti)->>'fondo')::uuid
    and (greatest(coalesce(c.fondo_iniziale, 0), coalesce(c.fondo_amm, 0)) > 0 or exists (
      select from public.contabilita_cespiti_quote q where q.cespite_id = c.id and q.quota > 0
    )) then
    raise exception 'Il cespite ha un fondo già registrato. Mantieni il conto del fondo e fai verificare la riclassificazione in contabilità.' using errcode = '22023';
  end if;

  if c.fattura_ricevuta_id is not null and c.fattura_linea is not null then
    select * into strict f from public.fatture_ricevute
      where id = c.fattura_ricevuta_id and company_id = c.company_id for update;
    if v_bene is null then
      raise exception 'Seleziona il conto del bene collegato alla fattura di acquisto' using errcode = '22023';
    end if;
    v_riferimento := 'conto:' || v_bene;
    if f.conti_righe->>c.fattura_linea is distinct from v_riferimento then
      v_anno := extract(year from f.data_fattura)::int;
      v_generare := public.contabilita_documento_registrato(c.company_id, 'fattura_ricevuta', f.id);
      if v_generare and exists (
        select from public.contabilita_esercizi e where e.company_id = c.company_id and e.anno = v_anno
          and (e.chiuso_il is not null or e.stampato_fino_al >= make_date(v_anno,12,31))
      ) then
        raise exception 'La fattura è in un esercizio definitivo. Registra la riclassificazione con il referente contabile prima di cambiare il conto.' using errcode = '22023';
      end if;
      update public.fatture_ricevute
        set conti_righe = coalesce(conti_righe, '{}'::jsonb) || jsonb_build_object(c.fattura_linea, v_riferimento)
        where id = f.id and company_id = c.company_id;
    end if;
  end if;

  update public.cespiti set conto_bene_id = p_conto_bene, conto_fondo_id = p_conto_fondo,
    conto_ammortamento_id = p_conto_ammortamento, fondo_iniziale = p_fondo_iniziale,
    fondo_iniziale_anno = p_fondo_iniziale_anno, updated_at = now()
    where id = c.id;

  if v_generare then
    perform public.contabilita_genera_da_documenti(c.company_id, v_anno, f.id);
    if not exists (
      select from public.contabilita_scritture s
      join public.contabilita_righe r on r.scrittura_id = s.id
      where s.company_id = c.company_id and s.origine = 'fattura_ricevuta' and s.origine_id = f.id
        and not exists (select from public.contabilita_scritture t where t.storno_di = s.id)
        and r.conto_id = v_bene and r.dare > 0
    ) then
      raise exception 'Il giornale di acquisto non è stato riallineato. Salvataggio annullato.' using errcode = '22023';
    end if;
  end if;
end;
$$;
revoke all on function public.contabilita_cespite_imposta(uuid,uuid,uuid,uuid,numeric,int) from public, anon;
grant execute on function public.contabilita_cespite_imposta(uuid,uuid,uuid,uuid,numeric,int) to authenticated, service_role;


-- Rileggi il cespite dopo il lock quando la cessione attende una riclassificazione.
do $$
declare
  v_def text := pg_get_functiondef('public.contabilita_cespite_cessione(uuid,date,numeric,uuid,boolean)'::regprocedure);
  v_attuale text := $lock$  IF NOT p_anteprima THEN PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || c.company_id, 0)); END IF;$lock$;
  v_nuovo text := $lock$  IF NOT p_anteprima THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || c.company_id, 0));
    SELECT * INTO STRICT c FROM public.cespiti WHERE id = p_cespite FOR UPDATE;
  END IF;$lock$;
begin
  if position(v_attuale in v_def) = 0 then
    raise exception 'Lock contabile mancante nella registrazione della cessione';
  end if;
  execute replace(v_def, v_attuale, v_nuovo);
end;
$$;
