

# Miglioramento Sezione Utenti Aziendali - Segmentazione e Chiarezza

## Stato attuale

La pagina mostra una tabella con filtri basici. Manca una visione d'insieme sulla composizione del team: quanti admin, quanti operatori, distribuzione permessi.

## Interventi previsti

### 1. KPI Cards di segmentazione (sopra la tabella)

Aggiungere 3-4 card riassuntive in cima:
- **Totale Utenti** (conteggio totale, incluso l'admin corrente)
- **Amministratori** (con icona shield, count)
- **Operatori** (count)
- **Accesso limitato** (count di staff con `only_assigned = true`)

Queste card danno un colpo d'occhio immediato sulla composizione del team.

### 2. Includere l'utente corrente nella lista

Attualmente la query esclude `user?.id` (riga 69). Questo e confuso perche l'admin non vede se stesso nella lista. Includerlo con un badge "Tu" e disabilitare le azioni di eliminazione su se stesso.

### 3. Migliorare la colonna Permessi

Invece di un singolo badge con testo troncato, mostrare:
- Per Admin: badge colorato "Accesso completo" con icona shield
- Per Staff: badges multipli (max 3 visibili + "+N") con colori distinti per categoria (interno vs marketing)

### 4. Badge ruolo piu descrittivo

- Admin: badge con sfondo verde/primary e icona
- Operatore: badge con sfondo secondario
- Aggiungere sotto-testo "Accesso limitato" se `only_assigned = true`

### 5. Empty state migliorato

Suggerimento contestuale piu chiaro quando non ci sono utenti.

## File da modificare

- `src/components/settings/UsersConfig.tsx` - Aggiungere KPI cards, includere utente corrente, migliorare rendering permessi e ruoli

Nessuna migrazione DB necessaria.

