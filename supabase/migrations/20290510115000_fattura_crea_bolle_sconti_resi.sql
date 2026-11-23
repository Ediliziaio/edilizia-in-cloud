-- 23/11/2026 — fattura_crea_bolle: una bolla con una riga di sconto o di reso (quantità o importo
-- negativi) faceva fallire tutta la registrazione, per i vincoli di ddt_righe. Ora quella bolla si
-- salta, detta («sconto_o_reso»), e le altre si registrano. Più la regola delle funzioni nuove:
-- listino_equivalenza_chiave non resta eseguibile da anon.
do $migr$
declare
  definizione text := pg_get_functiondef(to_regprocedure('public.fattura_crea_bolle(uuid,jsonb)'));
  prima text := $t$    insert into public.ddt_ricezione (company_id, supplier_id, numero_ddt, data_ricezione, destinazione, order_id, source, stato, note, created_by)$t$;
  dopo text := $t$    -- Sconti e resi non sono merce consegnata: la bolla si registra a mano (20290510115000).
    if exists (select 1 from xmltable('/*/*[local-name()="DatiBeniServizi"]/*[local-name()="DettaglioLinee"]' passing corpo
                 columns n integer path '*[local-name()="NumeroLinea"]', q text path '*[local-name()="Quantita"]',
                         tot text path '*[local-name()="PrezzoTotale"]') v
                where v.n = any(rif.linee) and (coalesce(public.fattura_numero(v.q), 0) < 0 or coalesce(public.fattura_numero(v.tot), 0) < 0)) then
      saltate := saltate || jsonb_build_object('numero', rif.numero, 'motivo', 'sconto_o_reso');
      continue;
    end if;
    insert into public.ddt_ricezione (company_id, supplier_id, numero_ddt, data_ricezione, destinazione, order_id, source, stato, note, created_by)$t$;
begin
  if definizione is null or position('20290510115000' in definizione) > 0 then return; end if;
  if position(prima in definizione) = 0 then raise exception 'fattura_crea_bolle: punto di inserimento non trovato'; end if;
  execute replace(definizione, prima, dopo);
end $migr$;
revoke all on function public.listino_equivalenza_chiave(text, text) from public, anon;
grant execute on function public.listino_equivalenza_chiave(text, text) to authenticated, service_role;
