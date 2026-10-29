-- ════════════════════════════════════════════════════════════════════════════
-- «Fuori contratto» vale anche per una riga a listino
-- ════════════════════════════════════════════════════════════════════════════
-- Trovato provando il modulo su Demo Azienda 2, il 28/10/2026.
--
-- `appalto_rendiconto_prepara` scriveva `extra_contratto := false` su ogni riga
-- che usa una tariffa del contratto. Risultato: era impossibile segnare «questo
-- lavoro non me l'aveva ordinato» su un lavoro pagato a listino — e quello e'
-- proprio il caso piu' frequente. Lo smaltimento che nessuno aveva previsto si
-- paga con la giornata uomo del contratto, ma NON e' dentro l'accordo: a fine
-- lavori e' la riga che si discute.
--
-- Il commento della colonna diceva già la cosa giusta («Riga fuori dall'accordo:
-- sono quelle che si litigano a fine lavori»): era il codice a dire di meno.
--
-- Adesso:
--  - riga SENZA tariffa → fuori contratto per forza (non c'e' nessun listino da
--    cui prendere il prezzo: resta come prima);
--  - riga CON tariffa → il prezzo lo decide il database come prima, ma se chi
--    la inserisce dice che e' fuori contratto, resta fuori contratto.
--
-- Nessuna riga riscritta: il valore predefinito della colonna e' `false`, quindi
-- tutte le righe che esistono restano come sono. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.appalto_rendiconto_prepara()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  v_ord record;
  v_t public.appalto_tariffe%rowtype;
  v_override numeric(14,4);
  v_costo numeric;
begin
  select o.company_id, o.order_type, o.appalto_contratto_id
    into v_ord
    from public.orders o
   where o.id = new.order_id and o.deleted_at is null;
  if not found then
    raise exception 'Commessa inesistente' using errcode = '23514';
  end if;
  if v_ord.order_type is distinct from 'appaltatore_lavoro' then
    raise exception 'Il rendiconto esiste solo sulle commesse in appalto' using errcode = '23514';
  end if;
  new.company_id := v_ord.company_id;

  if new.fase_id is not null and not exists (
    select 1 from public.order_work_phases f
     where f.id = new.fase_id and f.order_id = new.order_id
  ) then
    raise exception 'La fase deve appartenere a questa commessa' using errcode = '23514';
  end if;

  if new.tariffa_id is null then
    -- Riga libera: fuori contratto per definizione, e il prezzo lo scrive chi
    -- la inserisce (non c'e' nessun listino da cui prenderlo).
    new.extra_contratto := true;
    return new;
  end if;

  select * into v_t from public.appalto_tariffe where id = new.tariffa_id;
  if not found then
    raise exception 'Tariffa inesistente' using errcode = '23514';
  end if;
  if v_t.company_id is distinct from v_ord.company_id then
    raise exception 'La tariffa e'' di un''altra azienda' using errcode = '23514';
  end if;
  if v_ord.appalto_contratto_id is null then
    raise exception 'Questa commessa non ha un contratto: aggancialo prima di rendicontare a listino' using errcode = '23514';
  end if;
  if v_t.contratto_id is distinct from v_ord.appalto_contratto_id then
    raise exception 'La tariffa appartiene a un altro contratto' using errcode = '23514';
  end if;
  if (v_t.valido_dal is not null and new.data < v_t.valido_dal)
     or (v_t.valido_al is not null and new.data > v_t.valido_al) then
    raise exception 'La tariffa «%» non era in vigore il %', v_t.descrizione, to_char(new.data, 'DD/MM/YYYY')
      using errcode = '23514';
  end if;

  -- Lo snapshot viene dal database, non da quello che manda il client.
  select tc.prezzo_unitario into v_override
    from public.appalto_tariffe_commessa tc
   where tc.order_id = new.order_id and tc.tariffa_id = new.tariffa_id;

  new.descrizione := v_t.descrizione;
  new.unita_misura := v_t.unita_misura;
  new.prezzo_unitario := coalesce(v_override, v_t.prezzo_unitario);
  -- Il PREZZO lo decide il contratto; se il lavoro fosse dentro l'accordo, no:
  -- quello lo sa chi era in cantiere, e lo tiene.
  new.extra_contratto := coalesce(new.extra_contratto, false);

  -- Il costo: dalla tariffa aziendale collegata, se c'e'. Altrimenti resta
  -- quello che ha scritto l'utente, che del suo costo e' padrone.
  if v_t.tariffa_id is not null then
    select coalesce(ta.costo_interno, ta.prezzo_costo) into v_costo
      from public.tariffe_aziendali ta where ta.id = v_t.tariffa_id;
    if v_costo is not null and v_costo > 0 then
      new.costo_interno := round(new.quantita * v_costo, 2);
    end if;
  end if;

  return new;
end;
$fn$;
revoke all on function public.appalto_rendiconto_prepara() from public, anon, authenticated;
