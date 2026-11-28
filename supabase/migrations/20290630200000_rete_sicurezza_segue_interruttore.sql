-- La rete di sicurezza del rapportino segue l'interruttore del rendiconto
-- ────────────────────────────────────────────────────────────────────────────
-- 28/11/2026.
--
-- Il 27/11 è stata presa una decisione che supera il percorso costruito da
-- `20290624100000`: il rapportino torna a essere il diario del cantiere, e il
-- documento per il committente è il **rendiconto giornaliero**, che si scrive
-- a parte (migrazioni 20290629*). L'interruttore è globale:
--
--     private.rendiconto_dai_rapportini() -> false
--
-- `rapportino_voce_applica` è già stata adattata a quell'interruttore: un
-- rapportino approvato non crea più righe di rendiconto.
--
-- La rete di sicurezza «Rimasto fuori dal rendiconto», però, non lo sapeva, e
-- il suo riquadro è pubblicato. Siccome niente si crea più in automatico, ogni
-- giornata approvata di ogni azienda compariva come «non ancora un importo»:
-- **15.301 voci** in tutto il sistema, per sempre.
--
-- Il guaio peggiore non era il rumore. Le righe del rendiconto giornaliero non
-- portano `voce_libera_id` (0 su 94), quindi la rete non vedeva che quel
-- lavoro era GIÀ stato fatturato: riproponeva la voce con un «Crea riga»
-- funzionante, e crearlo avrebbe fatto una seconda riga per lo stesso lavoro.
-- Con 26 rapportini già presi da un rendiconto giornaliero, era una strada
-- aperta alla doppia fatturazione.
--
-- Qui la rete smette di parlare quando non è più lei la sorgente. La funzione
-- `rapportino_rimasto_fuori` resta com'è: se un domani l'interruttore torna
-- true, il riquadro torna a dire la verità senza altri interventi.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- L'interruttore nasce in `20290629100000_rendiconto_giornaliero`, che al
-- 28/11/2026 è applicata al database ma il cui FILE non è ancora su main (una
-- delle 20 in quella condizione). Il controllo «Complete offline database
-- reconstruction» rigioca tutte le migrazioni del solo repository: senza quella,
-- qui la funzione non esisterebbe e il replay si fermerebbe — come è successo.
-- Quindi la si crea solo se manca, con lo stesso corpo. Quando il loro file
-- arriverà su main girerà prima (20290629 < 20290630) e questo blocco non farà
-- niente.
do $guardia$
begin
  if to_regprocedure('private.rendiconto_dai_rapportini()') is null then
    create function private.rendiconto_dai_rapportini() returns boolean
      language sql immutable as $corpo$ select false $corpo$;
  end if;
end
$guardia$;

create or replace view public.v_rapportini_da_rendicontare as
select cr.id as rapportino_id,
       cr.company_id,
       cr.order_id,
       cr.data_lavoro,
       cr.user_id,
       f.sorgente,
       f.riferimento_id,
       f.descrizione,
       f.quantita,
       f.unita,
       f.vendita_proposta,
       f.motivo
  from public.campo_rapportini cr
  join public.orders o on o.id = cr.order_id and o.deleted_at is null
  cross join lateral public.rapportino_rimasto_fuori(cr.id) f
 where private.rendiconto_dai_rapportini()
   and cr.approvato
   and cr.annullato_at is null
   and public.puo_vedere_commessa(cr.order_id)
   and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', cr.company_id);

revoke all on public.v_rapportini_da_rendicontare from public, anon;
grant select on public.v_rapportini_da_rendicontare to authenticated, service_role;
