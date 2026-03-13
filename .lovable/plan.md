

## Remove Redundant Tabs from Reportistica

Remove 4 tabs that are redundant or unnecessary:
- **Report sugli agenti** (`agents`)
- **Report sugli appuntamenti** (`appointments`)
- **Report personalizzati** (`custom`)
- **Audit marketing locale** (`audit`)

### Change

**File: `src/pages/azienda/ReportisticaPage.tsx`** — Remove the 4 entries from the `TABS` array (lines 12, 15, 16, 17). The remaining tabs will be:
1. Report di Facebook Ads
2. Report di Google Ads
3. Rapporto di attribuzione
4. Report sulle chiamate
5. Performance Venditori

