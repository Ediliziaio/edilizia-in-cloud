# Ticket FAQ Templates — Giorgio Support KB

> Giorgio cerca match qui prima di rispondere. Se trova FAQ con confidence
> > 90%, può rispondere AUTO. Altrimenti escalation a Florin.

## Format

Ogni FAQ ha:
```
## [SLUG] Domanda principale
Intent: feature_request / configurazione / bug / billing / how_to
Keywords: parole chiave per matching
---
Risposta template (Marco voice):
[testo]
```

## FAQ catalog (DA RIEMPIRE)

> ⚠️ Florin, riempi con i 30 ticket più frequenti che ricevi.

### [how-collegare-gmail] Come collego Gmail al sistema?

Intent: configurazione
Keywords: gmail, collegare, oauth, email, mail, sync

---

Risposta template:

> Ciao [NOME],
>
> Per collegare Gmail:
> 1. Vai su Impostazioni → Il mio profilo → tab Email
> 2. Click "Collega Gmail" — autorizza nella popup Google
> 3. Da quel momento vedi le tue email in /azienda/email
>
> Se la popup non si apre o ti blocca: disattiva ad-blocker e riprova.
>
> [SOFIA/GIORGIO] del team EiC

### [reset-password] Come resetto la password?

Intent: how_to
Keywords: password, reset, dimenticata, accesso, login

---

> Ciao [NOME],
>
> Sulla pagina login: click "Password dimenticata?" → inserisci email →
> ricevi link via email (controlla anche spam).
>
> Link valido 1 ora. Se è scaduto, ripeti il flow.

### [ddt-non-salva] DDT non si salva, dà errore

Intent: bug
Keywords: ddt, errore, salva, non funziona

---

> [ESCALATION_REQUIRED] — questo è un bug operativo, manda subito a Florin.

(Giorgio NON risponde da solo, ma genera bozza con domande chiarificatrici)

### [fattura-non-emessa] Fattura cliente non viene emessa

> [ESCALATION] — chiede info su:
> - Numero fattura
> - Data emissione tentata
> - Screenshot errore (se possibile)
> - Mail SDI ricevute

### [...]

> Aggiungi qui altre 25 FAQ tipiche.

## Pattern di escalation OBBLIGATORIA (mai auto-reply)

Giorgio escalation a Florin se:
- **Severity** = high o critical
- **Sentiment** = angry
- **Intent** = billing question (sempre Florin per fatturazione/contratti)
- **Intent** = feature_request (Marco saprà se è in roadmap)
- **Intent** = legal/GDPR
- **Keyword match**: "cancellare account", "disdetta", "rimborso", "garante", "avvocato"
