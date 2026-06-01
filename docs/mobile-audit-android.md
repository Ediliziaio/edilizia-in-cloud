# Mobile audit Android — 2026-05-27

Viewport: 360×800 @3x (Pixel 8 Pro UA)  
Base URL: https://app.ediliziaincloud.com  
Pagine auditate: 7  
Issues automatici rilevati: 3

## Osservazioni visive aggiuntive (dalle screenshot)

- **Cruscotto**: header denso con 4 icone (settings, brain, chat, bell) + logo + dropdown — su 360px lo spazio per il nome azienda "Demo Azien..." è ridotto e il testo è troncato
- **Cruscotto**: dopo i filtri data (Oggi/Ieri/7 giorni/30 giorni/Mese) c'è una larga area vuota — la dashboard non scrolla, è solo header+filtri. Verificare se manca contenuto KPI sotto il fold (skeleton non risolto o layout fixed-height)
- **Commesse** (riepilogo KPI): valori monetari "1.348.666,00 €" stampati come "1.348.6…" — IMPATTO ALTO: l'utente non riesce a leggere fatturato/incassato/da incassare
- **Clienti**: i nomi clienti vengono troncati e affianco c'è il badge arancione "2 anomalie" che riduce ulteriormente lo spazio. I bottoni checkbox "Seleziona" sono 16×16 (molto sotto la soglia 44px)
- **Chat (Silvio)**: l'ultimo messaggio "Silvio: Per affrontare la questione…" è troncato a 13px font; readability bassa su Android. Considera 14px min
- **Bottom nav** (visibile in tutte le pagine): 5 voci (Home/Commesse/Silvio/Magazzino/App) — il check automatico non l'ha rilevata come fixed (probabilmente sticky in flex column). Verificare manualmente safe-area-inset-bottom su dispositivi con gesture bar

## Sommario — Top 10 problemi

1. **[Commesse] Testo troncato (10 elementi, incluse cifre €)** — severità: **alta**
   - dettaglio: "1.348.666,00 €" | "161.415,00 €" | "892.794,00 €"
   - fix suggerito: CRITICO: valore monetario tagliato — ridurre font-size su mobile, abbreviare con notazione K/M (es. 1.35M €), o stackare label/valore in verticale

2. **[Clienti] Touch target piccoli (25 elementi <44px)** — severità: **alta**
   - dettaglio: prime occorrenze: div.space-y-4.sm:space-y-6 > div.rounded-lg.border:nth-of-type(5) > div.sm:hidden.divide-y:nth-of-type(1) > div.flex.items-center:nth-of-type(1) > button.peer.h-4 (16×16) | div.space-y-4.sm:space-y-6 > div.rounded-lg.border:nth-of-type(5) > div.sm:hidden.divide-y:nth-of-type(1) > div.flex.items-center:nth-of-type(2) > button.peer.h-4 (16×16) | div.space-y-4.sm:space-y-6 > div.rounded-lg.border:nth-of-type(5) > div.sm:hidden.divide-y:nth-of-type(1) > div.flex.items-center:nth-of-type(3) > button.peer.h-4 (16×16)
   - fix suggerito: Aumentare h/w minimi a 44px (h-11 w-11) o aggiungere padding cliccabile su bottoni icona

3. **[Clienti] Testo troncato (24 elementi)** — severità: **media**
   - dettaglio: "Numero complessivo di clienti in anagrafica della tua aziend" | "100% vs mese scorso" | "Clienti con almeno un ordine associato."
   - fix suggerito: Considerare title= per tooltip nativo, o layout wrap su mobile

## Per pagina

### Cruscotto (Dashboard) (`/azienda/cruscotto`)

- Page height: **800px**  
- Doc overflow orizzontale: **no**

**Overflow orizzontale (0)**

_nessuno_

**Touch target < 44px (0)**

_nessuno_

**Testo troncato (1)**

- `div.flex-1.flex > header.h-14.border-b > button.flex.items-start:nth-of-type(3) > span.flex.flex-col > span.block.text-left` — "Demo Azienda S.r.l." (scrollW=107 clientW=80)

