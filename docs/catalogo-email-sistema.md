# Catalogo email di sistema — Edilizia in Cloud

58 template · **copy v2 revisionato** applicato il 2026-07-16 · ✅ = inviata da un flusso reale · 💤 = dormiente

Le variabili `{{così}}` vengono sostituite all'invio. Builder: **Admin → Impostazioni → Email → Template**.


---

## Onboarding & account azienda

### Benvenuto azienda  ·  `welcome`  ·  ✅ ATTIVA

*Inviata da: create-company*
*Quando/a chi: Un super_admin crea una nuova azienda · Nuovo admin azienda*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`, `{{user.role_label}}`*

**Oggetto:** {{company.name}} è pronta. Si parte.
**Testo:**
```
Benvenuto, {{user.first_name}}.

Da oggi {{company.name}} ha tutto in un posto solo: cantieri, preventivi, fatture, DDT, clienti e team. Anche dal telefono, direttamente dal cantiere.

Il tuo account è attivo con ruolo {{user.role_label}}. Scegli la tua password e sei dentro:

[Imposta la password e accedi]({{link_url_1}})

Primo passo che ti consiglio: crea il primo cantiere e carica un cliente. Cinque minuti. Da lì il resto viene da sé.

Il link vale 24 ore — se è scaduto, vai alla pagina di accesso e usa "Password dimenticata".
PS. Ti blocchi da qualche parte? Rispondi a questa email: dall'altra parte c'è una persona vera, non un robot.
```

### Documenti accettati  ·  `terms_accepted`  ·  ✅ ATTIVA

*Inviata da: create-company*
*Quando/a chi: Subito dopo il benvenuto, stesso admin · Admin azienda*
*Variabili: `{{company.name}}`, `{{event.date}}`, `{{event.time}}`, `{{link_url_1}}`, `{{link_url_2}}`, `{{link_url_3}}`, `{{link_url_4}}`, `{{user.first_name}}`*

**Oggetto:** La tua copia dei documenti, {{user.first_name}}
**Testo:**
```
Qui c'è tutto quello che hai firmato.

Quando hai registrato {{company.name}} hai accettato le condizioni del servizio. Questa è la tua copia: tienila da parte, è il riferimento di cosa hai sottoscritto.

Accettazione registrata il {{event.date}} alle {{event.time}}.

- Termini e Condizioni del Servizio — [apri]({{link_url_1}})
- Privacy Policy — [apri]({{link_url_2}})
- Accordo trattamento dati (DPA) — [apri]({{link_url_3}})
- Cookie Policy — [apri]({{link_url_4}})
Conserva questa email: è la tua copia di riferimento. Per qualsiasi dubbio rispondi pure qui.
```

### Accesso staff  ·  `staff_access`  ·  💤 DORMIENTE

*Quando/a chi: L'admin crea un membro dello staff · Nuovo utente staff*
*Variabili: `{{company.name}}`, `{{inviter.name}}`, `{{link_url_1}}`, `{{user.email}}`*

**Oggetto:** Il tuo accesso a {{company.name}} è pronto
**Testo:**
```
Benvenuto in {{company.name}}.

{{inviter.name}} ti ha creato un account su Edilizia in Cloud: è il gestionale che {{company.name}} usa per cantieri, clienti e documenti. Da oggi ci lavori anche tu.

Imposta la tua password — è personale, la vedi solo tu — e sei dentro in un minuto.

Accedi con: {{user.email}}

[Imposta la password]({{link_url_1}})

Il link vale 24 ore. Se scade, usa "Password dimenticata" dalla pagina di accesso.
```

### Account dipendente  ·  `employee_account`  ·  💤 DORMIENTE

*Quando/a chi: L'admin crea l'account di un dipendente · Dipendente*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.email}}`, `{{user.first_name}}`*

**Oggetto:** {{user.first_name}}, da oggi le ore le timbri dal telefono
**Testo:**
```
Ciao {{user.first_name}},

{{company.name}} ti ha aperto un account su Edilizia in Cloud. Cosa cambia per te: timbri le ore, vedi i tuoi cantieri e carichi le foto dei lavori. Tutto dal telefono, niente fogli.

Imposta la password e sei operativo:

Accedi con: {{user.email}}

[Imposta la password]({{link_url_1}})

Il link vale 24 ore. Ci metti meno che a compilare un rapportino.
```

### Account venditore  ·  `salesperson_account`  ·  💤 DORMIENTE

*Quando/a chi: L'admin crea l'account di un venditore · Venditore*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.email}}`, `{{user.first_name}}`*

**Oggetto:** {{user.first_name}}, il tuo portafoglio commesse è qui dentro
**Testo:**
```
Ciao {{user.first_name}},

{{company.name}} ti ha aperto un account commerciale su Edilizia in Cloud. Da qui gestisci preventivi, clienti e il tuo portafoglio commesse — e vedi a che punto è ogni trattativa senza chiedere in giro.

Imposta la password e parti:

Accedi con: {{user.email}}

[Imposta la password]({{link_url_1}})

Il link vale 24 ore.
```


---

## Password & sicurezza

### Reset password (self-service)  ·  `password_reset`  ·  ✅ ATTIVA

*Inviata da: reset-customer-password (⚠️ usa HTML proprio, copy bypassato)*
*Quando/a chi: L'utente clicca “password dimenticata” · Utente*
*Variabili: `{{link_url_1}}`*

**Oggetto:** Reimposta la password
**Testo:**
```
Capita a tutti.

Hai chiesto di reimpostare la password del tuo account. Creane una nuova da qui, ci vogliono trenta secondi:

[Crea una nuova password]({{link_url_1}})

Il link scade tra 24 ore.

Non hai richiesto tu il reset? Ignora questa email: la password resta quella di prima e nessuno può cambiarla senza questo link.
```

### Reset password (da admin)  ·  `password_reset_admin`  ·  💤 DORMIENTE

*Quando/a chi: Un admin reimposta la password di un utente · Utente target*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{platform.support_email}}`, `{{user.first_name}}`*

**Oggetto:** Devi impostare una nuova password
**Testo:**
```
Ciao {{user.first_name}},

un amministratore di {{company.name}} ha reimpostato il tuo accesso. Per sicurezza la nuova password la scegli tu — nessuno la conosce, nemmeno l'amministratore:

[Imposta la nuova password]({{link_url_1}})

Non te l'aspettavi? Scrivici a {{platform.support_email}} prima di cliccare qualsiasi cosa.
```

