-- I costi arrivano nelle voci giuste anche quando li scrivi a modo tuo
-- (9 novembre 2026).
--
-- Due difetti insieme facevano sì che su OGNI azienda vera i costi fossero
-- classificati allo 0%: tutto finiva nella voce «Costi non classificati», che
-- entra nell'EBITDA ma non dice niente. Il margine era giusto, il conto
-- economico cieco.
--
-- 1) L'elenco delle categorie non c'era. Esiste da sempre un elenco pronto
--    (45 voci), ma si carica premendo un bottone in Configurazione. Nessuno
--    l'ha premuto: nel database l'elenco esisteva solo per le due aziende
--    demo, dove l'avevamo caricato noi. Ora l'elenco lo semina una funzione
--    del database, per tutte le aziende che ci sono e per ognuna che nasce:
--    il bottone resta, ma non è più l'unico modo.
--
-- 2) L'abbinamento era carattere per carattere. «Utenze» non era «utenze»,
--    «materiali_edili» non era «materiali edili». Nelle demo si vede il
--    rimedio di allora: la stessa voce inserita due volte, una per ogni
--    maiuscola. Ora l'abbinamento ignora maiuscole, trattini, underscore e
--    spazi doppi.
--
-- Perché si può fare senza paura: i costi non classificati erano già contati
-- nell'EBITDA (voce 08b), quindi questa migrazione NON cambia il margine.
-- Sposta soldi dalla riga «non classificati» alle righe vere. Misurato sui
-- dati veri prima di applicarla: la categoria più grossa è «materiali», su 4
-- aziende, oltre tre milioni di euro che adesso vanno in «Acquisti materie».
--
-- Cosa resta fuori di proposito: «Altro», e gli acquisti di terreni e
-- immobili. Un terreno non è un costo dell'anno, è un investimento: metterlo
-- nei costi distruggerebbe il margine. Restano nella riga «non classificati»
-- e si vedono nell'elenco delle voci da sistemare, dove l'imprenditore
-- decide.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── Come si confrontano due nomi di categoria ───────────────────────────────
-- Minuscole, underscore e trattini come spazi, spazi doppi schiacciati, via
-- gli accenti. Serve anche all'indice, quindi deve essere IMMUTABLE.
create or replace function public.cg_norm_voce(p_valore text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select nullif(
    btrim(regexp_replace(
      translate(lower(p_valore), '_-àáâäèéêëìíîïòóôöùúûüç', '  aaaaeeeeiiiioooouuuuc'),
      '\s+', ' ', 'g'
    )),
    ''
  );
$$;

comment on function public.cg_norm_voce is
  'Normalizza il nome di una categoria per confrontarlo: minuscole, separatori come spazi, accenti via. Usata dalla vista dei costi e dall''indice (09/11/2026).';

create index if not exists idx_cg_class_lookup_norm
  on public.cg_classificazione_voci (company_id, source_table, public.cg_norm_voce(source_value))
  where is_active;

-- ── La vista dei costi, con l'abbinamento tollerante ───────────────────────
-- Le date restano quelle della migrazione sulla competenza: qui cambia solo
-- il modo di trovare la classificazione.
create or replace view public.v_cg_costi_classificati as
with costi_company as (
  select cc.company_id,
         coalesce(
           cc.mese_competenza,
           cc.documento_data,
           fr.data_fattura,
           cc.due_date,
           cc.paid_date
         ) as data,
         cc.amount as importo,
         cc.category as source_value,
         'company_costs'::text as source_table
    from company_costs cc
    left join fatture_ricevute fr on fr.company_cost_id = cc.id
   where cc.amount is not null
), movimenti_bancari as (
  select bt.company_id,
         coalesce(bt.value_date, bt.booking_date) as data,
         abs(bt.amount) as importo,
         bt.category as source_value,
         'bank_transactions'::text as source_table
    from bank_transactions bt
   where bt.amount < 0::numeric
     and bt.linked_scadenza_id is null
     and bt.linked_cost_id is null
     and not (bt.id in (
       select br.transaction_id from bank_reconciliations br
        where br.invoice_id is not null or br.scadenza_id is not null
     ))
     and coalesce(lower(bt.category), ''::text) !~~ 'girocont%'::text
)
select u.company_id,
       u.data,
       u.importo,
       u.source_table,
       u.source_value,
       cl.voce_chiave,
       cl.macro_voce,
       cl.tipo,
       extract(year from u.data)::integer as anno,
       extract(month from u.data)::integer as mese
  from (
    select company_id, data, importo, source_value, source_table from costi_company
    union all
    select company_id, data, importo, source_value, source_table from movimenti_bancari
  ) u
  -- Una sola classificazione per riga, sempre: con l'abbinamento tollerante
  -- due regole scritte con maiuscole diverse puntano allo stesso nome, e un
  -- join normale conterebbe il costo due volte. Il LATERAL con LIMIT 1 lo
  -- impedisce, e preferisce la regola scritta esattamente come la categoria.
  left join lateral (
    select c.voce_chiave, c.macro_voce, c.tipo
      from cg_classificazione_voci c
     where c.company_id = u.company_id
       and c.source_table = u.source_table
       and c.is_active
       and public.cg_norm_voce(c.source_value) = public.cg_norm_voce(u.source_value)
     order by (c.source_value = u.source_value) desc, c.voce_chiave
     limit 1
  ) cl on true;

comment on view public.v_cg_costi_classificati is
  'Costi del Controllo di Gestione, datati per competenza e abbinati alla classificazione ignorando maiuscole e separatori (09/11/2026). Una sola classificazione per riga: mai due.';

-- ── L'elenco delle categorie, per tutte le aziende ─────────────────────────
create or replace function public.cg_semina_classificazione_voci(p_company_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserite integer;
begin
  if p_company_id is null then
    raise exception 'company_id obbligatorio';
  end if;

  insert into cg_classificazione_voci
    (company_id, voce_chiave, voce_descrizione, macro_voce, tipo,
     source_table, source_field, source_value, ordering, is_active)
  select p_company_id, v.chiave, v.descrizione, v.macro, v.tipo,
         v.tabella, case when v.tabella = 'manual' then null else 'category' end,
         v.valore, v.ordine, true
    from (values
      -- Personale
      ('salari_stipendi',    'Salari e stipendi (banca)',   'costo_personale',      'F', 'bank_transactions', 'stipendi', 100),
      ('personale_bt',       'Personale (banca)',           'costo_personale',      'F', 'bank_transactions', 'personale', 101),
      ('salari_stipendi_cc', 'Salari e stipendi',           'costo_personale',      'F', 'company_costs',     'stipendi', 102),
      ('personale_cc',       'Personale',                   'costo_personale',      'F', 'company_costs',     'personale', 103),
      ('manodopera',         'Manodopera',                  'costo_personale',      'V', 'company_costs',     'manodopera', 104),
      ('inps',               'Contributi INPS',             'costo_personale',      'F', 'company_costs',     'inps', 110),
      ('inail',              'Contributi INAIL',            'costo_personale',      'F', 'company_costs',     'inail', 111),
      ('tfr',                'Accantonamento TFR',          'costo_personale',      'F', 'company_costs',     'tfr', 120),
      ('trasferte_personale','Trasferte personale',         'costo_personale',      'F', 'company_costs',     'trasferte', 130),
      ('viaggi_trasferte',   'Viaggi e trasferte',          'costo_personale',      'F', 'company_costs',     'viaggi trasferte', 131),
      -- Materiali
      ('materie_prime',      'Materie prime / merci',       'acquisti_materie',     'V', 'company_costs',     'merci', 200),
      ('materiali',          'Materiali',                   'acquisti_materie',     'V', 'company_costs',     'materiali', 201),
      ('materiali_edili',    'Materiali edili',             'acquisti_materie',     'V', 'company_costs',     'materiali edili', 202),
      ('forniture',          'Forniture',                   'acquisti_materie',     'V', 'company_costs',     'forniture', 203),
      ('materie_prime_bt',   'Fornitori (banca)',           'acquisti_materie',     'V', 'bank_transactions', 'fornitori', 210),
      ('materiali_bt',       'Materiali e forniture (banca)','acquisti_materie',    'V', 'bank_transactions', 'materiali e forniture', 211),
      -- Produzione e cantiere
      ('subappalti',         'Subappalti / lavorazioni',    'costi_produttivi',     'V', 'company_costs',     'subappalti', 300),
      ('carburanti_cc',      'Carburanti',                  'costi_produttivi',     'V', 'company_costs',     'carburante', 310),
      ('carburanti_furg',    'Carburanti (banca)',          'costi_produttivi',     'V', 'bank_transactions', 'carburante', 311),
      ('veicoli',            'Veicoli',                     'costi_produttivi',     'F', 'company_costs',     'veicoli', 312),
      ('veicoli_bt',         'Veicoli (banca)',             'costi_produttivi',     'F', 'bank_transactions', 'veicoli', 313),
      ('manutenzione',       'Manutenzioni e riparazioni',  'costi_produttivi',     'V', 'company_costs',     'manutenzione', 320),
      ('manutenzioni',       'Manutenzioni',                'costi_produttivi',     'V', 'company_costs',     'manutenzioni', 321),
      ('noleggi_attrezzi',   'Noleggio attrezzature',       'costi_produttivi',     'V', 'company_costs',     'noleggi', 330),
      ('noleggio_mezzi',     'Noleggio mezzi e attrezzature','costi_produttivi',    'V', 'company_costs',     'noleggio mezzi attrezzature', 331),
      ('attrezzature',       'Attrezzature',                'costi_produttivi',     'V', 'company_costs',     'attrezzature', 332),
      ('attrezzature_bt',    'Attrezzature (banca)',        'costi_produttivi',     'V', 'bank_transactions', 'attrezzature', 333),
      ('trasporti',          'Trasporti',                   'costi_produttivi',     'V', 'company_costs',     'trasporti', 334),
      ('trasporti_logistica','Trasporti e logistica',       'costi_produttivi',     'V', 'company_costs',     'trasporti logistica', 335),
      ('affitti_cc',         'Affitti immobili',            'costi_produttivi',     'F', 'company_costs',     'affitti', 340),
      ('affitto',            'Affitto',                     'costi_produttivi',     'F', 'company_costs',     'affitto', 341),
      ('affitti',            'Affitti (banca)',             'costi_produttivi',     'F', 'bank_transactions', 'affitti', 342),
      ('immobili',           'Immobili',                    'costi_produttivi',     'F', 'company_costs',     'immobili', 343),
      ('immobili_bt',        'Immobili (banca)',            'costi_produttivi',     'F', 'bank_transactions', 'immobili', 344),
      ('leasing_cc',         'Leasing',                     'costi_produttivi',     'F', 'company_costs',     'leasing', 345),
      ('leasing',            'Leasing (banca)',             'costi_produttivi',     'F', 'bank_transactions', 'leasing', 346),
      ('assicurazioni_cc',   'Assicurazioni',               'costi_produttivi',     'F', 'company_costs',     'assicurazioni', 350),
      ('assicurazioni',      'Assicurazioni (banca)',       'costi_produttivi',     'F', 'bank_transactions', 'assicurazioni', 351),
      ('utenze_cc',          'Utenze (acqua/luce/gas)',     'costi_produttivi',     'V', 'company_costs',     'utenze', 360),
      ('utenze_acqua',       'Utenze (banca)',              'costi_produttivi',     'V', 'bank_transactions', 'utenze', 361),
      ('utenze_telefonia',   'Telefonia / connettività',    'costi_produttivi',     'F', 'company_costs',     'telefonia', 362),
      ('smaltimento_rifiuti','Smaltimento rifiuti',         'costi_produttivi',     'V', 'company_costs',     'rifiuti', 370),
      ('oneri_urbanistici',  'Oneri urbanistici',           'costi_produttivi',     'V', 'company_costs',     'oneri urbanistici', 380),
      ('oneri_urbanizzazione','Oneri di urbanizzazione',    'costi_produttivi',     'V', 'company_costs',     'oneri urbanizzazione', 381),
      -- Commerciali
      ('pubblicita',         'Pubblicità',                  'costi_commerciali',    'F', 'company_costs',     'pubblicita', 400),
      ('marketing_digital',  'Marketing digitale',          'costi_commerciali',    'F', 'company_costs',     'marketing', 401),
      ('marketing_pubblicita','Marketing e pubblicità',     'costi_commerciali',    'F', 'company_costs',     'marketing pubblicita', 402),
      ('provvigioni',        'Provvigioni venditori',       'costi_commerciali',    'V', 'company_costs',     'provvigioni', 410),
      ('fiere_congressi',    'Fiere e congressi',           'costi_commerciali',    'F', 'company_costs',     'fiere', 420),
      ('rappresentanza',     'Spese di rappresentanza',     'costi_commerciali',    'V', 'company_costs',     'rappresentanza', 430),
      -- Amministrativi
      ('consulenze_fiscali', 'Commercialista',              'costi_amministrativi', 'F', 'company_costs',     'commercialista', 500),
      ('consulenze_legali',  'Studio legale',               'costi_amministrativi', 'F', 'company_costs',     'legale', 510),
      ('consulenze_lavoro',  'Consulenza del lavoro',       'costi_amministrativi', 'F', 'company_costs',     'consulenza lavoro', 511),
      ('consulenze_prof',    'Consulenze professionali',    'costi_amministrativi', 'F', 'company_costs',     'consulenze professionali', 512),
      ('professionisti',     'Professionisti',              'costi_amministrativi', 'F', 'company_costs',     'professionisti', 513),
      ('software_sw',        'Software / SaaS',             'costi_amministrativi', 'F', 'company_costs',     'software', 520),
      ('servizi',            'Servizi',                     'costi_amministrativi', 'F', 'company_costs',     'servizi', 521),
      ('cancelleria',        'Cancelleria / ufficio',       'costi_amministrativi', 'F', 'company_costs',     'cancelleria', 530),
      ('formazione',         'Formazione personale',        'costi_amministrativi', 'F', 'company_costs',     'formazione', 540),
      -- Finanziari
      ('spese_bancarie',     'Spese bancarie',              'oneri_finanziari',     'F', 'bank_transactions', 'bancario', 600),
      ('interessi_passivi',  'Interessi passivi',           'oneri_finanziari',     'F', 'company_costs',     'interessi', 610),
      ('commissioni_pos',    'Commissioni POS / circuiti',  'oneri_finanziari',     'V', 'bank_transactions', 'commissioni', 620),
      -- Tributari
      ('f24_iva',            'F24 IVA (banca)',             'oneri_tributari',      'F', 'bank_transactions', 'tasse', 700),
      ('imposte_contributi', 'Imposte e contributi (banca)','oneri_tributari',      'F', 'bank_transactions', 'imposte e contributi', 701),
      ('f24_irpef',          'F24 IRPEF / IRES',            'oneri_tributari',      'F', 'company_costs',     'f24', 710),
      ('tasse_cc',           'Tasse',                       'oneri_tributari',      'F', 'company_costs',     'tasse', 711),
      ('imu_tari',           'IMU / TARI',                  'oneri_tributari',      'F', 'company_costs',     'imu', 720),
      -- Ammortamenti (li scrive il registro cespiti)
      ('amm_immobili',       'Ammortamento immobili',       'ammortamenti',         'F', 'manual',            'amm_immobili', 800),
      ('amm_macchinari',     'Ammortamento macchinari',     'ammortamenti',         'F', 'manual',            'amm_macchinari', 810),
      ('amm_automezzi',      'Ammortamento automezzi',      'ammortamenti',         'F', 'manual',            'amm_automezzi', 820),
      ('amm_software',       'Ammortamento software',       'ammortamenti',         'F', 'manual',            'amm_software', 830),
      -- Straordinari
      ('sopravv_attive',     'Sopravvenienze attive',       'ricavi_extra',         'Z', 'prima_nota',        'sopravvenienze', 900),
      ('sopravv_passive',    'Sopravvenienze passive',      'costi_extra',          'Z', 'prima_nota',        'sopravvenienze_p', 901),
      ('plusvalenze',        'Plusvalenze',                 'ricavi_extra',         'Z', 'prima_nota',        'plusvalenze', 910),
      ('minusvalenze',       'Minusvalenze',                'costi_extra',          'Z', 'prima_nota',        'minusvalenze', 911),
      ('donazioni',          'Donazioni',                   'costi_extra',          'Z', 'company_costs',     'donazioni', 920)
    ) as v(chiave, descrizione, macro, tipo, tabella, valore, ordine)
  on conflict (company_id, voce_chiave, source_table, source_value) do nothing;

  get diagnostics v_inserite = row_count;
  return v_inserite;
end;
$$;

revoke all on function public.cg_semina_classificazione_voci(uuid) from public, anon, authenticated;

comment on function public.cg_semina_classificazione_voci is
  'Semina l''elenco standard delle categorie di costo per un''azienda. Idempotente. Chiamata dal trigger sulle aziende nuove e una volta per tutte quelle esistenti (09/11/2026).';

-- Tutte le aziende che ci sono già, una alla volta: la tabella è piccola e
-- l'inserimento è idempotente, ma meglio non tenere un lock lungo.
do $$
declare
  r record;
begin
  for r in select id from companies order by created_at loop
    perform public.cg_semina_classificazione_voci(r.id);
  end loop;
end $$;

-- E ogni azienda nuova nasce con l'elenco già dentro.
create or replace function public.cg_semina_classificazione_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cg_semina_classificazione_voci(new.id);
  return new;
end;
$$;

drop trigger if exists trg_cg_semina_classificazione on public.companies;
create trigger trg_cg_semina_classificazione
  after insert on public.companies
  for each row execute function public.cg_semina_classificazione_trigger();

-- ── Che cosa resta da sistemare ────────────────────────────────────────────
-- L'elenco delle categorie che compaiono nei costi e non hanno una voce: si
-- mostra in Configurazione, dalla più costosa, così si sistema quello che
-- conta e si lascia stare il resto.
create or replace function public.cg_voci_non_classificate(
  p_company_id uuid default null,
  p_anno integer default extract(year from current_date)::integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_righe jsonb;
begin
  v_company_id := coalesce(p_company_id, public.get_my_company_id());
  if v_company_id is null then
    raise exception 'company_id non risolvibile';
  end if;
  if v_company_id <> public.get_my_company_id()
     and not public.has_role(auth.uid(), 'super_admin'::public.app_role) then
    raise exception 'Accesso negato: company_id non autorizzato';
  end if;

  select coalesce(jsonb_agg(t.x order by t.ordine desc), '[]'::jsonb) into v_righe
    from (
      select jsonb_build_object(
               'source_table', c.source_table,
               'source_value', c.source_value,
               'righe', count(*),
               'euro', round(sum(c.importo), 2)
             ) as x,
             round(sum(c.importo), 2) as ordine
        from public.v_cg_costi_classificati c
       where c.company_id = v_company_id
         and c.anno = p_anno
         and c.macro_voce is null
         and c.source_value is not null
       group by c.source_table, c.source_value
       order by ordine desc
       limit 50
    ) t;

  return jsonb_build_object('anno', p_anno, 'voci', v_righe);
end;
$$;

revoke all on function public.cg_voci_non_classificate(uuid, integer) from public, anon;
grant execute on function public.cg_voci_non_classificate(uuid, integer) to authenticated;

comment on function public.cg_voci_non_classificate is
  'Categorie di costo senza una voce del conto economico, dalla più costosa: quello che resta da sistemare in Configurazione (09/11/2026).';
