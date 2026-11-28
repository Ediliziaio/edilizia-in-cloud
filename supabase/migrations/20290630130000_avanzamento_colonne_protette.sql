-- Le colonne che decidono l'avanzamento le scrive solo il database
-- ───────────────────────────────────────────────────────────────
-- 28/11/2026, dal controllo accessi su `avanzamento_movimenti`
-- (20290630110000 + 20290630120000), provato con utenti veri in transazioni annullate.
--
-- COSA SI POTEVA FARE PRIMA
--  1. `order_work_subphases` ha quattro colonne nuove — `a_movimenti`, `modo_avanzamento`,
--     `quantita_contratto`, `unita_contratto` — che decidono SE e COME l'avanzamento viene
--     derivato dai movimenti e su quale base di contratto. La migrazione dava ad `authenticated`
--     un GRANT di sola SELECT, ma il GRANT di tabella (`arwdDxtm` a authenticated, come su tutte
--     le tabelle del progetto) comprende già UPDATE su OGNI colonna: un permesso per colonna
--     aggiunge, non toglie. Provato: chiunque abbia «Commesse → modifica» (admin e staff)
--     cambiava tutte e quattro dal browser, 1 riga modificata. L'azienda è rispettata (sulla
--     sottofase di un'altra azienda: 0 righe), quindi non è un buco fra aziende: è una colonna
--     che decide un calcolo e che l'ufficio può spostare senza che nessun movimento lo dica —
--     esattamente la cosa che la migrazione dice di voler evitare («una variante nel computo
--     sposterebbe l'avanzamento senza nessun movimento che lo dica»).
--     Con `a_movimenti = true` messo a mano su una sottofase senza movimenti, l'avanzamento
--     derivato diventa 0 e `fatta` si spegne; con `quantita_contratto` cambiata, cambiano la
--     percentuale e quindi gli importi del SAL.
--     Il cantiere non c'entrava: `public.sottofase_guardia()` gli lascia solo la lista
--     `fatta, fatta_il, fatta_da, updated_at, percentuale, quantita_fatta`.
--  2. Su `avanzamento_movimenti` la revoca era incompleta: `revoke insert, update, delete`
--     lascia ad `authenticated` il TRUNCATE del GRANT di tabella. Provato: ogni utente
--     autenticato, di qualunque azienda, svuotava il registro di TUTTE le aziende (il TRUNCATE
--     non passa dalle regole RLS). Dal browser non è raggiungibile — PostgREST non emette
--     TRUNCATE — ma su una tabella dove le scritture sono state togliete di proposito il
--     privilegio non ha motivo di restare.
--  3. Le due funzioni di trigger `private.avanzamento_movimento_imposta` e
--     `…_applica` sono nate con l'EXECUTE predefinito a PUBLIC. Chiamate a mano rispondono
--     0A000 («trigger functions can only be called as triggers»), quindi non fanno danno, ma
--     la regola di casa è che una funzione nasca con REVOKE e un GRANT esplicito.
--
-- CHI DEVE CONTINUARE A FUNZIONARE (provato prima/dopo)
--  * `private.avanzamento_registra`, che congela `quantita_contratto`/`unita_contratto` e
--    decide `modo_avanzamento`: gira come proprietario, passa dal primo `return` della guardia;
--  * `private.avanzamento_ricalcola`, che scrive `percentuale`/`quantita_fatta`/`fatta`;
--  * il service role (edge function);
--  * la modifica normale di una sottofase dall'ufficio (nome, date, peso…);
--  * il cantiere che spunta `fatta` sulla commessa a cui è assegnato.
-- Il super admin dal browser non arriva comunque a quella riga (le policy di
-- `order_work_subphases` confrontano l'azienda della commessa con la sua): 0 righe prima e 0
-- dopo. Per lui non c'è eccezione: dalle pagine di piattaforma passa dal service role, che
-- esce al primo `return` come le funzioni definer.
--
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- 1. Il registro non si svuota dal client ────────────────────────────────────────────────────
revoke truncate on public.avanzamento_movimenti from authenticated;
revoke all on public.avanzamento_movimenti from anon;

-- 2. Le funzioni di trigger non hanno bisogno di EXECUTE ─────────────────────────────────────
revoke all on function private.avanzamento_movimento_imposta() from public, anon, authenticated;
revoke all on function private.avanzamento_movimento_applica() from public, anon, authenticated;

-- 3. La guardia della sottofase protegge le quattro colonne nuove ────────────────────────────
-- Identica a prima, con un solo blocco in più subito dopo il passaggio del proprietario
-- (le funzioni definer e il service role sono già uscite) e prima del permesso «Commesse».
create or replace function public.sottofase_guardia()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_utente uuid := (select auth.uid());
  v_cantiere constant text[] := array['fatta', 'fatta_il', 'fatta_da', 'updated_at', 'percentuale', 'quantita_fatta'];
  v_azienda uuid;
  v_commessa uuid;
  v_regola text;
  v_ruolo jsonb;
  v_puo boolean;
begin
  select f.company_id, f.order_id into v_azienda, v_commessa
    from public.order_work_phases f
   where f.id = new.phase_id;
  if v_azienda is null then
    raise exception 'La fase non esiste.' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and new.phase_id is distinct from old.phase_id then
    raise exception 'Una sottofase non cambia fase.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' or new.fatta is distinct from old.fatta then
    new.fatta_il := case when new.fatta then now() end;
    new.fatta_da := case when new.fatta then v_utente end;
  end if;
  new.updated_at := now();
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Come si misura l'avanzamento, e la base di contratto congelata, le decide il registro dei
  -- movimenti: private.avanzamento_registra e private.avanzamento_ricalcola, che girano come
  -- proprietario e sono già uscite dal return di sopra. Dal browser non si toccano, nemmeno
  -- con il permesso «Commesse → modifica». Una sottofase nuova nasce spenta.
  if tg_op = 'INSERT' then
    new.a_movimenti := false;
    new.modo_avanzamento := null;
    new.quantita_contratto := null;
    new.unita_contratto := null;
  elsif new.a_movimenti is distinct from old.a_movimenti
        or new.modo_avanzamento is distinct from old.modo_avanzamento
        or new.quantita_contratto is distinct from old.quantita_contratto
        or new.unita_contratto is distinct from old.unita_contratto then
    raise exception 'Come si misura l''avanzamento e la quantità di contratto le decide il registro dei movimenti, non la scheda.'
      using errcode = '42501';
  end if;

  if public.has_permission_for_company(v_utente, 'can_edit_orders', v_azienda) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'Le sottofasi le crea chi ha il permesso «Ordini e Commesse».'
      using errcode = '42501';
  end if;
  if (to_jsonb(new) - v_cantiere) = (to_jsonb(old) - v_cantiere) then
    if new.fatta is distinct from old.fatta or new.percentuale is distinct from old.percentuale or new.quantita_fatta is distinct from old.quantita_fatta then
      v_regola := public.fasi_regola_chi_spunta(v_azienda);
      if v_regola <> 'tutti' then
        v_ruolo := public.campo_mio_ruolo(v_commessa);
        v_puo := coalesce((v_ruolo->>'capocantiere')::boolean, false)
                 or not coalesce((v_ruolo->>'esiste_capo')::boolean, false);
        if not v_puo and v_regola = 'chi_la_fa' then
          v_puo := exists (select 1 from jsonb_array_elements(public.campo_mie_fasi(v_commessa)) e
                            where (e->>'id')::uuid = new.phase_id
                              and (coalesce((e->>'tu')::boolean, false) or nullif(e->>'squadra', '') is not null));
        end if;
        if not v_puo then
          raise exception '%', case v_regola
              when 'capi' then 'Le sottofasi le spunta il capocantiere.'
              else 'Le sottofasi le spunta chi fa quella fase, o il capocantiere.' end
            using errcode = '42501';
        end if;
      end if;
    end if;
    return new;
  end if;
  raise exception 'Dal cantiere si segna solo a che punto è una sottofase: il resto lo cambia chi ha il permesso «Ordini e Commesse».'
    using errcode = '42501';
end;
$function$;