### Password cambiata  ·  `password_changed`  ·  💤 DORMIENTE

*Quando/a chi: Notifica di sicurezza dopo un cambio password · Utente*
*Variabili: `{{company.name}}`, `{{event.date}}`, `{{event.time}}`, `{{platform.support_email}}`*

**Oggetto:** La tua password è stata cambiata
**Testo:**
```
La password del tuo account {{company.name}} è stata cambiata il {{event.date}} alle {{event.time}}.

Sei stato tu? Tutto a posto, non devi fare nulla.

Non sei stato tu? Allora qualcuno ha accesso al tuo account, e ogni minuto conta. Scrivici SUBITO a {{platform.support_email}}: blocchiamo l'accesso e lo mettiamo in sicurezza.
```

### Codice OTP login (2FA)  ·  `otp_login`  ·  ✅ ATTIVA

*Inviata da: email-otp-send*
*Quando/a chi: Secondo fattore dopo l'inserimento password · Utente con 2FA attiva*
*Variabili: `{{otp.code}}`*

**Oggetto:** Codice di accesso: {{otp.code}}
**Testo:**
```
Il tuo codice di sicurezza:

{{otp.code}}

Scade tra 15 minuti.

Non stai accedendo tu? Allora qualcuno conosce la tua password. Non inserire il codice da nessuna parte e cambia subito la password.
```

### Email modificata · avviso vecchio indirizzo  ·  `email_change_old`  ·  💤 DORMIENTE

*Quando/a chi: Richiesta di cambio email — inviata al VECCHIO indirizzo · Indirizzo email precedente*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`, `{{user.new_email}}`*

**Oggetto:** Hai chiesto tu di cambiare l'email di accesso?
**Testo:**
```
Ciao {{user.first_name}},

qualcuno ha chiesto di spostare l'email di accesso del tuo account {{company.name}} verso {{user.new_email}}.

Sei stato tu? Non devi fare nulla: appena confermi dal nuovo indirizzo, l'accesso si sposta lì.

Non sei stato tu? Qualcuno sta cercando di prenderti l'account. Bloccalo adesso:

[Non sono stato io — blocca il cambio]({{link_url_1}})

Per sicurezza mandiamo questo avviso anche al nuovo indirizzo.
```

### Email modificata · conferma nuovo indirizzo  ·  `email_change_new`  ·  💤 DORMIENTE

*Quando/a chi: Richiesta di cambio email — inviata al NUOVO indirizzo · Nuovo indirizzo email*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Un click e il cambio email è fatto
**Testo:**
```
Ciao {{user.first_name}},

per completare il cambio email del tuo account {{company.name}} manca solo una conferma: dimostra che questo indirizzo è tuo.

[Conferma il nuovo indirizzo]({{link_url_1}})

Finché non confermi, l'accesso resta sull'email precedente. Il link vale 24 ore.
```

### Verifica in due passaggi attivata  ·  `twofa_enabled`  ·  💤 DORMIENTE

*Quando/a chi: L'utente attiva la 2FA · Utente*
*Variabili: `{{company.name}}`, `{{platform.support_email}}`, `{{user.first_name}}`*

**Oggetto:** Fatto: il tuo account ora è blindato
**Testo:**
```
Ciao {{user.first_name}},

hai attivato la verifica in due passaggi sul tuo account {{company.name}}. Buona mossa.

Da ora, a ogni accesso, oltre alla password serve un codice temporaneo. Anche se qualcuno ti rubasse la password, senza il codice resta fuori. Dentro ci sono i tuoi cantieri e le tue fatture: meglio così.

Non sei stato tu ad attivarla? Scrivici a {{platform.support_email}}.
```

### Verifica in due passaggi disattivata  ·  `twofa_disabled`  ·  💤 DORMIENTE

*Quando/a chi: L'utente disattiva la 2FA · Utente*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Hai tolto la protezione in due passaggi
**Testo:**
```
Ciao {{user.first_name}},

la verifica in due passaggi sul tuo account {{company.name}} è stata disattivata. Da ora per entrare basta la password — tua o di chiunque la scopra.

Sei stato tu e sai quello che fai? Ok, tutto qui.

Non sei stato tu? Riattivala e cambia subito la password:

