-- Una quantità negativa è un errore, non «niente»
-- ───────────────────────────────────────────────
-- 28/11/2026, dalle prove del caos sulla 20290630220000.
--
-- Due difetti trovati provando numeri assurdi su `avanzamento_del_giorno_salva`:
--
--  1. **La quantità negativa non veniva rifiutata: cancellava.** Il controllo «niente da
--     dichiarare» (`coalesce(quantita, 0) <= 0`) stava PRIMA del controllo sul segno, e -5 cadeva
--     lì: la funzione rispondeva «togliti: 1» e buttava via il movimento del giorno. Chi sbaglia a
--     digitare si vedeva sparire quello che aveva dichiarato, senza un errore.
--  2. **Una lavorazione che si misura a percentuale e riceve solo una quantità** passava il
--     controllo e scriveva un movimento a percentuale con la percentuale a NULL — un movimento che
--     non dice niente. Il caso opposto (a quantità, arriva solo la percentuale) era già fermato:
--     mancava la simmetria.
--
-- Qui l'ordine è quello giusto: prima si guarda se i numeri hanno senso, poi se c'è qualcosa da
-- dichiarare. Una percentuale a zero resta «oggi niente» e cancella, come prima.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

create or replace function public.avanzamento_del_giorno_salva(
  p_order uuid,
  p_data date,
  p_origine text,
  p_documento uuid,
  p_righe jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_company uuid;
  v_r jsonb;
  v_s record;
  v_base numeric;
  v_modo text;
  v_q numeric;
  v_pct numeric;
  v_scritti int := 0;
  v_togli int := 0;
  v_fermi int := 0;
  v_aperte int := 0;
  v_apertura jsonb;
  v_spostate jsonb := '[]'::jsonb;
  v_motivi jsonb := '[]'::jsonb;
begin
  if p_origine not in ('rendiconto', 'rapportino', 'ufficio', 'campo') then
    raise exception 'Origine non ammessa per l''avanzamento del giorno: %', p_origine using errcode = '22023';
  end if;
  if p_documento is null then
    raise exception 'Serve il documento che dichiara l''avanzamento.' using errcode = '22023';
  end if;
  select o.company_id into v_company from public.orders o where o.id = p_order and o.deleted_at is null;
  if v_company is null then
    raise exception 'Commessa inesistente.' using errcode = '23514';
  end if;
  if v_uid is null
     or public.utente_bloccato()
     or public.utente_e_cliente_esterno()
     or public.utente_sola_lettura(v_company)
     or not public.puo_modificare_commessa(p_order) then
    raise exception 'Non puoi dichiarare l''avanzamento di questa commessa.' using errcode = '42501';
  end if;

  if p_origine = 'rendiconto' and exists (
       select 1 from public.rendiconti_giornalieri g
        where g.id = p_documento and g.stato <> 'bozza') then
    raise exception 'Il rendiconto è già confermato: l''avanzamento si corregge con una rettifica dell''ufficio.'
      using errcode = '42501';
  end if;

  for v_r in select * from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb))
  loop
    select s.id, s.phase_id, s.a_movimenti, s.modo_avanzamento, s.quantita_contratto, s.unita_contratto
      into v_s
      from public.order_work_subphases s
      join public.order_work_phases f on f.id = s.phase_id
     where s.id = (v_r->>'sottofase_id')::uuid and f.order_id = p_order;
    if not found then
      v_fermi := v_fermi + 1;
      v_motivi := v_motivi || jsonb_build_object('sottofase', v_r->>'sottofase_id', 'motivo', 'non è una lavorazione di questa commessa');
      continue;
    end if;

    v_q := nullif(v_r->>'quantita', '')::numeric;
    v_pct := nullif(v_r->>'percentuale', '')::numeric;

    -- Prima: i numeri hanno senso? Un numero assurdo è un errore, non «niente da dichiarare».
    if v_q is not null and v_q < 0 then
      raise exception 'Una quantità fatta non può essere negativa.' using errcode = '23514';
    end if;
    if v_pct is not null and (v_pct < 0 or v_pct > 100) then
      raise exception 'Una percentuale sta fra 0 e 100.' using errcode = '23514';
    end if;

    -- Poi: niente da dichiarare oggi → si toglie quello che questo documento aveva detto.
    if coalesce(v_q, 0) <= 0 and coalesce(v_pct, 0) <= 0 then
      delete from public.avanzamento_movimenti m
       where m.sottofase_id = v_s.id and m.origine = p_origine and m.documento_id = p_documento;
      if found then v_togli := v_togli + 1; end if;
      continue;
    end if;

    v_base := coalesce(v_s.quantita_contratto, public.sottofase_quantita_totale(v_s.id));
    v_modo := coalesce(v_s.modo_avanzamento,
                       case when v_q is not null and v_base > 0 then 'quantita' else 'percentuale' end);
    if v_modo = 'quantita' and (v_base is null or v_base <= 0) then
      v_fermi := v_fermi + 1;
      v_motivi := v_motivi || jsonb_build_object('sottofase', v_s.id, 'motivo', 'si misura a quantità ma non ha una quantità di contratto');
      continue;
    end if;
    if v_modo = 'quantita' and v_q is null then
      v_fermi := v_fermi + 1;
      v_motivi := v_motivi || jsonb_build_object('sottofase', v_s.id, 'motivo', 'si misura a quantità: serve la quantità, non la percentuale');
      continue;
    end if;
    if v_modo = 'percentuale' and v_pct is null then
      v_fermi := v_fermi + 1;
      v_motivi := v_motivi || jsonb_build_object('sottofase', v_s.id, 'motivo', 'si misura a percentuale: serve la percentuale, non la quantità');
      continue;
    end if;

    if not coalesce(v_s.a_movimenti, false) then
      v_apertura := private.avanzamento_apri_sottofase(v_s.id, v_modo);
      v_aperte := v_aperte + 1;
      if coalesce((v_apertura->>'spostata')::boolean, false) then
        v_spostate := v_spostate || jsonb_build_object(
          'sottofase', v_s.id, 'prima', v_apertura->'prima', 'dopo', v_apertura->'dopo');
      end if;
    end if;

    delete from public.avanzamento_movimenti m
     where m.sottofase_id = v_s.id and m.origine = p_origine and m.documento_id = p_documento;

    perform private.avanzamento_registra(
      v_s.id, v_s.phase_id, coalesce(p_data, current_date), v_modo,
      case when v_modo = 'quantita' then v_q end,
      case when v_modo = 'percentuale' then v_pct end,
      p_origine, p_documento, v_s.unita_contratto, false,
      case when p_origine = 'rendiconto' then 'Dichiarato nel rendiconto del giorno'
           else 'Dichiarato nel rapportino' end);
    v_scritti := v_scritti + 1;
  end loop;

  return jsonb_build_object(
    'scritti', v_scritti, 'togliti', v_togli, 'fermi', v_fermi, 'motivi', v_motivi,
    'aperte', v_aperte, 'spostate_dall_apertura', v_spostate);
end;
$function$;

revoke all on function public.avanzamento_del_giorno_salva(uuid, date, text, uuid, jsonb) from public, anon;
grant execute on function public.avanzamento_del_giorno_salva(uuid, date, text, uuid, jsonb) to authenticated;
