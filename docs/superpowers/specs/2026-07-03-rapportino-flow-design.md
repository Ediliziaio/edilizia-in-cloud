# Rapportino di cantiere — PDF premium, firma fine lavori, avanzamento fasi

Data: 2026-07-03 · Modulo: /campo + OrderDetail tab Campo · Stato: approvato ("tutte e 3 in sequenza")

## Contesto (stato attuale verificato)

- `campo_rapportini`: rapportino giornaliero operaio (order_id, ore, descrizione, materiali jsonb, foto_urls max 5, gps, meteo, % avanzamento, stato bozza→inviato→approvato/rifiutato, pdf_url, firma_cliente_url/nome/at e firma_operaio_url PRESENTI a schema ma NON usati dal form mobile).
- Flusso: operaio /campo (3 step o vocale AI) → invia → admin approva/rifiuta in OrderDetail tab Campo → PDF auto (basico, SENZA foto, senza logo).
- `rapportini_intervento` (ticket): ha già firma cliente canvas — pattern riusabile.
- `order_work_phases`: fasi commessa con start_date/end_date/status — base per il semaforo tempi.
- Gap notifiche: nessun avviso al responsabile su rapportino inviato.

## Fase A — PDF premium con foto (edge `genera-pdf-rapportino`)

Redesign completo stile "classic premium" (come generate-quote-pdf v94+):
- Header brand: nome azienda + contatti + barra bicolore (branding.primaryColor, fallback arancio EiC).
- Titolo dinamico: "RAPPORTINO GIORNALIERO" oppure "RAPPORTO DI FINE LAVORI" se lavoro_completato.
- Chip-box: OPERAIO | COMMESSA · DATA | ORE (+straord.) · METEO | AVANZAMENTO %.
- Descrizione lavori in box; materiali in tabella zebrata; note.
- **GALLERIA FOTO**: tutte le foto_urls embeddate (jpg/png), griglia 2 colonne, pagine aggiuntive se servono, caption numerata; skip resiliente su fetch fallito.
- Box firme: FIRMA OPERAIO | FIRMA CLIENTE (immagini se presenti, righe vuote se no).
- Footer band brand + pagina X/Y. WinAnsi-safe. Deploy via CLI supabase (già loggata).

## Fase B — Firma cliente su fine lavori (mobile)

- In CampoRapportino step riepilogo: se "lavoro completato" attivo → step firma: canvas firma CLIENTE + nome (obbligatoria per fine lavori) e canvas firma OPERAIO (opzionale sul giornaliero, presente sul fine lavori). Upload PNG su bucket campo-rapportini, salva firma_cliente_url/nome/at e firma_operaio_url.
- Riuso pattern canvas di RapportinoForm.tsx (interventi).
- Notifica (create_notification) al responsabile commessa + admin: "Rapportino di fine lavori firmato dal cliente" / "Nuovo rapportino da approvare" su ogni invio.
- Il PDF fine lavori (Fase A) mostra le firme reali.

## Fase C — Dichiarazione per fasi + semaforo tempi

- Nel rapportino l'operaio spunta le fasi (`order_work_phases`) su cui ha lavorato con % per fase (chips + slider, niente testo obbligatorio). Persistenza: `campo_rapportini.fasi_lavorate jsonb` [{phase_id, percentuale}] + al salvataggio aggiorna order_work_phases.status/percentuale (colonna nuova `percentuale INTEGER DEFAULT 0`).
- Funzione `order_schedule_health(order_id)`: per ogni fase con date, avanzamento atteso a oggi (interpolazione lineare start→end) vs reale → stato commessa: in_anticipo | in_linea | in_ritardo (+ giorni stimati di scarto sulla fase peggiore).
- Badge semaforo in OrderDetail (top + tab Cantiere) e nella lista rapportini; alert in regia se in ritardo.

## Vincoli

Additivo, zero regressioni sul flusso esistente; migrazioni additive; UI italiana; verify E2E in preview su Demo Azienda; commit locali, push solo con ok esplicito.
