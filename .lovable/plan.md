
# Fix Errore Email Marketing + Info SendGrid

## Problema

L'errore "A Select.Item must have a value prop that is not an empty string" viene dal file `CampaignDialog.tsx` alla riga 104:

```
<SelectItem value="">Nessuno</SelectItem>
```

Radix UI Select non permette valori stringa vuota per gli item. Questo causa il crash dell'intera pagina.

## Soluzione

### 1. Fix `CampaignDialog.tsx`

- Cambiare `<SelectItem value="">Nessuno</SelectItem>` in `<SelectItem value="none">Nessuno</SelectItem>`
- Aggiornare la logica di salvataggio per convertire "none" in `null` per il campo `template_id`
- Aggiornare lo stato iniziale di `templateId` per usare "none" come valore di default quando non c'e un template selezionato

### 2. Nessuna modifica database

Il fix e puramente frontend.

---

## SendGrid - Come integrarlo

SendGrid NON e necessario per far funzionare la UI. Il modulo attuale e un sistema CRUD completo (crea campagne, template, visualizza statistiche). L'invio reale delle email tramite SendGrid e previsto come Fase 2 e richiede:

1. **API Key SendGrid**: dovrai creare un account su sendgrid.com e generare una API key
2. **Configurazione secret**: la chiave verra salvata in modo sicuro nel backend come secret
3. **Backend function**: verra creata una funzione backend `send-email-campaign` che usa l'API SendGrid per l'invio
4. **Webhook**: verra configurato un endpoint per ricevere eventi da SendGrid (aperture, click, bounce)

Per ora, il fix dell'errore rendera il modulo utilizzabile per creare e gestire campagne e template. L'invio effettivo verra aggiunto successivamente.

---

## Sezione tecnica

| Azione | File |
|--------|------|
| Modifica | `src/components/email-marketing/CampaignDialog.tsx` (fix SelectItem value) |
