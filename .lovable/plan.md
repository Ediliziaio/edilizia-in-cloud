

# Redesign pagina Dettaglio Cliente — Layout a due colonne

## Problema
Il form ha `max-w-xl` (~36rem) e lascia tutto lo spazio destro vuoto. Lo storico ordini è sotto, creando una pagina lunga e sbilanciata.

## Soluzione
Convertire in layout a due colonne stile "detail page" coerente con il layout ordini (colonna principale 2/3 + sidebar 1/3):

### Colonna sinistra (2/3) — Dati Cliente
- Rimuovere `max-w-xl` dalla Card del form
- Il form si espande e occupa lo spazio disponibile
- Sezioni: Email, Dati Anagrafici, Indirizzi, Note, bottoni Salva/Annulla

### Colonna destra (1/3) — Sidebar informativa
- **Card Riepilogo**: avatar con iniziali, nome completo, email, telefono, data registrazione (`created_at`), CF/P.IVA — tutto read-only e compatto
- **Card Storico Ordini**: spostare qui la tabella ordini in formato compatto (codice, stato badge, importo, link). Se molti ordini, mostrare gli ultimi 5 con link "Vedi tutti"

### Struttura
```text
┌─────────────────────────┬──────────────┐
│  Header (nome, back)    │   Elimina    │
├─────────────────────────┴──────────────┤
│                                        │
│  ┌──────────────────┐ ┌─────────────┐  │
│  │ Modifica Dati    │ │ Riepilogo   │  │
│  │ Cliente          │ │ • Iniziali  │  │
│  │                  │ │ • Email     │  │
│  │ Nome / Cognome   │ │ • Tel       │  │
│  │ CF/PIVA          │ │ • Dal: data │  │
│  │ Telefono         │ │ • CF        │  │
│  │ Indirizzi        │ ├─────────────┤  │
│  │ Note             │ │ Ordini (N)  │  │
│  │                  │ │ • ORD-001   │  │
│  │ [Annulla] [Salva]│ │ • ORD-002   │  │
│  └──────────────────┘ └─────────────┘  │
└────────────────────────────────────────┘
```

### File modificato
- `src/pages/azienda/CompanyCustomerDetail.tsx` — ristrutturazione del JSX, nessuna modifica alla logica

