-- I file del bucket documenti-fiscali (PDF delle fatture, ricevute caricate): solo chi
-- lavora su fatturazione, costi, tesoreria o magazzino, non ogni interno dell'azienda.
-- Migrazione a parte e brevissima: ALTER POLICY tiene un lock su auth.users fino al commit.

set local lock_timeout = '3s';
set local statement_timeout = '15s';

do $migrazione$
declare
  q text;
  c text;
  a text := $x$WHEN 'documenti-fiscali'::text THEN ((NOT ( SELECT e_solo_campo() AS e_solo_campo)) AND (NOT ( SELECT utente_e_cliente_esterno() AS utente_e_cliente_esterno)))$x$;
  aree text := $x$( SELECT utente_super_admin() AS utente_super_admin) OR (azienda_del_percorso(name) = ANY (( SELECT aziende_area(ARRAY['can_view_billing'::text, 'can_view_costs'::text, 'can_view_prima_nota'::text, 'can_view_tesoreria'::text, 'can_view_scadenzario'::text, 'can_manage_payments'::text, 'can_view_warehouse'::text, 'can_edit_orders'::text]) AS aziende_area)::uuid[]))$x$;
  p text;
begin
  select qual into q from pg_policies where schemaname = 'storage' and policyname = 'permessi_file_uffici';
  if position(aree in q) = 0 then
    if position(a in q) = 0 then raise exception 'permessi_file_uffici è cambiata: rivedere la migrazione'; end if;
    execute format('alter policy permessi_file_uffici on storage.objects using (%s)', replace(q, a, $x$WHEN 'documenti-fiscali'::text THEN ($x$ || aree || ')'));
  end if;

  foreach p in array array['documenti_fiscali_carica_azienda', 'documenti_fiscali_aggiorna_azienda'] loop
    select with_check into c from pg_policies where schemaname = 'storage' and policyname = p;
    if c is null then raise exception 'policy % senza controllo', p; end if;
    if position('aziende_area' in c) = 0 then
      execute format('alter policy %I on storage.objects with check ((%s) AND (%s))', p, c, aree);
    end if;
  end loop;
end
$migrazione$;
