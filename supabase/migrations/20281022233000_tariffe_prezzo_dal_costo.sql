-- Tariffe: il prezzo di vendita può nascere dal costo.
--
-- Fino al 22/10/2026 il prezzo di una voce di listino si scriveva a mano e il
-- margine ne era una conseguenza: quando il costo cambiava (costo orario della
-- squadra, subappalto), il prezzo restava fermo e il margine si consumava senza
-- che nessuno lo vedesse. E chi ragiona in ricarico sul costo (Best Infissi:
-- +20% su 62 voci, cioè margine 16,7%) non trovava il campo per farlo.
--
-- prezzo_modo
--   'libero'    il prezzo si scrive (prezzo di mercato, prezzario regionale);
--               ricarico e margine sono una conseguenza. È il modo di tutte le
--               voci esistenti: nessun prezzo cambia con questa migrazione.
--   'dal_costo' il prezzo è costo pieno × (1 + ricarico_pct / 100), dove costo
--               pieno = costo × (1 + spese generali di «Prezzo e margini»).
--               Si ricalcola quando si salva la voce o con «Ricalcola dai costi».
--
-- prezzo_vendita resta la colonna che tutti leggono (preventivatori, computi,
-- Silvio, importazioni): per una voce «dal costo» è il prezzo calcolato, scritto
-- lì come per le famiglie articoli «acquisto + markup». Nessun lettore cambia.

alter table public.tariffe_aziendali
  add column if not exists prezzo_modo text not null default 'libero',
  add column if not exists ricarico_pct numeric(8, 4);

alter table public.tariffe_aziendali
  drop constraint if exists tariffe_aziendali_prezzo_modo_check;
alter table public.tariffe_aziendali
  add constraint tariffe_aziendali_prezzo_modo_check
  check (prezzo_modo in ('libero', 'dal_costo'));

alter table public.tariffe_aziendali
  drop constraint if exists tariffe_aziendali_ricarico_pct_check;
alter table public.tariffe_aziendali
  add constraint tariffe_aziendali_ricarico_pct_check
  check (ricarico_pct is null or (ricarico_pct >= 0 and ricarico_pct < 10000));

-- una voce «dal costo» deve sapere il suo ricarico
alter table public.tariffe_aziendali
  drop constraint if exists tariffe_aziendali_dal_costo_ha_ricarico;
alter table public.tariffe_aziendali
  add constraint tariffe_aziendali_dal_costo_ha_ricarico
  check (prezzo_modo <> 'dal_costo' or ricarico_pct is not null);

comment on column public.tariffe_aziendali.prezzo_modo is
  'libero = prezzo scritto a mano; dal_costo = costo pieno (costo + spese generali) × (1 + ricarico_pct/100), salvato in prezzo_vendita.';
comment on column public.tariffe_aziendali.ricarico_pct is
  'Ricarico % sul costo pieno, per le voci con prezzo_modo = dal_costo.';
