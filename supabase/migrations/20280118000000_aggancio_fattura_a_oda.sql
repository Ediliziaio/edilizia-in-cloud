-- L'ultimo anello della catena a tre: fattura fornitore → ordine d'acquisto.
--
-- La fattura ricevuta arriva da CINQUE strade diverse (sync FIC, cassetto SDI,
-- webhook ricevi-sdi, OCR da foto, estrazione da allegato email): l'unico punto
-- che le copre tutte e' il database. Quando i numeri combaciano — stesso
-- fornitore per P.IVA, stesso importo al centesimo, UN SOLO ordine candidato —
-- la fattura si aggancia da sola all'ordine e la scheda Contabilita' dell'OdA
-- mostra fattura e scostamento senza che nessuno debba cercarla.
--
-- Regola di prodotto: MAI indovinare. Zero candidati o due candidati = nessun
-- aggancio, il collegamento resta manuale. Le note di credito/debito (TD04,
-- TD05) rettificano un documento, non ne ordinano uno: escluse sempre.
--
-- Il trigger e' BEFORE e scrive NEW direttamente: niente update ricorsivi.
-- Scatta solo quando purchase_order_id e' NULL, quindi non tocca mai un
-- collegamento gia' fatto (a mano o automatico). I re-sync che arricchiscono
-- gli importi (Aruba li porta a null, FIC li aggiorna) ripassano dal trigger
-- via UPDATE OF: una fattura arrivata monca si aggancia quando i numeri
-- finalmente arrivano.

create or replace function public.aggancia_fattura_a_oda()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_piva text;
  v_cf   text;
  v_ids  uuid[];
begin
  -- Le note di credito/debito non ordinano merce: mai agganciarle a un OdA.
  if left(coalesce(new.tipo_documento, ''), 4) in ('TD04', 'TD05') then
    return new;
  end if;

  -- Senza importi (lista Aruba) o senza identita' fiscale del cedente non
  -- c'e' abbastanza per riconoscere l'ordine: meglio nessun link che uno
  -- sbagliato.
  if new.totale_documento is null and new.imponibile_totale is null then
    return new;
  end if;

  -- Normalizzazione: solo cifre/lettere maiuscole, via il prefisso paese "IT"
  -- (nei gestionali la P.IVA gira in entrambe le forme).
  v_piva := nullif(regexp_replace(regexp_replace(upper(coalesce(new.cedente_piva, '')), '[^0-9A-Z]', '', 'g'), '^IT', ''), '');
  v_cf   := nullif(regexp_replace(upper(coalesce(new.cedente_cf, '')), '[^0-9A-Z]', '', 'g'), '');
  if v_piva is null and v_cf is null then
    return new;
  end if;

  -- Candidati: ordini EMESSI dello stesso fornitore (riconosciuto per P.IVA o
  -- codice fiscale) il cui totale — o imponibile — combacia al centesimo, non
  -- gia' rivendicati da un'altra fattura. Bastano 2 righe per sapere che il
  -- match e' ambiguo.
  select array_agg(id) into v_ids from (
    select po.id
    from purchase_orders po
    join suppliers s on s.id = po.supplier_id
    where po.company_id = new.company_id
      and po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')
      and coalesce(po.total, po.subtotal, 0) > 0
      and (
        (v_piva is not null
          and regexp_replace(regexp_replace(upper(coalesce(s.vat_number, '')), '[^0-9A-Z]', '', 'g'), '^IT', '') = v_piva)
        or
        (v_cf is not null
          and regexp_replace(upper(coalesce(s.fiscal_code, '')), '[^0-9A-Z]', '', 'g') = v_cf)
      )
      and (
        (new.totale_documento is not null and abs(coalesce(po.total, 0) - new.totale_documento) <= 0.01)
        or
        (new.imponibile_totale is not null and abs(coalesce(po.subtotal, 0) - new.imponibile_totale) <= 0.01)
      )
      and not exists (
        select 1 from fatture_ricevute f2
        where f2.purchase_order_id = po.id and f2.id <> new.id
      )
    limit 2
  ) candidati;

  -- UN candidato solo: i numeri parlano chiaro, si aggancia. Due: ambiguo,
  -- decide una persona.
  if coalesce(array_length(v_ids, 1), 0) = 1 then
    new.purchase_order_id := v_ids[1];
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fatture_ricevute_aggancia_oda on public.fatture_ricevute;
create trigger trg_fatture_ricevute_aggancia_oda
  before insert or update of cedente_piva, cedente_cf, totale_documento, imponibile_totale, tipo_documento
  on public.fatture_ricevute
  for each row
  when (new.purchase_order_id is null)
  execute function public.aggancia_fattura_a_oda();

comment on function public.aggancia_fattura_a_oda() is
  'Aggancia la fattura ricevuta all''ordine d''acquisto quando il match e'' inequivocabile: fornitore per P.IVA/CF + importo al centesimo + candidato unico non gia'' fatturato. Ambiguo = nessun aggancio (decide una persona). Note di credito/debito escluse.';
