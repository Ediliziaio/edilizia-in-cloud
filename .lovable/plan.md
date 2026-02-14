
# Miglioramenti Chat Assistenza: Badge, Notifiche, Reportistica e Canali di Contatto

## 1. Badge notifica sul bottone "Assistenza" nell'header azienda

### File: `src/components/layouts/CompanyLayout.tsx`
- Aggiungere una query realtime che conta i messaggi non letti dal super admin (messaggi con `sender_role = "super_admin"` piu recenti dell'ultima apertura della chat)
- Creare un hook `useUnreadSupportCount` che:
  - Sottoscrive alla tabella `support_messages` in realtime filtrato per `company_id`
  - Tiene traccia dell'ultimo timestamp di lettura (salvato in `localStorage`)
  - Conta i messaggi con `sender_role = "super_admin"` e `created_at > lastReadTimestamp`
- Mostrare un Badge rosso sul bottone "Assistenza" con il conteggio
- Quando l'utente apre la chat, aggiornare il `lastReadTimestamp` a `now()`

### File da creare: `src/hooks/useUnreadSupportCount.ts`
- Query: `support_messages` filtrata per `company_id` e `sender_role = "super_admin"` e `created_at > lastRead`
- Realtime subscription per aggiornamento live
- Salvataggio `lastRead` in localStorage con chiave `support_last_read_{companyId}`

## 2. Notifiche sonore su nuovo messaggio

### File: `src/components/layouts/SupportChatSheet.tsx` (lato azienda)
- Nel listener realtime, quando arriva un messaggio con `sender_role = "super_admin"`, riprodurre un suono di notifica
- Usare l'API `Audio` del browser con un suono breve (data URI o file in `/public`)
- Mostrare anche un toast (sonner) con anteprima del messaggio se la chat e chiusa

### File: `src/components/admin/support/AdminSupportChatSheet.tsx` (lato admin)
- Nel listener realtime, quando arriva un messaggio con `sender_role = "company"`, riprodurre suono + toast

### File da creare: `public/notification.mp3`
- Suono di notifica breve (generato come data URI inline nel codice per semplicita)

### File da creare: `src/lib/notificationSound.ts`
- Utility che gestisce la riproduzione del suono di notifica
- Funzione `playNotificationSound()` riutilizzabile

## 3. Reportistica assistenza (lato admin)

### File: `src/components/admin/support/AdminSupportChatList.tsx`
- Aggiungere stat cards sopra la lista conversazioni con:
  - Totale conversazioni attive
  - Conversazioni da rispondere (ultimo messaggio da azienda)
  - Tempo medio di risposta (calcolato dai timestamp)
  - Messaggi totali oggi

### File da creare: `src/components/admin/support/SupportStats.tsx`
- Componente con 4 stat cards
- Calcola le metriche dai dati gia fetchati (nessuna query aggiuntiva)

## 4. Scelta canale di contatto lato azienda

### File: `src/components/layouts/CompanyLayout.tsx`
- Modificare il bottone "Assistenza" per aprire un dialog di scelta invece della chat diretta
- Opzioni: "Chat in tempo reale", "Invia email", "Altro"

### File da creare: `src/components/layouts/SupportChannelDialog.tsx`
- Dialog con 3 opzioni:
  1. **Chat in tempo reale** - apre il `SupportChatSheet` esistente
  2. **Invia email** - apre un form per comporre un'email di supporto (salvata come messaggio con tipo "email" o apre il client email con `mailto:`)
  3. **Richiedi richiamata** - form breve con numero telefono e orario preferito (salvato come messaggio speciale nella tabella `support_messages` con un prefisso tipo `[CALLBACK]`)

---

## Dettagli tecnici

### Badge unread (CompanyLayout.tsx)
```typescript
// Nel CompanyLayout, prima del bottone:
const { unreadCount, markAsRead } = useUnreadSupportCount();

// Nel bottone:
<Button variant="outline" size="sm" onClick={() => { markAsRead(); setSupportOpen(true); }}>
  <HeadphonesIcon className="h-4 w-4 mr-2" />
  Assistenza
  {unreadCount > 0 && (
    <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
      {unreadCount}
    </Badge>
  )}
</Button>
```

### Notifica sonora (notificationSound.ts)
```typescript
let audio: HTMLAudioElement | null = null;
export function playNotificationSound() {
  if (!audio) audio = new Audio('/notification.mp3');
  audio.currentTime = 0;
  audio.play().catch(() => {});
}
```

### Integrazione nel listener realtime
```typescript
// In SupportChatSheet, dentro il callback realtime:
if (newMsg.sender_role === "super_admin") {
  playNotificationSound();
  toast("Nuovo messaggio dal supporto", { description: newMsg.message.slice(0, 80) });
}
```

### SupportChannelDialog
- Card-based layout con 3 opzioni
- Ogni opzione ha icona, titolo e descrizione
- Click su "Chat" chiude il dialog e apre SupportChatSheet
- Click su "Email" apre `mailto:supporto@ediliziacloud.it` con subject precompilato
- Click su "Richiamata" mostra un mini-form inline con telefono + orario, salva come messaggio speciale

## File coinvolti

1. **Creare** `src/hooks/useUnreadSupportCount.ts`
2. **Creare** `src/lib/notificationSound.ts`
3. **Creare** `src/components/layouts/SupportChannelDialog.tsx`
4. **Creare** `src/components/admin/support/SupportStats.tsx`
5. **Modificare** `src/components/layouts/CompanyLayout.tsx` - badge + dialog scelta canale
6. **Modificare** `src/components/layouts/SupportChatSheet.tsx` - notifica sonora
7. **Modificare** `src/components/admin/support/AdminSupportChatSheet.tsx` - notifica sonora
8. **Modificare** `src/components/admin/support/AdminSupportChatList.tsx` - aggiungere SupportStats
