

# Piano - WhatsApp Marketing & Vendita

## Obiettivo
Aggiungere una sezione "WhatsApp" nella navigazione Marketing, con una pagina dedicata che riutilizza i componenti della messaggistica interna esistente ma contestualizzata per il marketing (contatti marketing, lead, opportunità).

## Struttura

La pagina avrà 3 tab:
1. **Conversazioni** - Inbox WhatsApp filtrato per contatti marketing (riuso `ConversationList`, `ChatView`, `AiPanel`)
2. **Broadcast** - Invio messaggi di massa a segmenti di contatti (template WhatsApp)
3. **Impostazioni** - Connessione WhatsApp Business (riuso `MessagingSettingsTab`)

## Modifiche

### 1. Nuova pagina `src/pages/azienda/marketing/MarketingWhatsApp.tsx`
- 3 tab: Conversazioni, Broadcast, Impostazioni
- Tab Conversazioni: layout a 3 colonne identico a `MessagingBeta.tsx` (ConversationList + ChatView + AiPanel)
- Tab Broadcast: form per selezionare segmento contatti, template WhatsApp, anteprima, invio
- Tab Impostazioni: embed di `MessagingSettingsTab` esistente

### 2. Sidebar: aggiungere voce in `src/lib/sidebarConfig.ts`
- Aggiungere `{ title: "WhatsApp", url: "/azienda/marketing/whatsapp", icon: MessageCircle, permissionKey: "canViewMarketing", category: "marketing" }` dopo "Email Marketing"

### 3. Route in `src/App.tsx`
- Aggiungere lazy import `MarketingWhatsApp`
- Aggiungere `<Route path="marketing/whatsapp" element={<MarketingWhatsApp />} />`

### 4. Componente Broadcast `src/components/marketing/whatsapp/WhatsAppBroadcastTab.tsx`
- Select segmento contatti (tutti, per tag, per source, per pipeline stage)
- Select template WhatsApp (input nome template)
- Textarea per il testo del messaggio con variabili
- Anteprima messaggio
- Pulsante invio con conferma
- Tabella storico broadcast (placeholder per ora, dati non ancora in DB)

## Note tecniche
- I componenti `ConversationList`, `ChatView`, `AiPanel`, `MessageBubble`, `MessagingSettingsTab` vengono riutilizzati direttamente senza duplicazione
- Il hook `useMessagingData` viene riutilizzato as-is
- La tab Broadcast è un placeholder funzionale UI-only (il backend per l'invio di massa richiederà una edge function dedicata in futuro)

