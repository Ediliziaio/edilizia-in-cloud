-- Il ruolo Acquisti legge le bolle aziendali anche senza magazzini assegnati:
-- il trigger fattura_legame_stessa_azienda deve poter verificare il DDT scelto.
create policy ddt_ricezione_acquisti_legge on public.ddt_ricezione for select to authenticated
using (not public.utente_bloccato() and not public.utente_e_cliente_esterno() and
 company_id=any(public.aziende_con_permesso('can_manage_purchasing')));
