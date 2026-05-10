# MP-VERT-01 — Schema business_verticals + Onboarding multi-vertical

## 🎯 Obiettivo
Generalizzare il pattern serramentisti esistente in un sistema universale di
verticalizzazione. Ogni company sceglie 1 vertical principale + N secondari.
Sistema specializza KB, personas, tariffe, render.

## 📦 Context
- **Branch**: `feat/mp-vert-01-business-verticals`
- **Dipendenze**: nessuna
- **File esistenti**: `supabase/migrations/20260917*serramenti*.sql` (12 file pattern)

## 📐 Architettura Target

```
┌────────────┐
│ companies  │──┐
└────────────┘  │  vertical_key (FK)
                ▼
┌──────────────────────────┐    ┌────────────────────────────┐
│ business_verticals       │◄───│ vertical_persona_overrides │
│ - vertical_key (PK)      │    │ - persona_key              │
│ - display_name           │    │ - system_prompt_addendum   │
│ - kb_areas               │    │ - vertical_kb_filter       │
│ - enabled_personas       │    │ - vertical_tools_extra     │
│ - render_categories      │    └────────────────────────────┘
└──────────────────────────┘
```

15 verticali iniziali:
1. serramentisti (✅ esistente)
2. tettisti
3. bagnisti
4. facciatisti
5. persianisti
6. pergolisti
7. piscinisti
8. pavimentisti_interni
9. pavimentisti_esterni
10. porte_blindate
11. porte_interne
12. giardinieri
13. ristrutturatori_interni
14. fotovoltaico (🟡 parziale)
15. edili_generaliste

## 🛠️ Implementazione

### Step 1 — Schema base
File: `supabase/migrations/[timestamp]_business_verticals.sql`

```sql
CREATE TABLE IF NOT EXISTS public.business_verticals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_key    text NOT NULL UNIQUE,
  display_name    text NOT NULL,
  short_label     text NOT NULL,
  parent_vertical text,
  description     text,
  icon            text,
  color           text,
  has_render_module       boolean DEFAULT false,
  render_categories       text[] DEFAULT '{}',
  enabled_personas        text[] NOT NULL DEFAULT '{}',
  vertical_personas       text[] DEFAULT '{}',
  kb_areas                text[] NOT NULL DEFAULT '{}',
  default_tariff_template text,
  default_family_template text,
  recommended_plan        text DEFAULT 'plus',
  estimated_avg_revenue   numeric,
  enabled                 boolean DEFAULT true,
  sort_order              int DEFAULT 0,
  created_at              timestamptz DEFAULT now()
);

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS vertical_key text,
  ADD COLUMN IF NOT EXISTS secondary_verticals text[] DEFAULT '{}';

ALTER TABLE public.companies
  ADD CONSTRAINT companies_vertical_fk
  FOREIGN KEY (vertical_key) REFERENCES public.business_verticals(vertical_key);

CREATE TABLE IF NOT EXISTS public.vertical_persona_overrides (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_key           text NOT NULL REFERENCES public.business_verticals(vertical_key) ON DELETE CASCADE,
  persona_key            text NOT NULL,
  system_prompt_addendum text,
  vertical_kb_filter     text[] DEFAULT '{}',
  vertical_tools_extra   jsonb DEFAULT '[]'::jsonb,
  enabled                boolean DEFAULT true,
  created_at             timestamptz DEFAULT now(),
  UNIQUE(vertical_key, persona_key)
);

ALTER TABLE public.ai_brain_documents
  ADD COLUMN IF NOT EXISTS vertical_key text,
  ADD COLUMN IF NOT EXISTS is_universal_for_vertical boolean DEFAULT false;

-- RLS
ALTER TABLE public.business_verticals ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_verticals_read ON public.business_verticals FOR SELECT USING (true);
CREATE POLICY business_verticals_admin ON public.business_verticals FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

ALTER TABLE public.vertical_persona_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY vpo_read ON public.vertical_persona_overrides FOR SELECT USING (true);
CREATE POLICY vpo_admin ON public.vertical_persona_overrides FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Seed 15 verticali
INSERT INTO public.business_verticals (vertical_key, display_name, short_label, description, icon, color, has_render_module, render_categories, enabled_personas, kb_areas, recommended_plan, sort_order) VALUES
  ('serramentisti','Serramentisti / Infissi','Serramenti','Aziende che producono e installano serramenti, finestre, persiane','window','#0ea5e9',true,ARRAY['infissi','persiane'],ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione'],ARRAY['normativa_serramenti','cam_serramenti','fiscale_50pct'],'plus',10),
  ('tettisti','Tettisti / Coperture','Tetti','Imprese specializzate in coperture, manti bituminosi, lattoneria','home','#dc2626',true,ARRAY['tetti'],ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione','compliance'],ARRAY['normativa_tetti_uni8178','en13956','sicurezza_lavori_quota','pimus'],'plus',20),
  ('bagnisti','Ristrutturazioni Bagni','Bagni','Ristrutturazione completa bagni e ambienti idro','bath','#0891b2',true,ARRAY['bagni'],ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione'],ARRAY['dm_236_89_barriere','impianti_idro','fiscale_75pct_barriere'],'plus',30),
  ('facciatisti','Facciatisti / Cappotto','Cappotto','Cappotto termico, intonaci, facciate','building','#84cc16',false,ARRAY[]::text[],ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione'],ARRAY['uni_en_13499','superbonus','ecobonus'],'plus',40),
  ('persianisti','Persianisti','Persiane','Specialisti persiane, scuri, oscuranti','blinds','#a16207',false,ARRAY[]::text[],ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione'],ARRAY['normativa_serramenti','cam_serramenti'],'plus',50),
  ('pergolisti','Pergolisti / Bioclimatiche','Pergole','Pergole, gazebo, strutture esterne','sun','#f59e0b',true,ARRAY['pergole'],ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione','compliance'],ARRAY['edilizia_libera','permessi_pergola','dlgs_222_16'],'plus',60),
  ('piscinisti','Piscinisti','Piscine','Costruzione e manutenzione piscine','droplets','#0ea5e9',false,ARRAY[]::text[],ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione','compliance'],ARRAY['normativa_piscine','autorizzazioni_piscina'],'premium',70),
  ('pavimentisti_interni','Pavimentisti Interni','Pavimenti int.','Posa pavimenti interni, parquet, ceramica','layers-3','#92400e',false,ARRAY[]::text[],ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione'],ARRAY['posa_pavimenti'],'plus',80),
  ('pavimentisti_esterni','Pavimentisti Esterni','Pavimenti est.','Pavimentazioni esterne, autobloccanti, resine','layers-3','#65a30d',false,ARRAY[]::text[],ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione'],ARRAY['drenaggio','permeabilita_dlgs'],'plus',90),
  ('porte_blindate','Porte Blindate','Blindate','Porte blindate, sicurezza','wrench','#475569',false,ARRAY[]::text[],ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione'],ARRAY['uni_envz_1627_classi_anti_effrazione','detrazione_50pct_sicurezza'],'plus',100),
  ('porte_interne','Porte Interne','Porte int.','Porte interne, scorrevoli','package','#a16207',false,ARRAY[]::text[],ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione'],ARRAY['posa_qualificata'],'plus',110),
  ('giardinieri','Giardinieri / Verde','Giardini','Manutenzione e progettazione giardini','paintbrush','#16a34a',false,ARRAY[]::text[],ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione'],ARRAY['contratto_manutenzione','codice_strada_potatura'],'pro',120),
  ('ristrutturatori_interni','Ristrutturatori Interni','Ristruttur.','Ristrutturazioni complete interni','hammer','#7c3aed',true,ARRAY['interni'],ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione','compliance'],ARRAY['fiscale_50pct','superbonus','dia_scia','t_u_edilizia'],'premium',130),
  ('fotovoltaico','Fotovoltaico','FV','Impianti fotovoltaici e accumulo','zap','#facc15',false,ARRAY[]::text[],ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione','compliance'],ARRAY['conto_energia','scia_fv','gse'],'premium',140),
  ('edili_generaliste','Imprese Edili Generaliste','Generalista','Imprese edili a 360°','construction','#a855f7',true,ARRAY['interni','esterni','tetti'],ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione','compliance','hr'],ARRAY['t_u_edilizia','superbonus','sicurezza_d_lgs_81','pos','pimus'],'enterprise',999)
ON CONFLICT (vertical_key) DO NOTHING;

-- Backfill: companies esistenti senza vertical → 'edili_generaliste'
UPDATE public.companies SET vertical_key = 'edili_generaliste' WHERE vertical_key IS NULL;
```