[Riattiva la protezione]({{link_url_1}})
```

### Nuovo accesso da dispositivo sconosciuto  ·  `new_device_login`  ·  💤 DORMIENTE

*Quando/a chi: Login da dispositivo/posizione mai visti · Utente*
*Variabili: `{{company.name}}`, `{{device.location}}`, `{{device.name}}`, `{{event.date}}`, `{{event.time}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Nuovo accesso al tuo account — sei stato tu?
**Testo:**
```
Ciao {{user.first_name}},

qualcuno è entrato nel tuo account {{company.name}}:

🖥 Dispositivo: {{device.name}}
📍 Posizione: {{device.location}}
🕐 Quando: {{event.date}} alle {{event.time}}

Sei stato tu — nuovo telefono, altro computer? Ignora pure questa email.

Non ti riconosci? Blocca subito e cambia la password:

[Non sono stato io]({{link_url_1}})
```

### Account bloccato (troppi tentativi)  ·  `account_locked`  ·  💤 DORMIENTE

*Quando/a chi: Troppi tentativi di accesso falliti · Utente*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Account bloccato per qualche minuto — ecco perché
**Testo:**
```
Ciao {{user.first_name}},

abbiamo bloccato temporaneamente l'accesso al tuo account {{company.name}}: troppi tentativi falliti di fila. È una protezione automatica contro chi prova a indovinare la password — scatta anche se eri tu che non la ricordavi.

Due strade:

- Ricordi la password? Riprova tra qualche minuto.
- Non la ricordi? Reimpostala adesso, fai prima:

[Reimposta la password]({{link_url_1}})

Non hai provato a entrare tu? Reimposta comunque la password: qualcuno ci sta provando al posto tuo.
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
{{inviter.name}} ti ha invitato a entrare in Edilizia in Cloud come {{user.role_label}}.

Accetta e crea il tuo account: due minuti, non serve altro.

[Accetta l'invito]({{link_url_1}})

L'invito vale 7 giorni. Non riconosci la richiesta? Ignora questa email e non succede niente.
```

### Invito commercialista  ·  `accountant_invite`  ·  💤 DORMIENTE

*Quando/a chi: L'azienda invita il proprio commercialista · Commercialista*
*Variabili: `{{access.level}}`, `{{accountant.name}}`, `{{company.name}}`, `{{inviter.name}}`, `{{link_url_1}}`*

**Oggetto:** {{company.name}} ti ha dato accesso ai suoi documenti
**Testo:**
```
Ciao {{accountant.name}},

{{inviter.name}} di {{company.name}} ti ha dato accesso come commercialista, con livello {{access.level}}.

Cosa significa in pratica: fatture e documenti dell'azienda li vedi qui, aggiornati, quando ti servono. Fine delle email "mi mandi le fatture di marzo?" — e dei solleciti per averle.

Non hai ancora un account studio? Lo apri in 60 secondi e {{company.name}} compare subito tra i tuoi clienti.

[Accetta e accedi]({{link_url_1}})

Una cosa chiara: {{company.name}} non avrà mai accesso ai dati del tuo studio. L'accesso va in una direzione sola.
```

### Reminder invito  ·  `invite_reminder`  ·  ✅ ATTIVA

*Inviata da: system-emails-tick (+48h)*
*Quando/a chi: L'utente invitato non ha ancora completato l'accesso · Utente invitato*
*Variabili: `{{company.name}}`, `{{inviter.name}}`, `{{link_url_1}}`*

**Oggetto:** {{inviter.name}} ti sta aspettando
**Testo:**
```
{{inviter.name}} ti ha invitato su {{company.name}} un paio di giorni fa, ma non sei ancora entrato.

Manca un passo solo: imposti la password e sei dentro, coi cantieri e i documenti che ti riguardano.

[Completa l'accesso]({{link_url_1}})

Un minuto adesso, e non ci pensi più.

Link scaduto? Chiedi a {{inviter.name}} di rimandartelo: ci mette dieci secondi.
```

### Conferma email  ·  `account_verify`  ·  💤 DORMIENTE

*Quando/a chi: Registrazione che richiede verifica dell'indirizzo · Utente in attesa di verifica*
*Variabili: `{{company.name}}`, `{{link_url_1}}`*

**Oggetto:** Un click e il tuo account è attivo
**Testo:**
```
Ci siamo quasi.

Conferma che questo indirizzo è tuo e attiviamo subito il tuo account su {{company.name}}:

[Conferma l'email]({{link_url_1}})

Il link vale 24 ore. Non hai creato tu questo account? Ignora questa email e non si attiva niente.
```

### Invito accettato (notifica admin)  ·  `invite_accepted_admin`  ·  💤 DORMIENTE

*Quando/a chi: Un invitato accetta e attiva l'account · Admin che ha invitato*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`, `{{user.full_name}}`, `{{user.role_label}}`*

**Oggetto:** {{user.full_name}} è dentro ✅
**Testo:**
```
Ciao {{user.first_name}},

{{user.full_name}} ha accettato l'invito ed è operativo su {{company.name}} con ruolo {{user.role_label}}.

Vuoi controllare o cambiare cosa può vedere e modificare? Lo fai da Persone & Accessi:

[Gestisci il team]({{link_url_1}})
```

### Ruolo modificato  ·  `role_changed`  ·  💤 DORMIENTE

*Quando/a chi: Un admin cambia ruolo/permessi a un utente · Utente interessato*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`, `{{user.role_label}}`*

**Oggetto:** Il tuo ruolo su {{company.name}} è cambiato: ora sei {{user.role_label}}
**Testo:**
```
Ciao {{user.first_name}},

il tuo ruolo su {{company.name}} è stato aggiornato a {{user.role_label}}. Col ruolo cambia cosa puoi vedere e modificare nel gestionale.

[Entra e guarda cosa è cambiato]({{link_url_1}})

Qualcosa non torna? Parlane con chi gestisce gli accessi in azienda: la modifica arriva da lì, non da noi.
```

### Utente rimosso dal workspace  ·  `user_removed`  ·  💤 DORMIENTE

*Quando/a chi: Un admin revoca l'accesso a un utente · Utente rimosso*
*Variabili: `{{company.name}}`, `{{user.first_name}}`*

**Oggetto:** Il tuo accesso a {{company.name}} è stato revocato
**Testo:**
```
Ciao {{user.first_name}},

il tuo accesso a {{company.name}} su Edilizia in Cloud è stato rimosso. Da questo momento non puoi più entrare nei cantieri e nei documenti dell'azienda.

Pensi sia un errore? Contatta chi gestisce gli accessi in {{company.name}}: possono riattivarti in un minuto.
```

### Invito scaduto  ·  `invite_expired`  ·  💤 DORMIENTE

*Quando/a chi: Un invito non accettato supera la scadenza · Utente invitato*
*Variabili: `{{company.name}}`, `{{inviter.name}}`, `{{user.first_name}}`*

**Oggetto:** L'invito a {{company.name}} è scaduto (rimedio facile)
**Testo:**
```
Ciao {{user.first_name}},

l'invito a entrare in {{company.name}} è scaduto prima che lo accettassi. Capita: il lavoro chiama.

Il rimedio è semplice: chiedi a {{inviter.name}} di rimandartelo. Dieci secondi per lui, e questa volta entra subito anche tu.

Gli inviti scadono per sicurezza: nessun link deve restare valido all'infinito.
```


---

## Abbonamento & fatturazione

### Setup incompleto  ·  `setup_incomplete`  ·  ✅ ATTIVA

*Inviata da: system-emails-tick (+48h)*
*Quando/a chi: Account creato ma setup a metà · Admin azienda*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Ti mancano 5 minuti, {{user.first_name}}
**Testo:**
```
Hai aperto l'account di {{company.name}}, poi qualcosa ti ha chiamato via. Normale: il cantiere non aspetta.

Ti mancano due cose, cinque minuti in tutto:

- I dati di fatturazione — così la prima fattura esce senza intoppi
- Il primo cantiere — così vedi subito il gestionale che lavora coi TUOI dati, non con quelli finti di una demo

[Completa il setup]({{link_url_1}})

Ti blocchi su un passaggio? Rispondi a questa email: ti guidiamo noi, passo passo.
```

### Trial in scadenza  ·  `lifecycle_trial_ending`  ·  ✅ ATTIVA

*Inviata da: lifecycle-email-tick (D-3)*
*Quando/a chi: Il periodo di prova sta per finire · Admin azienda in trial*
*Variabili: `{{link_url_1}}`, `{{stats.customers}}`, `{{stats.orders}}`, `{{trial.days_left}}`, `{{user.first_name}}`*

**Oggetto:** {{trial.days_left}} giorni, poi l'accesso si ferma
**Testo:**
```
{{user.first_name}}, mancano {{trial.days_left}} giorni.

Poi il trial finisce e l'accesso si blocca. E dentro c'è già del lavoro tuo, vero:

📦 {{stats.orders}} commesse create
👥 {{stats.customers}} clienti caricati

Quei dati non spariscono. Ma restano chiusi lì — e tu torni a fare a mano quello che qui era già fatto.

Attiva un piano e non cambia niente: stessi dati, stesso punto, zero da rifare.

[Attiva un piano]({{link_url_1}})

PS. Un dubbio sul prezzo o sul piano giusto per la tua impresa? Rispondi a questa email: ti rispondo io, senza copione da venditore.
```

### Pagamento fallito (dunning)  ·  `lifecycle_payment_failed`  ·  💤 DORMIENTE

*Quando/a chi: Addebito ricorrente non riuscito · Admin azienda*
*Variabili: `{{company.name}}`, `{{dunning.attempt}}`, `{{link_url_1}}`, `{{subscription.amount}}`, `{{user.first_name}}`*

**Oggetto:** Pagamento non passato — 1 minuto per sistemarlo
**Testo:**
```
Ciao {{user.first_name}},

l'addebito di {{subscription.amount}} per l'abbonamento di {{company.name}} non è passato (tentativo {{dunning.attempt}}).

Quasi sempre è una carta scaduta o un plafond momentaneo. Niente di grave — se lo sistemi adesso:

[Aggiorna il pagamento]({{link_url_1}})

Riproviamo in automatico nei prossimi giorni. Ma se i tentativi si esauriscono, l'account si sospende: e restare chiusi fuori dai propri cantieri per una carta scaduta è un peccato.

Problemi col pagamento? Rispondi a questa email: troviamo una soluzione insieme.
```

### Abbonamento attivato  ·  `purchase_confirmed`  ·  ✅ ATTIVA

*Inviata da: system-emails-tick*
*Quando/a chi: Primo pagamento andato a buon fine · Admin azienda*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{plan.name}}`, `{{subscription.amount}}`, `{{subscription.periodicity}}`, `{{user.first_name}}`*

**Oggetto:** Fatto: {{company.name}} è operativa senza limiti
**Testo:**
```
Grazie {{user.first_name}}.

L'abbonamento di {{company.name}} è attivo: da adesso hai tutto il gestionale, senza i limiti del periodo di prova.

📦 Piano: {{plan.name}}
💶 Importo: {{subscription.amount}}
🔁 Fatturazione: {{subscription.periodicity}}

[Vai alla dashboard]({{link_url_1}})

La ricevuta arriva con una mail separata: girala pure al commercialista.

Un consiglio da subito: invita il tuo team. Il gestionale rende il doppio quando le ore e le foto le caricano loro, direttamente dal cantiere.
```

### Ricevuta di pagamento  ·  `payment_received`  ·  💤 DORMIENTE

*Quando/a chi: Ogni addebito andato a buon fine · Admin azienda*
*Variabili: `{{card.last4}}`, `{{company.name}}`, `{{event.date}}`, `{{link_url_1}}`, `{{payment.method}}`, `{{subscription.amount}}`, `{{user.first_name}}`*

**Oggetto:** Ricevuta pagamento · {{company.name}} · {{event.date}}
**Testo:**
```
Ciao {{user.first_name}},

pagamento ricevuto per l'abbonamento di {{company.name}}. Tutto regolare.

🧾 Importo: {{subscription.amount}}
💳 Metodo: {{payment.method}} ••{{card.last4}}
📅 Data: {{event.date}}

[Scarica la fattura]({{link_url_1}})

Conserva questa email o girala al commercialista: è già tutto quello che gli serve.
```

### Rinnovo imminente  ·  `renewal_upcoming`  ·  💤 DORMIENTE

*Quando/a chi: Pochi giorni prima del rinnovo automatico · Admin azienda*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{subscription.amount}}`, `{{subscription.renewal_date}}`, `{{user.first_name}}`*

**Oggetto:** Il {{subscription.renewal_date}} si rinnova l'abbonamento — tutto ok?
**Testo:**
```
Ciao {{user.first_name}},

