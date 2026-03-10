

# Audit — Email Marketing, Campaign Editor, Send Settings, DragDrop Builder

## Bug trovati

### Bug 1 (P0): Segment settings non vengono restaurati dal DB
**File:** `src/pages/azienda/marketing/CampaignSendSettings.tsx`, lines 131-150
`useEffect` che popola lo stato dal campaign NON restaura `segment_json`, `recipientMode`, `segmentTags`, `segmentSource`, `segmentContactType`. Quando l'utente salva una segmentazione, esce e rientra, i filtri segmento tornano a default ("list" / vuoti). Se invia senza riconfigurare, la campagna va a TUTTI i contatti iscritti invece che al segmento configurato.

**Fix:** Aggiungere nel `useEffect` la lettura di `campaign.segment_json` per restaurare `recipientMode` a "segment" e popolare `segmentTags`, `segmentSource`, `segmentContactType` dal JSON salvato.

### Bug 2 (P1): Query key mismatch tra editor/builder/sendSettings e lista
- `CampaignEditor.tsx` usa `["campaign-editor", id]` e invalida `["email-campaigns"]`
- `DragDropEmailBuilder.tsx` usa `["campaign-builder", id]` e invalida `["email-campaigns"]`
- `CampaignSendSettings.tsx` usa `["campaign-send-settings", id]` e invalida `["email-campaigns"]`

Il problema: tre query separate caricano la stessa campagna con chiavi diverse. Se l'utente modifica nel builder, poi va alle sendSettings, il contenuto mostrato nella preview (`campaign?.html_content`) viene dalla cache stale di `["campaign-send-settings", id]`, non dal dato appena salvato. La preview nella sidebar mostra il vecchio HTML.

**Fix:** Quando saveMut ha successo in CampaignEditor e DragDropEmailBuilder, invalidare anche `["campaign-send-settings", id]` e `["campaign-builder", id]` / `["campaign-editor", id]` rispettivamente. In questo modo, quando l'utente naviga tra editor e sendSettings, la campagna viene ricaricata dal DB.

### Bug 3 (P1): Invalidazione campagne usa `["email-campaigns"]` inline, non la factory
Tutti e 3 i file (editor, builder, sendSettings) e EmailCampaignsTab usano `["email-campaigns"]` inline. La factory `queryKeys.emailCampaigns.all` produce lo stesso valore, ma l'uso non è centralizzato. Questo non causa un bug attivo ora ma impedisce evoluzioni centralizzate.

**Fix:** Migrare le invalidazioni alla factory `queryKeys.emailCampaigns.all`. Basso rischio.

### Bug 4 (P1): Duplicate campaign non copia `segment_json` ne A/B settings
**File:** `src/components/email-marketing/EmailCampaignsTab.tsx`, lines 126-140
`duplicateMutation` copia `html_content`, `subject`, `sender_*`, `json_content` ma NON `segment_json`, `ab_test_enabled`, `ab_subject_b`, `ab_split_percent`, `preview_text` (preview_text IS copied), `track_clicks`, `utm_tracking`, ecc. Una campagna duplicata perde la segmentazione e tutte le impostazioni avanzate.

**Fix:** Aggiungere i campi mancanti al payload di duplicazione: `segment_json`, `ab_test_enabled`, `ab_subject_b`, `ab_split_percent`, `ab_winner_criteria`, `ab_test_duration_hours`, `track_clicks`, `utm_tracking`, `auto_tag`, `resend_to_unopened`, `send_mode`.

### Bug 5 (P2): CampaignEditor non filtra per company_id
**File:** `src/pages/azienda/marketing/CampaignEditor.tsx`, line 104
La query carica la campagna solo per `id` senza `.eq("company_id", ...)`. Defense-in-depth mancante. Stesso problema in DragDropEmailBuilder (line 57) e CampaignSendSettings (line 85).

**Fix:** Aggiungere `.eq("company_id", company.id)` dove `company` è disponibile dal context. In CampaignEditor il context auth non è importato, quindi va aggiunto `useAuth()`.

### Bug 6 (P2): AutoSave timer non cancellato su unmount nel DragDropEmailBuilder
**File:** `src/pages/azienda/marketing/DragDropEmailBuilder.tsx`
Non c'è un `useEffect` cleanup per `autoSaveTimer`. Se l'utente naviga via durante il debounce, il timer scatta su un componente smontato causando un warning e possibile crash. CampaignEditor ha già questo fix (line 152-156).

**Fix:** Aggiungere cleanup `useEffect` per il timer.

---

## Piano correzioni

| File | Fix | Tipo |
|------|-----|------|
| `src/pages/azienda/marketing/CampaignSendSettings.tsx` | Restaurare segment_json dal DB + cross-invalidate editor/builder keys + company_id filter | Dati / Cache / Sicurezza |
| `src/pages/azienda/marketing/CampaignEditor.tsx` | Cross-invalidate builder/sendSettings keys + company_id filter | Cache / Sicurezza |
| `src/pages/azienda/marketing/DragDropEmailBuilder.tsx` | Cross-invalidate editor/sendSettings keys + company_id filter + timer cleanup | Cache / Sicurezza / Memory |
| `src/components/email-marketing/EmailCampaignsTab.tsx` | Duplicazione campagna completa con tutti i campi | Dati |

4 file, 6 bug. Nessun cambio UX. Backward-compatible.

