

# Spostare Tag e Campi Personalizzati in nuova categoria "Marketing e Vendita"

## Panoramica
Nella sidebar delle impostazioni aziendali, spostare le voci **Tag** e **Campi personalizzati** dalla sezione "Gestione ordini" a una nuova macrocategoria chiamata **"Marketing e Vendita"**, posizionata tra "Gestione ordini" e "Team".

## Cosa cambia

### File: `src/components/layouts/CompanyLayout.tsx`

**Sezione "Gestione ordini"** (righe 171-207): rimuovere le voci Tag e Campi personalizzati, lasciando solo:
- Stati ordine
- Fornitori

**Nuova sezione "Marketing e Vendita"**: aggiungere un nuovo `SidebarGroup` subito dopo "Gestione ordini" con:
- Tag (icona Tag, route `/azienda/impostazioni/tag`)
- Campi personalizzati (icona SlidersHorizontal, route `/azienda/impostazioni/campi-personalizzati`)

Nessun'altra icona da importare (Tag, SlidersHorizontal e Megaphone sono gia importati). Si aggiungera l'icona `Megaphone` come label della sezione per coerenza con la sidebar principale, oppure si usera solo il testo come nelle altre sezioni impostazioni.

## Risultato finale nella sidebar impostazioni

```
La mia azienda
  - Profilo aziendale
  - Catalogo articoli

Gestione ordini
  - Stati ordine
  - Fornitori

Marketing e Vendita    <-- NUOVA
  - Tag
  - Campi personalizzati

Team
  - Utenti
  - Venditori
  - Staff / Operai

Sicurezza e log
  - Cambio password
  - Registro attivita
```

## File coinvolti

| File | Azione |
|---|---|
| `src/components/layouts/CompanyLayout.tsx` | Spostamento voci + aggiunta nuovo SidebarGroup |

## Cosa NON cambia
- Routing invariato
- Componenti Tag e Campi personalizzati invariati
- Nessuna modifica al database

