-- ============================================================================
-- I numeri accanto alle sotto-schede della commessa, in UNA richiesta
-- ============================================================================
-- Diario 16, Collaudo 1, Ordini d'acquisto 3… prima erano quattro richieste
-- separate (una per tabella), tra le prime a partire all'apertura della
-- commessa: su telefono con rete debole ritardavano quelle che servono per
-- vedere la pagina. Ora è una funzione sola, che conta e basta.
--
-- SECURITY INVOKER: valgono le stesse regole di visibilità di chi chiama, riga
-- per riga, come per le quattro richieste di prima: ognuno conta ciò che può
-- vedere. Nessun dato nuovo esposto: solo numeri.
--
-- Idempotente. Nessuna scrittura.

create or replace function public.ordine_conteggi_viste(p_order_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  select jsonb_build_object(
    'lavorazioni',     (select count(*) from public.order_work_phases        where order_id = p_order_id),
    'rapportini',      (select count(*) from public.campo_rapportini         where order_id = p_order_id),
    'verbali',         (select count(*) from public.order_acceptance_reports where order_id = p_order_id),
    'ordini_acquisto', (select count(*) from public.purchase_orders          where order_id = p_order_id)
  )
$$;

revoke all on function public.ordine_conteggi_viste(uuid) from public, anon;
grant execute on function public.ordine_conteggi_viste(uuid) to authenticated;