ti avvisiamo prima, come è giusto: l'abbonamento di {{company.name}} si rinnova il {{subscription.renewal_date}} per {{subscription.amount}}, sullo stesso metodo di pagamento.

Va bene così? Non devi fare nulla, pensa al cantiere.

Vuoi cambiare piano o metodo di pagamento? Fallo prima del rinnovo:

[Gestisci l'abbonamento]({{link_url_1}})
```

### Carta in scadenza  ·  `card_expiring`  ·  💤 DORMIENTE

*Quando/a chi: La carta salvata sta per scadere · Admin azienda*
*Variabili: `{{card.last4}}`, `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** La carta ••{{card.last4}} sta per scadere
**Testo:**
```
Ciao {{user.first_name}},

la carta che usi per l'abbonamento di {{company.name}} (••{{card.last4}}) scade a breve.

Un minuto adesso per aggiornarla, e al prossimo rinnovo non si blocca niente:

[Aggiorna la carta]({{link_url_1}})

Meglio ora che a account sospeso, con te chiuso fuori e il lavoro che aspetta.
```

### Trial scaduto  ·  `trial_expired`  ·  💤 DORMIENTE

*Quando/a chi: Il periodo di prova è terminato senza attivazione · Admin azienda*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Il trial è finito. I tuoi dati no.
**Testo:**
```
Ciao {{user.first_name}},

il periodo di prova di {{company.name}} è terminato e l'accesso è in pausa.

I tuoi dati — commesse, clienti, documenti — sono tutti lì. Intatti. Attivi un piano quando vuoi e riparti dal punto esatto dove eri:

[Riattiva l'account]({{link_url_1}})

Un avviso onesto: li conserviamo per un periodo limitato. Non lasciar passare mesi.

PS. Se non hai attivato per un dubbio — prezzo, funzioni, tempo per imparare a usarlo — rispondi a questa email. Meglio una risposta vera che un account fermo.
```

### Cambio piano confermato  ·  `plan_changed`  ·  💤 DORMIENTE

*Quando/a chi: Upgrade o downgrade del piano · Admin azienda*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{plan.name}}`, `{{subscription.amount}}`, `{{subscription.renewal_date}}`, `{{user.first_name}}`*

**Oggetto:** Fatto: ora sei su {{plan.name}}
**Testo:**
```
Ciao {{user.first_name}},

