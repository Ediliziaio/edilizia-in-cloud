-- ════════════════════════════════════════════════════════════════════════════
-- Materiali per fase: libreria standard delle scomposizioni e prezzi d'acquisto
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Libreria standard: un catalogo di partenza (impianti elettrici,
--    rivelazione incendi, climatizzazione, fotovoltaico) scritto nel codice
--    (src/lib/distinta/scomposizioniStandard.ts). L'azienda lo importa con
--    «Aggiungi la libreria standard»: le scomposizioni entrano con origine
--    'standard' e SPENTE, come le proposte dell'AI; le accende chi valida i
--    materiali (can_validate_bom). codice_standard evita i doppioni se il
--    pulsante si preme due volte.
-- 2. Prezzo di un componente della scomposizione (facoltativo): è l'ultima
--    fonte del prezzo proposto per un materiale generato.
-- 3. Fonte del prezzo su order_items: listino, ultimo acquisto, scomposizione,
--    offerta aggiudicata, ordine, a mano. Quando un materiale generato entra in
--    una riga d'ordine con un prezzo, il prezzo della riga della commessa
--    diventa quello (fonte 'offerta' se il materiale era in una richiesta
--    d'offerta, altrimenti 'ordine').
-- 4. materiali_ultimi_prezzi: l'ultimo prezzo pagato per una descrizione,
--    dagli ordini emessi dell'azienda (con i permessi di chi chiama).
--
-- Colonne nuove senza default e tabelle piccole: nessuna riga riscritta.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ─── 1. Libreria standard ──────────────────────────────────────────────────

ALTER TABLE public.scomposizioni_voce
  ADD COLUMN IF NOT EXISTS codice_standard text;

COMMENT ON COLUMN public.scomposizioni_voce.codice_standard IS
  'Codice della voce nella libreria standard (es. EL-PUNTO-LUCE-INT): una sola copia per azienda.';

ALTER TABLE public.scomposizioni_voce DROP CONSTRAINT IF EXISTS scomposizioni_voce_origine_check;
ALTER TABLE public.scomposizioni_voce
  ADD CONSTRAINT scomposizioni_voce_origine_check CHECK (origine IN ('manuale', 'ai', 'standard'));

CREATE UNIQUE INDEX IF NOT EXISTS scomposizioni_voce_standard_uidx
  ON public.scomposizioni_voce (company_id, codice_standard);

-- Le proposte dell'AI e quelle della libreria standard entrano in uso solo
-- con l'approvazione di chi valida i materiali; chi le attiva resta scritto.
CREATE OR REPLACE FUNCTION public.scomposizione_approvazione()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  attivazione boolean;
begin
  new.updated_at := now();
  attivazione := new.attiva and (tg_op = 'INSERT' or not coalesce(old.attiva, false));
  if new.origine in ('ai', 'standard') and attivazione then
    if auth.uid() is not null and not public.materiali_puo('can_validate_bom', new.company_id) then
      raise exception 'Solo chi valida i materiali può approvare una scomposizione proposta (AI o libreria standard)'
        using errcode = '42501';
    end if;
    new.approvata_da := coalesce(auth.uid(), new.approvata_da);
    new.approvata_il := now();
  end if;
  if tg_op = 'UPDATE' then
    new.company_id := old.company_id;
    new.creata_da := old.creata_da;
    new.codice_standard := old.codice_standard;
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.scomposizione_approvazione() FROM PUBLIC, anon, authenticated;

-- ─── 2. Prezzo dei componenti ──────────────────────────────────────────────

ALTER TABLE public.scomposizioni_voce_componenti
  ADD COLUMN IF NOT EXISTS prezzo_unitario numeric;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scomposizioni_componenti_prezzo_check') THEN
    ALTER TABLE public.scomposizioni_voce_componenti
      ADD CONSTRAINT scomposizioni_componenti_prezzo_check CHECK (prezzo_unitario IS NULL OR prezzo_unitario >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.scomposizioni_voce_componenti.prezzo_unitario IS
  'Costo d''acquisto indicativo per unità del componente: si propone se il materiale non ha listino né acquisti precedenti.';

-- Import della libreria standard in un colpo solo: tutto o niente, con i
-- permessi di chi chiama (RLS: chi modifica le commesse o valida i materiali).
-- p_voci: [{codice_standard, nome, parole_chiave[], unita_misura, categoria, note,
--           componenti: [{descrizione, specifiche, unita_misura, quantita_per_unita, sfrido_percentuale, categoria}]}]
CREATE OR REPLACE FUNCTION public.scomposizioni_importa_standard(p_company uuid, p_voci jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
  nuova uuid;
  inserite integer := 0;
begin
  if p_company is null or jsonb_typeof(p_voci) <> 'array' then
    raise exception 'Dati della libreria non validi' using errcode = '22023';
  end if;
  if jsonb_array_length(p_voci) > 500 then
    raise exception 'Troppe voci in una volta' using errcode = '22023';
  end if;
  for v in select * from jsonb_array_elements(p_voci) loop
    continue when nullif(btrim(coalesce(v->>'codice_standard', '')), '') is null;
    continue when exists (select 1 from public.scomposizioni_voce s
                           where s.company_id = p_company and s.codice_standard = v->>'codice_standard');
    insert into public.scomposizioni_voce (company_id, nome, codice_standard, parole_chiave, unita_misura, categoria, attiva, origine, note)
    values (
      p_company,
      left(v->>'nome', 200),
      v->>'codice_standard',
      coalesce((select array_agg(left(x, 60)) from jsonb_array_elements_text(coalesce(v->'parole_chiave', '[]'::jsonb)) x), '{}'),
      nullif(v->>'unita_misura', ''),
      nullif(v->>'categoria', ''),
      false,
      'standard',
      nullif(v->>'note', '')
    )
    returning id into nuova;
    insert into public.scomposizioni_voce_componenti
      (scomposizione_id, company_id, ordine, descrizione, specifiche, unita_misura, quantita_per_unita, sfrido_percentuale, categoria)
    select nuova, p_company, (c.ord - 1)::integer,
           left(c.val->>'descrizione', 200), nullif(c.val->>'specifiche', ''),
           coalesce(nullif(c.val->>'unita_misura', ''), 'pz'),
           (c.val->>'quantita_per_unita')::numeric,
           coalesce((c.val->>'sfrido_percentuale')::numeric, 0),
           nullif(c.val->>'categoria', '')
      from jsonb_array_elements(coalesce(v->'componenti', '[]'::jsonb)) with ordinality as c(val, ord)
     where (c.val->>'quantita_per_unita')::numeric > 0;
    inserite := inserite + 1;
  end loop;
  return inserite;
end;
$function$;

REVOKE ALL ON FUNCTION public.scomposizioni_importa_standard(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scomposizioni_importa_standard(uuid, jsonb) TO authenticated, service_role;

-- ─── 3. Fonte del prezzo sulle righe della commessa ────────────────────────

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS prezzo_fonte text,
  ADD COLUMN IF NOT EXISTS prezzo_aggiornato_il timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_prezzo_fonte_check') THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_prezzo_fonte_check
      CHECK (prezzo_fonte IS NULL OR prezzo_fonte IN ('listino', 'ultimo_acquisto', 'scomposizione', 'offerta', 'ordine', 'manuale'));
  END IF;
END $$;

COMMENT ON COLUMN public.order_items.prezzo_fonte IS
  'Da dove viene il costo d''acquisto della riga: listino, ultimo acquisto, scomposizione, offerta aggiudicata, ordine, a mano. Vuota = come prima.';

-- Il prezzo d'ordine (o dell'offerta aggiudicata) aggiorna il materiale
-- generato della commessa. Solo righe con prezzo, solo materiali generati,
-- solo nella stessa azienda; ordini annullati esclusi.
CREATE OR REPLACE FUNCTION public.materiali_prezzo_da_ordine()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  prezzo numeric;
begin
  if new.order_item_id is null or coalesce(new.unit_price, 0) <= 0 then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and new.unit_price is not distinct from old.unit_price
     and new.discount_percent is not distinct from old.discount_percent
     and new.order_item_id is not distinct from old.order_item_id then
    return null;
  end if;
  if exists (select 1 from public.purchase_orders po
              where po.id = new.purchase_order_id and po.status = 'annullato') then
    return null;
  end if;
  prezzo := round(new.unit_price * (1 - coalesce(new.discount_percent, 0) / 100), 4);
  update public.order_items oi
     set purchase_price = prezzo,
         prezzo_fonte = case when oi.supplier_rfq_item_id is not null then 'offerta' else 'ordine' end,
         prezzo_aggiornato_il = now()
   where oi.id = new.order_item_id
     and oi.company_id = new.company_id
     and oi.origine_materiale is not null
     and oi.purchase_price is distinct from prezzo;
  return null;
end;
$function$;

REVOKE ALL ON FUNCTION public.materiali_prezzo_da_ordine() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS materiali_prezzo_da_ordine ON public.purchase_order_items;
CREATE TRIGGER materiali_prezzo_da_ordine
  AFTER INSERT OR UPDATE OF unit_price, discount_percent, order_item_id ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.materiali_prezzo_da_ordine();

-- ─── 4. Ultimo prezzo pagato ───────────────────────────────────────────────

-- Per ogni descrizione chiesta (confronto senza maiuscole e spazi doppi),
-- l'ultima riga d'ordine emesso con un prezzo. Con i permessi di chi chiama:
-- chi non vede gli ordini d'acquisto non riceve niente.
CREATE OR REPLACE FUNCTION public.materiali_ultimi_prezzi(p_company uuid, p_descrizioni text[])
 RETURNS TABLE (chiave text, prezzo numeric, unita text, data date, oda text)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  with richieste as (
    select distinct lower(regexp_replace(btrim(d), '\s+', ' ', 'g')) as k
      from unnest(coalesce(p_descrizioni, '{}'::text[])) d
     where btrim(coalesce(d, '')) <> ''
     limit 1000
  )
  select distinct on (r.k)
         r.k,
         round(poi.unit_price * (1 - coalesce(poi.discount_percent, 0) / 100), 4),
         poi.unit_of_measure,
         coalesce(po.issue_date, po.created_at::date),
         po.oda_number
    from richieste r
    join public.purchase_order_items poi
      on poi.company_id = p_company
     and lower(regexp_replace(btrim(poi.description), '\s+', ' ', 'g')) = r.k
    join public.purchase_orders po on po.id = poi.purchase_order_id
   where po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')
     and coalesce(poi.unit_price, 0) > 0
   order by r.k, coalesce(po.issue_date, po.created_at::date) desc, poi.created_at desc;
$function$;

REVOKE ALL ON FUNCTION public.materiali_ultimi_prezzi(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materiali_ultimi_prezzi(uuid, text[]) TO authenticated, service_role;
