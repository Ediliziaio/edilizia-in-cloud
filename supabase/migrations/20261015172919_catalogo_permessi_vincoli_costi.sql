-- Listino, costi e manodopera: nessun backfill e nessun ricalcolo prezzi.
-- Operazioni limitate ai cataloghi (circa 5k famiglie / 15k celle, non al prezzario).
-- Se ci sono lock o dati incompatibili si annulla la migrazione: niente attese lunghe.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

-- I prodotti legacy seguono lo stesso permesso del listino, non la modifica ordini.
DROP POLICY IF EXISTS "Company admins can manage their article templates" ON public.article_templates;
DROP POLICY IF EXISTS "Staff can manage article templates if permitted" ON public.article_templates;
DROP POLICY IF EXISTS "Staff can view article templates if permitted" ON public.article_templates;
DROP POLICY IF EXISTS "Super admins can manage all article templates" ON public.article_templates;
DROP POLICY IF EXISTS at_lettura ON public.article_templates;
CREATE POLICY at_lettura ON public.article_templates FOR SELECT TO authenticated
USING (company_id = (SELECT public.get_my_company_id())
  AND NOT (SELECT public.utente_e_cliente_esterno()));
DROP POLICY IF EXISTS at_scrittura ON public.article_templates;
CREATE POLICY at_scrittura ON public.article_templates FOR ALL TO authenticated
USING (company_id = (SELECT public.get_my_company_id())
  AND NOT (SELECT public.utente_e_cliente_esterno())
  AND company_id IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing'))))
WITH CHECK (company_id = (SELECT public.get_my_company_id())
  AND NOT (SELECT public.utente_e_cliente_esterno())
  AND company_id IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing'))));
DROP POLICY IF EXISTS at_super_admin ON public.article_templates;
CREATE POLICY at_super_admin ON public.article_templates FOR ALL TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)))
WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)));
-- La policy RESTRICTIVE blocco_utente_bloccato resta invariata.

-- NULL è consentito (dato sconosciuto), zero è consentito: nessun prezzo è inventato.
-- La soglia superiore esclude Infinity e NaN, che per numeric risultano >= 0.
ALTER TABLE public.tariffe_aziendali DROP CONSTRAINT IF EXISTS tariffe_aziendali_catalogo_economia_valida;
ALTER TABLE public.tariffe_aziendali ADD CONSTRAINT tariffe_aziendali_catalogo_economia_valida
CHECK (
  (prezzo_costo >= 0 AND prezzo_costo < 'Infinity'::numeric)
  AND (costo_interno >= 0 AND costo_interno < 'Infinity'::numeric)
  AND (costo_default >= 0 AND costo_default < 'Infinity'::numeric)
  AND (prezzo_vendita >= 0 AND prezzo_vendita < 'Infinity'::numeric)
  AND (prezzo_piano_aggiuntivo >= 0 AND prezzo_piano_aggiuntivo < 'Infinity'::numeric)
  AND (piano_base >= 0)
  AND (incidenza_manodopera_pct BETWEEN 0 AND 100)
) NOT VALID;
ALTER TABLE public.article_templates DROP CONSTRAINT IF EXISTS article_templates_catalogo_economia_valida;
ALTER TABLE public.article_templates ADD CONSTRAINT article_templates_catalogo_economia_valida
CHECK (
  (unit_price >= 0 AND unit_price < 'Infinity'::numeric)
  AND (standard_cost >= 0 AND standard_cost < 'Infinity'::numeric)
  AND (prezzo_acquisto_netto >= 0 AND prezzo_acquisto_netto < 'Infinity'::numeric)
  AND (prezzo_vendita >= 0 AND prezzo_vendita < 'Infinity'::numeric)
  AND (vat_rate BETWEEN 0 AND 100)
  AND (margine_minimo_percentuale BETWEEN 0 AND 100)
  AND (sconto_max_cliente_percentuale BETWEEN 0 AND 100)
) NOT VALID;
ALTER TABLE public.article_families DROP CONSTRAINT IF EXISTS article_families_catalogo_economia_valida;
ALTER TABLE public.article_families ADD CONSTRAINT article_families_catalogo_economia_valida
CHECK (
  (prezzo_base_vendita >= 0 AND prezzo_base_vendita < 'Infinity'::numeric)
  AND (prezzo_base_acquisto >= 0 AND prezzo_base_acquisto < 'Infinity'::numeric)
  AND (markup_valore >= 0 AND markup_valore < 'Infinity'::numeric)
  AND (manodopera_costo_acquisto >= 0 AND manodopera_costo_acquisto < 'Infinity'::numeric)
  AND (manodopera_prezzo_vendita >= 0 AND manodopera_prezzo_vendita < 'Infinity'::numeric)
  AND (posa_quantita_default > 0 AND posa_quantita_default < 'Infinity'::numeric)
) NOT VALID;
ALTER TABLE public.listino_griglia DROP CONSTRAINT IF EXISTS listino_griglia_catalogo_economia_valida;
ALTER TABLE public.listino_griglia ADD CONSTRAINT listino_griglia_catalogo_economia_valida
CHECK (
  (prezzo_vendita >= 0 AND prezzo_vendita < 'Infinity'::numeric)
  AND (prezzo_acquisto >= 0 AND prezzo_acquisto < 'Infinity'::numeric)
) NOT VALID;

