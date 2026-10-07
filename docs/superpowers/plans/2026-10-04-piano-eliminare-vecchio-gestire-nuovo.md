# Disegno automatico serramenti — piano per eliminare il vecchio e gestire il nuovo

Data: 04/10/2026. Stato: tutto locale (non committato, non pushato). Migration già applicate sul DB live (colonne nullable, nessun effetto sui dati esistenti).

## 1. Risultati della simulazione in Demo Azienda 2

| Prova | Esito |
|---|---|
| Articoli con disegno | 232 (da 214), 1.160 prove (5 misure ciascuno), **0 errori** |
| Aperture | 90 codici apertura disegnati correttamente (battente/anta-ribalta/scorrevoli/libro) |
| Colori | 261 colori (Salamander 43 + RAL + legni + PVC) risolti, nessun grigio di ripiego |
| Prestazioni | preventivo da 40 righe: PDF ≈ 0,9 s, ≈ 7 MB |
| Flusso completo | picker → riga → config congelata → PDF live → Allegato tecnico: ok |
| Test automatici | 98 passano (disegno, estensioni, tipologiaDaNome, riga «nessuno»). Falliscono solo 3 test/lint **già rotti prima** (fotovoltaico PDF, serramentiLocalModules, 3 `set-state-in-effect`) |

**Problema scoperto:** i preventivi già consegnati (`da_consegnare`) leggono la foto dell'articolo «dal vivo». Se togliamo la foto o assegniamo un tipo di disegno, cambiano retroattivamente. È già successo in Demo 2 (articolo «Costruzione 3 IT — Porta balcone 1 anta»). Il piano parte da qui.

## 2. Inventario del «vecchio»

- **Aziende reali con listino serramenti:** Infissi e Living (il grosso), Renova (4 articoli / 8 righe in un preventivo `da_consegnare`), Ser Style (solo bozze), Best Infissi (nessun preventivo), Demo Azienda (1 consegnato), Demo 2.
- **Dati:** articoli con foto e senza `disegno_tipologia`; 48 `article_family_templates` con foto e senza tipo; foto in `custom_field_values`.
- **File:** 4,2 MB di asset statici in `public/templates/serramenti`; `docs/serramenti-disegni/` + `.zip` (obsoleti); `PhotoTemplatePicker` e percorsi codice che leggono la foto.
- **Da NON toccare:** porte blindate/interne, tapparelle, zanzariere, cassonetti → restano a foto per scelta del founder.

## 3. Principi

