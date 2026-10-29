-- Doppio invio sulla registrazione di un pagamento fattura.
--
-- Il 29/10/2026 due fatture di Dimora Torino risultavano pagate due e tre volte:
-- righe identiche in `invoice_payments` create a 11 e 28 secondi di distanza
-- (doppio clic sul pulsante, nessuna protezione lato server). Il ledger diceva
-- 21.472 su una fattura da 10.736 e 6.837 su una da 2.279. Le righe in eccesso
-- sono state rimosse; questo indice impedisce che si ricreino.
--
-- La chiave e' la firma dello stesso pagamento registrato due volte: stessa
-- fattura, stesso importo, stessa data, stesso mezzo, stesso riferimento.
-- `coalesce` sui campi nullabili perche' in un indice unico i NULL sono
-- distinti fra loro: senza, due registrazioni manuali (reference NULL) non
-- verrebbero bloccate, che e' esattamente il caso accaduto.
--
-- Registrazioni davvero distinte lo stesso giorno restano possibili
-- distinguendole con `reference` (la riconciliazione bancaria usa gia'
-- `recon:<id>`, quindi non e' mai in conflitto con l'inserimento manuale).

create unique index if not exists invoice_payments_senza_doppioni
  on public.invoice_payments (
    invoice_id,
    amount,
    payment_date,
    coalesce(payment_method, ''),
    coalesce(reference, '')
  );

comment on index public.invoice_payments_senza_doppioni is
  'Blocca la stessa registrazione di pagamento inserita due volte (doppio clic). Per due incassi davvero distinti nello stesso giorno, valorizzare reference.';
