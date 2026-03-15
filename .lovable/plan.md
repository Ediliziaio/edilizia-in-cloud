

## Piano: Rimozione Impostazioni Piattaforma dall'area aziendale + Bug Fix Agenti AI

### Problema principale
Il tab "Impostazioni" nell'area aziendale (`ImpostazioniTab.tsx`) espone configurazioni che devono essere esclusivamente nel pannello super admin:
- API Key ElevenLabs (con possibilità di modifica!)
- Tabella prezzi e markup
- Domain whitelist
- Webhook URL piattaforma

Queste impostazioni esistono già correttamente in `PlatformSettingsPage.tsx` (modulo admin). L'`ImpostazioniTab` è una duplicazione pericolosa.

### Bug aggiuntivi trovati nell'area Agenti AI

| # | Bug | File | Gravità |
|---|-----|------|---------|
| 1 | Tab "Impostazioni" espone API key/pricing alle aziende | `AgentiAIPage.tsx`, `ImpostazioniTab.tsx` | **P0 — Sicurezza** |
| 2 | Header "Configura ElevenLabs" punta a tab impostazioni (che va rimossa) | `AgentiAIPage.tsx` L107-113 | P1 |
| 3 | Console error: `Select` non può ricevere refs in `StatisticheTab` | `StatisticheTab.tsx` L89 | P2 |
| 4 | `elConfig` query nel header legge `ai_elevenlabs_config` direttamente — dovrebbe usare la safe view per le aziende | `AgentiAIPage.tsx` L57-68 | P1 |
| 5 | Il filtro `visibleTabs` nasconde "impostazioni" per non-super_admin ma il tab rimane nel codice e può essere forzato via URL `?tab=impostazioni` | `AgentiAIPage.tsx` L75-77 | P1 |

### Correzioni pianificate

#### 1. Rimuovere tab "Impostazioni" dall'area aziendale
- Rimuovere `"impostazioni"` dal type `MainTab` e dall'array `TABS`
- Rimuovere il `TabsContent` per impostazioni
- Rimuovere l'import di `ImpostazioniTab`
- **NON eliminare** il file `ImpostazioniTab.tsx` (potrebbe essere utile per un futuro tab impostazioni company-level ridotto)... anzi sì, eliminarlo perché è una copia delle impostazioni piattaforma

#### 2. Rimuovere il banner "Configura ElevenLabs" dal header aziendale
- Rimuovere il pulsante "Configura ElevenLabs" che punta al tab rimosso
- Mantenere solo il badge di stato "ElevenLabs connesso" (read-only, senza link)
- La query `elConfig` deve leggere dalla safe view `ai_elevenlabs_config_safe` invece della tabella diretta

#### 3. Fix console error Select ref in StatisticheTab
- Il `Select` di Radix UI non accetta `ref` — il problema è che viene usato come componente diretto senza `forwardRef`. Verificare e wrappare se necessario, oppure rimuovere la struttura che causa il warning.

#### 4. Protezione URL diretta
- Nel render del `TabsContent`, se `activeTab === "impostazioni"` e il ruolo non è super_admin, redirect al tab "agenti"

### File da modificare

| File | Azione |
|---|---|
| `src/pages/azienda/AgentiAIPage.tsx` | Rimuovere tab impostazioni, fix header, fix elConfig query |
| `src/components/agenti/ImpostazioniTab.tsx` | Eliminare |
| `src/components/agenti/StatisticheTab.tsx` | Fix Select ref warning |

