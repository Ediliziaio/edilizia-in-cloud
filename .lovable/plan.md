

# Riorganizzazione Sidebar Impostazioni - Team vs Utenti

## Situazione attuale (linee 239-267 di CompanyLayout.tsx)

Attualmente c'è un unico gruppo **"Team"** che contiene:
- Utenti (gestione accessi admin/operatori)
- Venditori (dati provvigioni/importi)
- Staff / Operai (dati stipendi/ore/importi)

## Problema
"Utenti" gestisce accessi e permessi al sistema, mentre "Venditori" e "Staff/Operai" servono per inserire dati economici (stipendi, provvigioni). Mescolarli crea confusione.

## Modifica

Separare in **due gruppi** nella sidebar delle Impostazioni:

### Gruppo 1: "Utenti"
- **Utenti** → gestione accessi, ruoli, permessi (admin/operatori)

### Gruppo 2: "Team"
- **Venditori** → dati commerciali, provvigioni
- **Staff / Operai** → stipendi, ore, costi manodopera

## File da modificare

**`src/components/layouts/CompanyLayout.tsx`** (linee 239-267):
- Rinominare il gruppo attuale "Team" in "Utenti" e lasciare solo la voce "Utenti"
- Creare un nuovo gruppo "Team" sotto, con le voci "Venditori" e "Staff / Operai"

Nessun altro file da toccare: le route e i componenti restano invariati.