il piano di {{company.name}} è passato a {{plan.name}}. La modifica è già attiva, non devi fare niente.

📦 Nuovo piano: {{plan.name}}
💶 Importo: {{subscription.amount}}
🔁 Prossimo rinnovo: {{subscription.renewal_date}}

[Vedi cosa è incluso nel tuo piano]({{link_url_1}})
```

### Abbonamento cancellato  ·  `subscription_cancelled`  ·  💤 DORMIENTE

*Quando/a chi: L'utente cancella l'abbonamento · Admin azienda*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{subscription.renewal_date}}`, `{{user.first_name}}`*

**Oggetto:** Cancellazione registrata — hai tempo fino al {{subscription.renewal_date}}
**Testo:**
```
Ciao {{user.first_name}},

abbiamo registrato la cancellazione dell'abbonamento di {{company.name}}. Nessun trucco: continui a usare tutto fino al {{subscription.renewal_date}}, poi l'account va in pausa e i dati restano lì, in attesa.

Se cambi idea prima di quella data, riattivi con un click:

[Ho ripensato — riattiva]({{link_url_1}})

Un minuto per dirmi cosa non ha funzionato? Rispondi a questa email. La leggo io, personalmente — ed è il modo più rapido per far sistemare quello che ti ha fatto andare via.
```

### Account sospeso per mancato pagamento  ·  `account_suspended`  ·  💤 DORMIENTE

*Quando/a chi: Fine sequenza dunning senza incasso · Admin azienda*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Account sospeso — 2 minuti per riaccenderlo
**Testo:**
```
Ciao {{user.first_name}},

dopo diversi tentativi non siamo riusciti a incassare l'abbonamento di {{company.name}}, quindi l'account è sospeso. L'accesso è bloccato — ma i tuoi dati sono ancora tutti lì: commesse, clienti, documenti.

Aggiorna il pagamento e torni operativo all'istante:

[Aggiorna e riattiva]({{link_url_1}})

I dati restano disponibili per un periodo limitato. Non aspettare che il problema si risolva da solo: le carte scadute non si aggiornano da sole.

Se il problema non è la carta, rispondi a questa email: parliamone.
```

### Rimborso emesso  ·  `refund_issued`  ·  💤 DORMIENTE

*Quando/a chi: Viene emesso un rimborso · Admin azienda*
*Variabili: `{{card.last4}}`, `{{company.name}}`, `{{payment.amount}}`, `{{payment.method}}`, `{{payment.reference}}`, `{{user.first_name}}`*

**Oggetto:** Rimborso di {{payment.amount}} in arrivo sulla tua carta
**Testo:**
```
Ciao {{user.first_name}},

fatto: abbiamo emesso il rimborso di {{payment.amount}} sull'abbonamento di {{company.name}}.

💶 Importo: {{payment.amount}}
💳 Su: {{payment.method}} ••{{card.last4}}
🧾 Riferimento: {{payment.reference}}

Lo vedi sull'estratto conto entro 5-10 giorni lavorativi: il tempo lo fa la tua banca, non noi.

Se dopo 10 giorni non è arrivato, rispondi a questa email col riferimento qui sopra.
```


---

## Lifecycle & retention

### Lifecycle · Riepilogo mensile  ·  `lifecycle_monthly_summary`  ·  ✅ ATTIVA

*Inviata da: lifecycle-email-tick (mensile)*
*Quando/a chi: Inizio mese, riepilogo del mese precedente · Admin azienda attiva*
*Variabili: `{{link_url_1}}`, `{{period.month}}`, `{{stats.hours_saved}}`, `{{stats.orders}}`, `{{stats.revenue}}`, `{{user.first_name}}`*

**Oggetto:** {{period.month}} in 3 numeri: {{stats.orders}} commesse, {{stats.revenue}}
**Testo:**
```
Ciao {{user.first_name}},

il tuo {{period.month}}, in tre numeri — quelli che contano davvero:

📦 Commesse gestite: {{stats.orders}}
💶 Fatturato: {{stats.revenue}}
⏱ Ore risparmiate rispetto a carta ed Excel: ~{{stats.hours_saved}}

{{stats.hours_saved}} ore sono giornate intere che questo mese hai passato in cantiere o a casa, invece che dietro una scrivania a rincorrere fogli.

[Apri la dashboard e guarda il dettaglio]({{link_url_1}})
```

### Lifecycle · D+3 non attivato  ·  `lifecycle_d3_no_activation`  ·  ✅ ATTIVA

*Inviata da: lifecycle-email-tick (D+3)*
*Quando/a chi: 3 giorni dopo la registrazione, setup fermo · Admin azienda*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Ti do una mano a partire, {{user.first_name}}?
**Testo:**
```
Hai aperto l'account di {{company.name}} qualche giorno fa, poi tutto fermo. Capita a tanti: il cantiere chiama e il gestionale aspetta.

Ma per essere operativo bastano 5 minuti, in tre passi:

1. Aggiungi il primo cliente
2. Crea la prima commessa
3. Invita il tuo team

[Riprendi da qui]({{link_url_1}})

Fai anche solo il passo 1: domani il 2 e il 3 vengono da soli.

PS. Preferisci farlo insieme? Rispondi a questa email e ti seguo io, passo passo. Gratis, senza impegno: mi interessa che parti bene.
```

### Lifecycle · D+7 funzioni  ·  `lifecycle_d7_features`  ·  ✅ ATTIVA

*Inviata da: lifecycle-email-tick (D+7)*
*Quando/a chi: 7 giorni dopo la registrazione · Admin azienda*
*Variabili: `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Il preventivo in 2 minuti, dettato a voce
**Testo:**
```
{{user.first_name}}, è passata una settimana.