**Bottom nav / sticky bottom (0)**

_nessuna_

**Modal/Dialog aperti (0)**

_nessuno_

Screenshot: `docs/mobile-store-assets/screenshots/audit-android/01-cruscotto.png`

### Commesse (`/azienda/ordini`)

- Page height: **4772px**  
- Doc overflow orizzontale: **no**

**Overflow orizzontale (0)**

_nessuno_

**Touch target < 44px (0)**

_nessuno_

**Testo troncato (10)**

- `div.mt-3.sm:mt-6:nth-of-type(2) > div.rounded-xl.border:nth-of-type(2) > div.flex.items-center > span.min-w-0:nth-of-type(2) > span.block.truncate:nth-of-type(2)` — "1.348.666,00 €" (scrollW=146 clientW=97)
- `div.mt-3.sm:mt-6:nth-of-type(2) > div.rounded-xl.border:nth-of-type(3) > div.flex.items-center > span.min-w-0:nth-of-type(2) > span.block.truncate:nth-of-type(2)` — "161.415,00 €" (scrollW=121 clientW=93)
- `div.mt-3.sm:mt-6:nth-of-type(2) > div.rounded-xl.border:nth-of-type(4) > div.flex.items-center > span.min-w-0:nth-of-type(2) > span.block.truncate:nth-of-type(2)` — "892.794,00 €" (scrollW=130 clientW=94)
- `div.rounded-lg.border:nth-of-type(2) > div.sm:hidden.divide-y:nth-of-type(1) > a.flex.flex-col:nth-of-type(3) > div.min-w-0:nth-of-type(2) > p.text-sm.font-medium:nth-of-type(1)` — "Pergola bioclimatica con lamelle orientabili - Terrazza Via " (scrollW=512 clientW=302)
- `div.rounded-lg.border:nth-of-type(2) > div.sm:hidden.divide-y:nth-of-type(1) > a.flex.flex-col:nth-of-type(4) > div.min-w-0:nth-of-type(2) > p.text-sm.font-medium:nth-of-type(1)` — "Fornitura porte interne e portoncino blindato - Cantiere Via" (scrollW=518 clientW=302)
- `div.rounded-lg.border:nth-of-type(2) > div.sm:hidden.divide-y:nth-of-type(1) > a.flex.flex-col:nth-of-type(5) > div.min-w-0:nth-of-type(2) > p.text-sm.font-medium:nth-of-type(1)` — "Fornitura e posa persiane in alluminio - Abitazione Piazza D" (scrollW=484 clientW=302)
- `div.rounded-lg.border:nth-of-type(2) > div.sm:hidden.divide-y:nth-of-type(1) > a.flex.flex-col:nth-of-type(6) > div.min-w-0:nth-of-type(2) > p.text-sm.font-medium:nth-of-type(1)` — "Fornitura e posa finestre in PVC - Appartamento Via Roma 15," (scrollW=453 clientW=302)
- `div.rounded-lg.border:nth-of-type(2) > div.sm:hidden.divide-y:nth-of-type(1) > a.flex.flex-col:nth-of-type(13) > div.min-w-0:nth-of-type(2) > p.text-sm.font-medium:nth-of-type(1)` — "Impermeabilizzazione terrazzo e tetto piano - Via Dante, Nap" (scrollW=417 clientW=302)

**Bottom nav / sticky bottom (0)**

_nessuna_

**Modal/Dialog aperti (0)**

_nessuno_

Screenshot: `docs/mobile-store-assets/screenshots/audit-android/02-ordini.png`

### Silvio AI Chat (`/azienda/chat`)

- Page height: **808px**  
- Doc overflow orizzontale: **no**

**Overflow orizzontale (0)**

_nessuno_

**Touch target < 44px (0)**

_nessuno_

**Testo troncato (1)**

