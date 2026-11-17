-- Materiali dal computo: prima proposti, poi confermati nella scheda Articoli (17/11/2026).
--
-- «Genera dal computo» metteva i materiali direttamente negli articoli della commessa
-- (materiali_salva_generazione). Il titolare vuole confermarli lui, nella scheda Articoli:
-- il computo crea le lavorazioni e PROPONE i materiali; si spuntano quelli da comprare e
-- «Inserisci negli articoli» li mette nelle fasi. Quelli scartati non si ripropongono quando
-- si rigenera: per questo le proposte stanno in una tabella, con lo stato.
--
-- La tabella è chiusa al browser (dentro c'è il prezzo d'acquisto, che non tutti possono
-- vedere): si legge e si scrive solo con le quattro funzioni qui sotto, che controllano chi
-- modifica le commesse. Idempotente.

CREATE TABLE IF NOT EXISTS public.materiali_proposti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  computo_upload_id uuid,
  chiave text NOT NULL,
  -- La riga come la prepara la finestra (rigaDaSalvare), con la fase già risolta.
  riga jsonb NOT NULL,
  -- Spuntata in partenza: le proposte dell'AI da controllare partono spente.
  consigliata boolean NOT NULL DEFAULT true,
  stato text NOT NULL DEFAULT 'proposto' CHECK (stato IN ('proposto', 'confermato', 'scartato')),
  deciso_da uuid,
  deciso_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, chiave)
);
CREATE INDEX IF NOT EXISTS materiali_proposti_order_stato ON public.materiali_proposti (order_id, stato);

ALTER TABLE public.materiali_proposti ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.materiali_proposti FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.materiali_proposti TO service_role;

-- Chi può: modifica le commesse dell'azienda e vede questa commessa.
CREATE OR REPLACE FUNCTION public._materiali_proposti_azienda(p_order uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  azienda uuid;
  vede boolean;
begin
  select o.company_id, public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)
    into azienda, vede
    from public.orders o where o.id = p_order;
  if azienda is null or not coalesce(vede, false) then
    raise exception 'Commessa non trovata' using errcode = 'P0002';
  end if;
  if public.utente_bloccato() or not public.materiali_puo('can_edit_orders', azienda) then
    raise exception 'Serve il permesso di modificare le commesse' using errcode = '42501';
  end if;
  return azienda;
end;
$function$;
REVOKE ALL ON FUNCTION public._materiali_proposti_azienda(uuid) FROM PUBLIC, anon, authenticated;

-- La finestra «Genera dal computo» salva qui i materiali: nuovi come «proposto», quelli ancora
-- proposti si aggiornano, quelli già confermati o scartati non si toccano, e quelli che sono già
-- negli articoli (commesse generate prima del 17/11/2026) non si propongono.
CREATE OR REPLACE FUNCTION public.materiali_proponi(p_order uuid, p_righe jsonb, p_computo uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  azienda uuid := public._materiali_proposti_azienda(p_order);
  chiavi text[];
  proposti integer;
  tolti integer;
  gia_decisi integer;
  gia_articoli integer;
begin
  if jsonb_typeof(coalesce(p_righe, '[]'::jsonb)) <> 'array' then
    raise exception 'Righe non valide' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_righe) r
              where r->>'phase_id' is not null
                and not exists (select 1 from public.order_work_phases w where w.id = (r->>'phase_id')::uuid and w.order_id = p_order)) then
    raise exception 'Una fase indicata non è di questa commessa' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct r->>'chiave'), '{}') into chiavi
    from jsonb_array_elements(p_righe) r where coalesce(r->>'chiave', '') <> '';

  -- Le proposte che il nuovo computo non fa più spariscono (solo quelle ancora da decidere).
  delete from public.materiali_proposti
   where order_id = p_order and stato = 'proposto' and not (chiave = any(chiavi));
  get diagnostics tolti = row_count;

  select count(*) into gia_decisi from public.materiali_proposti
   where order_id = p_order and stato <> 'proposto' and chiave = any(chiavi);
  select count(distinct oi.chiave_materiale) into gia_articoli from public.order_items oi
   where oi.order_id = p_order and oi.chiave_materiale = any(chiavi)
     and not exists (select 1 from public.materiali_proposti mp where mp.order_id = p_order and mp.chiave = oi.chiave_materiale);

  insert into public.materiali_proposti (company_id, order_id, computo_upload_id, chiave, riga, consigliata)
  select distinct on (x.r->>'chiave') azienda, p_order, p_computo, x.r->>'chiave', x.r - 'consigliata',
         coalesce((x.r->>'consigliata')::boolean, true)
    from jsonb_array_elements(p_righe) as x(r)
   where coalesce(x.r->>'chiave', '') <> ''
     and coalesce((x.r->>'quantita_calcolata')::numeric, 0) > 0
     and not exists (select 1 from public.order_items oi where oi.order_id = p_order and oi.chiave_materiale = x.r->>'chiave')
  on conflict (order_id, chiave) do update
     set riga = excluded.riga, consigliata = excluded.consigliata, computo_upload_id = excluded.computo_upload_id, updated_at = now()
   where materiali_proposti.stato = 'proposto';

  select count(*) into proposti from public.materiali_proposti where order_id = p_order and stato = 'proposto';
  return jsonb_build_object('proposti', proposti, 'tolti', tolti, 'gia_decisi', gia_decisi, 'gia_articoli', gia_articoli);
end;
$function$;