Ti risparmio la scoperta per tentativi: queste tre cose sono quelle che fanno dire "ah, però" a chi le prova. In ordine di ore che ti restituiscono:

- AI Preventivo — descrivi il lavoro, a voce o per iscritto. Preventivo pronto in 2 minuti, non in due sere.
- Render AI — foto del cantiere, render fotorealistico in 90 secondi. Il cliente vede il risultato finito e firma prima.
- Automazioni — le imposti una volta. Poi lavorano loro, anche di domenica.

[Provale ora]({{link_url_1}})

Prova la prima già oggi, sul prossimo preventivo che devi fare comunque.
```

### Win-back inattività  ·  `winback`  ·  💤 DORMIENTE

*Quando/a chi: L'utente non accede da molti giorni · Admin azienda inattiva*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.first_name}}`, `{{user.inactive_days}}`*

**Oggetto:** {{user.first_name}}, i tuoi cantieri sono ancora qui
**Testo:**
```
Ciao {{user.first_name}},

sono passati {{user.inactive_days}} giorni dal tuo ultimo accesso a {{company.name}}. Nessuna predica: quando il cantiere chiama, il gestionale aspetta. È il suo mestiere.

Però una cosa te la dico. I preventivi, le ore, i documenti: o stanno qui, o stanno in testa. E in testa, coi giorni, si perdono pezzi.

I tuoi dati sono esattamente dove li hai lasciati. Riparti da lì:

[Riprendi da dove eri]({{link_url_1}})

PS. Se qualcosa ti ha bloccato — una funzione che non trovavi, un dubbio, un accidenti — rispondi a questa email. Nove volte su dieci si sistema in due righe.
```

### Annuncio nuova funzionalità  ·  `feature_announcement`  ·  💤 DORMIENTE

*Quando/a chi: Rilascio di una funzione rilevante · Tutti gli utenti attivi*
*Variabili: `{{feature.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Da oggi su EiC: {{feature.name}}
**Testo:**
```
Ciao {{user.first_name}},

abbiamo aggiunto una cosa che ci chiedevate in tanti: {{feature.name}}.

È già attiva nel tuo account. Non devi installare niente, non devi pagare niente in più: entri e la trovi.

[Provala adesso]({{link_url_1}})

Ti torna utile? Ci piacerebbe saperlo. Non ti serve? Ignorala, non cambia nient'altro.
```

### Richiesta feedback / NPS  ·  `nps_feedback`  ·  💤 DORMIENTE

*Quando/a chi: Dopo un periodo d'uso, per misurare la soddisfazione · Admin azienda attiva*
*Variabili: `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Una domanda sola, {{user.first_name}}. Un click.
**Testo:**
```
Ciao {{user.first_name}},

ti rubo dieci secondi, promesso. Da 0 a 10: quanto consiglieresti Edilizia in Cloud a un altro imprenditore edile come te?

[Rispondi con un click]({{link_url_1}})

E se c'è qualcosa che non va, scrivimelo senza filtri, anche brutale. Le pacche sulle spalle non ci fanno migliorare: le critiche sì.
```


---

## Programma partner

### Partner · Benvenuto  ·  `partner_welcome`  ·  ✅ ATTIVA

*Inviata da: send-partner-notification*
*Quando/a chi: Un nuovo partner viene attivato · Partner*
*Variabili: `{{link_url_1}}`, `{{partner.commission}}`, `{{partner.tier}}`, `{{referral.code}}`, `{{user.full_name}}`*

**Oggetto:** Sei dentro. Ecco come si guadagna.
**Testo:**
```
Ciao {{user.full_name}}, benvenuto: da oggi sei partner {{partner.tier}} di Edilizia in Cloud.

Come funziona, in due righe e senza asterischi:

Ogni azienda che si registra col tuo link ti riconosce il {{partner.commission}} del suo abbonamento. Ogni mese, finché resta cliente. Non una tantum: ricorrente. Porti un cliente una volta, incassi finché lui lavora.

Il tuo codice: {{referral.code}}

[Vai alla dashboard partner]({{link_url_1}})

Lì trovi il link da condividere e vedi le conversioni in tempo reale.

Primo passo che funziona sempre: mandalo alle 3 imprese che conosci meglio. Il passaparola tra colleghi converte più di qualsiasi post.
```

### Partner · Nuova conversione  ·  `partner_conversion`  ·  ✅ ATTIVA

*Inviata da: send-partner-notification*
*Quando/a chi: Un'azienda si registra col link del partner · Partner*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{user.full_name}}`*

**Oggetto:** 🚀 {{company.name}} si è registrata col tuo link
**Testo:**
```
Ottimo lavoro, {{user.full_name}}.

{{company.name}} si è appena registrata usando il tuo link. Da qui in poi, finché resta cliente, entra nelle tue commissioni ricorrenti — il primo accredito parte dal prossimo ciclo di calcolo.

[Vedi le tue conversioni]({{link_url_1}})

Il momento buono per raddoppiare è adesso: a chi altro puoi girare il link questa settimana?
```

### Partner · Commissioni pronte  ·  `partner_commission`  ·  ✅ ATTIVA

*Inviata da: send-partner-notification*
*Quando/a chi: Chiusura mensile delle commissioni · Partner*
*Variabili: `{{commission.amount}}`, `{{link_url_1}}`, `{{partner.active_companies}}`, `{{period.month}}`, `{{user.full_name}}`*

**Oggetto:** {{commission.amount}} maturati a {{period.month}} 💰
**Testo:**
```
Ciao {{user.full_name}},

mese chiuso. Ecco il tuo:

💰 Commissioni {{period.month}}: {{commission.amount}}
🏢 Aziende attive: {{partner.active_companies}}

[Richiedi il pagamento]({{link_url_1}})

E ricorda come funziona il ricorrente: le {{partner.active_companies}} aziende di questo mese lavorano per te anche il prossimo. Ogni nuova che porti si somma, non si sostituisce.
```

### Partner · Payout approvato  ·  `partner_payout`  ·  ✅ ATTIVA

*Inviata da: send-partner-notification*
*Quando/a chi: Il pagamento al partner viene approvato · Partner*
*Variabili: `{{payment.reference}}`, `{{payout.amount}}`, `{{user.full_name}}`*

