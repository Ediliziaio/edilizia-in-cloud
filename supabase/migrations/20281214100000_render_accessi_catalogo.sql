-- Il catalogo render è riservato agli utenti autenticati dell'azienda.
-- Le funzioni di trigger non richiedono EXECUTE ai chiamanti della tabella.
REVOKE ALL ON FUNCTION public.can_access_render_company(uuid) FROM PUBLIC, anon;
ALTER FUNCTION public.render_catalog_assets_touch_updated_at() SET search_path = public;
REVOKE ALL ON FUNCTION public.render_catalog_assets_touch_updated_at() FROM PUBLIC, anon, authenticated, service_role;
