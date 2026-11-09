-- I soldi dei rapportini non si leggono piu' direttamente: solo con rapportini_costi(), che li da' a chi ha il permesso.
-- Una colonna nuova di campo_rapportini va aggiunta qui sotto (nuova migrazione) e a src/lib/campo/colonneRapportino.ts.
set local lock_timeout = '3s';
revoke select on public.campo_rapportini from authenticated;
grant select (id, company_id, order_id, user_id, role_type, data_lavoro, ore_lavorate, descrizione_lavori, materiali_usati, foto_urls, lavoro_completato, percentuale_avanzamento, gps_lat, gps_lng, gps_accuracy, meteo, note, firma_cliente_url, firma_cliente_nome, firma_cliente_at, ticket_aperto_id, approvato, approvato_da, approvato_at, created_at, updated_at, stato, pdf_url, firma_operaio_url, ore_straordinario, motivo_rifiuto, source, fasi_lavorate, costo_registrato_at, presenze, ufficio_employee_id, ufficio_created_by, mezzi_usati, campi_extra, annullato_at, annullato_da)
  on public.campo_rapportini to authenticated;
