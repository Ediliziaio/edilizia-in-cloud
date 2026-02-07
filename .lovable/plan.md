

# Piano: Miglioramenti Calendario

## Panoramica

Ottimizzare l'usabilità del calendario con miglioramenti visivi, nuovi filtri e funzionalità extra.

---

## 1. Miglioramenti Vista Mensile

### 1.1 Mostrare nome cliente negli eventi

Aggiungere il cognome del cliente accanto al codice ordine per riconoscere subito di chi si tratta:

```text
+------------------------+
|  15                    |
|  📦 ORD-001 - Bianchi  |  <- Codice + Cognome
|  🔨 ORD-002 - Rossi    |
+------------------------+
```

### 1.2 Correggere coerenza colori legenda

Usare le stesse classi CSS sia negli eventi che nella legenda (`bg-blue-500` e `bg-amber-500`).

### 1.3 Tooltip dettagliato

Aggiungere tooltip hover sugli eventi che mostri:
- Codice ordine completo
- Nome cliente completo
- Descrizione ordine
- Stato attuale

---

## 2. Miglioramenti Filtri

### 2.1 Contatore ordini

Mostrare quanti ordini sono visualizzati dopo il filtraggio:

```text
[Tutti gli stati v] [Tutti i clienti v]  |  Visualizzati: 12 ordini
```

### 2.2 Pulsante Reset Filtri

Aggiungere pulsante per azzerare tutti i filtri in un click:

```text
[Tutti gli stati v] [Tutti i clienti v] [Resetta Filtri]
```

### 2.3 Filtro Date Range

Aggiungere possibilità di filtrare per intervallo date (prossima settimana, prossimo mese, personalizzato).

---

## 3. Miglioramenti Vista Gantt

### 3.1 Correggere legenda

La legenda attuale dice "Completato/In corso/Futuro" ma i colori derivano dallo status ordine. Due opzioni:

**Opzione A**: Rimuovere legenda generica e mostrare mini-legenda degli stati aziendali
**Opzione B**: Colorare le barre in base alla logica temporale invece che allo status

Consiglio Opzione A per coerenza con il sistema.

### 3.2 Indicatore ordini senza date

Aggiungere sezione "Ordini non pianificati" con lista degli ordini che non hanno date lavoro.

### 3.3 Quick Actions

Doppio click su area vuota del timeline per creare rapidamente un ordine con quella data preimpostata.

---

## 4. Miglioramenti UX Generali

### 4.1 Notifica ordini incompleti

Mostrare badge/avviso se ci sono ordini senza date importanti:

```text
⚠️ 5 ordini senza data posa programmata
```

### 4.2 Keyboard shortcuts

- `T`: Vai a oggi
- `←/→`: Naviga periodo precedente/successivo
- `1/2/3/4`: Cambia zoom (week/month/quarter/year)

### 4.3 Salvataggio preferenze

Ricordare ultima vista (Mese/Gantt) e ultimo zoom usato dall'utente usando localStorage.

---

## 5. Ottimizzazioni Performance

### 5.1 Virtualizzazione righe Gantt

Per progetti con 50+ ordini, implementare virtualizzazione delle righe per mantenere fluidità.

### 5.2 Caching intelligente

Usare `staleTime` nella query per evitare refetch continui.

---

## File da Modificare

| File | Modifiche |
|------|-----------|
| `src/pages/azienda/Calendar.tsx` | Aggiungere contatore, reset filtri, filtro date |
| `src/components/calendar/CalendarMonthView.tsx` | Tooltip eventi, mostrare cognome cliente, fix colori legenda |
| `src/components/calendar/CalendarGanttView.tsx` | Fix legenda, sezione ordini non pianificati |
| `src/types/calendar.ts` | Eventuali nuovi tipi per filtri date |

---

## Priorità Implementazione

| Priorità | Miglioramento | Impatto |
|----------|---------------|---------|
| **Alta** | Contatore ordini + Reset filtri | Usabilità immediata |
| **Alta** | Fix legenda Gantt | Chiarezza visiva |
| **Media** | Tooltip eventi calendario mese | Info rapide |
| **Media** | Cognome cliente negli eventi | Riconoscimento |
| **Media** | Ordini non pianificati | Visibilità problemi |
| **Bassa** | Keyboard shortcuts | Power users |
| **Bassa** | Virtualizzazione | Solo se molti ordini |

---

## Riepilogo

Le modifiche proposte migliorano:
1. **Chiarezza** - Informazioni più leggibili e coerenti
2. **Efficienza** - Filtri più potenti e reset rapido
3. **Completezza** - Visibilità su ordini non pianificati
4. **Performance** - Ottimizzazioni per grandi dataset

Vuoi procedere con l'implementazione di tutti i miglioramenti o preferisci selezionarne alcuni?

