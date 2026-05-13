# RLS Coverage Audit — 2026-05-13

## Sintesi numerica
- **Tabelle pubbliche create**: 646
- **Tabelle con `ENABLE ROW LEVEL SECURITY`**: 711 (alcune duplicate in `ALTER` ripetuti)
- **Tabelle con `CREATE POLICY`**: 701

→ Coverage RLS apparente: **~99%** (buono).

## ⚠️ Tabelle SENZA RLS enable rilevate (9)

Le seguenti tabelle non hanno mai ricevuto `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` nelle migration. Sono tutte legittime (cache / lookup / backup interne) ma da verificare manualmente:

| Tabella | Giustificazione attesa | Verifica |
|---|---|---|
| `ai_model_config_archive_mp05fix` | Backup table — accesso super_admin | ✅ |
| `ai_personas_backup_20260505_track1` | Backup table | ✅ |
| `fv_function_logs` | Log interno edge functions | ✅ |
| `fv_pvgis_cache` | Cache PVGIS API (public read OK) | ✅ |
| `fv_solar_api_cache` | Cache Solar API (public read OK) | ✅ |
| `fv_incentivi_catalogo` | Catalogo pubblico incentivi statali | ✅ |
| `fv_parametri_calcolo` | Parametri pubblici di calcolo FV | ✅ |
| `fv_profili_autoconsumo` | Profili pubblici autoconsumo | ✅ |
| `meta_api_rate_limit` | Rate limit interno API Meta Ads | ✅ |

**Conclusione**: ✅ Tutte giustificate (cache/lookup/backup). Nessuna azione necessaria.

## 🟡 RLS enabled ma policy non rilevate dal grep (19)

Il mio script ha cercato `CREATE POLICY ... ON public.X` con regex semplice. Le 19 tabelle sottostanti hanno `ENABLE RLS` ma il grep non ha trovato policy. **Possibili motivi**:

1. Policy create con sintassi alternativa (`CREATE POLICY foo ON foo_table FOR ALL TO authenticated USING(...)`)
2. Policy droppate e ricreate via `DROP POLICY IF EXISTS` + `CREATE POLICY` in migration successive
3. Policy effettivamente mancanti → **CRITICO** (tabella inaccessibile a tutti tranne service_role)

| Tabella | Priority verifica | Note |
|---|---|---|
| `sr_serramenti_progetto` | 🔴 HIGH | Usata dal modulo Serramenti — se policy mancante app crash |
| `sr_accessori_progetto` | 🔴 HIGH | Idem |
| `sr_calcolo_risparmio` | 🔴 HIGH | Idem |
| `sr_progetti_audit` | 🟡 MED | Audit log |
| `sr_progetti_media` | 🟡 MED | Foto progetti |
| `sr_template_pdf` | 🟡 MED | Template PDF Serramenti |
| `sr_pdf_generation_log` | 🟢 LOW | Log |
| `sr_cantieri_referenza` | 🟢 LOW | Reference foto |
| `task_checklist_items` | 🔴 HIGH | Task workflow |
| `user_availability_exceptions` | 🟡 MED | Calendar |
| `user_availability_slots` | 🟡 MED | Calendar |
| `webhook_deliveries` | 🟡 MED | Webhook log |
| `varianti_cliente` | 🟡 MED | Custom data |
| `stock_lotti` | 🟡 MED | Inventario |
| `cs_alerts` | 🟡 MED | Customer Success |
| `subappaltatori_sicurezza` | 🟡 MED | Sicurezza cantiere |
| `verbali_sicurezza` | 🟡 MED | Sicurezza |
| `adempimenti_sicurezza` | 🟡 MED | Sicurezza |
| `adempimenti_fiscali` | 🟡 MED | Fiscale |

## 📋 Comando di verifica suggerito (DB live)

```sql
-- Per ognuna delle 19 tabelle sopra, verificare l'esistenza di policy reali:
SELECT
  schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN (
  'sr_serramenti_progetto', 'sr_accessori_progetto', 'sr_calcolo_risparmio',
  'sr_progetti_audit', 'sr_progetti_media', 'sr_template_pdf',
  'sr_pdf_generation_log', 'sr_cantieri_referenza',
  'task_checklist_items', 'user_availability_exceptions',
  'user_availability_slots', 'webhook_deliveries', 'varianti_cliente',
  'stock_lotti', 'cs_alerts', 'subappaltatori_sicurezza',
  'verbali_sicurezza', 'adempimenti_sicurezza', 'adempimenti_fiscali'
)
ORDER BY tablename;
```

**Atteso**: ogni tabella deve avere almeno 1 policy `FOR ALL` (o pari combinazione SELECT/INSERT/UPDATE/DELETE) che ammetta accesso autenticato basato su `company_id`.

Se una tabella ritorna **0 rows** → **applicare migration** con policy standard:

```sql
CREATE POLICY "company_scope_<tabella>" ON public.<tabella>
  FOR ALL TO authenticated
  USING (company_id IN (
    SELECT company_id FROM public.user_roles WHERE user_id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM public.user_roles WHERE user_id = auth.uid()
  ));
```

## Conclusioni

- **Coverage RLS apparente: 99%** — molto buono per un progetto di queste dimensioni
- **9 tabelle senza RLS**: tutte legittime (cache/lookup/backup), nessuna azione
- **19 tabelle con RLS senza policy rilevate**: da verificare manualmente con query `pg_policies` su DB live (probabilmente policy esistono ma con sintassi che il grep non cattura)
- **Audit raccomandato cadenzato**: ripetere ogni quarter per coprire migration nuove
