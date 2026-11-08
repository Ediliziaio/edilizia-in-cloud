-- Impostazioni IVA: la partita IVA scritta con il prefisso del paese.
--
-- Simulazione del 07/11/2026 in produzione (transazione annullata): chi scrive
-- il codice fiscale dell'azienda come lo trova sulle fatture, «IT01234567890»,
-- si vedeva rifiutare il salvataggio dal controllo di formato. Il frontespizio
-- della LIPE vuole le 11 cifre: il prefisso IT si toglie, come gli spazi.

create or replace function private.fiscalita_impostazioni_iva_firma()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  pulito text;
begin
  if tg_op = 'UPDATE' and (new.company_id is distinct from old.company_id or new.anno is distinct from old.anno) then
    raise exception 'Azienda e anno delle impostazioni IVA non si cambiano: crea la riga dell''altro anno' using errcode = '22023';
  end if;
  new.aggiornato_da := auth.uid();
  new.aggiornato_il := now();

  pulito := nullif(upper(regexp_replace(coalesce(new.cf_contribuente, ''), '\s', '', 'g')), '');
  new.cf_contribuente := case when pulito ~ '^IT[0-9]{11}$' then substr(pulito, 3) else pulito end;
  new.cf_dichiarante := nullif(upper(regexp_replace(coalesce(new.cf_dichiarante, ''), '\s', '', 'g')), '');
  pulito := nullif(upper(regexp_replace(coalesce(new.cf_intermediario, ''), '\s', '', 'g')), '');
  new.cf_intermediario := case when pulito ~ '^IT[0-9]{11}$' then substr(pulito, 3) else pulito end;
  return new;
end $$;
revoke all on function private.fiscalita_impostazioni_iva_firma() from public, anon, authenticated;
