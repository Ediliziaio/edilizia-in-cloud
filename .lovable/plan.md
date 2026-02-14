

# Azioni rapide inline sulla riga conversazione

## Cosa cambia

Aggiungere due dropdown (stato e priorita) direttamente su ogni riga della lista conversazioni, cosi l'admin puo cambiare stato o priorita con un click senza dover aprire la chat.

## Implementazione

### File: `src/components/admin/support/AdminSupportChatList.tsx`

Su ogni card conversazione, nella sezione destra (accanto a timestamp e conteggio messaggi), aggiungere:

1. **Select Stato** - dropdown compatto con le 4 opzioni (Aperta, In lavorazione, Risolta, Chiusa) che salva direttamente su `support_conversations`
2. **Select Priorita** - dropdown compatto con le 4 opzioni (Bassa, Normale, Alta, Urgente)
3. **Pulsante rapido "Risolto"** - icona CheckCircle che segna come risolto con un click

Ogni controllo usa `e.stopPropagation()` per evitare di aprire la chat sheet al click.

Al cambio valore, upsert immediato su `support_conversations` + invalidazione query per aggiornare la lista.

### Layout della riga (aggiornato)

```text
+--------+---------------------------+------------------+------------------+-------+
| Icona  | Nome + Badge + Messaggio  | Select Stato     | Select Priorita  | Time  |
|        |                           | (compact)        | (compact)        | Msgs  |
+--------+---------------------------+------------------+------------------+-------+
```

### Dettagli tecnici

- I Select usano dimensione compatta (`className="h-7 text-xs w-[130px]"`) per non appesantire la riga
- La funzione `updateConversation` fa upsert su `support_conversations` usando `company_id` come chiave di conflitto
- Se lo stato viene cambiato a "resolved", viene anche settato `resolved_at = now()`
- Se lo stato viene cambiato da "resolved" ad altro, `resolved_at` viene azzerato a `null`
- Dopo ogni update, si invalida `admin-support-conversations` per refresh immediato
- Toast di conferma dopo ogni cambio

### Nessun nuovo file

Tutto viene gestito dentro `AdminSupportChatList.tsx` con l'aggiunta di una funzione helper `handleInlineUpdate` e i due Select nel JSX della card.

