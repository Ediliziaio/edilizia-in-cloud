

# Test Auto-Assegnazione Staff con Visibilita Limitata

## Stato Attuale

L'unico staff nella tua azienda e **Enrico Goldoni** (`flo.andrihvhhhciuc@gmail.com`) con:
- `only_assigned = false`
- Tutti i permessi disattivati

## Passaggi per il Test

### Step 1: Preparare l'utente staff
Aggiornare i permessi di Enrico Goldoni nel database:
- Attivare `only_assigned = true`
- Attivare i permessi: `can_view_orders`, `can_edit_orders`, `can_view_calendar`, `can_view_dashboard`, `can_view_customers`

SQL da eseguire:
```text
UPDATE staff_permissions 
SET only_assigned = true,
    can_view_dashboard = true,
    can_view_orders = true,
    can_edit_orders = true,
    can_view_calendar = true,
    can_view_customers = true
WHERE user_id = '1ce18771-a9dd-4a1d-84af-4b0d59961238';
```

### Step 2: Accedere come Enrico Goldoni
- Usare la funzione "Quick Login" dal pannello admin oppure fare login con le credenziali di questo utente
- Nota: l'utente ha `must_change_password = true`, quindi potrebbe essere reindirizzato al cambio password

### Step 3: Verificare il comportamento
Una volta loggato come staff con visibilita limitata:

1. **Creare un ordine**: il campo "Assegnato a" deve essere pre-compilato con "Enrico Goldoni" e disabilitato
2. **Creare un'attivita**: il campo assegnatario deve essere pre-compilato e disabilitato
3. **Creare un appuntamento**: il campo assegnatario deve essere pre-compilato e disabilitato
4. **Verificare che i record creati siano visibili** nella lista ordini/attivita
5. **Verificare che gli ordini di altri utenti NON siano visibili**

### Step 4: Verificare in modifica
- Aprire un ordine creato: il campo "Assegnato a" deve essere disabilitato per impedire la de-assegnazione

## Implementazione

Per procedere servono due operazioni:
1. Una migration SQL per aggiornare i permessi dello staff user
2. Il test manuale accedendo come quell'utente

