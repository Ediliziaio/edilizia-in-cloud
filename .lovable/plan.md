

# Spostamento Cerca e Notifiche nella header (top-right)

## Cosa cambia

Rimuovere i pulsanti "Cerca" e "Notifiche" dal fondo della sidebar e spostarli nella header bar in alto a destra, accanto al pulsante "Assistenza" e al nome azienda.

## File da modificare

**`src/components/layouts/CompanyLayout.tsx`** (unico file)

### 1. Sidebar — Rimuovere Cerca e Notifiche
Eliminare il blocco righe 593-626 (i due `SidebarMenuItem` per Cerca e Notifiche dentro `div.mt-auto > div.px-2.pt-3 > SidebarMenu`). Mantenere il `div.mt-auto.border-t` ma con solo il blocco Impostazioni sotto.

### 2. Header — Aggiungere Cerca e Notifiche
Nella header (riga 724-741), aggiungere prima del pulsante Assistenza:
- **Cerca**: un `Button` icon-only con `Search` icon che chiama `setCommandOpen(true)`, con tooltip `⌘K`
- **Notifiche**: un `Button` icon-only con `Bell` icon che chiama `setNotificationsPanelOpen(true)`, con badge conteggio non lette

L'ordine nella header sarà: `SidebarTrigger` | `flex-1 spacer` | **Cerca** | **Notifiche (con badge)** | **Assistenza (con badge)** | `Nome azienda`

### 3. Cleanup props
Rimuovere `onOpenNotifications`, `notificationCount`, `onOpenSearch` dalle props di `CompanySidebar` dato che non servono più nella sidebar. Questi stati sono già disponibili nel componente padre `CompanyLayout` dove risiede la header.

### Impatto
- Nessun cambio funzionale: CommandPalette, NotificationsPanel e SupportChannelDialog continuano a funzionare identicamente
- La shortcut `⌘K` continua a funzionare (gestita a livello di `CompanyLayout` con `useEffect`)
- Layout coerente con lo screenshot di riferimento fornito

