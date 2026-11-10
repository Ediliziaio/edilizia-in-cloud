-- Tre funzioni di trigger lasciate eseguibili da anon (igiene, non un buco).
--
-- COSA SI POTEVA FARE PRIMA
-- Niente, in pratica: le tre funzioni restituiscono `trigger`, e una funzione
-- che ritorna trigger non e' chiamabile come RPC. PostgREST non la espone, e
-- una chiamata diretta finisce con «trigger functions can only be called as
-- triggers» (SQLSTATE 0A000) prima di eseguire una sola riga del corpo. Il
-- GRANT a PUBLIC/anon e' quindi inutile, non pericoloso.
--
-- Perche' toglierlo: come dice il CLAUDE.md, «le funzioni di trigger non hanno
-- bisogno di alcun EXECUTE (il privilegio non viene controllato allo scatto)».
-- Finche' il GRANT c'e', queste tre restano in v_funzioni_aperte_ad_anon con
-- motivo NON CLASSIFICATA e coprono di rumore le righe che contano davvero:
-- la prossima funzione aperta per sbaglio si perde in mezzo a loro.
--
-- PROVATO COME
-- Censimento (scripts/accessi/censimento.sql), sezione 3: tre righe NON
-- CLASSIFICATA. Per ognuna il catalogo dice prorettype = trigger e che e' gia'
-- agganciata a un trigger vero (pg_trigger.tgfoid), quindi il REVOKE non puo'
-- rompere nessuna chiamata.
--
-- CHI DEVE CONTINUARE A FUNZIONARE
-- I trigger che le usano: lo scatto non controlla EXECUTE, quindi continuano a
-- funzionare identici. Nessun codice applicativo le chiama per nome.

set local lock_timeout = '3s';

revoke all on function public.cg_semina_classificazione_trigger() from public, anon, authenticated;
revoke all on function public.rapportino_voci_approvazione() from public, anon, authenticated;
revoke all on function public.rapportino_voci_trg() from public, anon, authenticated;

-- Rete di sicurezza: le tre devono restare agganciate a un trigger e senza
-- privilegi per anon.
do $verifica$
declare
  v_nome text;
  v_oid oid;
begin
  foreach v_nome in array array['cg_semina_classificazione_trigger',
                                'rapportino_voci_approvazione',
                                'rapportino_voci_trg'] loop
    select p.oid into v_oid
      from pg_catalog.pg_proc p
     where p.pronamespace = 'public'::pg_catalog.regnamespace and p.proname = v_nome
       and p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype;
    if v_oid is null then
      raise exception '%: non e'' una funzione di trigger, non toccarla cosi''', v_nome;
    end if;
    if not exists (select 1 from pg_catalog.pg_trigger t where t.tgfoid = v_oid) then
      raise exception '%: nessun trigger la usa, da guardare prima di revocare', v_nome;
    end if;
    if pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE') then
      raise exception '%: anon ha ancora EXECUTE', v_nome;
    end if;
  end loop;
end $verifica$;
