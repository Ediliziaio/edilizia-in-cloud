-- Correggere il prezzo di una voce dal rendiconto
-- ────────────────────────────────────────────────────────────────────────────
-- 27/11/2026. Lotto 4 di docs/piano-rendiconto-da-rapportini-verifica.md
--
-- Il caso vero: 47 voci su 137 di un’impresa in appalto hanno `vendita_unitaria = 1`
-- — MARMI 16 ml × 1,00, CHIUSINO GHISA 50X50 C250 × 1,00, TEGOLE 240 mq × 1,00.
-- È il campo obbligatorio compilato per uscire dalla schermata. Senza un modo
-- di correggerlo dal rendiconto, l'ufficio dovrebbe riaprire il rapportino di
-- una giornata già approvata, che è la cosa che non deve fare: il rapportino è
-- la prova di quello che è stato fatto.
--
-- Qui il prezzo si corregge sulla VOCE (che è dove il prezzo vive) e la riga di
-- rendiconto si riscrive da sola, perché `rapportino_voce_applica` è già
-- idempotente. Resta scritto che è stato messo a mano (`prezzo_a_mano`), così
-- il pannello «Da dove viene» può dire «era 165, applicato 189».
--
-- Il limite: una voce già chiusa in un rendiconto al committente non si tocca.
-- Quello è un documento, non un appunto.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.rapportino_voce_prezzo(
  p_voce_id uuid,
  p_vendita numeric,
  p_costo numeric default null,
  p_quantita numeric default null)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_v record;
begin
  select vl.order_id, vl.company_id, vl.descrizione, cr.approvato
    into v_v
    from public.rapportino_voci_libere vl
    join public.campo_rapportini cr on cr.id = vl.rapportino_id
   where vl.id = p_voce_id;
  if not found then raise exception 'Voce inesistente' using errcode = '23514'; end if;

  if public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(v_v.order_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_v.company_id)
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_v.company_id) then
    raise exception 'Non hai il permesso di correggere questa voce' using errcode = '42501';
  end if;

  if p_vendita is null or p_vendita < 0 then
    raise exception 'Il prezzo di vendita deve essere zero o più' using errcode = '23514';
  end if;
  if p_costo is not null and p_costo < 0 then
    raise exception 'Il costo deve essere zero o più' using errcode = '23514';
  end if;
  if p_quantita is not null and p_quantita <= 0 then
    raise exception 'La quantità deve essere maggiore di zero' using errcode = '23514';
  end if;

  -- Una voce già in un rendiconto consegnato al committente non si corregge:
  -- da quel momento quelle righe sono una prova.
  if exists (
    select 1 from public.appalto_rendiconto_righe rr
     where rr.voce_libera_id = p_voce_id and rr.stato <> 'bozza') then
    raise exception 'La voce «%» è già in un rendiconto al committente: si libera solo annullandone la bozza', v_v.descrizione
      using errcode = '23514';
  end if;

  -- `prezzo_a_mano` NON si scrive: è una colonna generata,
  -- `vendita_unitaria IS DISTINCT FROM vendita_proposta`. Si aggiorna da sé, ed
  -- è meglio così — un prezzo rimesso uguale a quello del listino torna a
  -- contare come «dal listino», che è la verità.
  update public.rapportino_voci_libere
     set vendita_unitaria = p_vendita,
         costo_unitario = coalesce(p_costo, costo_unitario),
         quantita = coalesce(p_quantita, quantita),
         updated_at = now()
   where id = p_voce_id;

  -- La riga di rendiconto si riscrive da sé (la funzione cancella e reinserisce).
  -- Se il rapportino non è approvato non fa niente, ed è giusto così.
  if coalesce(v_v.approvato, false) then
    perform public.rapportino_voce_applica(p_voce_id);
  end if;

  return 1;
end; $function$;

revoke all on function public.rapportino_voce_prezzo(uuid, numeric, numeric, numeric) from public, anon;
grant execute on function public.rapportino_voce_prezzo(uuid, numeric, numeric, numeric) to authenticated, service_role;