1. Mai cambiare un preventivo già consegnato.
2. Tutto reversibile: le foto non si cancellano, si mettono da parte (`custom_field_values._immagine_precedente`) e si ripristinano.
3. Un'azienda alla volta, con anteprima (dry-run) prima di scrivere.
4. Scritture DB a piccoli lotti (il DB è un'istanza micro).
5. Prima del lavoro su un'azienda: export di backup del suo listino.
6. Nessun push/deploy senza OK esplicito.
7. «Meglio nessun disegno che uno sbagliato»: ciò che non si riconosce resta a foto.

## 4. Governo del «nuovo»

- Unica fonte dei tipi: `TIPOLOGIE_DISEGNO` + `assiDisegno.ts` (aperture) + campo «Tipo di disegno» sull'articolo (incluso «Personalizzata»).
- Ogni nuovo tipo = preset + test in `disegnoEstensioni.test.ts` + voce nel riconoscimento da nome.
- I template (`article_family_templates`) portano `disegno_tipologia`, così ogni azienda nuova nasce già col disegno.
- Il disegno si congela nella riga (`sr_serramenti_progetto.disegno_config`): il PDF non dipende più dall'articolo.
- **Fatto oggi:** `disegno_config.nessuno = true` = riga congelata *senza* disegno (usa la foto). Il motore (`disegnoDaConfig`) e `StepBom` lo rispettano; test incluso.

## 5. Fasi

> **Stato 04/10:** Fase A ✅ (18 righe di preventivi non-bozza congelate con `nessuno`; foto dell'articolo di Demo 2 ripristinata). Fase B ✅ (bottone «Disegni» nel listino, solo admin e aziende con serramenti: `AssegnaDisegniDialog` + `assegnaDisegniDaNomi.ts`; provato in Demo 2 con applica e annulla). Prossimo: Fase C, Best Infissi.

**A — Proteggere i consegnati** *(prima di tutto, piccola)*
Per ogni riga di preventivo non-bozza con articolo che sta per cambiare: scrivere `disegno_config = {v:1, tipologia:…, nessuno:true}` (o, a scelta del founder, il disegno vero congelato). Dopo A le foto sugli articoli usati da preventivi non-bozza non vengono più toccate. Rimedio per Demo 2: stesso trattamento.

**B — Strumento admin «Assegna tipi di disegno dai nomi»**
Usa `tipologiaDaNome` (già scritto e testato su tutti i nomi reali). Schermata: dry-run con tabella (articolo → tipo proposto / non riconosciuto), spunta per riga, applica, report, annulla. Mai sovrascrive un tipo già impostato a mano.

**C — Rollout per azienda** (ordine, dal meno rischioso)
1. Best Infissi (nessun preventivo).
2. Ser Style (solo bozze).
3. Infissi e Living: replicare Demo 2 (linee, vetri, aperture, monoblocchi, sagome).
4. Renova (ha un consegnato → solo dopo A).
Per ognuna: backup → dry-run → applica → controllo visivo + PDF → OK del titolare.

**D — Pulizia dati**
Foto messe da parte, articoli vecchi disattivati in soft-delete (cestino 30 gg), asset statici rimossi **solo con zero riferimenti**, template aggiornati.

**E — Pulizia codice**
Rimuovere percorsi foto per gli articoli disegnabili, `PhotoTemplatePicker` (se inutilizzato), `docs/serramenti-disegni*`, asset statici, i 2 valori legacy «Apertura a destra/sinistra» dopo che nessuna riga li usa.

**F — PDF standard `quotes`** (edge pdf-lib, bot WhatsApp)
Oggi senza disegni. Decidere se portarli (rasterizzazione lato edge) o lasciare la foto.

**G — Interruttore per azienda**
Chiave feature via `resolve_company_feature` (default: attivo solo per Demo 2 e per le aziende già migrate), così si spegne il disegno in un'azienda senza deploy.

## 6. Rischi

| Rischio | Mitigazione |
|---|---|
| Consegnati che cambiano | Fase A + marker `nessuno` |
| Riconoscimento errato dal nome | dry-run, spunte per riga, annulla |
| DB micro bloccato da scritture grosse | lotti piccoli, niente DO block multi-tabella |
| Tipo non previsto dal produttore | «Personalizzata» + limiti per produttore da definire |
| Prezzi/maggiorazioni | restano a 0 come deciso; nessun tocco ai prezzi |
| Migration backlog (362 non applicate) | mai `supabase db push`; solo `execute_sql` |

## 7. Checklist QA per azienda

- [ ] Backup export fatto
- [ ] Dry-run rivisto (nessun «non riconosciuto» importante)
- [ ] Preventivi non-bozza invariati (PDF prima/dopo identico)
- [ ] Un preventivo di prova per tipologia principale (1/2/3 ante, porta finestra, scorrevole, persiana)
- [ ] Colori e vetro corretti nel PDF
- [ ] Persiane «da dentro», apertura dx/sx coerente
- [ ] Porte/tapparelle/zanzariere/cassonetti ancora a foto
- [ ] OK del titolare

## 8. Decisioni

**Prese il 04/10:**
- Interpretazioni dei tipi (Slide, Slide Plus, Smart Slide, alzante a scomparsa, traslanti, su parete, libro, finestra scorrevole 2 ante, scorri-ribalta patio): **confermate corrette**.
- Limiti per produttore: **dopo** il rollout.

**Ancora aperte:** punti 1, 3, 5, 6, 7 qui sotto.

### Elenco originale

1. **Consegnati:** tengono la foto (consigliato, è «com'era») o ricevono il disegno?
2. Conferma delle interpretazioni: Slide / Slide Plus / Smart Slide, alzante a scomparsa, traslanti con fisso nel telaio/nell'anta, su parete, libro, finestra scorrevole 2 ante, scorri-ribalta patio.
3. Prezzi/maggiorazioni: confermi che restano a 0 anche fuori Demo?
4. Limiti per produttore (misure minime/massime): da inserire ora o dopo?
5. Interruttore per azienda: attivo di default per tutti o solo migrati?
6. PDF standard `quotes`: con disegni o con foto?
7. Primo passo: Fase A + B subito?

## 9. Renova (05/10/2026) — eseguito
Piano: (1) i preventivi consegnati erano già congelati (`disegno_config.nessuno`, 14 righe); (2) modelli presi dalla variante Linea
che avevano (PVC Salamander 76, PVC Aluplast Ideal 5000); (3) installazione dal modello «Infissi con disegno automatico»
(42→40 tipologie per linea senza i vecchi monoblocchi, con la scelta «Con monoblocco») + persiane (62); (4) prezzi al mq copiati
sui prodotti con lo stesso nome (23 per linea; le tipologie nuove restano a zero, prezzo a mano); (5) vecchi non usati nel cestino
(`_archiviato_pulizia_disegni` = 2026-10-05), i 6 usati dai preventivi spenti.
Esito: 2 linee × 40 serramenti col disegno + persiane lamelle fisse/orientabili × 31; nessuna riga di preventivo modificata.
