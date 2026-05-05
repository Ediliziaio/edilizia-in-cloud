---
area: 05-fiscale-compliance
titolo: TipoDocumento — i codici TD da conoscere
tags: [tipo-documento, td, td17, td18, td19, td20, autofattura, fattura-elettronica]
livello: intermedio
applicabile_a: [fatturazione-elettronica, operazioni-estere, autofatture]
kpi_correlati: [accuratezza-td, scarti-sdi]
versione: 1.0
aggiornato_il: 2026-05-04
---

# TipoDocumento — i codici TD per fatturare correttamente

Nel formato XML FatturaPA, ogni fattura ha un **TipoDocumento (TD)** che identifica la natura dell'operazione. Sbagliare TD = scarto SDI o errori formali in dichiarazione.

## I TD principali

| Codice | Descrizione | Quando si usa |
|---|---|---|
| **TD01** | Fattura | Operazioni standard |
| **TD02** | Acconto / Anticipo su fattura | Acconti su lavori non ancora eseguiti |
| **TD03** | Acconto / Anticipo su parcella | Acconti per professionisti |
| **TD04** | Nota di credito | Storno o riduzione |
| **TD05** | Nota di debito | Aumento dell'imponibile |
| **TD06** | Parcella | Per professionisti |
| **TD16** | Integrazione fattura reverse charge interno | Cliente integra IVA ricevuta in reverse |
| **TD17** | Integrazione/autofattura per acquisti servizi dall'estero | Servizi da fornitore UE/extra-UE |
| **TD18** | Integrazione per acquisti beni intracomunitari | Acquisti beni da UE |
| **TD19** | Integrazione/autofattura per acquisti beni ex art. 17 c.2 DPR 633/72 | Acquisti da non residenti |
| **TD20** | Autofattura per regolarizzazione e integrazione | Regolarizzazione fatture mancanti |
| **TD21** | Autofattura per splafonamento | Per esportatori abituali |
| **TD22** | Estrazione beni da Deposito IVA | Caso specifico |
| **TD23** | Estrazione beni da Deposito IVA con versamento | Caso specifico |
| **TD24** | Fattura differita ex art. 21 c.4 lett. a) | Fatture differite con DDT |
| **TD25** | Fattura differita ex art. 21 c.4 lett. b) | Fatture differite per servizi |
| **TD26** | Cessione beni ammortizzabili e passaggi interni | Operazioni straordinarie |
| **TD27** | Fattura per autoconsumo o cessioni gratuite | Autoconsumo |
| **TD28** | Acquisti da San Marino con IVA | Operazioni con San Marino |

## I TD più rilevanti per l'edilizia

**TD01 — Fattura**: l'operazione tipica.

**TD16 — Integrazione reverse charge interno**: quando l'impresa edile riceve una fattura in reverse charge (es. da subappaltatore), deve "integrare" l'IVA. Il TD16 è il codice di questa integrazione.

**TD17 — Servizi dall'estero**: se l'impresa edile acquista un servizio da fornitore UE (es. consulenza ingegneristica francese) o extra-UE.

**TD18 — Beni da UE**: se acquista materiali da fornitore UE (es. piastrelle dalla Spagna).

**TD19 — Beni da non residenti senza stabile organizzazione in Italia**: caso più raro.

**TD24 / TD25 — Fatture differite**: tipiche dell'edilizia per fatturare a fine mese su DDT/SAL del periodo.

**TD20 — Autofattura per regolarizzazione**: se l'impresa edile non riceve la fattura del fornitore entro 4 mesi dall'operazione, deve emettere autofattura.

## Esempi pratici

**Caso 1 — Subappalto edile interno**
Impresa A (general contractor) riceve fattura da impresa B (subappaltatore) in reverse charge.
- B emette fattura TD01 con natura N6.7 (reverse charge edilizia)
- A integra con autofattura TD16

**Caso 2 — Acquisto materiali Italia**
Impresa edile compra calcestruzzo in Italia.
- Fornitore emette fattura TD01 con IVA standard
- Impresa edile registra come fattura passiva normale

**Caso 3 — Acquisto materiali Spagna**
Impresa edile compra rivestimenti in Spagna.
- Fornitore spagnolo emette fattura senza IVA (regime intracomunitario)
- Impresa edile italiana integra con TD18 + applicazione IVA italiana

**Caso 4 — Consulenza tecnica da Germania**
Impresa edile italiana riceve consulenza progettuale da studio tedesco.
- Studio tedesco emette fattura senza IVA tedesca
- Impresa edile italiana integra con TD17 + applicazione IVA italiana

## Errori comuni

1. **TD01 invece di TD16** quando si integra reverse charge: errore formale frequente.
2. **TD17 invece di TD18** o viceversa: confondere servizi e beni intracomunitari.
3. **Non emettere TD20 quando manca la fattura del fornitore**: in caso di controllo, sanzioni per omissione.
4. **TD24/25 per fatture immediate**: errore di classificazione che non genera scarto ma è formalmente sbagliato.
5. **Note di credito senza TD04**: se si stornano operazioni, va il codice corretto.

## Strumenti

I gestionali edili che integrano fatturazione elettronica (come EiC) suggeriscono automaticamente il TD corretto in base a:
- Tipo di anagrafica fornitore (italiano, UE, extra-UE)
- Tipo di operazione (servizi, beni, integrazione)
- Regime IVA applicabile

Senza automazione, l'errore di TD è frequentissimo. Con automazione, gli errori si riducono al 90%.

## Quando in dubbio

Per casi non standard (operazioni straordinarie, transazioni particolari), sempre confronto con commercialista. Sanzioni per dichiarazioni IVA con errori di codifica possono essere pesanti.

## Riferimenti

- **Provvedimenti AdE** annuali con codifiche TD aggiornate
- **Manuale Tecnico SDI** con specifiche complete
- **Circolari AdE** per casi interpretativi