- `div > div.w-full.text-left:nth-of-type(1) > div.flex-1.min-w-0:nth-of-type(2) > div.flex.items-center:nth-of-type(2) > p.text-[13px].truncate` — "Silvio: Per affrontare la questione della perdita di margi…" (scrollW=342 clientW=223)

**Bottom nav / sticky bottom (0)**

_nessuna_

**Modal/Dialog aperti (0)**

_nessuno_

Screenshot: `docs/mobile-store-assets/screenshots/audit-android/03-chat.png`

### Magazzino (`/azienda/magazzino`)

- Page height: **1850px**  
- Doc overflow orizzontale: **no**

**Overflow orizzontale (0)**

_nessuno_

**Touch target < 44px (0)**

_nessuno_

**Testo troncato (0)**

_nessuno_

**Bottom nav / sticky bottom (0)**

_nessuna_

**Modal/Dialog aperti (0)**

_nessuno_

Screenshot: `docs/mobile-store-assets/screenshots/audit-android/04-magazzino.png`

### Personale (`/azienda/personale`)

- Page height: **1639px**  
- Doc overflow orizzontale: **no**

**Overflow orizzontale (0)**

_nessuno_

**Touch target < 44px (0)**

_nessuno_

**Testo troncato (0)**

_nessuno_

**Bottom nav / sticky bottom (0)**

_nessuna_

**Modal/Dialog aperti (0)**

_nessuno_

Screenshot: `docs/mobile-store-assets/screenshots/audit-android/05-personale.png`

### Clienti (`/azienda/clienti`)

- Page height: **2769px**  
- Doc overflow orizzontale: **no**

**Overflow orizzontale (0)**

_nessuno_

**Touch target < 44px (25)**

- `div.space-y-4.sm:space-y-6 > div.rounded-lg.border:nth-of-type(5) > div.sm:hidden.divide-y:nth-of-type(1) > div.flex.items-center:nth-of-type(1) > button.peer.h-4` 16×16px — "Seleziona ACANFORA GENNARO ACANFORA"
- `div.space-y-4.sm:space-y-6 > div.rounded-lg.border:nth-of-type(5) > div.sm:hidden.divide-y:nth-of-type(1) > div.flex.items-center:nth-of-type(2) > button.peer.h-4` 16×16px — "Seleziona ACCARDO"
- `div.space-y-4.sm:space-y-6 > div.rounded-lg.border:nth-of-type(5) > div.sm:hidden.divide-y:nth-of-type(1) > div.flex.items-center:nth-of-type(3) > button.peer.h-4` 16×16px — "Seleziona ADAMO FRANCESCA ADAMO"
- `div.space-y-4.sm:space-y-6 > div.rounded-lg.border:nth-of-type(5) > div.sm:hidden.divide-y:nth-of-type(1) > div.flex.items-center:nth-of-type(4) > button.peer.h-4` 16×16px — "Seleziona AGRESTA ANTONIO AGRESTA"
- `div.space-y-4.sm:space-y-6 > div.rounded-lg.border:nth-of-type(5) > div.sm:hidden.divide-y:nth-of-type(1) > div.flex.items-center:nth-of-type(5) > button.peer.h-4` 16×16px — "Seleziona AHMED MOUSSA MOHAMED EL SAYED "
- `div.space-y-4.sm:space-y-6 > div.rounded-lg.border:nth-of-type(5) > div.sm:hidden.divide-y:nth-of-type(1) > div.flex.items-center:nth-of-type(6) > button.peer.h-4` 16×16px — "Seleziona AKBASH IRYNA AKBASH"
- `div.space-y-4.sm:space-y-6 > div.rounded-lg.border:nth-of-type(5) > div.sm:hidden.divide-y:nth-of-type(1) > div.flex.items-center:nth-of-type(7) > button.peer.h-4` 16×16px — "Seleziona ALFARANO ATTILIO ALFARANO"
- `div.space-y-4.sm:space-y-6 > div.rounded-lg.border:nth-of-type(5) > div.sm:hidden.divide-y:nth-of-type(1) > div.flex.items-center:nth-of-type(8) > button.peer.h-4` 16×16px — "Seleziona ALGAROTTI CRISTINA ALGAROTTI"
- `div.space-y-4.sm:space-y-6 > div.rounded-lg.border:nth-of-type(5) > div.sm:hidden.divide-y:nth-of-type(1) > div.flex.items-center:nth-of-type(9) > button.peer.h-4` 16×16px — "Seleziona ALGHAROUCH FATIMA ALGHAROUCH"
- `div.space-y-4.sm:space-y-6 > div.rounded-lg.border:nth-of-type(5) > div.sm:hidden.divide-y:nth-of-type(1) > div.flex.items-center:nth-of-type(10) > button.peer.h-4` 16×16px — "Seleziona ALOI GIOVANNI ALOI"

