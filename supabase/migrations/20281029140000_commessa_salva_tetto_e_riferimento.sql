-- ════════════════════════════════════════════════════════════════════════════
-- Il tetto e il numero d'ordine del committente si correggono anche dopo
-- ════════════════════════════════════════════════════════════════════════════
-- Trovato il 29/10/2026 guardando la differenza fra creare una commessa per un
-- cliente finale e crearne una in appalto. Il wizard dell'appalto chiede il
-- «tetto concordato» e il «loro numero d'ordine»; la pagina di modifica non li
-- mostrava, e il salvataggio li avrebbe comunque rifiutati. Un errore di
-- battitura sul numero d'ordine — quello senza cui molti committenti non
-- pagano — costringeva a rifare la commessa.
--
-- In `commessa_salva` i punti da toccare erano DUE, e il secondo è la trappola:
--
--  1. `c_ammesse`, l'elenco dei campi scrivibili. Senza, arriva «campo non
--     scrivibile da qui: tetto_importo»: un errore, ma almeno parlante.
--  2. la UPDATE della testata, che elenca le colonne **una per una**.
--     Aggiungere il campo solo all'elenco fa passare il controllo e poi NON
--     scrive niente: il salvataggio dice che è andato bene e il campo resta
--     vuoto. Un no-op silenzioso è peggio dell'errore, ed è esattamente quello
--     che è successo la prima volta che questa migrazione è stata scritta.
--
-- NON si aprono, di proposito: `valorizzazione` (a corpo / a misura) e
-- `appalto_contratto_id`. Cambiarli a lavoro iniziato riscriverebbe il senso
-- delle righe già rendicontate — che hanno il prezzo congelato da QUEL listino
-- — e il trigger dei prezzi rifiuterebbe ogni riga nuova con «la tariffa
-- appartiene a un altro contratto». Sulla pagina di modifica si leggono in
-- sola lettura, con scritto perché.
--
-- La funzione è lunga quattrocento righe e qui cambiano due righe. Invece di
-- ricopiarla — e rischiare di riportare indietro le correzioni fatte nel
-- frattempo — si prende la definizione VIVA con `pg_get_functiondef`, si
-- fanno le due sostituzioni e la si riesegue. Se un punto non si riconosce
-- più, la migrazione si ferma invece di indovinare.
--
-- Nessuna riga scritta. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $mig$
declare
  v_def text;
  c_lista_v constant text := '''materials_location'',''work_lat'',''work_lng''';
  c_lista_n constant text := '''materials_location'',''work_lat'',''work_lng'',''tetto_importo'',''riferimento_committente''';
  c_set_v   constant text := 'materials_location = n.materials_location, work_lat = n.work_lat, work_lng = n.work_lng,';
  c_set_n   constant text := 'materials_location = n.materials_location, work_lat = n.work_lat, work_lng = n.work_lng,'
                             || E'\n      tetto_importo = n.tetto_importo, riferimento_committente = n.riferimento_committente,';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'commessa_salva'
   limit 1;

  if v_def is null then
    raise exception 'commessa_salva non esiste: migrazione fuori ordine';
  end if;

  -- Già fatta: si riconosce dalla SCRITTURA, non dall'elenco. L'elenco da solo
  -- non basta — vedi il punto 2 in testa.
  if position('tetto_importo = n.tetto_importo' in v_def) > 0 then
    return;
  end if;

  if position(c_lista_v in v_def) = 0 and position(c_lista_n in v_def) = 0 then
    raise exception 'elenco dei campi scrivibili non riconosciuto: aggiornare la migrazione';
  end if;
  if position(c_set_v in v_def) = 0 then
    raise exception 'la UPDATE della testata non e'' riconosciuta: aggiornare la migrazione';
  end if;

  if position(c_lista_n in v_def) = 0 then
    v_def := replace(v_def, c_lista_v, c_lista_n);
  end if;
  v_def := replace(v_def, c_set_v, c_set_n);

  execute v_def;
end
$mig$;
