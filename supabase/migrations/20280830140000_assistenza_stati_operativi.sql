-- GIÀ APPLICATA sul live il 2026-08-30 via Management API e registrata in
-- supabase_migrations.schema_migrations.
--
-- Secondo giro sugli stati dell'assistenza: mancavano i passaggi che nel
-- lavoro vero tengono fermo un intervento — il sopralluogo prima di
-- quotare, l'attesa di una risposta del cliente, il preventivo rifiutato,
-- il reclamo in garanzia al fornitore (tipico dei serramenti), il giro a
-- vuoto da riprogrammare e l'intervento eseguito ancora da fatturare.
alter type ticket_status add value if not exists 'sopralluogo';
alter type ticket_status add value if not exists 'in_attesa_cliente';
alter type ticket_status add value if not exists 'preventivo_rifiutato';
alter type ticket_status add value if not exists 'reclamo_fornitore';
alter type ticket_status add value if not exists 'da_riprogrammare';
alter type ticket_status add value if not exists 'da_fatturare';
