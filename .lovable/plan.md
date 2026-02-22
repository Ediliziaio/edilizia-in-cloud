

# Validazione Contatti: Email/Telefono obbligatorio + Anti-duplicazione + Formato italiano

## Problema attuale
1. Solo `first_name` e obbligatorio, ma email e telefono no
2. Nessun controllo duplicati su email/telefono
3. Nessuna validazione formato numero italiano

## Modifiche

### File: `src/components/marketing/ContactDialog.tsx`

**1. Validazione: almeno email O telefono obbligatorio**
- Modificare `handleSubmit` per richiedere almeno uno tra email e telefono
- Aggiornare le label per indicare "Email o Telefono obbligatorio"
- Disabilitare il pulsante se mancano entrambi

**2. Validazione formato telefono italiano**
- Accettare formati: `+39 xxx xxxxxxx`, `+39xxxxxxxxxx`, `3xxxxxxxxx`, `0x xxxxxxx`
- Regex: `/^(\+39\s?)?[03]\d{5,12}$/` (dopo aver rimosso spazi)
- Mostrare errore inline se il formato non e valido

**3. Validazione formato email**
- Regex base per validare il formato email
- Mostrare errore inline

**4. Check duplicati nel database**
- Aggiungere prop `companyId` al `ContactDialog`
- Aggiungere prop `editingContactId` (opzionale) per escludere il contatto corrente in modifica
- In `handleSubmit`, prima di chiamare `onSave`:
  - Se email presente: query `marketing_contacts` per `email = X AND company_id = Y AND id != editingId`
  - Se telefono presente: query `marketing_contacts` per `phone = X AND company_id = Y AND id != editingId`
  - Se trovato un duplicato, mostrare errore e bloccare il salvataggio

### File: `src/pages/azienda/marketing/MarketingContacts.tsx`

- Passare `companyId` e `editingContactId` come nuove prop al `ContactDialog`

## Dettagli tecnici

### Regex telefono italiano
```text
// Rimuovi spazi, trattini, punti
const cleaned = phone.replace(/[\s\-\.]/g, "");
// Valida: +39 seguito da 9-10 cifre, oppure numero che inizia con 0 o 3
const isValid = /^(\+39)?[03]\d{8,10}$/.test(cleaned);
```

### Check duplicati (dentro ContactDialog)
```text
const checkDuplicate = async () => {
  if (!companyId) return null;
  const checks = [];
  if (form.email.trim()) {
    checks.push(
      supabase.from("marketing_contacts")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .eq("email", form.email.trim().toLowerCase())
        .neq("id", editingContactId || "00000000-0000-0000-0000-000000000000")
        .limit(1)
    );
  }
  if (cleanedPhone) {
    checks.push(
      supabase.from("marketing_contacts")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .eq("phone", cleanedPhone)
        .neq("id", editingContactId || "00000000-0000-0000-0000-000000000000")
        .limit(1)
    );
  }
  // Se trovato, return nome del duplicato
};
```

### UI errori
- Errori mostrati sotto ogni campo con testo rosso piccolo
- State `errors: { phone?: string; email?: string; general?: string }`
- Errore duplicato mostrato come toast o come messaggio sotto il form

## Riepilogo

| Cosa | Dettaglio |
|------|-----------|
| Obbligatorieta | Almeno email O telefono (non piu solo nome) |
| Anti-duplicazione | Check DB prima del salvataggio su email e telefono |
| Formato telefono | Regex per numeri italiani (+39, 3xx, 0xx) |
| Formato email | Validazione base |
| File modificati | `ContactDialog.tsx`, `MarketingContacts.tsx` |
| UX | Errori inline chiari, pulsante disabilitato se validazione fallisce |

