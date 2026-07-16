# Catalogo email di sistema — Edilizia in Cloud

58 template · aggiornato al 2026-07-16 · ✅ = inviata da un flusso reale · 💤 = dormiente (pronta nel builder, nessun invio cablato)

Le variabili `{{così}}` vengono sostituite all'invio. Modifica i testi qui e poi incollali nel builder: **Admin → Impostazioni → Email → Template**.


---

## Onboarding & account azienda

### Benvenuto azienda  ·  `welcome`  ·  ✅ ATTIVA

*Inviata da: create-company (creazione azienda)*
*Quando/a chi: Un super_admin crea una nuova azienda · Nuovo admin azienda*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`, `{{user.role_label}}`*

**Oggetto:** {{company.name}} è pronta su Edilizia in Cloud

**Testo:**

```
Benvenuto, {{user.first_name}}.
Da oggi {{company.name}} ha il suo gestionale. Cantieri, fatture, DDT, clienti e team in un posto solo — accessibile anche dal cantiere, col telefono in mano.

Il tuo account è attivo con ruolo {{user.role_label}}. Al primo accesso imposti la password e sei operativo:

[Imposta la password e accedi]({{link_url_1}})

Un consiglio da chi conosce il mestiere: parti creando il primo cantiere e caricando un cliente. Da lì il resto viene da sé.

Ti serve una mano per partire? Rispondi a questa email: dall'altra parte c'è una persona vera.
```

### Documenti accettati  ·  `terms_accepted`  ·  ✅ ATTIVA

*Inviata da: create-company (copia contratti)*
*Quando/a chi: Subito dopo il benvenuto, stesso admin · Admin azienda*
*Variabili: `{{company.name}}`, `{{event.date}}`, `{{event.time}}`, `{{link_url_1}}`, `{{link_url_2}}`, `{{link_url_3}}`, `{{link_url_4}}`, `{{link_url_5}}`, `{{user.first_name}}`*

**Oggetto:** La tua copia dei documenti, {{user.first_name}}

**Testo:**

```
I documenti che hai accettato
Quando hai registrato {{company.name}} hai accettato le condizioni del servizio. Qui sotto trovi la tua copia: tienila da parte, è il riferimento di cosa hai sottoscritto.

Accettazione registrata il {{event.date}} alle {{event.time}}.

- Termini e Condizioni del Servizio — [apri]({{link_url_1}})
- Privacy Policy — [apri]({{link_url_2}})
- Accordo trattamento dati (DPA) — [apri]({{link_url_3}})
- Cookie Policy — [apri]({{link_url_4}})
Un documento in più, che serve a te: quando i tuoi operai usano l'app (GPS, timbrature) devi consegnare loro l'informativa privacy. Te la lasciamo già pronta, da firmare e archiviare.

[Apri i tuoi documenti]({{link_url_5}})
```

### Accesso staff  ·  `staff_access`  ·  💤 DORMIENTE

*Quando/a chi: L'admin crea un membro dello staff · Nuovo utente staff*
*Variabili: `{{company.name}}`, `{{inviter.name}}`, `{{link_url_1}}`, `{{user.email}}`*

**Oggetto:** Il tuo accesso a {{company.name}} è pronto

**Testo:**

```
Benvenuto in {{company.name}}
{{inviter.name}} ti ha creato un account su Edilizia in Cloud, il gestionale che {{company.name}} usa per cantieri, clienti e documenti.

Per entrare imposta la tua password: è personale, la vedi solo tu.

Accedi con: {{user.email}}

[Imposta la password]({{link_url_1}})

Il link vale 24 ore. Scaduto, usa “Password dimenticata” dalla pagina di accesso.
```

### Account dipendente  ·  `employee_account`  ·  💤 DORMIENTE

*Quando/a chi: L'admin crea l'account di un dipendente · Dipendente*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.email}}`, `{{user.first_name}}`*

**Oggetto:** Il tuo accesso a {{company.name}}

**Testo:**

```
Ciao {{user.first_name}}, {{company.name}} ti ha aperto un account su Edilizia in Cloud. Da qui timbri le ore, vedi i cantieri assegnati e carichi le foto dei lavori — tutto dal telefono.

Imposta la password e sei operativo:

Accedi con: {{user.email}}

[Imposta la password]({{link_url_1}})

Il link vale 24 ore.
```

### Account venditore  ·  `salesperson_account`  ·  💤 DORMIENTE

*Quando/a chi: L'admin crea l'account di un venditore · Venditore*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.email}}`, `{{user.first_name}}`*

**Oggetto:** Il tuo accesso a {{company.name}}

**Testo:**

```
Ciao {{user.first_name}}, {{company.name}} ti ha aperto un account commerciale su Edilizia in Cloud. Da qui gestisci preventivi, clienti e il tuo portafoglio commesse.

Imposta la password e parti:

Accedi con: {{user.email}}

[Imposta la password]({{link_url_1}})

Il link vale 24 ore.
```


---

## Password & sicurezza

### Reset password (self-service)  ·  `password_reset`  ·  ✅ ATTIVA

*Inviata da: reset-customer-password (⚠️ usa HTML proprio, questo copy è bypassato)*
*Quando/a chi: L'utente clicca “password dimenticata” · Utente*
*Variabili: `{{link_url_1}}`*

**Oggetto:** Reimposta la tua password

**Testo:**

```
Reimposta la password
Hai chiesto di reimpostare la password del tuo account. Nessun problema: creane una nuova da qui.

[Crea una nuova password]({{link_url_1}})