-- Le proposte da decidere, senza prezzi.
CREATE OR REPLACE FUNCTION public.materiali_proposti_elenco(p_order uuid)
 RETURNS TABLE (id uuid, chiave text, phase_id uuid, descrizione text, specifiche text, quantita numeric,
                unita_misura text, supplier_id uuid, fornitore text, consigliata boolean, origine text, origini jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public._materiali_proposti_azienda(p_order);
  return query
  select mp.id, mp.chiave, nullif(mp.riga->>'phase_id', '')::uuid, mp.riga->>'descrizione', nullif(mp.riga->>'specifiche', ''),
         round((mp.riga->>'quantita_calcolata')::numeric, 4), mp.riga->>'unita_misura',
         nullif(mp.riga->>'supplier_id', '')::uuid, s.name, mp.consigliata, coalesce(mp.riga->>'origine', 'computo'),
         coalesce(mp.riga->'origini', '[]'::jsonb)
    from public.materiali_proposti mp
    left join public.suppliers s on s.id = nullif(mp.riga->>'supplier_id', '')::uuid and s.company_id = mp.company_id
   where mp.order_id = p_order and mp.stato = 'proposto'
   order by mp.created_at, mp.chiave;
end;
$function$;

-- «Inserisci negli articoli»: le proposte scelte diventano righe della commessa, come faceva
-- materiali_salva_generazione, ma senza togliere quelle già inserite.
CREATE OR REPLACE FUNCTION public.materiali_proposti_conferma(p_order uuid, p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  azienda uuid := public._materiali_proposti_azienda(p_order);
  bloccata text;
  inserite integer;
  scelte integer;
begin
  select w.name into bloccata
    from public.materiali_proposti mp
    join public.materiali_fasi_validazione v on v.phase_id = nullif(mp.riga->>'phase_id', '')::uuid and v.stato <> 'bozza'
    join public.order_work_phases w on w.id = v.phase_id
   where mp.order_id = p_order and mp.id = any(p_ids) and mp.stato = 'proposto'
   limit 1;
  if bloccata is not null then
    raise exception 'La fase «%» è inviata al tecnico o validata: va rimessa in bozza prima di aggiungere materiali', bloccata
      using errcode = '22023';
  end if;

  insert into public.order_items (
    order_id, name, description, quantity, status, natura_riga, phase_id, supplier_id, article_template_id,
    purchase_price, prezzo_fonte, categoria, unita_misura, specifiche, origine_materiale, quantita_netta, quantita_calcolata,
    sfrido, origini, chiave_materiale, computo_voce_id, scomposizione_id, planimetria_documento_id, locale, position)
  select p_order,
         left(mp.riga->>'descrizione', 500),
         nullif(mp.riga->>'specifiche', ''),
         round((mp.riga->>'quantita_calcolata')::numeric, 4),
         'da_ordinare', 'materiale', nullif(mp.riga->>'phase_id', '')::uuid, nullif(mp.riga->>'supplier_id', '')::uuid, at.id,
         coalesce(nullif(at.prezzo_acquisto_netto, 0), nullif(at.standard_cost, 0), riga.prezzo, 0),
         case
           when nullif(at.prezzo_acquisto_netto, 0) is not null or nullif(at.standard_cost, 0) is not null then null
           when riga.prezzo is not null and mp.riga->>'prezzo_fonte' in ('listino', 'ultimo_acquisto', 'scomposizione') then mp.riga->>'prezzo_fonte'
         end,
         mp.riga->>'categoria', mp.riga->>'unita_misura', nullif(mp.riga->>'specifiche', ''),
         coalesce(mp.riga->>'origine', 'computo'),
         (mp.riga->>'quantita_netta')::numeric, (mp.riga->>'quantita_calcolata')::numeric, (mp.riga->>'sfrido')::numeric,
         coalesce(mp.riga->'origini', '[]'::jsonb), mp.chiave,
         nullif(mp.riga->>'computo_voce_id', '')::uuid, nullif(mp.riga->>'scomposizione_id', '')::uuid,
         nullif(mp.riga->>'planimetria_documento_id', '')::uuid, mp.riga->>'locale',
         1000 + row_number() over (order by mp.created_at, mp.chiave)::integer
    from public.materiali_proposti mp
    left join public.article_templates at on at.id = nullif(mp.riga->>'article_template_id', '')::uuid and at.company_id = azienda
    cross join lateral (
      select case when jsonb_typeof(mp.riga->'purchase_price') = 'number' and (mp.riga->>'purchase_price')::numeric > 0
                  then round((mp.riga->>'purchase_price')::numeric, 4) end as prezzo
    ) riga
   where mp.order_id = p_order and mp.id = any(p_ids) and mp.stato = 'proposto'
     and not exists (select 1 from public.order_items oi where oi.order_id = p_order and oi.chiave_materiale = mp.chiave);
  get diagnostics inserite = row_count;

  update public.materiali_proposti
     set stato = 'confermato', deciso_da = auth.uid(), deciso_at = now(), updated_at = now()
   where order_id = p_order and id = any(p_ids) and stato = 'proposto';
  get diagnostics scelte = row_count;

  return jsonb_build_object('inserite', inserite, 'confermate', scelte);
end;
$function$;

-- «Scarta»: non si comprano, e rigenerando non tornano.
CREATE OR REPLACE FUNCTION public.materiali_proposti_scarta(p_order uuid, p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n integer;
begin
  perform public._materiali_proposti_azienda(p_order);
  update public.materiali_proposti
     set stato = 'scartato', deciso_da = auth.uid(), deciso_at = now(), updated_at = now()
   where order_id = p_order and id = any(p_ids) and stato = 'proposto';
  get diagnostics n = row_count;
  return n;
end;
$function$;

REVOKE ALL ON FUNCTION public.materiali_proponi(uuid, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.materiali_proposti_elenco(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.materiali_proposti_conferma(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.materiali_proposti_scarta(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materiali_proponi(uuid, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.materiali_proposti_elenco(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.materiali_proposti_conferma(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.materiali_proposti_scarta(uuid, uuid[]) TO authenticated, service_role;
