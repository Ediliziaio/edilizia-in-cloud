

# Ottimizzazione P2: Contacts Lookup + Travel Legs Paralleli

## 1. Contacts Lookup — fetch solo contatti referenziati

**Stato attuale** (righe 172-186): query che carica fino a 1000 contatti dall'azienda, indipendentemente da quanti sono effettivamente referenziati dagli appuntamenti.

**Intervento**: cambiare la query in modo che dipenda da `rawAppointments` e faccia fetch solo dei `contact_id` presenti negli appuntamenti caricati.

```text
Prima:  SELECT id, first_name, last_name FROM marketing_contacts WHERE company_id = X LIMIT 1000
Dopo:   SELECT id, first_name, last_name FROM marketing_contacts WHERE id IN (id1, id2, ..., idN)
```

Modifiche in `MarketingCalendar.tsx`:
- Estrarre `contactIds` unici da `rawAppointments` con `useMemo`
- Cambiare la `queryKey` per includere i `contactIds` (così si ricarica quando cambiano gli appuntamenti)
- Usare `.in("id", contactIds)` invece di `.eq("company_id", companyId).limit(1000)`
- Abilitare la query solo se `contactIds.length > 0`
- Rimuovere `staleTime` (non serve più, la query è già scoped agli appuntamenti correnti)

Stima miglioramento: da ~1000 righe a ~10-50 righe per payload tipico. -80% payload.

---

## 2. Travel Legs — parallelizzare con Promise.all

**Stato attuale** (righe 322-334): `for...of` sequenziale che chiama `computeTravelLegsForDate` per ogni giorno della settimana, uno alla volta.

**Intervento**: sostituire il loop sequenziale con `Promise.all` per eseguire tutte le chiamate in parallelo.

```typescript
// Prima (sequenziale):
for (const { dateKey, aptsWithCoords } of weekDaysWithAppts) {
  result[dateKey] = await computeTravelLegsForDate(aptsWithCoords);
}

// Dopo (parallelo):
const entries = await Promise.all(
  weekDaysWithAppts.map(async ({ dateKey, aptsWithCoords }) => ({
    dateKey,
    legs: await computeTravelLegsForDate(aptsWithCoords),
  }))
);
entries.forEach(({ dateKey, legs }) => { result[dateKey] = legs; });
```

Stima miglioramento: da 7× seriale (es. 7 × 300ms = 2.1s) a 1× parallelo (~300-400ms). -70% latenza.

---

## Riepilogo

| File | Modifica |
|------|----------|
| `MarketingCalendar.tsx` | Contacts: query scoped ai contact_id degli appuntamenti |
| `MarketingCalendar.tsx` | Travel legs: `Promise.all` invece di `for...of` |

Nessun rischio di regressione: entrambi i cambiamenti producono gli stessi dati, solo più velocemente e con meno payload.