Il link scade tra 24 ore. Se non hai richiesto tu il reset, ignora questa email: la password resta quella di prima.
```

### Reset password (da admin)  ·  `password_reset_admin`  ·  💤 DORMIENTE

*Quando/a chi: Un admin reimposta la password di un utente · Utente target*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{platform.support_email}}`, `{{user.first_name}}`*

**Oggetto:** La tua password è stata reimpostata

**Testo:**

```
Ciao {{user.first_name}}, un amministratore di {{company.name}} ha reimpostato il tuo accesso. Per sicurezza la nuova password la scegli tu, in un passaggio:

[Imposta la nuova password]({{link_url_1}})

Non te l'aspettavi? Scrivici a {{platform.support_email}}.
```

### Password cambiata  ·  `password_changed`  ·  💤 DORMIENTE

*Quando/a chi: Notifica di sicurezza dopo un cambio password · Utente*
*Variabili: `{{company.name}}`, `{{event.date}}`, `{{event.time}}`, `{{platform.support_email}}`*

**Oggetto:** La tua password è stata cambiata

**Testo:**

```
La tua password è stata cambiata
La password del tuo account {{company.name}} è stata cambiata il {{event.date}} alle {{event.time}}.

Se sei stato tu, è tutto a posto: non devi fare nulla.

Se non sei stato tu, qualcuno potrebbe avere accesso al tuo account. Scrivici subito a {{platform.support_email}}: blocchiamo l'accesso e lo mettiamo in sicurezza.
```

### Codice OTP login (2FA)  ·  `otp_login`  ·  ✅ ATTIVA

*Inviata da: email-otp-send*
*Quando/a chi: Secondo fattore dopo l'inserimento password · Utente con 2FA attiva*
*Variabili: `{{otp.code}}`*

**Oggetto:** Codice di accesso: {{otp.code}}

**Testo:**

```
Il tuo codice di sicurezza
Hai inserito la password giusta. Per completare l'accesso digita questo codice:

{{otp.code}}

Scade tra 15 minuti. Se non stai accedendo tu, qualcuno conosce la tua password: cambiala subito.
```

### Email modificata · avviso vecchio indirizzo  ·  `email_change_old`  ·  💤 DORMIENTE

*Quando/a chi: Richiesta di cambio email — inviata al VECCHIO indirizzo · Indirizzo email precedente*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`, `{{user.new_email}}`*

**Oggetto:** Hai cambiato l'email di accesso?

**Testo:**

```
Richiesta di cambio email
Ciao {{user.first_name}}, è stata richiesta la modifica dell'email di accesso del tuo account {{company.name}}, verso {{user.new_email}}.

Se sei stato tu, non devi fare nulla: appena confermi dal nuovo indirizzo, l'accesso si sposta lì.

Se non sei stato tu, qualcuno sta cercando di prenderti l'account. Annulla subito:

[Non sono stato io — blocca il cambio]({{link_url_1}})

Per sicurezza inviamo questo avviso anche al nuovo indirizzo.
```

### Email modificata · conferma nuovo indirizzo  ·  `email_change_new`  ·  💤 DORMIENTE

*Quando/a chi: Richiesta di cambio email — inviata al NUOVO indirizzo · Nuovo indirizzo email*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Conferma il tuo nuovo indirizzo email

**Testo:**

```
Ciao {{user.first_name}}, per completare il cambio email del tuo account {{company.name}}, conferma che questo nuovo indirizzo è tuo.

[Conferma il nuovo indirizzo]({{link_url_1}})

Finché non confermi, l'accesso resta sull'email precedente. Link valido 24 ore.
```

### Verifica in due passaggi attivata  ·  `twofa_enabled`  ·  💤 DORMIENTE

*Quando/a chi: L'utente attiva la 2FA · Utente*
*Variabili: `{{company.name}}`, `{{platform.support_email}}`, `{{user.first_name}}`*

**Oggetto:** Verifica in due passaggi attivata

**Testo:**

```
Ciao {{user.first_name}}, hai attivato la verifica in due passaggi sul tuo account {{company.name}}. Da ora, a ogni accesso, oltre alla password serve un codice temporaneo: anche se qualcuno indovinasse la password, senza il codice non entra.

Non sei stato tu ad attivarla? Scrivici a {{platform.support_email}}.
```

### Verifica in due passaggi disattivata  ·  `twofa_disabled`  ·  💤 DORMIENTE

*Quando/a chi: L'utente disattiva la 2FA · Utente*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Verifica in due passaggi disattivata

**Testo:**

```
Ciao {{user.first_name}}, la verifica in due passaggi sul tuo account {{company.name}} è stata disattivata. Da ora per entrare basta la password.

Se non sei stato tu, riattivala e cambia la password: qualcuno potrebbe avere accesso.

