-- ════════════════════════════════════════════════════════════════════════════
-- Chi ha portato la merce — e la stessa bolla non si carica due volte
-- ════════════════════════════════════════════════════════════════════════════
-- Seguito delle fasi 1-3 di docs/piano-ddt-bolle-fatture.md.
--
-- IL RITIRO NON ERA PREVISTO. La scheda della bolla chiedeva corriere, targa,
-- autista e telefono dell'autista: campi che hanno senso solo se qualcun altro
-- ha portato la merce. Ma molto spesso non la porta nessuno: si va a ritirarla,
-- col furgone dell'azienda, e il magazzino la carica direttamente. Misurato il
-- 29/10/2026: su 232 bolle, **231 non hanno nessun corriere**. Quel riquadro
-- era vuoto nel 99,6% dei casi, e occupava il posto migliore della pagina.
--
-- L'AI lo legge già. `ddt-ai-extract` estrae `vettore.tipo`
-- ("mittente|destinatario|terzi") e `trasporto.porto` ("franco|assegnato"):
-- «destinatario» vuol dire che il trasporto l'abbiamo fatto noi, cioè un
-- ritiro. Lo leggeva e lo buttavamo via, come le righe merce.
--
--   trasporto_a_cura_di   'fornitore' l'ha portata lui col suo mezzo;
--                         'noi'       siamo andati a ritirarla (ritiro);
--                         'terzi'     un corriere (GLS, DHL, un padroncino).
--                         NULL        non si sa: non è 'fornitore' per finta.
--   porto                 'franco' (trasporto compreso) o 'assegnato' (a nostro
--                         carico): serve a sapere se nella fattura di fine mese
--                         ci sarà anche una riga di trasporto.
--
-- Non servono colonne nuove per il ritiro: `autista_nome` è chi è andato,
-- `targa_mezzo` è il furgone. Cambia l'etichetta, non il dato — una colonna in
-- più per dire la stessa cosa in un altro contesto è un doppione.
--
-- LA STESSA BOLLA NON SI CARICA DUE VOLTE. Su `ddt_ricezione` non c'era nessun
-- vincolo di unicità: la stessa bolla dello stesso fornitore si poteva caricare
-- due volte, e con la foto dal cantiere più il caricamento dall'ufficio è
-- questione di tempo. Due bolle uguali vogliono dire merce contata due volte,
-- costo doppio in commessa e una fattura che non torna. Il numero di un DDT è
-- unico per fornitore: diventa una chiave. Verificato prima di metterlo: sulle
-- 232 bolle esistenti zero collisioni su (azienda, fornitore, numero).
--
-- Nessuna riga riscritta: per le bolle vecchie non si sa chi ha portato la
-- merce, e inventarlo sarebbe peggio del non saperlo.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Chi ha portato la merce ──────────────────────────────────────────────

alter table public.ddt_ricezione
  add column if not exists trasporto_a_cura_di text;
alter table public.ddt_ricezione
  add column if not exists porto text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.ddt_ricezione'::regclass
       and conname = 'ddt_ricezione_trasporto_valido'
  ) then
    alter table public.ddt_ricezione
      add constraint ddt_ricezione_trasporto_valido
      check (trasporto_a_cura_di is null
             or trasporto_a_cura_di in ('fornitore', 'noi', 'terzi'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.ddt_ricezione'::regclass
       and conname = 'ddt_ricezione_porto_valido'
  ) then
    alter table public.ddt_ricezione
      add constraint ddt_ricezione_porto_valido
      check (porto is null or porto in ('franco', 'assegnato'));
  end if;
end $$;

comment on column public.ddt_ricezione.trasporto_a_cura_di is
  '"fornitore" l''ha portata lui, "noi" siamo andati a ritirarla (ritiro: autista_nome e'' chi e'' andato, targa_mezzo il nostro furgone), "terzi" un corriere. NULL = non si sa, e non si inventa.';
comment on column public.ddt_ricezione.porto is
  '"franco" = trasporto compreso nel prezzo, "assegnato" = a nostro carico. Dice se nella fattura ci sara'' anche una riga di trasporto.';

-- ── 2. La stessa bolla non si carica due volte ──────────────────────────────
-- Il numero di un DDT è unico per fornitore: è una chiave, non un'etichetta.
-- Dove il fornitore non è ancora indicato il vincolo non si applica: non si
-- può dire che due bolle «di nessuno» siano la stessa.

create unique index if not exists ddt_ricezione_una_bolla_per_fornitore
  on public.ddt_ricezione (company_id, supplier_id, upper(btrim(numero_ddt)))
  where supplier_id is not null and btrim(numero_ddt) <> '';

comment on index public.ddt_ricezione_una_bolla_per_fornitore is
  'La stessa bolla dello stesso fornitore una volta sola: con la foto dal cantiere E il caricamento dall''ufficio, caricarla due volte vuol dire merce e costo contati due volte.';

-- Le bolle da ritirare ancora in piedi: la coda del magazzino.
create index if not exists ddt_ricezione_da_ritirare_idx
  on public.ddt_ricezione(company_id, data_ricezione desc)
  where trasporto_a_cura_di = 'noi';
