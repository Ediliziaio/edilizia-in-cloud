
# Piano: Fix Fornitore, UX Stati Articoli e Caricamento Dati

## Problemi Identificati

### 1. Creazione Fornitore Fallisce
Il componente `SupplierSelect.tsx` (linee 48-61) usa una query per ottenere `company_id` dal profilo utente, ma per il super_admin che sta impersonando un'azienda, `profile.company_id` e `null`. Il network request conferma: `{"company_id":null,"name":"mario"}`.

**Soluzione**: Stessa fix gia applicata a `ArticleCombobox` - usare `effectiveCompany` da `useAuth()` invece della query sul profilo.

---

### 2. Dati Non Visibili in Modifica Ordine
Il problema e che gli articoli dell'ordine (`order_items`) vengono ricaricati correttamente dal database, ma quando si apre la pagina di modifica, gli articoli salvati dovrebbero apparire. Verifico che la logica di popolamento in `EditOrder.tsx` (linee 213-226) sia corretta.

**Possibile causa**: Se gli articoli non sono mai stati salvati inizialmente (a causa del bug precedente del form submit), il database e vuoto.

---

### 3. UX Stati Articoli - Miglioramento Visivo
I colori attuali sono troppo sottili. L'utente ha bisogno di:
- **Colori piu vividi e distinti** per ogni stato
- **Riepilogo visivo immediato** che mostri quanti articoli sono in ogni stato
- **Evidenziazione problemi** - se alcuni articoli sono "Da Ordinare" mentre altri sono "In Magazzino"

---

## Modifiche da Effettuare

### File 1: `src/components/orders/SupplierSelect.tsx`

#### Rimuovere query profilo, usare effectiveCompany

```typescript
// PRIMA (linee 44-61)
const { user } = useAuth();
const { data: profile } = useQuery({...});

// DOPO
const { effectiveCompany } = useAuth();
const companyId = effectiveCompany?.id;

// Usare companyId invece di profile.company_id ovunque
```

---

### File 2: `src/components/orders/OrderItemsList.tsx`

#### A. Nuovi colori piu vividi per gli stati

```typescript
const STATUS_CONFIG: Record<OrderItemStatus, { label: string; color: string; bgColor: string }> = {
  da_ordinare: { 
    label: "Da Ordinare", 
    color: "bg-amber-500 text-white",  // Arancione vivace per attenzione
    bgColor: "border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20"
  },
  ordinato: { 
    label: "Ordinato", 
    color: "bg-blue-500 text-white",   // Blu per "in processo"
    bgColor: "border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-950/20"
  },
  in_magazzino: { 
    label: "In Magazzino", 
    color: "bg-emerald-500 text-white", // Verde per "pronto"
    bgColor: "border-l-4 border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"
  },
  installato: { 
    label: "Installato", 
    color: "bg-purple-500 text-white",  // Viola per "completato"
    bgColor: "border-l-4 border-l-purple-500 bg-purple-50 dark:bg-purple-950/20"
  },
};
```

#### B. Riepilogo visivo nell'header della card

Aggiungere un riepilogo che mostra immediatamente lo stato degli articoli:

```
+--------------------------------------------------+
| Articoli dell'Ordine                   [Aggiungi]|
| ○ 2 Da Ordinare  ● 3 Ordinato  ● 1 In Magazzino  |
+--------------------------------------------------+
| [ARANCIO] Finestre PVC          x3   Da Ordinare |
| [BLU]     Porte interne         x2   Ordinato    |
| [VERDE]   Maniglie              x6   In Magazzino|
+--------------------------------------------------+
```

#### C. Evidenziazione articoli con bordo colorato

Ogni articolo avra un bordo sinistro colorato in base allo stato, rendendo immediata l'identificazione visiva.

---

## Layout Nuovo Riepilogo Stati

Il riepilogo mostra dei "chip" colorati con il conteggio per ogni stato:

```typescript
// Calcolare conteggio per stato
const statusCounts = items.reduce((acc, item) => {
  acc[item.status] = (acc[item.status] || 0) + 1;
  return acc;
}, {} as Record<OrderItemStatus, number>);

// Mostrare solo stati con articoli > 0
{Object.entries(statusCounts).map(([status, count]) => (
  <span 
    key={status} 
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CONFIG[status].color}`}
  >
    {count} {STATUS_CONFIG[status].label}
  </span>
))}
```

---

## Riepilogo Modifiche

| File | Modifica |
|------|----------|
| `SupplierSelect.tsx` | Usare `effectiveCompany` invece della query profilo |
| `OrderItemsList.tsx` | Colori vividi, bordi colorati, riepilogo stati nell'header |

---

## Colori Proposti

| Stato | Colore Badge | Bordo Sinistro | Significato |
|-------|--------------|----------------|-------------|
| Da Ordinare | Arancione (`amber-500`) | Arancione | Attenzione richiesta |
| Ordinato | Blu (`blue-500`) | Blu | In lavorazione |
| In Magazzino | Verde (`emerald-500`) | Verde | Pronto per la posa |
| Installato | Viola (`purple-500`) | Viola | Completato |

---

## Risultato Atteso

1. **Creazione fornitore funzionante** - Il componente usa `effectiveCompany` per ottenere il `company_id` corretto
2. **Identificazione immediata** - Ogni articolo ha un bordo colorato che indica lo stato
3. **Riepilogo nell'header** - Vedi subito quanti articoli sono in ogni stato (es. "2 Da Ordinare, 3 Ordinato")
4. **Colori vividi** - Badge con colori pieni (non sbiaditi) per massima leggibilita
5. **Attenzione visiva** - Gli articoli "Da Ordinare" hanno colore arancione che attira l'attenzione
