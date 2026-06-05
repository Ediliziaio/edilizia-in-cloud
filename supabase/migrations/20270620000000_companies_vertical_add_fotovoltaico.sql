-- Onboarding settore: aggiunge 'fotovoltaico' ai vertical ammessi su
-- companies.vertical. Il modulo Fotovoltaico ha già il flusso completo
-- (FotovoltaicoWizard + catalogo), quindi va reso selezionabile in onboarding
-- (useVertical.VERTICAL_META.fotovoltaico.enabled=true).
--
-- Additivo e sicuro: il nuovo CHECK è un superset di quello esistente
-- (nessuna riga viola il vincolo). Allineato a business_verticals (che già
-- contiene il vertical_key 'fotovoltaico').
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_vertical_check;
ALTER TABLE public.companies ADD CONSTRAINT companies_vertical_check
  CHECK (
    vertical IS NULL OR vertical = ANY (ARRAY[
      'serramentista','fotovoltaico','tetti','bagno','ristrutturazione',
      'tende_da_sole','vetrate','caldaie','clima','generico'
    ]::text[])
  );