**Testo troncato (24)**

- `div.grid.grid-cols-2:nth-of-type(2) > div.rounded-lg.border:nth-of-type(1) > div.flex.items-center:nth-of-type(2) > div.min-w-0:nth-of-type(2) > p.mt-0.5.truncate:nth-of-type(3)` — "Numero complessivo di clienti in anagrafica della tua aziend" (scrollW=297 clientW=84)
- `div.grid.grid-cols-2:nth-of-type(2) > div.rounded-lg.border:nth-of-type(2) > div.flex.items-center:nth-of-type(2) > div.min-w-0:nth-of-type(2) > p.mt-0.5.truncate:nth-of-type(3)` — "100% vs mese scorso" (scrollW=105 clientW=84)
- `div.grid.grid-cols-2:nth-of-type(2) > div.rounded-lg.border:nth-of-type(3) > div.flex.items-center:nth-of-type(2) > div.min-w-0:nth-of-type(2) > p.mt-0.5.truncate:nth-of-type(3)` — "Clienti con almeno un ordine associato." (scrollW=189 clientW=84)
- `div.grid.grid-cols-2:nth-of-type(2) > div.rounded-lg.border:nth-of-type(4) > div.flex.items-center:nth-of-type(2) > div.min-w-0:nth-of-type(2) > p.mt-0.5.truncate:nth-of-type(3)` — "Clienti creati senza account di accesso al portale privato." (scrollW=276 clientW=84)
- `div.flex.items-center:nth-of-type(1) > a.flex-1.flex > div.flex-1.min-w-0:nth-of-type(1) > div.flex.items-center > p.font-semibold.text-sm` — "ACANFORA GENNARO ACANFORA" (scrollW=232 clientW=123)
- `div.flex.items-center:nth-of-type(3) > a.flex-1.flex > div.flex-1.min-w-0 > div.flex.items-center > p.font-semibold.text-sm` — "ADAMO FRANCESCA ADAMO" (scrollW=197 clientW=159)
- `div.flex.items-center:nth-of-type(4) > a.flex-1.flex > div.flex-1.min-w-0 > div.flex.items-center > p.font-semibold.text-sm` — "AGRESTA ANTONIO AGRESTA" (scrollW=201 clientW=159)
- `div.flex.items-center:nth-of-type(5) > a.flex-1.flex > div.flex-1.min-w-0 > div.flex.items-center > p.font-semibold.text-sm` — "AHMED MOUSSA MOHAMED EL SAYED AHMED MOUSSA" (scrollW=385 clientW=159)

**Bottom nav / sticky bottom (0)**

_nessuna_

**Modal/Dialog aperti (0)**

_nessuno_

Screenshot: `docs/mobile-store-assets/screenshots/audit-android/06-clienti.png`

### Fatturazione (`/azienda/fatturazione`)

- Page height: **1308px**  
- Doc overflow orizzontale: **no**

**Overflow orizzontale (0)**

_nessuno_

**Touch target < 44px (0)**

_nessuno_

**Testo troncato (0)**

_nessuno_

**Bottom nav / sticky bottom (0)**

_nessuna_

**Modal/Dialog aperti (0)**

_nessuno_

Screenshot: `docs/mobile-store-assets/screenshots/audit-android/07-fatturazione.png`