-- Le chiavi composte verificano l'azienda anche con service_role o invii concorrenti.
-- Stessi nomi delle FK precedenti: nessuna relazione duplicata per PostgREST.
-- SET NULL svuota SOLO il riferimento, mai company_id (Postgres 15+).
DO $catalogo$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['external_teams', 'article_families', 'suppliers', 'tariffe_aziendali', 'listino_categorie', 'listino_macrocategorie', 'article_templates', 'supplier_catalogs', 'supplier_product_lines']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = ('public.' || tab)::regclass AND conname = tab || '_catalogo_company_id_key') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (company_id, id)', tab, tab || '_catalogo_company_id_key');
    END IF;
  END LOOP;
END $catalogo$;

ALTER TABLE public.tariffe_aziendali DROP CONSTRAINT IF EXISTS tariffe_aziendali_external_team_id_fkey;
ALTER TABLE public.tariffe_aziendali ADD CONSTRAINT tariffe_aziendali_external_team_id_fkey
FOREIGN KEY (company_id, external_team_id) REFERENCES public.external_teams(company_id, id)
ON DELETE SET NULL (external_team_id) NOT VALID;
ALTER TABLE public.article_templates DROP CONSTRAINT IF EXISTS article_templates_family_id_fkey;
ALTER TABLE public.article_templates ADD CONSTRAINT article_templates_family_id_fkey
FOREIGN KEY (company_id, family_id) REFERENCES public.article_families(company_id, id)
ON DELETE SET NULL (family_id) NOT VALID;
ALTER TABLE public.article_templates DROP CONSTRAINT IF EXISTS article_templates_supplier_id_fkey;
ALTER TABLE public.article_templates ADD CONSTRAINT article_templates_supplier_id_fkey
FOREIGN KEY (company_id, supplier_id) REFERENCES public.suppliers(company_id, id)
ON DELETE SET NULL (supplier_id) NOT VALID;
ALTER TABLE public.article_templates DROP CONSTRAINT IF EXISTS fk_at_montaggio_tariffa;
ALTER TABLE public.article_templates ADD CONSTRAINT fk_at_montaggio_tariffa
FOREIGN KEY (company_id, montaggio_tariffa_id) REFERENCES public.tariffe_aziendali(company_id, id)
ON DELETE SET NULL (montaggio_tariffa_id) NOT VALID;
ALTER TABLE public.article_templates DROP CONSTRAINT IF EXISTS article_templates_categoria_id_fkey;
ALTER TABLE public.article_templates ADD CONSTRAINT article_templates_categoria_id_fkey
FOREIGN KEY (company_id, categoria_id) REFERENCES public.listino_categorie(company_id, id)
ON DELETE SET NULL (categoria_id) NOT VALID;
ALTER TABLE public.article_families DROP CONSTRAINT IF EXISTS article_families_supplier_id_fkey;
ALTER TABLE public.article_families ADD CONSTRAINT article_families_supplier_id_fkey
FOREIGN KEY (company_id, supplier_id) REFERENCES public.suppliers(company_id, id)
ON DELETE SET NULL (supplier_id) NOT VALID;
ALTER TABLE public.article_families DROP CONSTRAINT IF EXISTS article_families_posa_tariffa_default_id_fkey;
ALTER TABLE public.article_families ADD CONSTRAINT article_families_posa_tariffa_default_id_fkey
FOREIGN KEY (company_id, posa_tariffa_default_id) REFERENCES public.tariffe_aziendali(company_id, id)
ON DELETE SET NULL (posa_tariffa_default_id) NOT VALID;
ALTER TABLE public.article_families DROP CONSTRAINT IF EXISTS article_families_categoria_id_fkey;
ALTER TABLE public.article_families ADD CONSTRAINT article_families_categoria_id_fkey
FOREIGN KEY (company_id, categoria_id) REFERENCES public.listino_categorie(company_id, id)
ON DELETE SET NULL (categoria_id) NOT VALID;
ALTER TABLE public.article_families DROP CONSTRAINT IF EXISTS article_families_macrocategoria_id_fkey;
ALTER TABLE public.article_families ADD CONSTRAINT article_families_macrocategoria_id_fkey
FOREIGN KEY (company_id, macrocategoria_id) REFERENCES public.listino_macrocategorie(company_id, id)
ON DELETE SET NULL (macrocategoria_id) NOT VALID;
ALTER TABLE public.listino_griglia DROP CONSTRAINT IF EXISTS listino_griglia_family_id_fkey;
ALTER TABLE public.listino_griglia ADD CONSTRAINT listino_griglia_family_id_fkey
FOREIGN KEY (company_id, family_id) REFERENCES public.article_families(company_id, id)
ON DELETE CASCADE NOT VALID;
ALTER TABLE public.listino_griglia DROP CONSTRAINT IF EXISTS listino_griglia_prodotto_id_fkey;
ALTER TABLE public.listino_griglia ADD CONSTRAINT listino_griglia_prodotto_id_fkey
FOREIGN KEY (company_id, prodotto_id) REFERENCES public.article_templates(company_id, id)
ON DELETE CASCADE NOT VALID;
ALTER TABLE public.listino_griglia DROP CONSTRAINT IF EXISTS listino_griglia_supplier_catalog_id_fkey;
ALTER TABLE public.listino_griglia ADD CONSTRAINT listino_griglia_supplier_catalog_id_fkey
FOREIGN KEY (company_id, supplier_catalog_id) REFERENCES public.supplier_catalogs(company_id, id)
ON DELETE SET NULL (supplier_catalog_id) NOT VALID;
ALTER TABLE public.listino_griglia DROP CONSTRAINT IF EXISTS listino_griglia_supplier_product_line_id_fkey;
ALTER TABLE public.listino_griglia ADD CONSTRAINT listino_griglia_supplier_product_line_id_fkey
FOREIGN KEY (company_id, supplier_product_line_id) REFERENCES public.supplier_product_lines(company_id, id)
ON DELETE SET NULL (supplier_product_line_id) NOT VALID;