[Riattiva la protezione]({{link_url_1}})
```

### Nuovo accesso da dispositivo sconosciuto  ·  `new_device_login`  ·  💤 DORMIENTE

*Quando/a chi: Login da dispositivo/posizione mai visti · Utente*
*Variabili: `{{company.name}}`, `{{device.location}}`, `{{device.name}}`, `{{event.date}}`, `{{event.time}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Nuovo accesso al tuo account

**Testo:**

```
Abbiamo notato un nuovo accesso
Ciao {{user.first_name}}, qualcuno ha effettuato l'accesso al tuo account {{company.name}}:

🖥 Dispositivo: {{device.name}}
📍 Posizione: {{device.location}}
🕐 Quando: {{event.date}} alle {{event.time}}

Se sei stato tu, ignora pure questa email.

Se non ti riconosci, cambia subito la password: mettiamo in sicurezza l'account.

[Non sono stato io]({{link_url_1}})
```

### Account bloccato (troppi tentativi)  ·  `account_locked`  ·  💤 DORMIENTE

*Quando/a chi: Troppi tentativi di accesso falliti · Utente*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Account bloccato temporaneamente

**Testo:**

```
Ciao {{user.first_name}}, abbiamo bloccato l'accesso al tuo account {{company.name}} dopo diversi tentativi falliti. È una protezione automatica contro chi prova a indovinare la password.

Puoi riprovare tra qualche minuto. Se non ricordi la password, reimpostala subito:

[Reimposta la password]({{link_url_1}})

Non hai provato a entrare tu? Reimposta la password per sicurezza.
```


---

## Team, inviti & accessi

### Invito admin piattaforma  ·  `user_invited`  ·  ✅ ATTIVA

*Inviata da: invite-admin*
*Quando/a chi: Un super_admin invita un nuovo admin · Nuovo admin (token 7 giorni)*
*Variabili: `{{inviter.name}}`, `{{link_url_1}}`, `{{user.role_label}}`*

**Oggetto:** {{inviter.name}} ti ha invitato su Edilizia in Cloud

**Testo:**

```
{{inviter.name}} ti ha invitato a entrare in Edilizia in Cloud come {{user.role_label}}. Accetta e crea il tuo account: bastano due minuti.

[Accetta l'invito]({{link_url_1}})

Vale 7 giorni. Se non riconosci la richiesta, ignora l'email.
```

### Invito commercialista  ·  `accountant_invite`  ·  💤 DORMIENTE

*Quando/a chi: L'azienda invita il proprio commercialista · Commercialista*
*Variabili: `{{access.level}}`, `{{accountant.name}}`, `{{company.name}}`, `{{inviter.name}}`, `{{link_url_1}}`*

**Oggetto:** {{company.name}} ti ha aggiunto come commercialista

**Testo:**

```
Ciao {{accountant.name}}, {{inviter.name}} di {{company.name}} ti ha dato accesso come commercialista, con livello {{access.level}}. Da qui vedi fatture e documenti dell'azienda senza più rincorrerli via email.

Non hai ancora un account studio? Lo apri in 60 secondi e l'azienda compare subito tra i tuoi clienti.

[Accetta e accedi]({{link_url_1}})

{{company.name}} non avrà mai accesso ai dati del tuo studio.
```

### Reminder invito  ·  `invite_reminder`  ·  ✅ ATTIVA

*Inviata da: system-emails-tick (+48h)*
*Quando/a chi: L'utente invitato non ha ancora completato l'accesso · Utente invitato*
*Variabili: `{{company.name}}`, `{{inviter.name}}`, `{{link_url_1}}`*

**Oggetto:** Ti aspettano su {{company.name}}

**Testo:**

```
{{inviter.name}} ti ha invitato su {{company.name}} qualche giorno fa, ma non sei ancora entrato. Manca solo che imposti la password — poi accedi ai cantieri.

[Completa l'accesso]({{link_url_1}})

Link scaduto? Chiedi a {{inviter.name}} di rimandartelo.
```

### Conferma email  ·  `account_verify`  ·  💤 DORMIENTE

*Quando/a chi: Registrazione che richiede verifica dell'indirizzo · Utente in attesa di verifica*
*Variabili: `{{company.name}}`, `{{link_url_1}}`*

**Oggetto:** Conferma la tua email per attivare l'account

**Testo:**

```
Ci siamo quasi. Conferma che questo è il tuo indirizzo e attiviamo subito il tuo account su {{company.name}}.

[Conferma l'email]({{link_url_1}})

Il link è valido 24 ore. Non hai creato tu questo account? Ignora pure.
```

### Invito accettato (notifica admin)  ·  `invite_accepted_admin`  ·  💤 DORMIENTE

*Quando/a chi: Un invitato accetta e attiva l'account · Admin che ha invitato*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`, `{{user.full_name}}`, `{{user.role_label}}`*

**Oggetto:** {{user.full_name}} è entrato in {{company.name}}

**Testo:**

```
Ciao {{user.first_name}}, {{user.full_name}} ha accettato l'invito ed è ora attivo su {{company.name}} con ruolo {{user.role_label}}.

[Gestisci il team]({{link_url_1}})

Vuoi cambiargli i permessi? Lo fai dalla sezione Persone & Accessi.
```

### Ruolo modificato  ·  `role_changed`  ·  💤 DORMIENTE

*Quando/a chi: Un admin cambia ruolo/permessi a un utente · Utente interessato*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`, `{{user.role_label}}`*

**Oggetto:** Il tuo ruolo su {{company.name}} è cambiato

**Testo:**

```
Ciao {{user.first_name}}, il tuo ruolo su {{company.name}} è stato aggiornato a {{user.role_label}}. A seconda del ruolo cambia cosa puoi vedere e modificare nella piattaforma.

[Accedi e dai un'occhiata]({{link_url_1}})

Qualcosa non torna? Parlane con chi gestisce gli accessi in azienda.
```

### Utente rimosso dal workspace  ·  `user_removed`  ·  💤 DORMIENTE

*Quando/a chi: Un admin revoca l'accesso a un utente · Utente rimosso*
*Variabili: `{{company.name}}`, `{{user.first_name}}`*

**Oggetto:** Il tuo accesso a {{company.name}} è stato revocato

**Testo:**

```
Ciao {{user.first_name}}, il tuo accesso a {{company.name}} su Edilizia in Cloud è stato rimosso. Da questo momento non puoi più entrare nei cantieri e nei documenti dell'azienda.

Pensi sia un errore? Contatta chi gestisce gli accessi in {{company.name}}.
```

### Invito scaduto  ·  `invite_expired`  ·  💤 DORMIENTE

*Quando/a chi: Un invito non accettato supera la scadenza · Utente invitato*
*Variabili: `{{company.name}}`, `{{inviter.name}}`, `{{user.first_name}}`*

**Oggetto:** Il tuo invito a {{company.name}} è scaduto

**Testo:**

```
Ciao {{user.first_name}}, l'invito a entrare in {{company.name}} è scaduto prima che lo accettassi. Capita.

Per riaverlo chiedi a {{inviter.name}} di rimandartelo: ci mette dieci secondi.

Gli inviti scadono per sicurezza, così nessun link resta valido all'infinito.
```


---

## Abbonamento & fatturazione

### Setup incompleto  ·  `setup_incomplete`  ·  ✅ ATTIVA

*Inviata da: system-emails-tick (+48h)*
*Quando/a chi: Account creato ma setup a metà · Admin azienda*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Manca poco per partire, {{user.first_name}}

**Testo:**

```
Manca poco per partire
Hai aperto l'account ma il setup di {{company.name}} è a metà. Ti restano due cose, cinque minuti in tutto:

- Completare i dati per le fatture (così emetti la prima senza intoppi)
- Creare il primo cantiere

[Completa il setup]({{link_url_1}})

Ti si blocca qualcosa? Rispondi a questa email, ti diamo una mano noi.
```

### Trial in scadenza  ·  `lifecycle_trial_ending`  ·  ✅ ATTIVA

*Inviata da: lifecycle-email-tick (D-3)*
*Quando/a chi: Il periodo di prova sta per finire · Admin azienda in trial*
*Variabili: `{{link_url_1}}`, `{{stats.customers}}`, `{{stats.orders}}`, `{{trial.days_left}}`, `{{user.first_name}}`*

**Oggetto:** Il tuo trial scade tra {{trial.days_left}} giorni

**Testo:**

```
Mancano {{trial.days_left}} giorni, {{user.first_name}}
Il periodo di prova sta per finire. Intanto guarda cosa hai già messo dentro:

📦 Commesse create: {{stats.orders}}
👥 Clienti gestiti: {{stats.customers}}

Quando il trial scade l'accesso si ferma e questi dati restano in attesa. Attiva un piano e continui da dove sei, senza perdere niente.

[Attiva un piano]({{link_url_1}})

Domande prima di decidere? Rispondi qui.
```

### Pagamento fallito (dunning)  ·  `lifecycle_payment_failed`  ·  💤 DORMIENTE

*Quando/a chi: Addebito ricorrente non riuscito · Admin azienda*
*Variabili: `{{company.name}}`, `{{dunning.attempt}}`, `{{link_url_1}}`, `{{subscription.amount}}`, `{{user.first_name}}`*

**Oggetto:** Pagamento non riuscito — sistemalo in 1 minuto

**Testo:**

```
Ciao {{user.first_name}}, non siamo riusciti ad addebitare {{subscription.amount}} per l'abbonamento di {{company.name}} (tentativo {{dunning.attempt}}).

Di solito è solo una carta scaduta o un plafond momentaneo. Aggiorna il metodo e risolviamo in un minuto — prima che l'account venga sospeso.

[Aggiorna il pagamento]({{link_url_1}})

Riproviamo in automatico nei prossimi giorni. Se ti serve aiuto, rispondi a questa email.
```

### Abbonamento attivato  ·  `purchase_confirmed`  ·  ✅ ATTIVA

*Inviata da: system-emails-tick*
*Quando/a chi: Primo pagamento andato a buon fine · Admin azienda*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{plan.name}}`, `{{subscription.amount}}`, `{{subscription.periodicity}}`, `{{user.first_name}}`*

**Oggetto:** Abbonamento attivo: bentornato operativo

**Testo:**

```
Il tuo abbonamento è attivo
Grazie {{user.first_name}}. L'abbonamento di {{company.name}} è attivo: hai tutta la piattaforma, senza i limiti del periodo di prova.

💶 Importo: {{subscription.amount}}
📦 Piano: {{plan.name}}
🔁 Fatturazione: {{subscription.periodicity}}

[Vai alla dashboard]({{link_url_1}})

La ricevuta arriva in una mail separata.
```

### Ricevuta di pagamento  ·  `payment_received`  ·  💤 DORMIENTE

*Quando/a chi: Ogni addebito andato a buon fine · Admin azienda*
*Variabili: `{{card.last4}}`, `{{company.name}}`, `{{event.date}}`, `{{link_url_1}}`, `{{payment.method}}`, `{{subscription.amount}}`, `{{user.first_name}}`*

**Oggetto:** Ricevuta pagamento · {{company.name}}

**Testo:**

```
Ciao {{user.first_name}}, abbiamo ricevuto il pagamento dell'abbonamento di {{company.name}}.

🧾 Importo: {{subscription.amount}}
💳 Metodo: {{payment.method}} ••{{card.last4}}
📅 Data: {{event.date}}

[Scarica la fattura]({{link_url_1}})

Conserva questa email per la contabilità.
```

### Rinnovo imminente  ·  `renewal_upcoming`  ·  💤 DORMIENTE

*Quando/a chi: Pochi giorni prima del rinnovo automatico · Admin azienda*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{subscription.amount}}`, `{{subscription.renewal_date}}`, `{{user.first_name}}`*

**Oggetto:** Tra pochi giorni si rinnova l'abbonamento

**Testo:**

```
Ciao {{user.first_name}}, ti avvisiamo in anticipo: l'abbonamento di {{company.name}} si rinnova il {{subscription.renewal_date}} per {{subscription.amount}}, sullo stesso metodo di pagamento.

Va bene così? Non devi fare nulla. Vuoi cambiare piano o metodo? Fallo prima del rinnovo:

[Gestisci l'abbonamento]({{link_url_1}})
```

### Carta in scadenza  ·  `card_expiring`  ·  💤 DORMIENTE

*Quando/a chi: La carta salvata sta per scadere · Admin azienda*
*Variabili: `{{card.last4}}`, `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** La carta sta per scadere

**Testo:**

```
Ciao {{user.first_name}}, la carta che usi per l'abbonamento di {{company.name}} (••{{card.last4}}) scade a breve. Aggiornala adesso, così al prossimo rinnovo non si blocca niente.

[Aggiorna la carta]({{link_url_1}})

Ci vuole un minuto. Meglio ora che con l'account sospeso.
```

### Trial scaduto  ·  `trial_expired`  ·  💤 DORMIENTE

*Quando/a chi: Il periodo di prova è terminato senza attivazione · Admin azienda*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Il tuo trial è finito — i dati sono al sicuro

**Testo:**

```
Ciao {{user.first_name}}, il periodo di prova di {{company.name}} è terminato e l'accesso è in pausa. I tuoi dati — commesse, clienti, documenti — sono tutti lì, intatti.

Quando sei pronto, attivi un piano e riparti esattamente da dove avevi lasciato.

[Riattiva l'account]({{link_url_1}})

Conserviamo i dati per un periodo limitato: non aspettare troppo per non rischiare di perderli.
```

### Cambio piano confermato  ·  `plan_changed`  ·  💤 DORMIENTE

*Quando/a chi: Upgrade o downgrade del piano · Admin azienda*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{plan.name}}`, `{{subscription.amount}}`, `{{subscription.renewal_date}}`, `{{user.first_name}}`*

**Oggetto:** Piano aggiornato: ora sei su {{plan.name}}

**Testo:**

```
Ciao {{user.first_name}}, il piano di {{company.name}} è stato aggiornato a {{plan.name}}. La modifica è attiva da subito.

📦 Nuovo piano: {{plan.name}}
💶 Importo: {{subscription.amount}}
🔁 Prossimo rinnovo: {{subscription.renewal_date}}

[Vedi cosa è cambiato]({{link_url_1}})
```

### Abbonamento cancellato  ·  `subscription_cancelled`  ·  💤 DORMIENTE

*Quando/a chi: L'utente cancella l'abbonamento · Admin azienda*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{subscription.renewal_date}}`, `{{user.first_name}}`*

**Oggetto:** Abbonamento cancellato — ci dispiace vederti andare

**Testo:**

```
Ciao {{user.first_name}}, abbiamo registrato la cancellazione dell'abbonamento di {{company.name}}. Continui a usare tutto fino al {{subscription.renewal_date}}: dopo, l'account va in pausa e i dati restano in attesa.

Se cambi idea, riattivi con un click prima di quella data.

[Ho ripensato — riattiva]({{link_url_1}})

Un minuto per dirci cosa non ha funzionato? Rispondi a questa email: leggo tutto io.
```

### Account sospeso per mancato pagamento  ·  `account_suspended`  ·  💤 DORMIENTE

*Quando/a chi: Fine sequenza dunning senza incasso · Admin azienda*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Account sospeso — riattivalo ora

**Testo:**

```
Account in pausa
Ciao {{user.first_name}}, dopo diversi tentativi non siamo riusciti a incassare l'abbonamento di {{company.name}}, quindi l'account è stato sospeso. L'accesso è bloccato, ma i tuoi dati sono ancora tutti lì.

Aggiorna il pagamento e torni operativo all'istante:

[Aggiorna e riattiva]({{link_url_1}})

I dati restano disponibili per un periodo limitato. Riattiva prima di rischiare di perderli.
```

### Rimborso emesso  ·  `refund_issued`  ·  💤 DORMIENTE

*Quando/a chi: Viene emesso un rimborso · Admin azienda*
*Variabili: `{{card.last4}}`, `{{company.name}}`, `{{payment.amount}}`, `{{payment.method}}`, `{{payment.reference}}`, `{{user.first_name}}`*

**Oggetto:** Rimborso di {{payment.amount}} in arrivo

**Testo:**

```
Ciao {{user.first_name}}, abbiamo emesso un rimborso di {{payment.amount}} sull'abbonamento di {{company.name}}.

💶 Importo: {{payment.amount}}
💳 Su: {{payment.method}} ••{{card.last4}}
🧾 Riferimento: {{payment.reference}}

Arriva entro 5-10 giorni lavorativi, secondo i tempi della tua banca.
```


---

## Lifecycle & retention

### Lifecycle · Riepilogo mensile  ·  `lifecycle_monthly_summary`  ·  ✅ ATTIVA

*Inviata da: lifecycle-email-tick (mensile)*
*Quando/a chi: Inizio mese, riepilogo del mese precedente · Admin azienda attiva*
*Variabili: `{{link_url_1}}`, `{{period.month}}`, `{{stats.hours_saved}}`, `{{stats.orders}}`, `{{stats.revenue}}`, `{{user.first_name}}`*

**Oggetto:** Il tuo mese su Edilizia in Cloud · {{period.month}}

**Testo:**

```
Com'è andato {{period.month}}
Ciao {{user.first_name}}, due numeri sul tuo mese — quelli che contano:

📦 Commesse gestite: {{stats.orders}}
💶 Fatturato: {{stats.revenue}}
⏱ Ore risparmiate vs carta/Excel: ~{{stats.hours_saved}}

[Apri la dashboard]({{link_url_1}})
```

### Lifecycle · D+3 non attivato  ·  `lifecycle_d3_no_activation`  ·  ✅ ATTIVA

*Inviata da: lifecycle-email-tick (D+3)*
*Quando/a chi: 3 giorni dopo la registrazione, setup fermo · Admin azienda*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Ti aiuto a partire, {{user.first_name}}?

**Testo:**

```
Hai aperto l'account di {{company.name}} qualche giorno fa, ma il setup è fermo. Capita: il cantiere chiama. Però bastano 5 minuti per essere operativo. Tre passi:

- Aggiungi il primo cliente
- Crea la prima commessa
- Invita il tuo team

[Riprendi da qui]({{link_url_1}})

Rispondi a questa email e ti seguo io, passo passo.
```

### Lifecycle · D+7 funzioni  ·  `lifecycle_d7_features`  ·  ✅ ATTIVA

*Inviata da: lifecycle-email-tick (D+7)*
*Quando/a chi: 7 giorni dopo la registrazione · Admin azienda*
*Variabili: `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** 3 funzioni di EiC che ti fanno guadagnare ore

**Testo:**

```
3 superpoteri che forse non conosci
È passata una settimana, {{user.first_name}}. Ti mostro tre cose che gli imprenditori più rapidi su EiC usano ogni giorno:

- Render AI — Foto del cantiere → render fotorealistico in 90 secondi.
- AI Preventivo — Descrivi il lavoro a voce o testo → preventivo pronto in 2 minuti.
- Automazioni — Le imposti una volta, lavorano per te per sempre.

[Provale ora]({{link_url_1}})
```

### Win-back inattività  ·  `winback`  ·  💤 DORMIENTE

*Quando/a chi: L'utente non accede da molti giorni · Admin azienda inattiva*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`, `{{user.inactive_days}}`*

**Oggetto:** {{user.first_name}}, è un po' che non ci vediamo

**Testo:**

```
Ciao {{user.first_name}}, non accedi a {{company.name}} da {{user.inactive_days}} giorni. Niente prediche: il cantiere mangia il tempo, lo sappiamo bene.

Però i tuoi dati sono tutti lì, pronti. E nel frattempo abbiamo aggiunto qualcosa che ti fa risparmiare ancora più tempo.

[Riprendi da dove eri]({{link_url_1}})

Ti serve una mano per ripartire? Rispondi a questa email.
```

### Annuncio nuova funzionalità  ·  `feature_announcement`  ·  💤 DORMIENTE

*Quando/a chi: Rilascio di una funzione rilevante · Tutti gli utenti attivi*
*Variabili: `{{feature.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Novità su EiC: {{feature.name}}

**Testo:**

```
È arrivata: {{feature.name}}
Ciao {{user.first_name}}, abbiamo aggiunto una cosa che ci chiedevate in tanti: {{feature.name}}.

In due parole, ti serve a fare prima quello che oggi ti porta via tempo. È già attiva nel tuo account: non devi installare niente.

[Provala adesso]({{link_url_1}})
```

### Richiesta feedback / NPS  ·  `nps_feedback`  ·  💤 DORMIENTE

*Quando/a chi: Dopo un periodo d'uso, per misurare la soddisfazione · Admin azienda attiva*
*Variabili: `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Due secondi: come ci stiamo comportando?

**Testo:**

```
Ciao {{user.first_name}}, ti rubo due secondi. Su una scala da 0 a 10, quanto consiglieresti Edilizia in Cloud a un altro imprenditore come te?

[Rispondi (un click)]({{link_url_1}})

Se c'è qualcosa che non va, scrivimelo senza filtri: è così che miglioriamo.
```


---

## Programma partner

### Partner · Benvenuto  ·  `partner_welcome`  ·  ✅ ATTIVA

*Inviata da: send-partner-notification*
*Quando/a chi: Un nuovo partner viene attivato · Partner*
*Variabili: `{{link_url_1}}`, `{{partner.commission}}`, `{{partner.tier}}`, `{{referral.code}}`, `{{user.full_name}}`*

**Oggetto:** Sei dentro: benvenuto tra i partner di Edilizia in Cloud

**Testo:**

```
Benvenuto tra i partner 🎉
Ciao {{user.full_name}}, da oggi sei partner {{partner.tier}}. Te lo spiego in due righe.

Ogni azienda che si registra col tuo link ti riconosce il {{partner.commission}} del suo abbonamento — ogni mese, finché resta cliente. Non una tantum: ricorrente.

Il tuo codice: {{referral.code}}

[Vai alla dashboard partner]({{link_url_1}})

Lì trovi il link da condividere e segui le conversioni in tempo reale.
```

### Partner · Nuova conversione  ·  `partner_conversion`  ·  ✅ ATTIVA

*Inviata da: send-partner-notification*
*Quando/a chi: Un'azienda si registra col link del partner · Partner*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.full_name}}`*

**Oggetto:** Nuova conversione: {{company.name}} si è registrata 🚀

**Testo:**

```
Ottimo lavoro, {{user.full_name}}. {{company.name}} si è appena registrata usando il tuo link.

Da qui in poi, finché resta cliente, entra nelle tue commissioni ricorrenti. Il primo accredito parte dal prossimo ciclo di calcolo.

[Vedi le tue conversioni]({{link_url_1}})
```

### Partner · Commissioni pronte  ·  `partner_commission`  ·  ✅ ATTIVA

*Inviata da: send-partner-notification*
*Quando/a chi: Chiusura mensile delle commissioni · Partner*
*Variabili: `{{commission.amount}}`, `{{link_url_1}}`, `{{partner.active_companies}}`, `{{period.month}}`, `{{user.full_name}}`*

**Oggetto:** Le tue commissioni di {{period.month}} sono pronte 💰

**Testo:**

```
Ciao {{user.full_name}}, abbiamo chiuso il mese. Ecco quanto hai maturato:

💰 Commissioni {{period.month}}: {{commission.amount}}
🏢 Aziende attive: {{partner.active_companies}}

[Richiedi il pagamento]({{link_url_1}})
```

### Partner · Payout approvato  ·  `partner_payout`  ·  ✅ ATTIVA

*Inviata da: send-partner-notification*
*Quando/a chi: Il pagamento al partner viene approvato · Partner*
*Variabili: `{{payment.reference}}`, `{{payout.amount}}`, `{{user.full_name}}`*

**Oggetto:** Pagamento di {{payout.amount}} approvato ✅

**Testo:**

```
Ci siamo, {{user.full_name}}. Il tuo pagamento di {{payout.amount}} è stato approvato e parte il bonifico.

✅ Importo: {{payout.amount}}
🧾 Riferimento: {{payment.reference}}

Arriva entro 3-5 giorni lavorativi. Lo trovi anche nello storico della dashboard.
```

### Partner · Upgrade tier  ·  `partner_tier`  ·  ✅ ATTIVA

*Inviata da: send-partner-notification*
*Quando/a chi: Il partner raggiunge un nuovo livello · Partner*
*Variabili: `{{link_url_1}}`, `{{partner.multiplier}}`, `{{partner.new_tier}}`, `{{user.full_name}}`*

**Oggetto:** Sei salito a {{partner.new_tier}} 🎊

**Testo:**

```
Complimenti {{user.full_name}}: hai raggiunto il tier {{partner.new_tier}}. Hai portato abbastanza aziende da sbloccare un guadagno più alto.

Da adesso ogni commissione vale {{partner.multiplier}} in più. Vale anche sulle aziende che hai già portato.

[Vedi il nuovo tier]({{link_url_1}})
```


---

## Notifiche di prodotto

### Documento condiviso  ·  `document_shared`  ·  💤 DORMIENTE

*Quando/a chi: Un utente condivide un documento · Destinatario della condivisione*
*Variabili: `{{company.name}}`, `{{document.name}}`, `{{link_url_1}}`, `{{sender.name}}`, `{{user.first_name}}`*

**Oggetto:** {{sender.name}} ha condiviso un documento con te

**Testo:**

```
Ciao {{user.first_name}}, {{sender.name}} ha condiviso un documento con te su {{company.name}}:

📄 Documento: {{document.name}}

[Apri il documento]({{link_url_1}})

Lo trovi anche nella sezione documenti del cantiere.
```

### Attività assegnata  ·  `task_assigned`  ·  💤 DORMIENTE

*Quando/a chi: Viene assegnato un task a un utente · Utente assegnatario*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{sender.name}}`, `{{task.due_date}}`, `{{task.name}}`, `{{user.first_name}}`*

**Oggetto:** Hai una nuova attività: {{task.name}}

**Testo:**

```
Ciao {{user.first_name}}, {{sender.name}} ti ha assegnato un'attività su {{company.name}}:

✅ Attività: {{task.name}}
📅 Scadenza: {{task.due_date}}

[Apri l'attività]({{link_url_1}})
```

### Report pronto  ·  `report_ready`  ·  💤 DORMIENTE

*Quando/a chi: Un report richiesto è stato generato · Utente che lo ha richiesto*
*Variabili: `{{company.name}}`, `{{document.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Il tuo report è pronto

**Testo:**

```
Ciao {{user.first_name}}, il report che hai richiesto su {{company.name}} è pronto:

📊 Report: {{document.name}}

[Scarica il report]({{link_url_1}})

Resta disponibile nella tua dashboard.
```

### Richiesta di approvazione (Silvio · HITL)  ·  `silvio_approval`  ·  💤 DORMIENTE

*Quando/a chi: Silvio prepara un'azione che richiede conferma umana · Admin / responsabile*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{task.name}}`, `{{user.first_name}}`*

**Oggetto:** Silvio ha bisogno del tuo ok

**Testo:**

```
Una cosa da approvare
Ciao {{user.first_name}}, Silvio ha preparato un'azione per {{company.name}} ed è in attesa del tuo via libera prima di eseguirla:

⚙️ Azione: {{task.name}}

Dai un'occhiata: se va bene, approvi con un click. Se no, la blocchi. Niente parte senza il tuo ok.

[Rivedi e approva]({{link_url_1}})

Hai tempo per decidere: finché non approvi, Silvio resta fermo.
```


---

## Edilizia / fiscale

### Fattura accettata dallo SDI  ·  `sdi_accepted`  ·  💤 DORMIENTE

*Quando/a chi: Lo SDI accetta una fattura elettronica · Admin / amministrazione azienda*
*Variabili: `{{company.name}}`, `{{invoice.number}}`, `{{payment.amount}}`, `{{user.first_name}}`*

**Oggetto:** Fattura {{invoice.number}} consegnata ✅

**Testo:**

```
Ciao {{user.first_name}}, la fattura {{invoice.number}} di {{company.name}} è stata accettata dal Sistema di Interscambio ed è ufficialmente trasmessa al cliente.

🧾 Fattura: {{invoice.number}}
💶 Importo: {{payment.amount}}
✅ Stato: Consegnata

La ricevuta di consegna è archiviata nel CassettoSDI.
```

### Fattura SCARTATA dallo SDI  ·  `sdi_rejected`  ·  💤 DORMIENTE

*Quando/a chi: Lo SDI rifiuta una fattura elettronica · Admin / amministrazione azienda*
*Variabili: `{{company.name}}`, `{{invoice.number}}`, `{{link_url_1}}`, `{{sdi.reject_reason}}`, `{{user.first_name}}`*

**Oggetto:** ⚠️ Fattura {{invoice.number}} scartata dallo SDI

**Testo:**

```
La fattura è stata scartata
Ciao {{user.first_name}}, lo SDI ha scartato la fattura {{invoice.number}} di {{company.name}}. Tradotto: per il Fisco al momento non è stata emessa. Va corretta e rinviata, possibilmente in giornata.

🧾 Fattura: {{invoice.number}}
❌ Motivo: {{sdi.reject_reason}}

Apri la fattura, sistema il punto segnalato e rimandala: te lo facciamo fare in due click.

[Correggi e rinvia]({{link_url_1}})

Hai 5 giorni dalla notifica di scarto per rinviarla mantenendo la data originale.
```

### Promemoria incasso / sollecito  ·  `payment_reminder`  ·  💤 DORMIENTE

*Quando/a chi: Una fattura del cliente è in scadenza o scaduta · Cliente dell'azienda (debitore)*
*Variabili: `{{company.name}}`, `{{customer.name}}`, `{{document.expiry_date}}`, `{{invoice.number}}`, `{{payment.amount}}`*

**Oggetto:** Promemoria: fattura {{invoice.number}} in scadenza

**Testo:**

```
Gentile {{customer.name}}, le ricordiamo che la fattura {{invoice.number}} emessa da {{company.name}} è in scadenza:

🧾 Fattura: {{invoice.number}}
💶 Importo: {{payment.amount}}
📅 Scadenza: {{document.expiry_date}}

Se ha già provveduto, ignori questo promemoria. In caso contrario, può saldare con i riferimenti che trova in fattura.

Messaggio inviato automaticamente da {{company.name}} tramite Edilizia in Cloud.
```

### Documento in scadenza (DURC, polizze, certificazioni)  ·  `document_expiring`  ·  💤 DORMIENTE

*Quando/a chi: Un documento aziendale sta per scadere · Admin azienda*
*Variabili: `{{company.name}}`, `{{document.days_left}}`, `{{document.expiry_date}}`, `{{document.type}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** {{document.type}} in scadenza tra {{document.days_left}} giorni

**Testo:**

```
Un documento sta per scadere
Ciao {{user.first_name}}, un documento di {{company.name}} sta per scadere. Senza, rischi di doverti fermare in cantiere o di restare fuori da una gara:

📋 Documento: {{document.type}}
📅 Scade il: {{document.expiry_date}}
⏳ Mancano: {{document.days_left}} giorni

[Vedi il documento]({{link_url_1}})

Te lo ricordiamo in anticipo, così hai il tempo di rinnovarlo con calma.
```

### Sopralluogo programmato  ·  `site_inspection`  ·  💤 DORMIENTE

*Quando/a chi: Viene fissato un sopralluogo · Responsabile / tecnico assegnato*
*Variabili: `{{company.name}}`, `{{inspection.date}}`, `{{inspection.time}}`, `{{link_url_1}}`, `{{site.address}}`, `{{user.first_name}}`*

**Oggetto:** Sopralluogo fissato: {{inspection.date}}

**Testo:**

```
Ciao {{user.first_name}}, è stato fissato un sopralluogo per {{company.name}}:

📅 Data: {{inspection.date}}
🕐 Ora: {{inspection.time}}
📍 Dove: {{site.address}}

[Apri il sopralluogo]({{link_url_1}})

Da qui vedi la scheda e, sul posto, compili il rilievo direttamente dal telefono.
```


---

## Sistema & compliance

### Manutenzione programmata  ·  `maintenance_scheduled`  ·  💤 DORMIENTE

*Quando/a chi: Prima di un intervento pianificato · Tutti gli utenti*
*Variabili: `{{maintenance.date}}`, `{{maintenance.window}}`, `{{user.first_name}}`*

**Oggetto:** Breve manutenzione programmata il {{maintenance.date}}

**Testo:**

```
Ciao {{user.first_name}}, il {{maintenance.date}}, nella finestra {{maintenance.window}}, facciamo un intervento di manutenzione su Edilizia in Cloud. In quel lasso di tempo la piattaforma potrebbe essere lenta o non raggiungibile per qualche minuto.

Ti avvisiamo prima così organizzi il lavoro senza sorprese. Nessun dato va perso.

Programmiamo gli interventi in orari serali/notturni quando possibile, per darti meno fastidio.
```

### Aggiornamento Termini / Privacy  ·  `terms_update`  ·  💤 DORMIENTE

*Quando/a chi: Modifica ai documenti legali · Tutti gli utenti*
*Variabili: `{{event.date}}`, `{{link_url_1}}`, `{{terms.summary}}`, `{{user.first_name}}`*

**Oggetto:** Aggiorniamo Termini e Privacy — cosa cambia

**Testo:**

```
Ciao {{user.first_name}}, abbiamo aggiornato i Termini di Servizio e la Privacy Policy di Edilizia in Cloud. Entrano in vigore il {{event.date}}.

Te lo diciamo in italiano, non in legalese: {{terms.summary}}. Continuando a usare la piattaforma dopo quella data, accetti le nuove condizioni.

[Leggi cosa cambia]({{link_url_1}})

Vuoi i documenti completi? Sono linkati nella pagina.
```

### Export dati pronto (GDPR)  ·  `gdpr_export`  ·  💤 DORMIENTE

*Quando/a chi: Un export dati richiesto è pronto · Admin azienda*
*Variabili: `{{company.name}}`, `{{export.days_left}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Il tuo export dati è pronto

**Testo:**

```
Ciao {{user.first_name}}, abbiamo preparato l'export dei dati di {{company.name}} che avevi richiesto. È tutto in un unico archivio, pronto da scaricare.

[Scarica i tuoi dati]({{link_url_1}})

Per sicurezza il link scade tra {{export.days_left}} giorni. Dopo, dovrai richiedere un nuovo export.
```
