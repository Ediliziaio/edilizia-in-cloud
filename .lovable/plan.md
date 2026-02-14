

# Pulizia, Fix e Stabilizzazione del Progetto

## 1. Pulizia codice - Import e variabili inutilizzati

### File: `src/components/layouts/EmployeeLayout.tsx`
- Rimuovere `useLocation` dall'import di `react-router-dom` (riga 1)
- Rimuovere `Menu` dall'import di `lucide-react` (riga 9)
- Rimuovere `const location = useLocation();` dal corpo di `EmployeeSidebar` (riga 42)

### File: `src/components/layouts/CustomerLayout.tsx`
- Rimuovere `import { cn } from "@/lib/utils"` (riga 21) - non utilizzato nel componente

## 2. Fix funzionali

### Bug: `notificationSound.ts` crea un nuovo AudioContext ad ogni chiamata
Il codice attuale crea un nuovo `AudioContext` e oscillator ad ogni notifica, accumulando risorse. Il check `if (!audio)` non funziona come inteso perche `audio` rimane sempre `null` (il fallback Web Audio API esce prima di assegnare `audio`).

**Fix in `src/lib/notificationSound.ts`:** Ristrutturare per riutilizzare lo stesso AudioContext e non accumulare risorse.

```typescript
let audioCtx: AudioContext | null = null;

export function playNotificationSound() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.value = 800;
    oscillator.type = "sine";
    gainNode.gain.value = 0.3;
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    oscillator.stop(audioCtx.currentTime + 0.3);
  } catch {
    // Silently fail if audio is not supported
  }
}
```

### Bug: AdminSupportChatList non si aggiorna quando l'admin chiude la chat
La query `admin-support-messages` ha `refetchInterval: 30s` ma quando l'admin chiude la chat dopo aver risposto, la lista non riflette immediatamente la risposta. 

**Fix in `src/components/admin/support/AdminSupportChatList.tsx`:** Invalidare la query `admin-support-messages` quando la chat sheet viene chiusa:

```typescript
import { useQueryClient } from "@tanstack/react-query";
// ...
const queryClient = useQueryClient();
// Nel handler onOpenChange:
onOpenChange={(open) => {
  if (!open) {
    setSelectedCompany(null);
    queryClient.invalidateQueries({ queryKey: ["admin-support-messages"] });
  }
}}
```

### Warning console: "Function components cannot be given refs"
Questo warning viene dal React Router v6 `Outlet` che tenta di passare un ref ai page components. E un warning noto e innocuo, ma per pulizia console si puo risolvere.

**Non risolvibile senza riscrivere le pagine come `forwardRef`** - e un warning benigno di React Router v6 e non impatta la funzionalita. Lo documentiamo come "warning irrilevante accettato".

## 3. Miglioramenti UX

### ScrollArea nella chat non fa auto-scroll corretto
In `SupportChatSheet.tsx` e `AdminSupportChatSheet.tsx`, il `scrollRef` e posto su un `div` dentro `ScrollArea`, ma `ScrollArea` gestisce lo scroll internamente tramite un viewport. Lo `scrollTop` sul div esterno non funziona con Radix ScrollArea.

**Fix:** Usare un approccio con `scrollIntoView` su un elemento sentinella alla fine della lista messaggi:

```typescript
const bottomRef = useRef<HTMLDivElement>(null);
// ...
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages]);
// ...
// Nel JSX, dopo il map dei messaggi:
<div ref={bottomRef} />
```

Applicare a entrambi `SupportChatSheet.tsx` e `AdminSupportChatSheet.tsx`.

## 4. Riepilogo modifiche

| Tipo | File | Descrizione |
|------|------|-------------|
| Pulizia | `EmployeeLayout.tsx` | Rimossi `useLocation`, `location`, `Menu` inutilizzati |
| Pulizia | `CustomerLayout.tsx` | Rimosso `cn` import inutilizzato |
| Fix Bug | `notificationSound.ts` | Riutilizzo AudioContext per evitare accumulo risorse |
| Fix Bug | `AdminSupportChatList.tsx` | Invalidazione query alla chiusura della chat |
| Fix UX | `SupportChatSheet.tsx` | Auto-scroll corretto con `scrollIntoView` |
| Fix UX | `AdminSupportChatSheet.tsx` | Auto-scroll corretto con `scrollIntoView` |

## Dettagli tecnici completi

### EmployeeLayout.tsx
- Riga 1: `import { Outlet, Link, useLocation } from "react-router-dom"` diventa `import { Outlet, Link } from "react-router-dom"`
- Riga 9: Rimuovere `Menu` dalla lista import lucide-react
- Riga 42: Rimuovere `const location = useLocation();`

### CustomerLayout.tsx
- Riga 21: Rimuovere `import { cn } from "@/lib/utils";`

### notificationSound.ts
- Sostituire il file con la versione che riusa `AudioContext` (vedi sopra)

### AdminSupportChatList.tsx
- Riga 2: Aggiungere `useQueryClient` all'import di `@tanstack/react-query`
- Dopo riga 37: Aggiungere `const queryClient = useQueryClient();`
- Riga 177: Modificare `onOpenChange` per invalidare la query alla chiusura

### SupportChatSheet.tsx e AdminSupportChatSheet.tsx
- Sostituire `scrollRef` con `bottomRef` pattern
- Rimuovere il vecchio `scrollRef` e l'effetto associato
- Aggiungere `<div ref={bottomRef} />` dopo il map dei messaggi
- L'effetto diventa: `bottomRef.current?.scrollIntoView({ behavior: "smooth" })`