-- Validazione separata dalle aggiunte: se lo storico non è coerente, rollback integrale.
ALTER TABLE public.tariffe_aziendali VALIDATE CONSTRAINT tariffe_aziendali_catalogo_economia_valida;
ALTER TABLE public.article_templates VALIDATE CONSTRAINT article_templates_catalogo_economia_valida;
ALTER TABLE public.article_families VALIDATE CONSTRAINT article_families_catalogo_economia_valida;
ALTER TABLE public.listino_griglia VALIDATE CONSTRAINT listino_griglia_catalogo_economia_valida;
ALTER TABLE public.tariffe_aziendali VALIDATE CONSTRAINT tariffe_aziendali_external_team_id_fkey;
ALTER TABLE public.article_templates VALIDATE CONSTRAINT article_templates_family_id_fkey;
ALTER TABLE public.article_templates VALIDATE CONSTRAINT article_templates_supplier_id_fkey;
ALTER TABLE public.article_templates VALIDATE CONSTRAINT fk_at_montaggio_tariffa;
ALTER TABLE public.article_templates VALIDATE CONSTRAINT article_templates_categoria_id_fkey;
ALTER TABLE public.article_families VALIDATE CONSTRAINT article_families_supplier_id_fkey;
ALTER TABLE public.article_families VALIDATE CONSTRAINT article_families_posa_tariffa_default_id_fkey;
ALTER TABLE public.article_families VALIDATE CONSTRAINT article_families_categoria_id_fkey;
ALTER TABLE public.article_families VALIDATE CONSTRAINT article_families_macrocategoria_id_fkey;
ALTER TABLE public.listino_griglia VALIDATE CONSTRAINT listino_griglia_family_id_fkey;
ALTER TABLE public.listino_griglia VALIDATE CONSTRAINT listino_griglia_prodotto_id_fkey;
ALTER TABLE public.listino_griglia VALIDATE CONSTRAINT listino_griglia_supplier_catalog_id_fkey;
ALTER TABLE public.listino_griglia VALIDATE CONSTRAINT listino_griglia_supplier_product_line_id_fkey;

NOTIFY pgrst, 'reload schema';
