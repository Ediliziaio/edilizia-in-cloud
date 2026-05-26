# Onboarding Playbook — Sofia Agent KB

> Sequenza adattiva di touchpoint per portare nuovo cliente da signup a
> first value in 30gg. Sofia legge questo + customer_profile per decidere
> cosa mandare quando.

## Fasi standard

```
giorno 0    kickoff       (email immediata, link primo login)
giorno 3    check         (login fatto? sì → setup, no → assist)
giorno 7    first value   (tutorial contestuale su uso reale)
giorno 14   feedback NPS  (modal in-app)
giorno 21   call offer    (Calendly Florin se non graduated)
giorno 30   graduation OR stalled
```

## Adaptive rules

### Cliente ha già fatto login giorno 1
- giorno 3 → email "Vedo che hai già provato. Ti mando uno spunto"
- skip check-in standard, va a first_value

### Cliente NO login al giorno 3
- email tono empatico "Tutto ok? Serve aiuto?"
- escalation Slack a Florin: "cliente X stallo gg 3"

### Cliente login ma 0 commesse al giorno 7
- email con tutorial "crea la prima commessa in 60 sec" + video link
- enqueue task Florin: "chiamare cliente X per setup"

### Cliente power user (10+ login in 7gg)
- skip check-in invadente
- giorno 14 → email "Vedo che vai forte. Hai bisogno di X feature avanzata?"
- segnala a Tommaso: potenziale upsell

### Cliente team_size > 5
- email aggiuntiva con "invita i tuoi colleghi" + tutorial sharing

### Cliente paga piano Pro/Enterprise (> €400/mese)
- TUTTI gli touchpoint scattano notification a Florin per call diretta

## Per fase customer_onboarding

| current_phase | Sofia action |
|---------------|--------------|
| `kickoff` | Email benvenuto + login link |
| `first_login` | Email "primo step" specifico per modulo |
| `first_value` | Tutorial contestuale + offre call |
| `team_invited` | Email "complimenti, ora ecco come collaborare in team" |
| `integrated` | Email "siamo nella tua routine? Dimmi se serve altro" |
| `graduated` | Trasferito ad Elena CS (no più Sofia) |
| `stalled` | URGENTE: notif Florin + email recupero |

## Esempi email (DA RIEMPIRE da Florin)

### Email kickoff (giorno 0)

Subject: Benvenuto in EdiliziaInCloud, [NOME]

> [INSERISCI tone reale Florin]

### Email day 3 stuck

> [INSERISCI]

### Email day 21 call offer

> [INSERISCI con Calendly link]