### Step 2 — Wizard onboarding
File: `src/components/onboarding/VerticalSelectionStep.tsx`
- Card grandi per ogni vertical
- Single-select primary, multi-select secondari
- Conferma → call edge function `apply-vertical-templates`

### Step 3 — Edge function apply-vertical-templates
File: `supabase/functions/apply-vertical-templates/index.ts`

Esegue:
1. `installa-template-vertical` per primary
2. Per ogni secondary, `installa-template-vertical`
3. `installa-tariffe-vertical` per primary
4. Indicizza KB universale del vertical → `ai_brain_documents` (con `is_universal_for_vertical=true`)
5. Abilita personas del vertical
6. Setup dashboard KPI verticale

### Step 4 — UI Settings → Verticale
File: `src/pages/azienda/impostazioni/VerticaleSettings.tsx`

### Step 5 — Hook useBusinessVertical
File: `src/hooks/useBusinessVertical.ts`

```typescript
export function useBusinessVertical() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ['business-vertical', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: c } = await supabase.from('companies')
        .select('vertical_key, secondary_verticals').eq('id', companyId!).single();
      const { data: v } = await supabase.from('business_verticals')
        .select('*').eq('vertical_key', c?.vertical_key).single();
      return { ...c, vertical: v };
    }
  });
}
```

## ✅ Acceptance Criteria
- [ ] Schema business_verticals con 15 record seedati
- [ ] companies estesa con vertical_key + secondary_verticals
- [ ] Wizard onboarding multi-step funzionante
- [ ] Edge function apply-vertical-templates idempotente
- [ ] UI Settings vertical
- [ ] Backward compat: companies esistenti = vertical 'edili_generaliste' di default
- [ ] TypeScript 0 errori

## 🔗 Risorse
- Doc fonte: `EiC-Verticali-BrainAEDIX-PricingAI.md` (PARTE 1)
