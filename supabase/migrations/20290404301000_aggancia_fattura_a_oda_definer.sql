-- Correzione urgente di 20290404300000 (15/11/2026, trovata dalla revisione di pubblicazione).
-- aggancia_fattura_a_oda è il trigger BEFORE su fatture_ricevute e chiama acquisti_oda_da_importo,
-- che è chiusa a authenticated (è definer e riceve l'azienda come parametro: aprirla mostrerebbe gli
-- ordini di altre aziende). Ridefinita senza SECURITY DEFINER, la funzione del trigger girava coi diritti
-- di chi salva: dal browser il salvataggio di una fattura ricevuta falliva con «permission denied».
-- Ora gira come definer (legge solo i dati dell'azienda della fattura stessa) e nessuno la può chiamare
-- direttamente: a un trigger l'EXECUTE non serve.
create or replace function public.aggancia_fattura_a_oda()
returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.acquisti_oda_da_importo(new.company_id, new.id, new.cedente_piva, new.cedente_cf,
                                                      new.totale_documento, new.imponibile_totale, new.tipo_documento, new.xml_raw);
  if found and c.identifica and public.azienda_collegamento_automatico(new.company_id) then
    new.purchase_order_id := c.oda_id;
  end if;
  return new;
end $$;
revoke all on function public.aggancia_fattura_a_oda() from public, anon, authenticated;
