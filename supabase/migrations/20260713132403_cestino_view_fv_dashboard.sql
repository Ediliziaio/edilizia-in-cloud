-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- La view dashboard FV esclude anche i progetti nel cestino (deleted_at):
-- copre tutti i consumer (lista FV standalone inclusa) senza toccare il client.
create or replace view public.v_fv_progetti_dashboard as
 SELECT p.id,
    p.company_id,
    p.numero,
    p.titolo,
    p.stato,
    p.archetipo,
    p.indirizzo,
    p.comune,
    TRIM(BOTH FROM (COALESCE(c.first_name, ''::text) || ' '::text) || COALESCE(c.last_name, ''::text)) AS cliente_nome,
    p.potenza_kwp,
    p.prezzo_vendita_iva_inclusa,
    p.margine_eur,
    p.margine_pct,
    p.payback_anni,
    p.created_at,
    p.updated_at,
    p.emesso_il,
    p.firmato_il
   FROM fv_progetti p
     LEFT JOIN marketing_contacts c ON c.id = p.cliente_id
  WHERE p.annullato = false
    AND p.deleted_at IS NULL;
