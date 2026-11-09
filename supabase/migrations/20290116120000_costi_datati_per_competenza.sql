-- I costi vanno nell'anno in cui li hai ricevuti, non in quello in cui li
-- hai pagati (9 novembre 2026).
--
-- La vista datava ogni costo con `COALESCE(paid_date, due_date)`: la data
-- del pagamento se pagato, la scadenza se ancora aperto. È la cassa. Una
-- fattura di dicembre pagata a febbraio finiva nei costi di febbraio, e
-- cambiava anche anno.
--
-- Misurato sui dati veri: 995 costi finivano in un mese diverso da quello
-- di competenza, 194 in un anno diverso. Il conto economico mensile era
-- inutilizzabile e il margine annuo ballava, in entrambe le direzioni —
-- a seconda che l'azienda paghi in anticipo o in ritardo.
--
-- Ora la data è, in ordine: il mese di competenza se qualcuno l'ha scritto,
-- la data del documento, la data della fattura ricevuta collegata, e solo
-- in mancanza di tutto la scadenza — che per un costo ricorrente senza
-- documento (affitto, utenza) è la competenza giusta. Il pagamento resta
-- l'ultima spiaggia: un costo senza nessun'altra data non deve sparire.
--
-- Le uscite di banca non collegate a niente restano datate al movimento:
-- lì un documento non c'è per definizione.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

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
    -- La fattura ricevuta porta la data vera del documento: il costo da solo
    -- spesso non ce l'ha.
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
  left join cg_classificazione_voci cl
    on cl.company_id = u.company_id
   and cl.source_table = u.source_table
   and cl.source_value = u.source_value
   and cl.is_active = true;

comment on view public.v_cg_costi_classificati is
  'Costi del Controllo di Gestione, datati per competenza: mese di competenza, data documento, data della fattura ricevuta, poi la scadenza (09/11/2026). Le uscite di banca non collegate restano datate al movimento.';
