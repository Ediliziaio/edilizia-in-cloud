-- Codici del committente (piano punti aperti 16/11/2026, §4; deciso dal titolare il 16/11).
--
-- Alcuni committenti pagano scrivendo nella causale il LORO codice del cantiere o il loro numero
-- d'ordine («rif MM 311»). Sulla commessa nasce il campo «Codici del committente» (uno o più) e
-- il motore della banca (private.tes_classifica) li cerca negli incassi:
--   * codice trovato + cliente giusto (nome o IBAN) + importo che torna → candidato «forte»:
--     esito automatico, che si conferma da solo solo con l'interruttore comune
--     azienda_collegamento_automatico acceso (tesoreria_conferma_automatica, invariata);
--   * solo il codice → candidato «medio»: proposta;
--   * se il campo è vuoto (e lo è anche riferimento_committente) il codice si cerca nella
--     descrizione del lavoro (description e work_description): solo forme come «MM311»,
--     «MM 311», «AB-12345» (lettere maiuscole + almeno tre cifre).
-- Una proposta confermata a mano può aggiungere il codice alla commessa (commessa_ricorda_codice).
-- La colonna va anche in orders_visibili (il browser legge le commesse da lì).

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS codici_committente text[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.orders.codici_committente IS
  'Codici del committente (codice cantiere, numero d''ordine del cliente…): il motore della banca li cerca nelle causali degli incassi.';

-- orders_visibili: colonna in coda, opzioni della vista ripetute (create or replace le azzera).
DO $vista$
DECLARE definizione text; nuova text; opzioni text; segno text := E'\n   FROM (orders orders';
BEGIN
  definizione := pg_get_viewdef('public.orders_visibili'::regclass, false);
  IF position('codici_committente' IN definizione) > 0 THEN RETURN; END IF;
  IF position(segno IN definizione) = 0 THEN
    RAISE EXCEPTION 'orders_visibili: forma inattesa, aggiungere codici_committente a mano';
  END IF;
  nuova := replace(definizione, segno, E',\n    orders.codici_committente' || segno);
  SELECT coalesce(array_to_string(reloptions, ', '), '') INTO opzioni FROM pg_class WHERE oid = 'public.orders_visibili'::regclass;
  EXECUTE format('create or replace view public.orders_visibili %s as %s',
    CASE WHEN opzioni <> '' THEN 'with (' || opzioni || ')' ELSE '' END, nuova);
END $vista$;

-- ── Normalizzazione ──────────────────────────────────────────────────────────
-- Un codice si confronta senza spazi né segni: «MM-311», «mm 311» e «MM311» sono lo stesso.
CREATE OR REPLACE FUNCTION private.tes_codice_norm(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- Le chiavi di una causale: ogni parola, e due o tre parole vicine unite («MM 311» → MM311).
CREATE OR REPLACE FUNCTION private.tes_causale_chiavi(p text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  WITH t AS (
    SELECT x, row_number() OVER (ORDER BY n) i
      FROM unnest(regexp_split_to_array(upper(coalesce(p, '')), '[^A-Z0-9]+')) WITH ORDINALITY u(x, n)
     WHERE x <> '')
  SELECT coalesce(array_agg(DISTINCT k), '{}') FROM (
    SELECT a.x k FROM t a
    UNION ALL SELECT a.x || b.x FROM t a JOIN t b ON b.i = a.i + 1
    UNION ALL SELECT a.x || b.x || c.x FROM t a JOIN t b ON b.i = a.i + 1 JOIN t c ON c.i = a.i + 2) z
  WHERE length(k) >= 3
$$;

-- Un codice scritto a mano vale se ha almeno 3 caratteri e, se è solo numerico, almeno 4.
CREATE OR REPLACE FUNCTION private.tes_codice_valido(p text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT length(private.tes_codice_norm(p)) BETWEEN 3 AND 40
     AND (private.tes_codice_norm(p) ~ '[A-Z]' OR length(private.tes_codice_norm(p)) >= 4)
$$;

-- I codici che si riconoscono in una descrizione libera: lettere maiuscole (1-4) e almeno tre
-- cifre, attaccate o separate da uno spazio, un trattino, un punto o una barra. Non valgono le
-- sigle che precedono sempre un numero (IVA, CAP, N., via, fattura…).
CREATE OR REPLACE FUNCTION private.tes_codici_da_descrizione(p text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT coalesce(array_agg(DISTINCT m[1] || m[2]), '{}')
    FROM regexp_matches(coalesce(p, ''), '\m([A-Z]{1,4})[ ./-]?([0-9]{3,8})\M', 'g') m
   WHERE m[1] NOT IN ('IVA', 'CAP', 'N', 'NR', 'NO', 'NUM', 'FT', 'FATT', 'RIF', 'REF', 'VIA', 'CIG', 'CUP',
                      'TEL', 'CELL', 'KW', 'KWP', 'KWH', 'ANNO', 'DEL', 'DL', 'DM', 'DPR', 'UNI', 'EN', 'ISO', 'CEI')
$$;

-- I codici di una commessa con la loro fonte: quelli scritti (codici_committente e
-- riferimento_committente) o, se non ce ne sono, quelli trovati nella descrizione del lavoro.
CREATE OR REPLACE FUNCTION private.tes_codici_commessa(p_codici text[], p_riferimento text, p_descrizione text, p_lavoro text)
RETURNS TABLE(chiave text, codice text, fonte text) LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  WITH scritti AS (
    SELECT private.tes_codice_norm(x) chiave, btrim(x) codice, 'campo'::text fonte
      FROM unnest(coalesce(p_codici, '{}') || CASE WHEN nullif(btrim(p_riferimento), '') IS NOT NULL THEN ARRAY[p_riferimento] ELSE '{}'::text[] END) x
     WHERE private.tes_codice_valido(x))
  SELECT * FROM scritti
  UNION ALL
  SELECT k, k, 'descrizione'
    FROM unnest(private.tes_codici_da_descrizione(concat_ws(' ', p_descrizione, p_lavoro))) k
   WHERE NOT EXISTS (SELECT 1 FROM scritti)
$$;

-- Le commesse di una partita (documento, scadenza, rata) senza calcolare le quote.
CREATE OR REPLACE FUNCTION private.tes_ordini_riga(p_company uuid, p_tipo text, p_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT coalesce(array_agg(DISTINCT o) FILTER (WHERE o IS NOT NULL), '{}') FROM (
    SELECT f.ordine_id o FROM public.fattura_ordine f
     WHERE p_tipo IN ('documento', 'invoice') AND f.company_id = p_company AND f.fattura_id = p_id
    UNION ALL
    SELECT d.ordine_id FROM public.documenti_fiscali_elenco_operativo d
     WHERE p_tipo IN ('documento', 'invoice') AND d.company_id = p_company AND d.id = p_id
    UNION ALL
    SELECT i.order_id FROM public.order_installments i JOIN public.orders x ON x.id = i.order_id AND x.company_id = p_company
     WHERE p_tipo = 'rata' AND i.id = p_id
    UNION ALL
    SELECT s.order_id FROM public.scadenze s WHERE p_tipo = 'scadenza' AND s.company_id = p_company AND s.id = p_id) z
$$;

-- I codici delle commesse dell'azienda che compaiono in una causale: {order_id: {codice, fonte, commessa}}.
CREATE OR REPLACE FUNCTION private.tes_codici_in_causale(p_company uuid, p_causale text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  WITH ch AS (SELECT private.tes_causale_chiavi(p_causale) k)
  SELECT coalesce(jsonb_object_agg(o.id::text, jsonb_build_object('codice', c.codice, 'fonte', c.fonte,
           'commessa', coalesce(nullif(o.order_code, ''), left(o.description, 40), 'senza codice'))), '{}')
    FROM ch, public.orders o
    CROSS JOIN LATERAL (
      SELECT x.codice, x.fonte FROM private.tes_codici_commessa(o.codici_committente, o.riferimento_committente, o.description, o.work_description) x
       WHERE x.chiave = ANY (ch.k) ORDER BY x.fonte, length(x.chiave) DESC LIMIT 1) c
   WHERE o.company_id = p_company AND o.deleted_at IS NULL AND cardinality(ch.k) > 0
$$;

REVOKE ALL ON FUNCTION private.tes_codice_norm(text), private.tes_causale_chiavi(text), private.tes_codice_valido(text),
  private.tes_codici_da_descrizione(text), private.tes_codici_commessa(text[], text, text, text),
  private.tes_ordini_riga(uuid, text, uuid), private.tes_codici_in_causale(uuid, text) FROM PUBLIC, anon, authenticated;

-- ── Il motore: regola dei codici dentro tes_classifica ───────────────────────
-- Sostituzioni di testo sulla definizione in vigore; rilanciata, non applica due volte.
DO $motore$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('private.tes_classifica(uuid,uuid)'::regprocedure);
  IF position('cod_ordini' IN d) > 0 THEN RETURN; END IF;
  n := d;

  -- 1. variabili
  n := replace(n, $a$n_soggetto int; chiave_cli text;$a$,
                  $a$n_soggetto int; chiave_cli text; cod_ordini jsonb:='{}'; cod jsonb; ord_ids uuid[];$a$);
  -- 2. i codici delle commesse nella causale (solo incassi)
  n := replace(n, $a$ -- Candidati documentali
 FOR rec IN$a$, $a$ -- Codici del committente nella causale (R-CODICE, 16/11/2026): solo per gli incassi.
 IF cred THEN cod_ordini:=private.tes_codici_in_causale(p_company,causale); END IF;

 -- Candidati documentali
 FOR rec IN$a$);
  -- 3. il codice sul candidato
  n := replace(n, $a$  -- Data
  IF rec.scad IS NOT NULL$a$, $a$  -- Codice del committente: la commessa del candidato ha un codice che è nella causale.
  cod:=NULL;
  IF cod_ordini<>'{}'::jsonb THEN
   ord_ids:=private.tes_ordini_riga(p_company,rec.tipo,rec.id);
   SELECT cod_ordini->(o::text) INTO cod FROM unnest(ord_ids) o WHERE cod_ordini ? (o::text) LIMIT 1;
   IF cod IS NOT NULL THEN
    motivi:=motivi||to_jsonb(format('Codice del committente «%s» nella causale (commessa %s)',cod->>'codice',cod->>'commessa'));
   END IF;
  END IF;
  -- Data
  IF rec.scad IS NOT NULL$a$);
  -- 4. forza: codice + cliente giusto = forte; solo il codice = media
  n := replace(n, $a$forza:=CASE WHEN subj IN('iban_verificato','terzo_documentato') OR (nnum IN('si','anno') AND subj IS NOT NULL) THEN 'forte'$a$,
                  $a$forza:=CASE WHEN subj IN('iban_verificato','terzo_documentato') OR (nnum IN('si','anno') AND subj IS NOT NULL) OR (cod IS NOT NULL AND subj IS NOT NULL) THEN 'forte'$a$);
  n := replace(n, $a$WHEN subj IS NOT NULL OR (nnum IN('si','anno') AND length(private.tes_numero_nucleo(rec.numero))>=3) THEN 'media'$a$,
                  $a$WHEN subj IS NOT NULL OR cod IS NOT NULL OR (nnum IN('si','anno') AND length(private.tes_numero_nucleo(rec.numero))>=3) THEN 'media'$a$);
  -- 5. parziale su un documento indicato dal solo codice
  n := replace(n, $a$(x->>'forza'='media' AND (x->'motivi')::text LIKE '%IBAN%'));$a$,
                  $a$(x->>'forza'='media' AND (x->'motivi')::text LIKE '%IBAN%') OR (x->>'forza'='media' AND (x->'motivi')::text LIKE '%Codice del committente%'));$a$);
  -- 6. nessuna partita ma un codice: lo dice tra i dati mancanti
  n := replace(n, $a$     CASE WHEN intermediario THEN$a$,
                  $a$     CASE WHEN cod_ordini<>'{}'::jsonb THEN (SELECT format('Nella causale c''è il codice «%s» della commessa %s, ma quella commessa non ha fatture o rate aperte con questo importo',cx.valore_cod->>'codice',cx.valore_cod->>'commessa') FROM jsonb_each(cod_ordini) cx(chiave_cod,valore_cod) ORDER BY cx.chiave_cod LIMIT 1) END,
     CASE WHEN intermediario THEN$a$);

  IF (length(n) - length(replace(n, 'cod_ordini', ''))) / length('cod_ordini') < 6
     OR position('Codice del committente%' IN n) = 0 OR position('cod IS NOT NULL AND subj IS NOT NULL' IN n) = 0
     OR position('cod IS NOT NULL OR (nnum' IN n) = 0 THEN
    RAISE EXCEPTION 'tes_classifica: forma inattesa, la regola dei codici non si è innestata';
  END IF;
  EXECUTE n;
END $motore$;

-- ── Salvare e ricordare i codici ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commessa_codici_committente_salva(p_order uuid, p_codici text[])
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_company uuid; v_out text[];
BEGIN
  SELECT company_id INTO v_company FROM public.orders WHERE id = p_order AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commessa non trovata.' USING errcode = 'P0002'; END IF;
  IF coalesce(auth.jwt()->>'role', '') <> 'service_role'
     AND (auth.uid() IS NULL OR public.utente_sola_lettura(v_company) OR NOT coalesce(public.puo_modificare_commessa(p_order), false)) THEN
    RAISE EXCEPTION 'Non hai il permesso di modificare questa commessa.' USING errcode = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_codici, '{}')) x WHERE nullif(btrim(x), '') IS NOT NULL AND NOT private.tes_codice_valido(x)) THEN
    RAISE EXCEPTION 'Un codice deve avere almeno 3 caratteri (4 se sono solo cifre) e al massimo 40.' USING errcode = '22023';
  END IF;
  -- Uno per chiave (MM-311 e MM 311 sono lo stesso), nell'ordine scritto.
  SELECT coalesce(array_agg(codice ORDER BY primo), '{}') INTO v_out FROM (
    SELECT DISTINCT ON (private.tes_codice_norm(x)) upper(btrim(x)) codice, n primo
      FROM unnest(coalesce(p_codici, '{}')) WITH ORDINALITY u(x, n)
     WHERE nullif(btrim(x), '') IS NOT NULL
     ORDER BY private.tes_codice_norm(x), n) z;
  IF cardinality(v_out) > 20 THEN RAISE EXCEPTION 'Al massimo 20 codici per commessa.' USING errcode = '22023'; END IF;
  UPDATE public.orders SET codici_committente = v_out, updated_at = now() WHERE id = p_order;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.commessa_codici_committente_salva(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commessa_codici_committente_salva(uuid, text[]) TO authenticated, service_role;

-- «Ricorda questo codice» dopo una proposta confermata a mano: aggiunge, non sostituisce.
CREATE OR REPLACE FUNCTION public.commessa_ricorda_codice(p_order uuid, p_codice text)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_codici text[];
BEGIN
  SELECT codici_committente INTO v_codici FROM public.orders WHERE id = p_order AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commessa non trovata.' USING errcode = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_codici) x WHERE private.tes_codice_norm(x) = private.tes_codice_norm(p_codice)) THEN
    RETURN v_codici;
  END IF;
  RETURN public.commessa_codici_committente_salva(p_order, v_codici || ARRAY[p_codice]);
END $$;
REVOKE ALL ON FUNCTION public.commessa_ricorda_codice(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commessa_ricorda_codice(uuid, text) TO authenticated, service_role;
