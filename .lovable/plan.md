
# Sezione Recensioni / Casi Studio

## Posizione
Nuova sezione `TestimonialsSection.tsx` inserita tra `PricingSection` e `GuaranteeSection` in `Home.tsx` -- subito dopo il prezzo, per rafforzare la decisione d'acquisto con prove sociali concrete.

## Contenuto: 4 Aziende con Risultati

### 1. Costruzioni Rossi S.r.l. - Roma
- **Settore**: Ristrutturazioni residenziali
- **Fatturato**: 1.2M euro
- **Prima**: 80.000 euro di utile (6.7% margine)
- **Dopo**: 360.000 euro di utile (30% margine)
- **Citazione**: "In 8 mesi abbiamo scoperto che 3 cantieri su 10 erano in perdita. Ora ogni commessa e sotto controllo."
- **Persona**: Marco Rossi, Titolare

### 2. Edil Progetti S.r.l. - Milano
- **Settore**: Impiantistica e manutenzioni
- **Fatturato**: 800K euro
- **Prima**: Ritardi di incasso medi di 90 giorni
- **Dopo**: Incassi medi a 35 giorni, cassa sempre positiva
- **Citazione**: "Prima rincorrevamo i pagamenti. Ora il forecast ci dice esattamente quando e quanto incasseremo."
- **Persona**: Laura Bianchi, Amministratrice

### 3. Fratelli Conti Costruzioni - Napoli
- **Settore**: Edilizia civile e appalti pubblici
- **Fatturato**: 3.5M euro
- **Prima**: 2 giorni/settimana su fogli Excel per i report
- **Dopo**: Report automatici in tempo reale, 12 ore/settimana risparmiate
- **Citazione**: "Ho eliminato Excel dalla mia vita. Dashboard, margini, stato cantieri: tutto in un click."
- **Persona**: Giuseppe Conti, Direttore Tecnico

### 4. GreenBuild Italia - Torino
- **Settore**: Costruzioni sostenibili
- **Fatturato**: 600K euro (startup)
- **Prima**: Nessun controllo su costi materiali, margine stimato "a occhio"
- **Dopo**: Margine reale tracciato per ogni commessa, +22% di redditivita in 6 mesi
- **Citazione**: "Come startup non potevamo permetterci errori. Edilizia in Cloud ci ha dato il controllo dal giorno uno."
- **Persona**: Alessia Verde, Co-fondatrice

## Layout e Design

- **Titolo**: "I Risultati Parlano Chiaro" con sottotitolo "Ecco cosa hanno ottenuto le imprese che hanno scelto Edilizia in Cloud"
- **Card layout**: Griglia 2x2 su desktop, 1 colonna su mobile
- Ogni card include:
  - Avatar con iniziali (cerchio colorato stile teal/navy)
  - Nome azienda, citta, ruolo persona
  - Citazione in corsivo tra virgolette
  - **Risultato chiave** evidenziato: box con "Prima -> Dopo" usando colori rosso/verde
  - 5 stelline dorate
- Scroll animation con stagger (ogni card appare con un delay progressivo)
- Background: `bg-[#f8fafb]` per staccare dalla sezione bianca sopra

## Dettagli Tecnici

### Nuovo file: `src/components/landing/TestimonialsSection.tsx`
- Importa `useScrollAnimation` per animazioni scroll-based
- Array statico di 4 testimonianze con tutti i dati
- Card con `rounded-2xl`, bordo sottile, ombra leggera
- Box "Prima/Dopo" con icona ArrowRight, numeri in rosso (prima) e verde (dopo)
- Stelline con icona Star di lucide-react in `text-amber-400`
- Avatar circolare con iniziali (`bg-[#0fa68c]` o `bg-[#1a2744]` alternati)

### File modificato: `src/pages/Home.tsx`
- Import e inserimento di `TestimonialsSection` tra `PricingSection` e `GuaranteeSection`

### Nessuna dipendenza aggiuntiva
Usa solo lucide-react (gia installato) e hook esistente useScrollAnimation.