**Oggetto:** ✅ {{payout.amount}} in arrivo: bonifico partito
**Testo:**
```
Ci siamo, {{user.full_name}}.

Il tuo pagamento di {{payout.amount}} è approvato e il bonifico è partito.

✅ Importo: {{payout.amount}}
🧾 Riferimento: {{payment.reference}}

Arriva entro 3-5 giorni lavorativi. Lo trovi anche nello storico della dashboard.

Soldi veri, guadagnati facendo conoscere uno strumento che ai colleghi serve davvero. Avanti così.
```

### Partner · Upgrade tier  ·  `partner_tier`  ·  ✅ ATTIVA

*Inviata da: send-partner-notification*
*Quando/a chi: Il partner raggiunge un nuovo livello · Partner*
*Variabili: `{{link_url_1}}`, `{{partner.multiplier}}`, `{{partner.new_tier}}`, `{{user.full_name}}`*

**Oggetto:** 🎊 Nuovo tier {{partner.new_tier}}: da oggi guadagni di più
**Testo:**
```
Complimenti {{user.full_name}}: sei salito al tier {{partner.new_tier}}.

Hai portato abbastanza aziende da sbloccare un guadagno più alto. Da adesso ogni commissione vale {{partner.multiplier}} in più — e vale anche sulle aziende che hai GIÀ portato, non solo sulle prossime.

[Vedi il nuovo tier]({{link_url_1}})

Tradotto: il lavoro fatto finora ha appena aumentato di valore. Da solo.
```


---

## Notifiche di prodotto

### Documento condiviso  ·  `document_shared`  ·  💤 DORMIENTE

*Quando/a chi: Un utente condivide un documento · Destinatario della condivisione*
*Variabili: `{{company.name}}`, `{{document.name}}`, `{{link_url_1}}`, `{{sender.name}}`, `{{user.first_name}}`*

**Oggetto:** {{sender.name}} ti ha condiviso: {{document.name}}
**Testo:**
```
Ciao {{user.first_name}},

{{sender.name}} ha condiviso un documento con te su {{company.name}}:

📄 {{document.name}}

[Apri il documento]({{link_url_1}})

Lo ritrovi quando vuoi nella sezione documenti del cantiere: niente più "me lo rimandi?".
```

### Attività assegnata  ·  `task_assigned`  ·  💤 DORMIENTE

*Quando/a chi: Viene assegnato un task a un utente · Utente assegnatario*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{sender.name}}`, `{{task.due_date}}`, `{{task.name}}`, `{{user.first_name}}`*

**Oggetto:** Nuova attività da {{sender.name}}: {{task.name}} · entro {{task.due_date}}
**Testo:**
```
Ciao {{user.first_name}},

{{sender.name}} ti ha assegnato un'attività su {{company.name}}:

✅ Cosa: {{task.name}}
📅 Entro quando: {{task.due_date}}

