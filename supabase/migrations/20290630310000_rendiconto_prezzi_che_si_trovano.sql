-- Il rendiconto trova da sé il prezzo della manodopera e dei materiali, quando è certo
-- ───────────────────────────────────────────────────────────────────────────────────
-- 28/11/2026, controllando un'azienda vera (Impresa Vulcano) come chiesto dal titolare.
--
-- COSA SI VEDEVA. Vulcano ha 105 rapportini, 37 voci nel listino del committente (contratto
-- d'appalto) e 48 nel listino generale. Generando il rendiconto dai rapportini della commessa
-- «TRASPORTI»: le righe nascono giuste — la persona con le sue 9 ore, il mezzo con le sue, la voce
-- libera col prezzo scritto a mano — ma **3 righe su 4 hanno prezzo 0 e fonte «mancante»**.
--
-- PERCHÉ. La riga dal rapportino porta la voce di listino solo se qualcuno ha fatto il legame:
--   * la manodopera da `orders.tariffa_manodopera_id` (nullo su quella commessa) o dalla ditta;
--   * il mezzo da `mezzi.tariffa_id` (collegato su 12 mezzi su 38);
--   * il materiale da niente: le righe dei materiali non hanno mai una voce.
-- Senza voce non c'è prezzo, e `prezzo_voce_commessa_raw` — che la catena «cantiere → committente →
-- generale» la fa già bene — non viene nemmeno interrogata.
--
-- COSA FA QUESTA MIGRAZIONE. Due ripieghi, e solo dove la scelta è **certa**: un prezzo sbagliato
-- su un documento che va al committente è peggio di un prezzo mancante, che l'app già segnala in
-- rosso e che blocca la conferma.
--
--  1. `private.voce_manodopera_predefinita(commessa, data)` — se la riga di manodopera non ha una
--     voce: (a) il listino del **committente** valido per quella commessa, voci a ora che parlano
--     di operai/manodopera/economia: se ce n'è **una sola**, è quella (su Vulcano: «Ore economia
--     operai», 32 €/ora); (b) altrimenti il listino **generale**, tipo manodopera con un prezzo: se
--     ce n'è **una sola**, è quella. Se sono due o più, non si indovina.
--  2. `private.voce_materiale_per_nome(commessa, nome, data)` — il materiale scritto nel rapportino
--     si lega alla voce **con lo stesso nome**, normalizzato (spazi, accenti, maiuscole): prima nel
--     listino del committente, poi nel generale. Nome identico, non somigliante.
--
-- QUELLO CHE RESTA A MANO, DI PROPOSITO: i mezzi. «MAN CAMION 3 ASSI · HE749NF» e «Camion 3 assi -
-- a freddo» sono la stessa cosa per una persona e due cose diverse per una macchina. Il legame si
-- fa una volta sul mezzo (`mezzi.tariffa_id`) e da lì in avanti il prezzo arriva da sé; l'editor del
-- rendiconto, dal 28/11, apre la ricerca del listino col nome del mezzo già scritto.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Un nome confrontabile: senza accenti, senza doppi spazi, minuscolo.
-- Gli accenti si tolgono con `translate`, non con `unaccent`: quell'estensione in produzione c'è,
-- ma nessuna migrazione la installa, e la ricostruzione del database da zero si fermerebbe qui
-- (il corpo di una funzione `language sql` viene analizzato alla creazione).
create or replace function private.nome_confrontabile(p_testo text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select nullif(btrim(regexp_replace(
           translate(lower(coalesce(p_testo, '')),
                     'àáâãäåèéêëìíîïòóôõöùúûüçñ',
                     'aaaaaaeeeeiiiiooooouuuucn'),
           '\s+', ' ', 'g')), '');
$function$;

revoke all on function private.nome_confrontabile(text) from public, anon, authenticated;

create or replace function private.voce_manodopera_predefinita(p_order uuid, p_data date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  o record;
  v_data date := coalesce(p_data, current_date);
  v_id uuid;
  v_quante int;
begin
  select x.id, x.company_id, x.customer_id, x.appalto_contratto_id, x.tariffa_manodopera_id into o
    from public.orders x where x.id = p_order and x.deleted_at is null;
  if not found then return null; end if;

  -- 1. Quello che l'ufficio ha già scelto sulla commessa.
  if o.tariffa_manodopera_id is not null then
    return jsonb_build_object('listino_voce_id', o.tariffa_manodopera_id, 'da', 'commessa');
  end if;

  -- 2. Il listino del committente: una sola voce a ora che parla di manodopera.
  -- Si conta e poi si prende la prima: `min()` non esiste su uuid.
  with candidate as (
    select at.id
      from public.appalto_tariffe at
      join public.appalto_contratti c on c.id = at.contratto_id and c.company_id = o.company_id
     where at.attivo
       and private.unita_normale(at.unita_misura) = 'ora'
       and at.descrizione ~* '(manodoper|operai|economia|ore uomo)'
       and (at.valido_dal is null or at.valido_dal <= v_data)
       and (at.valido_al is null or at.valido_al >= v_data)
       and (c.id = o.appalto_contratto_id
            or (o.customer_id is not null and c.committente_id = o.customer_id and c.attivo
                and (c.valido_dal is null or c.valido_dal <= v_data)
                and (c.valido_al is null or c.valido_al >= v_data)))
  )
  select count(*), (select id from candidate limit 1) into v_quante, v_id from candidate;
  if v_quante = 1 then
    return jsonb_build_object('appalto_tariffa_id', v_id, 'da', 'committente');
  end if;

  -- 3. Il listino generale: una sola voce di manodopera con un prezzo.
  with candidate as (
    select ta.id from public.tariffe_aziendali ta
     where ta.company_id = o.company_id and coalesce(ta.attivo, true) and ta.tipo = 'manodopera'
       and coalesce(ta.prezzo_vendita, 0) > 0
  )
  select count(*), (select id from candidate limit 1) into v_quante, v_id from candidate;
  if v_quante = 1 then
    return jsonb_build_object('listino_voce_id', v_id, 'da', 'generale');
  end if;

  -- Due o più: non si indovina. Il prezzo resta da scrivere, e l'app lo dice.
  return null;
end;
$function$;

revoke all on function private.voce_manodopera_predefinita(uuid, date) from public, anon, authenticated;

create or replace function private.voce_materiale_per_nome(p_order uuid, p_nome text, p_data date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  o record;
  v_data date := coalesce(p_data, current_date);
  v_nome text := private.nome_confrontabile(p_nome);
  v_id uuid;
  v_quante int;
begin
  if v_nome is null then return null; end if;
  select x.id, x.company_id, x.customer_id, x.appalto_contratto_id into o
    from public.orders x where x.id = p_order and x.deleted_at is null;
  if not found then return null; end if;

  -- Il listino del committente, per nome identico.
  with candidate as (
    select at.id
      from public.appalto_tariffe at
      join public.appalto_contratti c on c.id = at.contratto_id and c.company_id = o.company_id
     where at.attivo
       and private.nome_confrontabile(at.descrizione) = v_nome
       and (at.valido_dal is null or at.valido_dal <= v_data)
       and (at.valido_al is null or at.valido_al >= v_data)
       and (c.id = o.appalto_contratto_id
            or (o.customer_id is not null and c.committente_id = o.customer_id and c.attivo
                and (c.valido_dal is null or c.valido_dal <= v_data)
                and (c.valido_al is null or c.valido_al >= v_data)))
  )
  select count(*), (select id from candidate limit 1) into v_quante, v_id from candidate;
  if v_quante = 1 then
    return jsonb_build_object('appalto_tariffa_id', v_id, 'da', 'committente');
  end if;

  -- Il listino generale, per nome identico.
  with candidate as (
    select ta.id from public.tariffe_aziendali ta
     where ta.company_id = o.company_id and coalesce(ta.attivo, true)
       and private.nome_confrontabile(ta.nome) = v_nome
  )
  select count(*), (select id from candidate limit 1) into v_quante, v_id from candidate;
  if v_quante = 1 then
    return jsonb_build_object('listino_voce_id', v_id, 'da', 'generale');
  end if;

  return null;
end;
$function$;

revoke all on function private.voce_materiale_per_nome(uuid, text, date) from public, anon, authenticated;

-- ── Correzione subito dopo: `min()` non esiste su uuid (20290630320000) ─────────────────────────
-- Le due funzioni contavano i candidati con `count(*), min(id)`: su `uuid` non c'è `min`. Riscritte
-- contando a parte e prendendo il primo candidato con una sottoquery.
