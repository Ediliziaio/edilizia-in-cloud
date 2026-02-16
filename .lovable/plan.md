

# Aggiunta Loghi Partner Scorrevoli nella Hero

## Stato Attuale
La sezione social proof sotto i CTA esiste già con:
- "150+ Imprese Edili" con icona Users
- 5 stelline con "4.9/5 Soddisfazione"
- "Supporto Italiano" con icona Headphones

## Cosa Aggiungere
Un **marquee di loghi partner/integrazioni** subito sotto la social proof esistente, con scorrimento orizzontale continuo e automatico.

### Loghi (testo stilizzato, senza immagini esterne)
8 loghi fittizi di partner/associazioni del settore edile:
- ANCE (Associazione Costruttori)
- Confindustria Edilizia
- Cassa Edile
- Edilportale
- Federcostruzioni
- Ordine Ingegneri
- Collegio Geometri
- ANIEM

### Design
- Riga orizzontale con loghi in bianco, opacità 30-40%, che scorrono da destra a sinistra
- Etichetta sopra: "Scelto da aziende che collaborano con" in testo piccolo bianco/40%
- Duplicazione dell'array per creare loop infinito senza gap
- Effetto sfumatura ai bordi (gradient mask) per dissolvenza laterale
- Animazione CSS con `@keyframes marquee` e `animation: marquee 25s linear infinite`

### Posizione
Subito dopo il div della social proof (stelline, 150+ imprese), prima della chiusura del container `max-w-5xl`

## Dettagli Tecnici

### File modificato: `src/components/landing/HeroSection.tsx`

1. Aggiungere array `partnerLogos` con 8 nomi di associazioni/partner edili
2. Dopo il blocco social proof (riga 273), inserire un nuovo div con:
   - Label "Scelto da aziende associate a" 
   - Container con `overflow-hidden` e gradient mask laterale (`mask-image: linear-gradient`)
   - Due copie dell'array affiancate in un flex container con animazione `marquee`
   - Ogni logo: testo in font bold, maiuscolo, `text-white/30`, separato da punti centrali
3. Aggiungere `@keyframes marquee` tramite classe Tailwind custom o style inline con `animation`

### Nessuna immagine necessaria
I loghi saranno renderizzati come testo stilizzato (font bold, uppercase, tracking wide) -- approccio pulito e coerente con il design attuale senza richiedere asset esterni.

### Nessuna dipendenza aggiuntiva
Solo CSS animation + markup React.