[Apri l'attività]({{link_url_1}})

Dentro trovi i dettagli e puoi segnare l'avanzamento — così {{sender.name}} lo vede senza chiamarti.
```

### Report pronto  ·  `report_ready`  ·  💤 DORMIENTE

*Quando/a chi: Un report richiesto è stato generato · Utente che lo ha richiesto*
*Variabili: `{{company.name}}`, `{{document.name}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Pronto: {{document.name}}
**Testo:**
```
Ciao {{user.first_name}},

il report che hai richiesto su {{company.name}} è pronto da scaricare:

📊 {{document.name}}

[Scarica il report]({{link_url_1}})

Resta comunque disponibile nella tua dashboard, quando ti serve.
```

### Richiesta di approvazione (Silvio · HITL)  ·  `silvio_approval`  ·  💤 DORMIENTE

*Quando/a chi: Silvio prepara un'azione che richiede conferma umana · Admin / responsabile*
*Variabili: `{{company.name}}`, `{{link_url_1}}`, `{{task.name}}`, `{{user.first_name}}`*

**Oggetto:** Silvio aspetta il tuo ok: {{task.name}}
**Testo:**
```
Ciao {{user.first_name}},

Silvio ha preparato un'azione per {{company.name}} e aspetta il tuo via libera prima di muoversi:

⚙️ Azione: {{task.name}}

Se va bene, approvi con un click. Se non ti convince, la blocchi. Niente parte senza il tuo ok — mai.

[Rivedi e approva]({{link_url_1}})

Non c'è fretta: finché non decidi tu, Silvio resta fermo. Comandi tu, lui esegue.
```


---

## Edilizia / fiscale

### Fattura accettata dallo SDI  ·  `sdi_accepted`  ·  💤 DORMIENTE

*Quando/a chi: Lo SDI accetta una fattura elettronica · Admin / amministrazione azienda*
*Variabili: `{{company.name}}`, `{{invoice.number}}`, `{{payment.amount}}`, `{{user.first_name}}`*

**Oggetto:** ✅ Fattura {{invoice.number}} consegnata: tutto in regola
**Testo:**
```
Ciao {{user.first_name}},

buone notizie: la fattura {{invoice.number}} di {{company.name}} è stata accettata dallo SDI e trasmessa al cliente. Per il Fisco è ufficialmente emessa.

🧾 Fattura: {{invoice.number}}
💶 Importo: {{payment.amount}}
✅ Stato: Consegnata

Non devi fare nulla: la ricevuta di consegna è già archiviata nel CassettoSDI, pronta se il commercialista la chiede.
```

### Fattura SCARTATA dallo SDI  ·  `sdi_rejected`  ·  💤 DORMIENTE

*Quando/a chi: Lo SDI rifiuta una fattura elettronica · Admin / amministrazione azienda*
*Variabili: `{{company.name}}`, `{{invoice.number}}`, `{{link_url_1}}`, `{{sdi.reject_reason}}`, `{{user.first_name}}`*

**Oggetto:** ⚠️ Fattura {{invoice.number}} scartata — correggila oggi
**Testo:**
```
Ciao {{user.first_name}},

lo SDI ha scartato la fattura {{invoice.number}} di {{company.name}}. Tradotto: per il Fisco quella fattura al momento NON è stata emessa. Va corretta e rinviata — meglio in giornata.

🧾 Fattura: {{invoice.number}}
❌ Motivo dello scarto: {{sdi.reject_reason}}

Niente panico: quasi sempre è un dato sbagliato, si sistema in due minuti. Apri la fattura, correggi il punto segnalato e rimandala — te lo facciamo fare in due click:

[Correggi e rinvia]({{link_url_1}})

Attenzione al termine: hai 5 giorni dalla notifica di scarto per rinviarla mantenendo la data originale. Passati quelli, si complica.
```

### Promemoria incasso / sollecito  ·  `payment_reminder`  ·  💤 DORMIENTE

*Quando/a chi: Una fattura del cliente è in scadenza o scaduta · Cliente dell'azienda (debitore)*
*Variabili: `{{company.name}}`, `{{customer.name}}`, `{{document.expiry_date}}`, `{{invoice.number}}`, `{{payment.amount}}`*

**Oggetto:** Promemoria di {{company.name}}: fattura {{invoice.number}} in scadenza il {{document.expiry_date}}
**Testo:**
```
Gentile {{customer.name}},

un promemoria cortese da parte di {{company.name}}: la fattura {{invoice.number}} è in scadenza.

🧾 Fattura: {{invoice.number}}
💶 Importo: {{payment.amount}}
📅 Scadenza: {{document.expiry_date}}

Se ha già provveduto al pagamento, ignori pure questo messaggio e ci scusi il disturbo. In caso contrario, può saldare con i riferimenti indicati in fattura.

Per qualsiasi chiarimento può rispondere direttamente a questa email: {{company.name}} la ricontatterà al più presto.

Messaggio inviato automaticamente da {{company.name}} tramite Edilizia in Cloud.
```

### Documento in scadenza (DURC, polizze, certificazioni)  ·  `document_expiring`  ·  💤 DORMIENTE

*Quando/a chi: Un documento aziendale sta per scadere · Admin azienda*
*Variabili: `{{company.name}}`, `{{document.days_left}}`, `{{document.expiry_date}}`, `{{document.type}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** {{document.type}} scade tra {{document.days_left}} giorni — muoviti per tempo
**Testo:**
```
Ciao {{user.first_name}},

controlla questa: un documento di {{company.name}} sta per scadere.

📋 Documento: {{document.type}}
📅 Scade il: {{document.expiry_date}}
⏳ Mancano: {{document.days_left}} giorni

Lo sai meglio di me: senza questo documento rischi il cantiere fermo, o di restare fuori da una gara. E il rinnovo fatto all'ultimo costa sempre più caro di quello fatto con calma.

[Vedi il documento]({{link_url_1}})

Te lo ricordiamo apposta in anticipo: il tempo per muoverti ce l'hai, usalo.
```

### Sopralluogo programmato  ·  `site_inspection`  ·  💤 DORMIENTE

*Quando/a chi: Viene fissato un sopralluogo · Responsabile / tecnico assegnato*
*Variabili: `{{company.name}}`, `{{inspection.date}}`, `{{inspection.time}}`, `{{link_url_1}}`, `{{site.address}}`, `{{user.first_name}}`*

**Oggetto:** Sopralluogo {{inspection.date}} ore {{inspection.time}} — {{site.address}}
**Testo:**
```
Ciao {{user.first_name}},

sopralluogo fissato per {{company.name}}. Segnatelo:

📅 Data: {{inspection.date}}
🕐 Ora: {{inspection.time}}
📍 Dove: {{site.address}}

[Apri la scheda sopralluogo]({{link_url_1}})

Sul posto compili il rilievo direttamente dal telefono: foto, misure e note finiscono già nella scheda. Niente da ricopiare quando torni.
```


---

## Sistema & compliance

### Manutenzione programmata  ·  `maintenance_scheduled`  ·  💤 DORMIENTE

*Quando/a chi: Prima di un intervento pianificato · Tutti gli utenti*
*Variabili: `{{maintenance.date}}`, `{{maintenance.window}}`, `{{user.first_name}}`*

**Oggetto:** Manutenzione il {{maintenance.date}} ({{maintenance.window}}): cosa aspettarti
**Testo:**
```
Ciao {{user.first_name}},

il {{maintenance.date}}, nella finestra {{maintenance.window}}, facciamo manutenzione su Edilizia in Cloud. In quel lasso di tempo il gestionale potrebbe essere lento o irraggiungibile per qualche minuto.

Due cose da sapere:

- Nessun dato va perso. Niente. Tutto torna esattamente com'era.
- Scegliamo orari serali o notturni apposta, per non intralciarti il lavoro.
Non devi fare nulla: ti avvisiamo solo per non farti trovare la sorpresa.
```

### Aggiornamento Termini / Privacy  ·  `terms_update`  ·  💤 DORMIENTE

*Quando/a chi: Modifica ai documenti legali · Tutti gli utenti*
*Variabili: `{{event.date}}`, `{{link_url_1}}`, `{{terms.summary}}`, `{{user.first_name}}`*

**Oggetto:** Aggiorniamo Termini e Privacy — te lo spieghiamo in italiano
**Testo:**
```
Ciao {{user.first_name}},

abbiamo aggiornato i Termini di Servizio e la Privacy Policy di Edilizia in Cloud. Entrano in vigore il {{event.date}}.

Cosa cambia, detto in italiano e non in legalese: {{terms.summary}}

Se continui a usare il gestionale dopo quella data, accetti le nuove condizioni. Vuoi leggere tutto per bene? Fai giusto:

[Leggi cosa cambia]({{link_url_1}})

I documenti completi sono linkati nella pagina.
```

### Export dati pronto (GDPR)  ·  `gdpr_export`  ·  💤 DORMIENTE

*Quando/a chi: Un export dati richiesto è pronto · Admin azienda*
*Variabili: `{{company.name}}`, `{{export.days_left}}`, `{{link_url_1}}`, `{{user.first_name}}`*

**Oggetto:** Il tuo export è pronto — scaricalo entro {{export.days_left}} giorni
**Testo:**
```
Ciao {{user.first_name}},

l'export dei dati di {{company.name}} che avevi richiesto è pronto: un unico archivio, tutto dentro.

[Scarica i tuoi dati]({{link_url_1}})

Il link scade tra {{export.days_left}} giorni — è una misura di sicurezza: i tuoi dati non devono restare scaricabili all'infinito. Dopo la scadenza basta richiedere un nuovo export.

Scaricalo adesso, finché ce l'hai sotto mano.
```
