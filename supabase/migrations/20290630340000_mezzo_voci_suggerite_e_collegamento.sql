-- Il mezzo senza voce di listino: si propone, e il legame si fa una volta
-- ──────────────────────────────────────────────────────────────────────
-- 28/11/2026, dalla prova su Impresa Vulcano: 26 mezzi su 38 non hanno una voce di listino, e le
-- loro righe nel rendiconto uscivano con «prezzo mancante» senza che nessuno dicesse perché.
--
-- Per i mezzi non si indovina: «MAN CAMION 3 ASSI · HE749NF» e «Camion 3 assi - a freddo» sono la
-- stessa cosa per una persona e due cose diverse per una macchina, e il rendiconto va al
-- committente. Quindi:
--   * `mezzo_voci_suggerite` propone le voci che somigliano al nome del mezzo — prima quelle del
--     committente, poi quelle generali di tipo nolo — con il loro prezzo e la somiglianza;
--   * `mezzo_collega_voce` scrive il legame **sul mezzo**: da lì in avanti ogni rendiconto trova il
--     prezzo da sé, senza ripetere la scelta.
-- Il collegamento chiede «Commesse → modifica», e la proposta si vede con «Commesse → vedi».
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

create or replace function public.mezzo_collega_voce(p_mezzo uuid, p_voce uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_company uuid;
begin
  select m.company_id into v_company from public.mezzi m where m.id = p_mezzo;
  if v_company is null then
    raise exception 'Mezzo inesistente.' using errcode = '23503';
  end if;
  if (select auth.uid()) is null
     or public.utente_bloccato()
     or public.utente_e_cliente_esterno()
     or public.utente_sola_lettura(v_company)
     or not public.has_permission_for_company((select auth.uid()), 'can_edit_orders', v_company) then
    raise exception 'Non puoi collegare il listino di questo mezzo.' using errcode = '42501';
  end if;
  if p_voce is not null and not exists (
       select 1 from public.tariffe_aziendali t where t.id = p_voce and t.company_id = v_company) then
    raise exception 'La voce di listino è di un''altra azienda.' using errcode = '23514';
  end if;
  update public.mezzi set tariffa_id = p_voce where id = p_mezzo;
end;
$function$;

revoke all on function public.mezzo_collega_voce(uuid, uuid) from public, anon;
grant execute on function public.mezzo_collega_voce(uuid, uuid) to authenticated;

comment on function public.mezzo_collega_voce(uuid, uuid) is
  'Collega un mezzo alla sua voce del listino generale: da lì in avanti i rendiconti trovano il prezzo da sé.';
