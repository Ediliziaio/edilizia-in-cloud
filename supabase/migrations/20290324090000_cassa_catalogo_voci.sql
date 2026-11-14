-- Categorie di cassa: un catalogo solo, per azienda, collegato ai movimenti (14/11/2026)
--
-- COSA C'ERA
-- ----------
-- Cinque sistemi di categorie che non si parlavano:
--  1. `bank_transactions.category` e `prima_nota_entries.category`: testo libero.
--     In Demo Azienda 2: 31 valori diversi per la stessa cosa («materiali»,
--     «Materiali e forniture», «merci»…) e 781 movimenti su 1.563 in «altro».
--  2. `treasury_categories`: area/genitore/nome, 28 righe in 2 aziende, ogni
--     seme inserito DUE volte, nessuna schermata che la usi. Morta.
--  3. `VOCI_CASSA` scritto nel codice (src/lib/controlloGestione/vociCassa.ts):
--     le righe del rendiconto di cassa, uguali per tutti, non configurabili.
--  4. `cg_classificazione_voci`: la classificazione ECONOMICA (CE riclassificato).
--     Valida, resta: è competenza, non cassa.
--  5. `bank_categorization_rules`: regole sul testo libero, 1 riga in tutto.
--
-- E due difetti misurati:
--  - la categoria scelta nel popup del movimento (`bank_movimento_note`) scrive
--    solo `bank_transactions.category`; il cash flow legge la prima nota, quindi
--    riclassificare un movimento non cambiava il cash flow;
--  - il cash flow consuntivo legge solo la prima nota: un movimento bancario non
--    ancora registrato spariva (Demo 2: 27 movimenti, ~101.000 €; Demo 1: 157,
--    ~118.000 €). Questo si corregge nel codice del rendiconto, con la funzione
--    `cassa_rendiconto_banca` qui sotto.
--
-- COSA FA QUESTA MIGRAZIONE
-- -------------------------
--  - `cassa_catalogo_base`: le 330 voci del file «Catalogo voci controllo
--    gestione», con significato, esempio, verso e la riga del rendiconto in cui
--    finiscono (entrata e uscita separate: giroconti e differenze cambio vanno
--    nei due versi). Corretto un errore del file: «12.12 Rimborsi fiscali
--    ricevuti» era un'uscita, è un'entrata. Attive di partenza 281: restano
--    spente le voci senza cassa (ammortamenti, ratei, ritenute subite…: su un movimento bancario
--    non hanno senso), quelle infragruppo, il cash pooling e le tre «fasi»
--    (SAL, saldo, svincolo: sono la fase di un incasso, non la sua natura).
--  - `cassa_voci`: la copia dell'azienda (area → categoria → voce → sottovoce),
--    con codice stabile, nome modificabile, attiva/archiviata. Si crea alla
--    prima apertura con `cassa_catalogo_prepara`, idempotente: rilanciarla non
--    duplica niente e non tocca ciò che l'azienda ha cambiato.
--  - Sul movimento: `cassa_voce_id` + origine (manuale, regola, documento,
--    controparte, proposta), chi e quando. Le voci usate non si cancellano
--    (FK RESTRICT): si archiviano.
--  - `cassa_voce_storico`: ogni cambio di categoria di un movimento, con autore,
--    data, origine e motivo.
--  - La vecchia categoria testuale NON viene riscritta: `cassa_voci_movimenti`
--    ne ricava una PROPOSTA (origine «storico»), mostrata come tale e mai
--    trattata come classificazione confermata.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Catalogo base (uguale per tutti, sola lettura) ─────────────────────────
create table if not exists public.cassa_catalogo_base (
  codice text primary key,
  area text not null,
  categoria text not null,
  voce text not null,
  descrizione text,
  esempio text,
  flusso text not null check (flusso in ('entrata', 'uscita', 'entrambi', 'nessuno')),
  trattamento_economico text,
  attenzioni text,
  tipo_utilizzo text,
  sezione text not null,
  voce_cassa_in text,
  voce_cassa_out text,
  attiva_di_partenza boolean not null default true,
  ordine integer not null
);
alter table public.cassa_catalogo_base enable row level security;
-- Ogni oggetto si crea solo se manca, così la migrazione
-- resta rilanciabile senza togliere niente a nessuno.
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cassa_catalogo_base' and policyname = 'Catalogo base leggibile') then
    create policy "Catalogo base leggibile" on public.cassa_catalogo_base for select to authenticated using (true);
  end if;
end $p$;
revoke all on public.cassa_catalogo_base from anon;
grant select on public.cassa_catalogo_base to authenticated;

-- Le descrizioni del file seguono un modello per categoria («Acquisto di {v}…»):
-- qui il modello una volta sola e le eccezioni dove il testo è diverso. Il
-- risultato sono le stesse 330 righe del file: confrontato con la versione
-- riga per riga (stesso md5 su tutte le colonne).
insert into public.cassa_catalogo_base
  (codice, area, categoria, voce, descrizione, esempio, flusso, trattamento_economico, attenzioni, tipo_utilizzo,
   sezione, voce_cassa_in, voce_cassa_out, attiva_di_partenza, ordine)
with categorie (pre, area, categoria, descrizione, esempio, trattamento, attenzioni, tipo, sezione) as (values
('01','Operativa','Incassi clienti','Corrispettivi relativi a {v}, da collegare a documento e prestazione.','Incasso cliente riferito a {v}.','Ricavo per competenza, non al pagamento','SAL, rate e saldi sono modalità/fasi di incasso: classificare una sola volta il movimento per voce; dettagliare la fase in un campo distinto.','Voce di classificazione','operativa'),
('02','Operativa','Anticipi e rettifiche clienti','Restituzione al cliente di somme precedentemente ricevute: {v}.','Bonifico al cliente riferito a {v}.','Da collegare al documento e alla competenza','Acconti e caparre non diventano automaticamente ricavi. Rimborsi e restituzioni: uscita.','Voce di classificazione','operativa'),
('03','Operativa','Altri incassi','Somma ricevuta per {v}, distinta dai corrispettivi ordinari dei clienti.','Accredito documentato per {v}.','Da qualificare','Contributi in conto impianti nella sezione investimenti; crediti fiscali in compensazione non sono incassi bancari.','Voce di classificazione','operativa'),
('04','Operativa','Materiali e merci','Acquisto o approvvigionamento di {v} per l’attività aziendale.','Fattura fornitore relativa a {v}.','Costo/consumo per competenza','Acquisti e consumi sono distinti: considerare variazioni magazzino; resi/abbuoni rettificano il costo.','Voce di classificazione','operativa'),
('05','Operativa','Lavorazioni e servizi diretti','Servizio o lavorazione di {v} sostenuto per realizzare una commessa.','Documento del fornitore per {v} sul cantiere.','Costo diretto','Collegare documento, periodo e controparte; evitare registrazioni duplicate.','Voce di classificazione','operativa'),
('06','Operativa','Personale','Componente del trattamento del personale o degli amministratori: {v}.','Cedolino, distinta o documento che dettaglia {v}.','Costo personale per competenza','In cassa separare netto, contributi e ritenute; nel conto economico usare costo lordo + oneri azienda, evitando di aggiungere nuovamente le trattenute. Anticipi non duplicano il saldo.','Voce di classificazione','operativa'),
('07','Operativa','Soci e amministratori: compensi','Componente del trattamento del personale o degli amministratori: {v}.','Cedolino, distinta o documento che dettaglia {v}.','Costo per competenza se pertinente','Non confondere con dividendi, prestiti soci o restituzioni di capitale.','Voce di classificazione','operativa'),
('08','Operativa','Immobili e struttura','Oneri o proventi relativi a {v}, da attribuire al periodo e al centro responsabile.','Documento o movimento specifico per {v}.','Costo per competenza','Collegare documento, periodo e controparte; evitare registrazioni duplicate.','Voce di classificazione','operativa'),
('09','Operativa','Mezzi e logistica','Oneri o proventi relativi a {v}, da attribuire al periodo e al centro responsabile.','Documento o movimento specifico per {v}.','Costo diretto o generale','Acquisto mezzi negli investimenti. Leasing finanziario distinto dal noleggio operativo.','Voce di classificazione','operativa'),
('10','Operativa','Marketing e vendite','Oneri o proventi relativi a {v}, da attribuire al periodo e al centro responsabile.','Documento o movimento specifico per {v}.','Costo commerciale','Sviluppi durevoli capitalizzati negli investimenti, se previsti dal modello aziendale.','Voce di classificazione','operativa'),
('11','Operativa','Consulenze e servizi generali','Oneri o proventi relativi a {v}, da attribuire al periodo e al centro responsabile.','Documento o movimento specifico per {v}.','Costo generale','Collegare documento, periodo e controparte; evitare registrazioni duplicate.','Voce di classificazione','operativa'),
('12','Operativa','Tributi e versamenti','Movimento relativo a {v}; distinguere pagamento, credito e competenza.','Distinta fiscale o documento che identifica {v}.','Distinguere imposte, debiti e crediti','F24 è un contenitore, non una categoria: suddividere per tributo/contributo. Ritenute subite: credito fiscale, non costo aggiuntivo. Compensazioni senza cassa escluse dai flussi.','Voce di classificazione','operativa'),
('13','Finanziaria','Oneri e proventi finanziari','Oneri o proventi relativi a {v}, da attribuire al periodo e al centro responsabile.','Documento o movimento specifico per {v}.','Provento/onere finanziario','Interessi separati dalla quota capitale. Politica di collocazione nel cash flow configurabile e coerente.','Voce di classificazione','finanziaria'),
('14','Investimenti','Acquisti durevoli','Impiego di risorse per {v}, con utilità su più periodi.','Pagamento al fornitore per {v}.','Patrimoniale; ammortamento nel CE','Non registrare tutto il pagamento come costo operativo e poi anche gli ammortamenti.','Voce di classificazione','investimenti'),
('15','Investimenti','Disinvestimenti e contributi','Somme ricevute per {v}; distinguere il flusso dal risultato economico.','Accredito riferito a {v}.','Patrimoniale; eventuale plus/minusvalenza nel CE','Incasso vendita cespite distinto da plus/minusvalenza.','Voce di classificazione','investimenti'),
('16','Finanziamenti','Banche e intermediari','Liquidità ottenuta tramite {v}, con rilevazione del rapporto finanziario.','Accredito del finanziatore per {v}.','Debito, non ricavo','Non duplicare anticipo e successivo incasso; distinguere utilizzo fido da disponibilità non utilizzata.','Voce di classificazione','finanziamenti'),
('17','Finanziamenti','Rimborsi capitale','Restituzione del capitale del debito: {v}.','Rata di 1.000 euro: 850 capitale qui, 150 interessi nella voce interessi.','Riduzione debito, non costo','Rate miste da suddividere tra capitale, interessi e spese.','Voce di classificazione','finanziamenti'),
('18','Finanziamenti','Leasing finanziario','Pagamento iniziale maggiorato del contratto di leasing.','Versamento iniziale alla società di leasing.','Secondo politica contabile e gestionale','Interessi in 13. Evitare duplicazione canone intero e sue componenti. Il trattamento economico va configurato.','Voce di classificazione','finanziamenti'),
('19','Finanziamenti','Capitale e soci','Movimento tra azienda e soci o titolare per {v}.','Versamento o pagamento con causale {v}.','Patrimoniale, non operativo','Definire verso per singola voce. Compensi amministratori nella gestione.','Voce di classificazione','finanziamenti'),
('20','Patrimoniale','Depositi e cauzioni','Somma vincolata o restituita nell’ambito di {v}.','Movimento contrattualmente riferito a {v}.','Credito/debito, non costo/ricavo','Collocazione cash flow configurata per natura; evidenziare liquidità vincolata separatamente.','Voce di classificazione','patrimoniale'),
('21','Trasferimenti interni','Giroconti','Spostamento di denaro: {v}, tra disponibilità della medesima azienda.','Trasferimento di 1.000 euro con due movimenti collegati.','Esclusi dal CE','Due movimenti collegati con ID trasferimento; effetto netto zero nel consolidato dei conti aziendali. Pagamento carta distinto dal regolamento del saldo.','Trasferimento interno','trasferimenti'),
('22','Solo economico','Assestamenti senza cassa','Rilevazione di competenza senza autonomo movimento di denaro: {v}.','Assestamento di periodo relativo a {v}.','Rettifica per competenza','Non generano movimenti bancari. Acconti, fatture, SAL e lavori in corso devono essere raccordati senza duplicare i ricavi.','Assestamento / competenza','senza_cassa'),
('23','Da classificare','Movimenti sospesi','Voce temporanea per {v}, in attesa di identificazione.','Movimento importato da assegnare a documento e categoria.','Da verificare','Non usare come destinazione definitiva; richiedere responsabile, motivazione e scadenza verifica.','Voce di classificazione','da_classificare'),
('24','Operativa','Anticipi fornitori','Somme pagate prima della consegna dei materiali.','Anticipo di 2.000 euro al fornitore serramenti.','Anticipo patrimoniale fino a imputazione','Collegare al documento e alla commessa quando disponibile.','Voce di classificazione','operativa'),
('25','Operativa','Restituzioni anticipi','Recupero di un anticipo pagato per una fornitura annullata.','Fornitore restituisce 2.000 euro di anticipo.','Riduzione credito verso fornitore','Non è un nuovo ricavo.','Voce di classificazione','operativa'),
('26','Operativa','Garanzie e gare','Pagamento della parte di compenso precedentemente trattenuta a garanzia.','Svincolo di 1.000 euro dopo collaudo.','Costo o regolamento debito secondo natura','Collegare al documento e alla commessa quando disponibile.','Voce di classificazione','operativa'),
('27','Operativa','Attrezzature e trasferte','Interventi per mantenere efficienti utensili e attrezzature.','Manutenzione del compressore.','Costo per competenza','Collegare al documento e alla commessa quando disponibile.','Voce di classificazione','operativa'),
('28','Solo economico','Personale di competenza','Retribuzioni maturate prima di trattenute fiscali e contributive.','Costo lordo del personale del mese.','Costo o assestamento per competenza','Collegare al documento e alla commessa quando disponibile.','Assestamento / competenza','senza_cassa'),
('29','Operativa','Uscite per personale e danni','Somme effettivamente pagate per accordi di cessazione.','Pagamento dell’incentivo concordato.','Costo o regolamento debito','Collegare al documento e alla commessa quando disponibile.','Voce di classificazione','operativa'),
('30','Solo economico','Rettifiche commerciali e magazzino','Riduzioni del prezzo di vendita riconosciute al cliente.','Abbuono di 100 euro sul saldo.','Rettifica economica o patrimoniale','Collegare al documento e alla commessa quando disponibile.','Assestamento / competenza','senza_cassa'),
('31','Operativa','Pagamenti e insoluti','Spese addebitate per mancato buon fine di un incasso.','Commissione su ricevuta bancaria insoluta.','Costo per competenza','Collegare al documento e alla commessa quando disponibile.','Voce di classificazione','operativa'),
('32','Operativa','Storni incassi','Ri addebito di un incasso precedentemente accreditato e poi risultato insoluto.','La banca riaddebita una ricevuta da 2.000 euro.','Riapertura credito o rettifica da verificare','Riaprire il credito; non creare automaticamente un nuovo costo.','Voce di classificazione','operativa'),
('33','Investimenti','Crediti fiscali: acquisti','Pagamento per acquisire un credito fiscale da terzi.','Acquisto di un credito nominale a prezzo concordato.','Credito patrimoniale','Tenere distinti valore nominale, prezzo pagato e utilizzo.','Voce di classificazione','investimenti'),
('34','Operativa','Crediti fiscali: cessioni','Denaro ricevuto cedendo un credito fiscale.','Accredito del corrispettivo della cessione.','Realizzo credito; differenza da qualificare','Non registrare l’intero incasso come nuovo ricavo di commessa.','Voce di classificazione','operativa'),
('35','Finanziaria','Oneri cessione crediti','Commissioni e costi specifici per trasferire un credito.','Commissione contrattuale della cessione.','Onere da classificare secondo natura','La differenza tra nominale e prezzo va raccordata separatamente.','Voce di classificazione','finanziaria'),
('36','Solo patrimoniale','Compensazioni senza cassa','Estinzione di debiti usando un credito anziché denaro.','Credito fiscale utilizzato in un F24.','Riduzione crediti e debiti','Solo l’eventuale saldo effettivamente addebitato è uscita bancaria.','Voce di classificazione','senza_cassa'),
('37','Investimenti','Finanziamenti concessi','Denaro prestato a un’altra società del gruppo.','Prestito dalla capogruppo alla controllata.','Credito finanziario','Non è giroconto tra conti della stessa azienda.','Voce di classificazione','investimenti'),
('38','Investimenti','Rimborsi prestiti concessi','Restituzione del capitale prestato a una società del gruppo.','Controllata restituisce parte del prestito.','Riduzione credito finanziario','Collegare al documento e alla commessa quando disponibile.','Voce di classificazione','investimenti'),
('39','Finanziamenti','Finanziamenti infragruppo ricevuti','Finanziamenti ricevuti da altre società del gruppo.','Controllata riceve un prestito dalla capogruppo.','Debito finanziario','Collegare al documento e alla commessa quando disponibile.','Voce di classificazione','finanziamenti'),
('40','Finanziamenti','Rimborsi infragruppo','Restituzione del capitale ricevuto da società del gruppo.','Restituzione di una rata del prestito infragruppo.','Riduzione debito finanziario','Collegare al documento e alla commessa quando disponibile.','Voce di classificazione','finanziamenti'),
('41','Finanziaria','Interessi infragruppo attivi','Compenso maturato sul denaro prestato a società del gruppo.','Incasso interessi sul prestito alla controllata.','Provento finanziario','Collegare al documento e alla commessa quando disponibile.','Voce di classificazione','finanziaria'),
('42','Finanziaria','Interessi infragruppo passivi','Costo del denaro ricevuto da società del gruppo.','Pagamento interessi alla capogruppo.','Onere finanziario','Collegare al documento e alla commessa quando disponibile.','Voce di classificazione','finanziaria'),
('43','Da configurare','Cash pooling','Trasferimento di liquidità al soggetto che gestisce la tesoreria accentrata.','Controllata trasferisce liquidità alla società tesoriera.','Credito o debito verso gestore pool','Uscita per la singola società; eliminare nel consolidato del gruppo se interno.','Voce di classificazione','da_configurare'),
('44','Investimenti','Investimenti in corso','Pagamenti prima della consegna di beni durevoli.','Acconto per acquisto autocarro.','Anticipo o immobilizzazione in corso','Scalare l’acconto dal saldo, senza duplicare l’investimento.','Voce di classificazione','investimenti')
), voci (codice, voce, flusso, vin, vout, attiva, ordine, descrizione, esempio, trattamento, attenzioni, tipo) as (values
('01.01','Vendita prodotti e materiali','entrata','inc_clienti',null,true,1,null,null,null,null,null),
('01.02','Fornitura serramenti','entrata','inc_clienti',null,true,2,null,null,null,null,null),
('01.03','Posa e installazione','entrata','inc_clienti',null,true,3,null,null,null,null,null),
('01.04','Lavori edili e ristrutturazioni','entrata','inc_clienti',null,true,4,null,null,null,null,null),
('01.05','Impianti e fotovoltaico','entrata','inc_clienti',null,true,5,null,null,null,null,null),
('01.06','Manutenzioni ordinarie','entrata','inc_clienti',null,true,6,null,null,null,null,null),
('01.07','Manutenzioni straordinarie','entrata','inc_clienti',null,true,7,null,null,null,null,null),
('01.08','Assistenza e riparazioni','entrata','inc_clienti',null,true,8,null,null,null,null,null),
('01.09','Progettazione e servizi tecnici','entrata','inc_clienti',null,true,9,null,null,null,null,null),
('01.10','Consulenze e servizi','entrata','inc_clienti',null,true,10,null,null,null,null,null),
('01.11','Canoni e abbonamenti','entrata','inc_clienti',null,true,11,null,null,null,null,null),
('01.12','Noleggi attivi','entrata','inc_clienti',null,true,12,null,null,null,null,null),
('01.13','SAL incassati','entrata','inc_clienti',null,false,13,'Incassi relativi a stati di avanzamento lavori: indicano la fase della commessa.','Pagamento del secondo SAL di un cantiere.',null,'Usare come fase del pagamento insieme alla natura della vendita; non sommare la fase alla categoria ricavo.','Fase incasso: campo separato'),
('01.14','Saldi commesse','entrata','inc_clienti',null,false,14,'Ultimi pagamenti che chiudono il corrispettivo di una commessa.','Saldo finale dopo posa e consegna.',null,'Usare come fase del pagamento insieme alla natura della vendita; non sommare la fase alla categoria ricavo.','Fase incasso: campo separato'),
('01.15','Varianti ed extra','entrata','inc_clienti',null,true,15,null,null,null,null,null),
('01.16','Svincolo ritenute di garanzia','entrata','inc_clienti',null,false,16,'Incasso di somme trattenute dal cliente fino a collaudo o scadenza garanzia.','Cliente paga il 5% trattenuto sul SAL.',null,'Usare come fase del pagamento insieme alla natura della vendita; non sommare la fase alla categoria ricavo.','Fase incasso: campo separato'),
('02.01','Acconti clienti','entrata','inc_acconti',null,true,17,'Denaro ricevuto prima della consegna o dell’avanzamento cui si riferisce.','Cliente versa 3.000 euro alla firma.',null,null,null),
('02.02','Caparre ricevute','entrata','inc_acconti',null,true,18,'Somme ricevute a garanzia dell’impegno contrattuale.','Caparra prevista nel contratto sottoscritto.',null,null,null),
('02.03','Rimborso a cliente per nota credito','uscita',null,'usc_rimborsi_clienti',true,19,null,null,null,null,null),
('02.04','Restituzione acconti','uscita',null,'usc_rimborsi_clienti',true,20,null,null,null,null,null),
('02.05','Restituzione caparre','uscita',null,'usc_rimborsi_clienti',true,21,null,null,null,null,null),
('03.01','Contributi in conto esercizio incassati','entrata','inc_incentivi',null,true,22,null,null,null,null,null),
('03.02','Rimborsi assicurativi','entrata','inc_altri',null,true,23,null,null,null,null,null),
('03.03','Rimborsi da fornitori','entrata','inc_altri',null,true,24,null,null,null,null,null),
('03.04','Recupero spese','entrata','inc_altri',null,true,25,null,null,null,null,null),
('03.05','Indennizzi e risarcimenti','entrata','inc_altri',null,true,26,null,null,null,null,null),
('03.06','Penali incassate','entrata','inc_altri',null,true,27,null,null,null,null,null),
('03.07','Altri incassi da classificare','entrata','inc_altri',null,true,28,null,null,null,null,null),
('04.01','Materie prime','uscita',null,'usc_materiali',true,29,null,null,null,null,null),
('04.02','Materiali edili','uscita',null,'usc_materiali',true,30,null,null,null,null,null),
('04.03','Serramenti e accessori','uscita',null,'usc_materiali',true,31,null,null,null,null,null),
('04.04','Vetri e oscuranti','uscita',null,'usc_materiali',true,32,null,null,null,null,null),
('04.05','Porte e portoncini','uscita',null,'usc_materiali',true,33,null,null,null,null,null),
('04.06','Materiale elettrico','uscita',null,'usc_materiali',true,34,null,null,null,null,null),
('04.07','Materiale idraulico e termico','uscita',null,'usc_materiali',true,35,null,null,null,null,null),
('04.08','Pannelli inverter e batterie','uscita',null,'usc_materiali',true,36,null,null,null,null,null),
('04.09','Semilavorati','uscita',null,'usc_materiali',true,37,null,null,null,null,null),
('04.10','Merci per rivendita','uscita',null,'usc_materiali',true,38,null,null,null,null,null),
('04.11','Ricambi','uscita',null,'usc_materiali',true,39,null,null,null,null,null),
('04.12','Minuteria e ferramenta','uscita',null,'usc_materiali',true,40,null,null,null,null,null),
('04.13','Consumabili di cantiere','uscita',null,'usc_materiali',true,41,null,null,null,null,null),
('04.14','Imballaggi','uscita',null,'usc_materiali',true,42,null,null,null,null,null),
('04.15','Trasporti su acquisti','uscita',null,'usc_materiali',true,43,null,null,null,null,null),
('04.16','Dazi e oneri su acquisti','uscita',null,'usc_materiali',true,44,null,null,null,null,null),
('04.17','Resi e abbuoni fornitori','uscita',null,'usc_materiali',true,45,'Riduzioni di acquisti per restituzioni o abbuoni riconosciuti dal fornitore.','Nota credito per materiale restituito.',null,null,null),
('05.01','Subappalti edili','uscita',null,'usc_subappalti',true,46,null,null,null,null,null),
('05.02','Squadre di posa esterne','uscita',null,'usc_subappalti',true,47,null,null,null,null,null),
('05.03','Lavorazioni conto terzi','uscita',null,'usc_subappalti',true,48,null,null,null,null,null),
('05.04','Installatori esterni','uscita',null,'usc_subappalti',true,49,null,null,null,null,null),
('05.05','Progettazione di commessa','uscita',null,'usc_subappalti',true,50,null,null,null,null,null),
('05.06','Direzione lavori esterna','uscita',null,'usc_subappalti',true,51,null,null,null,null,null),
('05.07','Coordinamento sicurezza','uscita',null,'usc_subappalti',true,52,null,null,null,null,null),
('05.08','Collaudi e certificazioni','uscita',null,'usc_subappalti',true,53,null,null,null,null,null),
('05.09','Pratiche ENEA e pratiche tecniche','uscita',null,'usc_subappalti',true,54,null,null,null,null,null),
('05.10','Noleggio attrezzature di cantiere','uscita',null,'usc_subappalti',true,55,null,null,null,null,null),
('05.11','Noleggio ponteggi','uscita',null,'usc_subappalti',true,56,null,null,null,null,null),
('05.12','Noleggio mezzi con operatore','uscita',null,'usc_subappalti',true,57,null,null,null,null,null),
('05.13','Allestimento e smobilizzo cantiere','uscita',null,'usc_subappalti',true,58,null,null,null,null,null),
('05.14','Occupazione suolo pubblico','uscita',null,'usc_subappalti',true,59,null,null,null,null,null),
('05.15','Smaltimento rifiuti e discarica','uscita',null,'usc_subappalti',true,60,null,null,null,null,null),
('05.16','Pulizia finale cantiere','uscita',null,'usc_subappalti',true,61,null,null,null,null,null),
('05.17','Vigilanza cantiere','uscita',null,'usc_subappalti',true,62,null,null,null,null,null),
('05.18','Allacci e utenze di cantiere','uscita',null,'usc_subappalti',true,63,null,null,null,null,null),
('05.19','Trasferte specifiche di commessa','uscita',null,'usc_subappalti',true,64,null,null,null,null,null),
('05.20','Interventi in garanzia','uscita',null,'usc_subappalti',true,65,null,null,null,null,null),
('05.21','Rilavorazioni e non conformità','uscita',null,'usc_subappalti',true,66,null,null,null,null,null),
('06.01','Stipendi netti','uscita',null,'usc_personale',true,67,null,null,null,null,null),
('06.02','Straordinari netti','uscita',null,'usc_personale',true,68,null,null,null,null,null),
('06.03','Premi e incentivi netti','uscita',null,'usc_personale',true,69,null,null,null,null,null),
('06.04','Tredicesima netta','uscita',null,'usc_personale',true,70,null,null,null,null,null),
('06.05','Quattordicesima netta','uscita',null,'usc_personale',true,71,null,null,null,null,null),
('06.06','Rimborsi spese dipendenti','uscita',null,'usc_personale',true,72,null,null,null,null,null),
('06.07','Buoni pasto e welfare','uscita',null,'usc_personale',true,73,null,null,null,null,null),
('06.08','Anticipi stipendio','uscita',null,'usc_personale',true,74,null,null,null,null,null),
('06.09','Liquidazioni TFR pagate','uscita',null,'usc_personale',true,75,null,null,null,null,null),
('06.10','Versamenti fondi pensione','uscita',null,'usc_personale',true,76,null,null,null,null,null),
('06.11','Contributi a carico azienda','uscita',null,'usc_contributi',true,77,null,null,null,null,null),
('06.12','Contributi trattenuti dipendenti','uscita',null,'usc_contributi',true,78,null,null,null,null,null),
('06.13','Ritenute fiscali dipendenti','uscita',null,'usc_contributi',true,79,null,null,null,null,null),
('06.14','Premi assicurativi lavoro','uscita',null,'usc_contributi',true,80,null,null,null,null,null),
('06.15','Cassa edile e fondi di settore','uscita',null,'usc_contributi',true,81,null,null,null,null,null),
('06.16','Lavoro somministrato','uscita',null,'usc_personale',true,82,null,null,null,null,null),
('06.17','Selezione del personale','uscita',null,'usc_personale',true,83,null,null,null,null,null),
('06.18','Formazione personale','uscita',null,'usc_personale',true,84,null,null,null,null,null),
('06.19','Visite mediche','uscita',null,'usc_personale',true,85,null,null,null,null,null),
('06.20','DPI e abbigliamento lavoro','uscita',null,'usc_personale',true,86,null,null,null,null,null),
('07.01','Compensi amministratori netti','uscita',null,'usc_personale',true,87,null,null,null,null,null),
('07.02','Contributi amministratori a carico azienda','uscita',null,'usc_contributi',true,88,null,null,null,null,null),
('07.03','Trattenute e ritenute amministratori','uscita',null,'usc_contributi',true,89,null,null,null,null,null),
('07.04','Rimborsi spese amministratori','uscita',null,'usc_personale',true,90,null,null,null,null,null),
('08.01','Affitto uffici','uscita',null,'usc_generali',true,91,null,null,null,null,null),
('08.02','Affitto showroom','uscita',null,'usc_generali',true,92,null,null,null,null,null),
('08.03','Affitto magazzino','uscita',null,'usc_generali',true,93,null,null,null,null,null),
('08.04','Affitto laboratorio','uscita',null,'usc_generali',true,94,null,null,null,null,null),
('08.05','Spese condominiali','uscita',null,'usc_generali',true,95,null,null,null,null,null),
('08.06','Energia elettrica','uscita',null,'usc_generali',true,96,null,null,null,null,null),
('08.07','Gas e riscaldamento','uscita',null,'usc_generali',true,97,null,null,null,null,null),
('08.08','Acqua','uscita',null,'usc_generali',true,98,null,null,null,null,null),
('08.09','Telefonia e internet','uscita',null,'usc_generali',true,99,null,null,null,null,null),
('08.10','Pulizie','uscita',null,'usc_generali',true,100,null,null,null,null,null),
('08.11','Manutenzione locali','uscita',null,'usc_generali',true,101,null,null,null,null,null),
('08.12','Vigilanza e allarmi','uscita',null,'usc_generali',true,102,null,null,null,null,null),
('08.13','Assicurazioni immobili','uscita',null,'usc_generali',true,103,null,null,null,null,null),
('08.14','Tassa rifiuti','uscita',null,'usc_generali',true,104,null,null,null,null,null),
('08.15','Cancelleria','uscita',null,'usc_generali',true,105,null,null,null,null,null),
('08.16','Materiale ufficio','uscita',null,'usc_generali',true,106,null,null,null,null,null),
('08.17','Spese postali e corrieri','uscita',null,'usc_generali',true,107,null,null,null,null,null),
('08.18','Archivi e conservazione documenti','uscita',null,'usc_generali',true,108,null,null,null,null,null),
('09.01','Carburante','uscita',null,'usc_mezzi',true,109,null,null,null,null,null),
('09.02','Ricarica veicoli elettrici','uscita',null,'usc_mezzi',true,110,null,null,null,null,null),
('09.03','Pedaggi','uscita',null,'usc_mezzi',true,111,null,null,null,null,null),
('09.04','Parcheggi','uscita',null,'usc_mezzi',true,112,null,null,null,null,null),
('09.05','Noleggio operativo veicoli','uscita',null,'usc_mezzi',true,113,null,null,null,null,null),
('09.06','Manutenzione veicoli','uscita',null,'usc_mezzi',true,114,null,null,null,null,null),
('09.07','Riparazioni veicoli','uscita',null,'usc_mezzi',true,115,null,null,null,null,null),
('09.08','Pneumatici','uscita',null,'usc_mezzi',true,116,null,null,null,null,null),
('09.09','Assicurazioni veicoli','uscita',null,'usc_mezzi',true,117,null,null,null,null,null),
('09.10','Bolli veicoli','uscita',null,'usc_mezzi',true,118,null,null,null,null,null),
('09.11','Revisioni','uscita',null,'usc_mezzi',true,119,null,null,null,null,null),
('09.12','Trasporti e consegne','uscita',null,'usc_mezzi',true,120,null,null,null,null,null),
('09.13','Spedizioni','uscita',null,'usc_mezzi',true,121,null,null,null,null,null),
('09.14','Depositi logistici','uscita',null,'usc_mezzi',true,122,null,null,null,null,null),
('09.15','Gestione flotte','uscita',null,'usc_mezzi',true,123,null,null,null,null,null),
('10.01','Meta Ads','uscita',null,'usc_marketing',true,124,null,null,null,null,null),
('10.02','Google Ads','uscita',null,'usc_marketing',true,125,null,null,null,null,null),
('10.03','Altre campagne pubblicitarie','uscita',null,'usc_marketing',true,126,null,null,null,null,null),
('10.04','Agenzia marketing','uscita',null,'usc_marketing',true,127,null,null,null,null,null),
('10.05','Produzione foto e video','uscita',null,'usc_marketing',true,128,null,null,null,null,null),
('10.06','Grafica e copywriting','uscita',null,'usc_marketing',true,129,null,null,null,null,null),
('10.07','Sito web e landing page: gestione','uscita',null,'usc_marketing',true,130,null,null,null,null,null),
('10.08','SEO e contenuti','uscita',null,'usc_marketing',true,131,null,null,null,null,null),
('10.09','Acquisto lead','uscita',null,'usc_marketing',true,132,null,null,null,null,null),
('10.10','Portali e marketplace','uscita',null,'usc_marketing',true,133,null,null,null,null,null),
('10.11','Fiere ed eventi','uscita',null,'usc_marketing',true,134,null,null,null,null,null),
('10.12','Sponsorizzazioni','uscita',null,'usc_marketing',true,135,null,null,null,null,null),
('10.13','Materiale promozionale e stampa','uscita',null,'usc_marketing',true,136,null,null,null,null,null),
('10.14','Provvigioni agenti','uscita',null,'usc_provvigioni',true,137,null,null,null,null,null),
('10.15','Premi rete vendita','uscita',null,'usc_provvigioni',true,138,null,null,null,null,null),
('10.16','CRM commerciale','uscita',null,'usc_marketing',true,139,null,null,null,null,null),
('10.17','Telefonia commerciale','uscita',null,'usc_marketing',true,140,null,null,null,null,null),
('10.18','Trasferte commerciali','uscita',null,'usc_marketing',true,141,null,null,null,null,null),
('10.19','Omaggi e rappresentanza','uscita',null,'usc_marketing',true,142,null,null,null,null,null),
('11.01','Commercialista','uscita',null,'usc_consulenze',true,143,null,null,null,null,null),
('11.02','Consulente del lavoro','uscita',null,'usc_consulenze',true,144,null,null,null,null,null),
('11.03','Avvocato','uscita',null,'usc_consulenze',true,145,null,null,null,null,null),
('11.04','Consulenza direzionale','uscita',null,'usc_consulenze',true,146,null,null,null,null,null),
('11.05','Consulenza informatica','uscita',null,'usc_consulenze',true,147,null,null,null,null,null),
('11.06','Consulenza qualità e sicurezza','uscita',null,'usc_consulenze',true,148,null,null,null,null,null),
('11.07','Revisione e organi di controllo','uscita',null,'usc_consulenze',true,149,null,null,null,null,null),
('11.08','Assicurazione responsabilità civile','uscita',null,'usc_generali',true,150,null,null,null,null,null),
('11.09','Assicurazione crediti','uscita',null,'usc_generali',true,151,null,null,null,null,null),
('11.10','Quote associative','uscita',null,'usc_generali',true,152,null,null,null,null,null),
('11.11','Diritti camerali','uscita',null,'usc_generali',true,153,null,null,null,null,null),
('11.12','Certificazioni e rinnovi','uscita',null,'usc_generali',true,154,null,null,null,null,null),
('11.13','Abbonamenti software SaaS','uscita',null,'usc_generali',true,155,null,null,null,null,null),
('11.14','Hosting domini e cloud','uscita',null,'usc_generali',true,156,null,null,null,null,null),
('11.15','Servizi AI e API','uscita',null,'usc_generali',true,157,null,null,null,null,null),
('11.16','Cybersecurity','uscita',null,'usc_generali',true,158,null,null,null,null,null),
('11.17','Assistenza hardware','uscita',null,'usc_generali',true,159,null,null,null,null,null),
('11.18','Spese notarili correnti','uscita',null,'usc_consulenze',true,160,null,null,null,null,null),
('11.19','Recupero crediti','uscita',null,'usc_generali',true,161,null,null,null,null,null),
('11.20','Altri servizi generali','uscita',null,'usc_generali',true,162,null,null,null,null,null),
('12.01','IVA versata','uscita',null,'usc_iva',true,163,null,null,null,null,null),
('12.02','Rimborso IVA ricevuto','entrata','inc_fiscali',null,true,164,null,null,null,null,null),
('12.03','Imposte redditi: acconti','uscita',null,'usc_contributi',true,165,null,null,null,null,null),
('12.04','Imposte redditi: saldi','uscita',null,'usc_contributi',true,166,null,null,null,null,null),
('12.05','IRAP: acconti','uscita',null,'usc_contributi',true,167,null,null,null,null,null),
('12.06','IRAP: saldi','uscita',null,'usc_contributi',true,168,null,null,null,null,null),
('12.07','Tributi immobiliari','uscita',null,'usc_contributi',true,169,null,null,null,null,null),
('12.08','Imposta di registro','uscita',null,'usc_contributi',true,170,null,null,null,null,null),
('12.09','Bolli e altre imposte indirette','uscita',null,'usc_contributi',true,171,null,null,null,null,null),
('12.10','Ritenute autonomi versate','uscita',null,'usc_contributi',true,172,null,null,null,null,null),
('12.11','Ritenute subite sugli incassi','nessuno',null,null,false,173,'Parte del corrispettivo trattenuta dal soggetto pagatore come anticipo fiscale.','Accredito netto inferiore al lordo per la ritenuta.',null,'Trattenuta senza autonoma uscita bancaria: separare credito fiscale e accredito netto.',null),
('12.12','Rimborsi fiscali ricevuti','entrata','inc_fiscali',null,true,174,null,null,null,null,null),
('12.13','Sanzioni','uscita',null,'usc_contributi',true,175,null,null,null,null,null),
('12.14','Interessi su debiti tributari','uscita',null,'usc_contributi',true,176,null,null,null,null,null),
('12.15','Rate debiti tributari: quota tributo','uscita',null,'usc_contributi',true,177,null,null,null,null,null),
('12.16','Rate debiti tributari: interessi e sanzioni','uscita',null,'usc_contributi',true,178,null,null,null,null,null),
('13.01','Interessi passivi mutui','uscita',null,'fin_mutui_interessi',true,179,null,null,null,null,null),
('13.02','Interessi passivi prestiti','uscita',null,'fin_mutui_interessi',true,180,null,null,null,null,null),
('13.03','Interessi su fidi e scoperti','uscita',null,'fin_mutui_interessi',true,181,null,null,null,null,null),
('13.04','Interessi leasing','uscita',null,'fin_mutui_interessi',true,182,null,null,null,null,null),
('13.05','Interessi factoring','uscita',null,'fin_mutui_interessi',true,183,null,null,null,null,null),
('13.06','Commissioni disponibilità fondi','uscita',null,'usc_banca',true,184,null,null,null,null,null),
('13.07','Commissioni POS','uscita',null,'usc_banca',true,185,null,null,null,null,null),
('13.08','Commissioni incasso e bonifico','uscita',null,'usc_banca',true,186,null,null,null,null,null),
('13.09','Spese tenuta conto','uscita',null,'usc_banca',true,187,null,null,null,null,null),
('13.10','Costi garanzie e fideiussioni','uscita',null,'usc_banca',true,188,null,null,null,null,null),
('13.11','Interessi attivi bancari','entrata','fin_interessi_attivi',null,true,189,null,null,null,null,null),
('13.12','Interessi attivi finanziamenti','entrata','fin_interessi_attivi',null,true,190,null,null,null,null,null),
('13.13','Differenze cambio realizzate','entrambi','inc_altri','usc_banca',true,191,null,null,null,null,null),
('14.01','Acquisto terreni','uscita',null,'inv_cespiti',true,192,null,null,null,null,null),
('14.02','Acquisto fabbricati','uscita',null,'inv_cespiti',true,193,null,null,null,null,null),
('14.03','Ristrutturazioni capitalizzate','uscita',null,'inv_cespiti',true,194,null,null,null,null,null),
('14.04','Acquisto impianti','uscita',null,'inv_cespiti',true,195,null,null,null,null,null),
('14.05','Acquisto macchinari','uscita',null,'inv_cespiti',true,196,null,null,null,null,null),
('14.06','Acquisto attrezzature','uscita',null,'inv_cespiti',true,197,null,null,null,null,null),
('14.07','Acquisto autocarri','uscita',null,'inv_cespiti',true,198,null,null,null,null,null),
('14.08','Acquisto autovetture','uscita',null,'inv_cespiti',true,199,null,null,null,null,null),
('14.09','Acquisto arredi showroom e uffici','uscita',null,'inv_cespiti',true,200,null,null,null,null,null),
('14.10','Acquisto computer e hardware','uscita',null,'inv_cespiti',true,201,null,null,null,null,null),
('14.11','Software capitalizzato','uscita',null,'inv_cespiti',true,202,null,null,null,null,null),
('14.12','Sviluppo prodotto capitalizzato','uscita',null,'inv_cespiti',true,203,null,null,null,null,null),
('14.13','Brevetti e marchi capitalizzati','uscita',null,'inv_cespiti',true,204,null,null,null,null,null),
('14.14','Acquisto partecipazioni','uscita',null,'inv_finanziari',true,205,null,null,null,null,null),
('14.15','Altri investimenti finanziari','uscita',null,'inv_finanziari',true,206,null,null,null,null,null),
('15.01','Vendita immobili','entrata','inv_disinvestimenti',null,true,207,null,null,null,null,null),
('15.02','Vendita mezzi','entrata','inv_disinvestimenti',null,true,208,null,null,null,null,null),
('15.03','Vendita macchinari e attrezzature','entrata','inv_disinvestimenti',null,true,209,null,null,null,null,null),
('15.04','Vendita partecipazioni','entrata','inv_disinvestimenti',null,true,210,null,null,null,null,null),
('15.05','Rimborso investimenti finanziari','entrata','inv_disinvestimenti',null,true,211,null,null,null,null,null),
('15.06','Contributi in conto impianti incassati','entrata','inv_disinvestimenti',null,true,212,null,null,null,null,null),
('16.01','Erogazione mutuo','entrata','fin_entrate',null,true,213,null,null,null,null,null),
('16.02','Erogazione prestito','entrata','fin_entrate',null,true,214,null,null,null,null,null),
('16.03','Utilizzo linea di credito','entrata','fin_entrate',null,true,215,'Liquidità effettivamente utilizzata a fronte di un affidamento.','Prelievo di 10.000 euro da una linea disponibile.',null,null,null),
('16.04','Anticipi fatture','entrata','fin_entrate',null,true,216,null,null,null,null,null),
('16.05','Anticipi contratti','entrata','fin_entrate',null,true,217,null,null,null,null,null),
('16.06','Factoring con finanziamento','entrata','fin_entrate',null,true,218,'Anticipo ottenuto trasferendo crediti a un intermediario.','Intermediario anticipa una quota delle fatture clienti.',null,null,null),
('17.01','Rimborso capitale mutuo','uscita',null,'fin_mutui_capitale',true,219,null,null,null,null,null),
('17.02','Rimborso capitale prestito','uscita',null,'fin_mutui_capitale',true,220,null,null,null,null,null),
('17.03','Rientro linea di credito','uscita',null,'fin_mutui_capitale',true,221,null,null,null,null,null),
('17.04','Rimborso anticipi fatture','uscita',null,'fin_mutui_capitale',true,222,null,null,null,null,null),
('17.05','Rimborso factoring','uscita',null,'fin_mutui_capitale',true,223,null,null,null,null,null),
('17.06','Rimborso anticipato debiti','uscita',null,'fin_mutui_capitale',true,224,null,null,null,null,null),
('18.01','Maxicanone leasing','uscita',null,'fin_leasing',true,225,null,null,null,null,null),
('18.02','Quota capitale leasing','uscita',null,'fin_leasing',true,226,'Parte del pagamento leasing che rimborsa il capitale nel modello gestionale finanziario.','Rata suddivisa tra capitale e interessi.',null,null,null),
('18.03','Riscatto finale leasing','uscita',null,'fin_leasing',true,227,'Pagamento per acquisire il bene al termine del leasing.','Pagamento del prezzo finale di riscatto del mezzo.',null,null,null),
('19.01','Aumento capitale versato','entrata','fin_entrate',null,true,228,null,null,null,null,null),
('19.02','Versamenti in conto capitale','entrata','fin_entrate',null,true,229,null,null,null,null,null),
('19.03','Finanziamenti soci ricevuti','entrata','fin_entrate',null,true,230,null,null,null,null,null),
('19.04','Restituzione finanziamenti soci','uscita',null,'fin_soci_uscite',true,231,null,null,null,null,null),
('19.05','Distribuzione dividendi','uscita',null,'fin_soci_uscite',true,232,null,null,null,null,null),
('19.06','Rimborso capitale','uscita',null,'fin_soci_uscite',true,233,null,null,null,null,null),
('19.07','Prelievi titolare','uscita',null,'fin_soci_uscite',true,234,null,null,null,null,null),
('19.08','Apporti titolare','entrata','fin_entrate',null,true,235,null,null,null,null,null),
('20.01','Cauzioni versate','uscita',null,'alt_cauzioni_out',true,236,null,null,null,null,null),
('20.02','Restituzione cauzioni versate','entrata','alt_cauzioni_in',null,true,237,null,null,null,null,null),
('20.03','Cauzioni ricevute','entrata','alt_cauzioni_in',null,true,238,null,null,null,null,null),
('20.04','Restituzione cauzioni ricevute','uscita',null,'alt_cauzioni_out',true,239,null,null,null,null,null),
('20.05','Depositi vincolati: costituzione','uscita',null,'alt_cauzioni_out',true,240,null,null,null,null,null),
('20.06','Depositi vincolati: svincolo','entrata','alt_cauzioni_in',null,true,241,null,null,null,null,null),
('21.01','Giroconto banca-banca','entrambi','inc_giroconti','usc_giroconti',true,242,null,null,null,null,null),
('21.02','Giroconto banca-cassa','entrambi','inc_giroconti','usc_giroconti',true,243,null,null,null,null,null),
('21.03','Giroconto cassa-banca','entrambi','inc_giroconti','usc_giroconti',true,244,null,null,null,null,null),
('21.04','Trasferimenti a carte aziendali','entrambi','inc_giroconti','usc_giroconti',true,245,null,null,null,null,null),
('21.05','Trasferimenti tra portafogli aziendali','entrambi','inc_giroconti','usc_giroconti',true,246,null,null,null,null,null),
('22.01','Ammortamenti materiali','nessuno',null,null,false,247,'Quota del costo di beni fisici durevoli attribuita al periodo di utilizzo.','Quota annuale di costo del macchinario.',null,null,null),
('22.02','Ammortamenti immateriali','nessuno',null,null,false,248,'Quota di costi pluriennali immateriali attribuita al periodo.','Quota annuale del software capitalizzato.',null,null,null),
('22.03','Accantonamento TFR','nessuno',null,null,false,249,'Costo maturato del trattamento di fine rapporto nel periodo.','Quota TFR maturata nel mese.',null,null,null),
('22.04','Accantonamenti rischi e garanzie','nessuno',null,null,false,250,null,null,null,null,null),
('22.05','Svalutazione crediti','nessuno',null,null,false,251,'Rettifica stimata per crediti che potrebbero non essere recuperati interamente.','Stima della perdita su un cliente in difficoltà.',null,null,null),
('22.06','Perdite su crediti','nessuno',null,null,false,252,'Perdita rilevata per importi divenuti non recuperabili.','Stralcio di un credito non più recuperabile.',null,null,null),
('22.07','Variazione rimanenze materiali e merci','nessuno',null,null,false,253,'Rettifica che raccorda gli acquisti ai materiali effettivamente consumati.','Materiali acquistati ma ancora in magazzino a fine periodo.',null,null,null),
('22.08','Variazione lavori in corso','nessuno',null,null,false,254,'Rettifica del valore dei lavori non ancora conclusi secondo il criterio adottato.','Avanzamento maturato su una commessa pluriperiodale.',null,null,null),
('22.09','Fatture da ricevere','nessuno',null,null,false,255,'Debiti per beni o servizi già ricevuti con fattura non ancora pervenuta.','Lavorazione di dicembre fatturata a gennaio.',null,null,null),
('22.10','Fatture da emettere','nessuno',null,null,false,256,'Crediti per prestazioni già maturate con fattura ancora da emettere.','Servizio concluso a dicembre da fatturare.',null,null,null),
('22.11','Ratei attivi','nessuno',null,null,false,257,'Quota di proventi maturata nel periodo con manifestazione finanziaria successiva.','Interessi attivi maturati e non ancora liquidati.',null,null,null),
('22.12','Ratei passivi','nessuno',null,null,false,258,'Quota di costi maturata nel periodo con manifestazione finanziaria successiva.','Interessi passivi maturati e pagabili dopo la chiusura.',null,null,null),
('22.13','Risconti attivi','nessuno',null,null,false,259,'Quota di costi già rilevati che riguarda periodi futuri.','Parte del premio annuale riferita all’anno successivo.',null,null,null),
('22.14','Risconti passivi','nessuno',null,null,false,260,'Quota di ricavi già rilevati che riguarda periodi futuri.','Canone anticipato riferito a mesi futuri.',null,null,null),
('22.15','Plusvalenze cessione cespiti','nessuno',null,null,false,261,'Differenza positiva tra valore di cessione e valore contabile residuo.','Vendita a 8.000 di bene con residuo contabile 5.000: plusvalenza 3.000.',null,null,null),
('22.16','Minusvalenze cessione cespiti','nessuno',null,null,false,262,'Differenza negativa tra valore di cessione e valore contabile residuo.','Vendita a 3.000 di bene con residuo contabile 5.000: minusvalenza 2.000.',null,null,null),
('22.17','Rettifiche di competenza','nessuno',null,null,false,263,null,null,null,null,null),
('23.01','Incasso da classificare','entrambi','inc_da_classificare','usc_da_classificare',true,264,null,null,null,null,null),
('23.02','Uscita da classificare','entrambi','inc_da_classificare','usc_da_classificare',true,265,null,null,null,null,null),
('23.03','Movimento contestato','entrambi','inc_da_classificare','usc_da_classificare',true,266,'Movimento la cui legittimità o attribuzione è in verifica.','Addebito bancario non riconosciuto.',null,null,null),
('23.04','Rettifica manuale autorizzata','entrambi','inc_da_classificare','usc_da_classificare',true,267,'Correzione tracciata introdotta da un utente responsabile.','Riassegnazione motivata della categoria di un movimento.',null,null,null),
('24.01','Acconti su materiali','uscita',null,'usc_materiali',true,268,null,null,null,'Scalare dal saldo finale; non duplicare il costo della fattura.',null),
('24.02','Acconti a subappaltatori','uscita',null,'usc_subappalti',true,269,'Anticipi pagati prima dell’esecuzione o del SAL del subappalto.','Anticipo di 3.000 euro alla squadra esterna.',null,null,null),
('24.03','Anticipi su servizi','uscita',null,'usc_generali',true,270,'Pagamenti anticipati per servizi ancora da ricevere.','Anticipo per progettazione da completare.',null,null,null),
('25.01','Restituzione anticipi da fornitori','entrata','inc_altri',null,true,271,null,null,null,null,null),
('26.01','Pagamento ritenute svincolate a subappaltatori','uscita',null,'usc_subappalti',true,272,null,null,null,'Il costo era già incluso nella lavorazione: non rilevarlo di nuovo.',null),
('26.02','Contributi partecipazione gare','uscita',null,'usc_generali',true,273,'Oneri richiesti per partecipare a una procedura di gara.','Pagamento del contributo previsto dalla procedura.',null,null,null),
('26.03','Documentazione di gara','uscita',null,'usc_generali',true,274,'Acquisto e predisposizione della documentazione necessaria alla partecipazione.','Acquisto elaborati tecnici.',null,null,null),
('26.04','Consulenza preparazione gara','uscita',null,'usc_generali',true,275,'Supporto esterno per offerta tecnica, amministrativa o economica.','Consulente prepara l’offerta tecnica.',null,null,null),
('26.05','Sopralluoghi per gare','uscita',null,'usc_generali',true,276,'Costi sostenuti per visitare i luoghi della futura commessa.','Trasferta tecnica prima della presentazione offerta.',null,null,null),
('26.06','Commissioni garanzie di gara','uscita',null,'usc_banca',true,277,'Premi e commissioni di garanzie provvisorie e definitive.','Premio della fideiussione definitiva.',null,'Il premio è distinto dal deposito cauzionale.',null),
('26.07','Polizze specifiche di commessa','uscita',null,'usc_generali',true,278,'Coperture assicurative riferite a uno specifico lavoro.','Polizza per i rischi di esecuzione del cantiere.',null,null,null),
('26.08','Coperture post intervento','uscita',null,'usc_generali',true,279,'Premi assicurativi per responsabilità che proseguono dopo la consegna.','Premio copertura successiva al collaudo.',null,null,null),
('26.09','Franchigie assicurative pagate','uscita',null,'usc_generali',true,280,'Quota del danno rimasta a carico azienda.','Franchigia di 500 euro sul sinistro.',null,'Separare indennizzo assicurativo e costo del danno.',null),
('27.01','Manutenzione attrezzature','uscita',null,'usc_generali',true,281,null,null,null,null,null),
('27.02','Riparazione attrezzature','uscita',null,'usc_generali',true,282,'Interventi su guasti di beni già in uso.','Riparazione del martello demolitore.',null,null,null),
('27.03','Verifiche periodiche attrezzature','uscita',null,'usc_generali',true,283,'Controlli tecnici periodici su macchine e attrezzature.','Verifica della piattaforma di sollevamento.',null,null,null),
('27.04','Taratura strumenti','uscita',null,'usc_generali',true,284,'Controllo e regolazione della precisione degli strumenti.','Taratura dello strumento di misura.',null,null,null),
('27.05','Piccoli utensili non capitalizzati','uscita',null,'usc_generali',true,285,'Utensili imputati a costo secondo la politica adottata.','Acquisto di punte, spatole e utensili minuti.',null,null,null),
('27.06','Hotel e pernottamenti','uscita',null,'usc_generali',true,286,'Alloggio per trasferte di lavoro.','Pernottamento squadra fuori regione.',null,null,null),
('27.07','Pasti in trasferta','uscita',null,'usc_generali',true,287,'Ristorazione durante trasferte lavorative.','Pranzo della squadra durante una trasferta.',null,null,null),
('27.08','Biglietti treno e aereo','uscita',null,'usc_generali',true,288,'Viaggi di lavoro con mezzi di trasporto pubblici.','Biglietto ferroviario per sopralluogo.',null,null,null),
('27.09','Indennità di trasferta','uscita',null,'usc_generali',true,289,'Indennità riconosciute al personale per lavoro fuori sede.','Indennità prevista per la giornata fuori sede.',null,'Raccordare con cedolino e rimborso spese per non duplicare.',null),
('28.01','Retribuzioni lorde di competenza','nessuno',null,null,false,290,null,null,null,'Nel CE sostituisce la lettura per netto e trattenute: non sommare entrambi.',null),
('28.02','Ferie e permessi maturati','nessuno',null,null,false,291,'Costo maturato per ferie e permessi non ancora fruiti.','Incremento del debito per ferie a fine mese.',null,'Rilevare variazioni e relativi utilizzi, non aggiungere l’intero saldo ogni mese.',null),
('28.03','Mensilità aggiuntive maturate','nessuno',null,null,false,292,'Quota di tredicesima e quattordicesima attribuibile al periodo.','Quota mensile di tredicesima.',null,'Il pagamento successivo estingue il debito e non ricrea il costo.',null),
('28.04','Premi personale maturati','nessuno',null,null,false,293,'Premi di competenza già maturati ma non ancora pagati.','Premio annuale maturato a dicembre.',null,null,null),
('28.05','Incentivi all’uscita maturati','nessuno',null,null,false,294,'Oneri per accordi di uscita del personale attribuiti al periodo.','Incentivo concordato con pagamento successivo.',null,null,null),
('29.01','Incentivi all’uscita pagati','uscita',null,'usc_personale',true,295,null,null,null,'Se già accantonato, il pagamento non genera un secondo costo.',null),
('29.02','Penali pagate','uscita',null,'usc_generali',true,296,'Somme dovute per ritardi o altre violazioni contrattuali.','Penale per ritardo nella consegna.',null,null,null),
('29.03','Risarcimenti a clienti','uscita',null,'usc_generali',true,297,'Importi corrisposti a clienti per danni riconosciuti.','Rimborso danno al pavimento del cliente.',null,null,null),
('29.04','Danni a terzi','uscita',null,'usc_generali',true,298,'Somme pagate per danni a soggetti diversi dal cliente.','Risarcimento al proprietario confinante.',null,null,null),
('30.01','Sconti e abbuoni concessi','nessuno',null,null,false,299,null,null,null,'Se già sottratti in fattura non sottrarli una seconda volta.',null),
('30.02','Premi commerciali da fornitori','nessuno',null,null,false,300,'Riduzioni del costo di acquisto riconosciute per obiettivi commerciali.','Premio volume acquisti di fine anno.',null,null,null),
('30.03','Arrotondamenti attivi','nessuno',null,null,false,301,'Piccole differenze favorevoli nella chiusura di un credito o debito.','Debito di 100,02 euro chiuso pagando 100 euro.',null,null,null),
('30.04','Arrotondamenti passivi','nessuno',null,null,false,302,'Piccole differenze sfavorevoli nella chiusura di un credito o debito.','Credito di 100,02 euro chiuso incassando 100 euro.',null,null,null),
('30.05','Materiali danneggiati','nessuno',null,null,false,303,'Perdita di valore di materiali non più utilizzabili integralmente.','Vetro rotto prima della posa.',null,'Non duplicare il costo già assorbito da consumi o rettifiche inventariali.',null),
('30.06','Furti e ammanchi di magazzino','nessuno',null,null,false,304,'Differenze negative delle scorte dovute a furti o quantità mancanti.','Materiale fisico inferiore alla giacenza registrata.',null,null,null),
('30.07','Sfridi e scarti anomali','nessuno',null,null,false,305,'Consumi eccedenti quelli ordinari previsti dalla lavorazione.','Tagli errati che rendono inutilizzabile materiale.',null,'Gli sfridi ordinari possono essere già inclusi nei consumi.',null),
('30.08','Rettifiche inventariali positive','nessuno',null,null,false,306,'Aumenti delle scorte emersi dal confronto con inventario fisico.','Rilevazione di materiali presenti ma non caricati.',null,null,null),
('30.09','Rettifiche inventariali negative','nessuno',null,null,false,307,'Riduzioni delle scorte emerse dall’inventario fisico.','Quantità reale inferiore a quella registrata.',null,null,null),
('30.10','Svalutazione materiali obsoleti','nessuno',null,null,false,308,'Riduzione del valore di scorte superate o difficilmente vendibili.','Accessori per un modello non più commercializzato.',null,null,null),
('30.11','Ritenute trattenute a subappaltatori','nessuno',null,null,false,309,'Parte del debito verso subappaltatore sospesa fino allo svincolo.','Trattenuta di garanzia sul SAL del subappaltatore.',null,'È una riclassifica del debito: non un ulteriore costo o uscita.',null),
('31.01','Commissioni insoluti','uscita',null,'usc_banca',true,310,null,null,null,null,null),
('31.02','Commissioni piattaforme di pagamento','uscita',null,'usc_banca',true,311,'Costi trattenuti da gestori di pagamenti online.','Commissione sull’incasso tramite piattaforma.',null,'Non confondere incasso lordo, commissione e accredito netto.',null),
('32.01','Storno incasso RiBa o SDD','uscita',null,'usc_rimborsi_clienti',true,312,null,null,null,null,null),
('32.02','Chargeback e contestazioni carta','uscita',null,'usc_rimborsi_clienti',true,313,'Ri addebito di un pagamento carta contestato dal cliente.','Il gestore revoca l’accredito del pagamento.',null,'Valutare se il credito rimane recuperabile o va rettificato.',null),
('33.01','Acquisto crediti fiscali','uscita',null,'inv_finanziari',true,314,null,null,null,null,null),
('34.01','Incasso da cessione crediti fiscali','entrata','inc_incentivi',null,true,315,null,null,null,null,null),
('35.01','Oneri di cessione crediti','uscita',null,'fin_mutui_interessi',true,316,null,null,null,null,null),
('36.01','Utilizzo crediti fiscali in compensazione','nessuno',null,null,false,317,null,null,null,null,null),
('36.02','Compensazione crediti debiti commerciali','nessuno',null,null,false,318,'Chiusura concordata di posizioni reciproche senza bonifico.','Credito cliente compensato con debito verso lo stesso soggetto.',null,'Non generare incassi o pagamenti bancari fittizi.',null),
('37.01','Prestiti infragruppo erogati','uscita',null,'inv_finanziari',false,319,null,null,null,null,null),
('37.02','Finanziamenti concessi a terzi','uscita',null,'inv_finanziari',false,320,'Denaro prestato a soggetti esterni al gruppo.','Prestito contrattuale a un’impresa terza.',null,'Collegare al documento e alla commessa quando disponibile.',null),
('38.01','Rimborso prestiti infragruppo erogati','entrata','inv_disinvestimenti',null,false,321,null,null,null,null,null),
('38.02','Rimborso finanziamenti concessi a terzi','entrata','inv_disinvestimenti',null,false,322,'Recupero del capitale prestato a terzi.','Rata capitale del prestito concesso.',null,'Gli interessi sono proventi distinti dal capitale.',null),
('39.01','Prestiti infragruppo ricevuti','entrata','fin_entrate',null,false,323,null,null,null,null,null),
('40.01','Rimborso prestiti infragruppo ricevuti','uscita',null,'fin_mutui_capitale',false,324,null,null,null,null,null),
('41.01','Interessi attivi infragruppo','entrata','fin_interessi_attivi',null,false,325,null,null,null,null,null),
('42.01','Interessi passivi infragruppo','uscita',null,'fin_mutui_interessi',false,326,null,null,null,null,null),
('43.01','Versamento al cash pool','uscita',null,'fin_mutui_capitale',false,327,null,null,null,null,null),
('43.02','Ricezione dal cash pool','entrata','fin_entrate',null,false,328,'Liquidità ricevuta dalla tesoreria accentrata.','Società tesoriera alimenta il conto della controllata.',null,'Entrata per la singola società; classificazione secondo il rapporto sottostante.',null),
('44.01','Anticipi per acquisto cespiti','uscita',null,'inv_cespiti',true,329,null,null,null,null,null),
('44.02','Pagamenti per immobilizzazioni in corso','uscita',null,'inv_cespiti',true,330,'Pagamenti per beni durevoli non ancora completati o pronti all’uso.','Avanzamento realizzazione del nuovo impianto.',null,'Distinguere pagamento, capitalizzazione e successivo ammortamento.',null)
)
select v.codice, c.area, c.categoria, v.voce,
       coalesce(v.descrizione, replace(c.descrizione, '{v}', lower(v.voce))),
       coalesce(v.esempio, replace(c.esempio, '{v}', lower(v.voce))),
       v.flusso, coalesce(v.trattamento, c.trattamento), coalesce(v.attenzioni, c.attenzioni), coalesce(v.tipo, c.tipo),
       c.sezione, v.vin, v.vout, v.attiva, v.ordine
  from voci v join categorie c on c.pre = left(v.codice, 2)
on conflict (codice) do update set
  area = excluded.area, categoria = excluded.categoria, voce = excluded.voce, descrizione = excluded.descrizione,
  esempio = excluded.esempio, flusso = excluded.flusso, trattamento_economico = excluded.trattamento_economico,
  attenzioni = excluded.attenzioni, tipo_utilizzo = excluded.tipo_utilizzo, sezione = excluded.sezione,
  voce_cassa_in = excluded.voce_cassa_in, voce_cassa_out = excluded.voce_cassa_out,
  attiva_di_partenza = excluded.attiva_di_partenza, ordine = excluded.ordine;

-- ── 2. Le righe del rendiconto di cassa in cui una voce può finire ────────────
-- Devono coincidere con `VoceCassa` in src/lib/controlloGestione/vociCassa.ts
-- (lo controlla src/test/logic/cassaCatalogo.test.ts).
create or replace function private.cassa_righe_rendiconto()
returns text[] language sql immutable set search_path to '' as $$
  select array[
    'inc_clienti','inc_acconti','inc_incentivi','inc_altri','inc_fiscali','inc_giroconti','inc_da_classificare',
    'usc_materiali','usc_subappalti','usc_personale','usc_contributi','usc_iva','usc_generali','usc_consulenze',
    'usc_mezzi','usc_marketing','usc_provvigioni','usc_banca','usc_rimborsi_clienti','usc_blocca_prezzo',
    'usc_altre','usc_giroconti','usc_da_classificare',
    'inv_cespiti','inv_finanziari','inv_disinvestimenti',
    'fin_mutui_capitale','fin_mutui_interessi','fin_leasing','fin_entrate','fin_interessi_attivi','fin_soci_uscite',
    'alt_cauzioni_in','alt_cauzioni_out'
  ]::text[]
$$;
revoke all on function private.cassa_righe_rendiconto() from public, anon;

do $controllo$
begin
  if exists (
    select 1 from public.cassa_catalogo_base b
     where (b.voce_cassa_in is not null and b.voce_cassa_in <> all (private.cassa_righe_rendiconto()))
        or (b.voce_cassa_out is not null and b.voce_cassa_out <> all (private.cassa_righe_rendiconto()))
  ) then
    raise exception 'Il catalogo base punta a una riga del rendiconto che non esiste';
  end if;
end $controllo$;

-- ── 3. Il catalogo dell'azienda ───────────────────────────────────────────────
create table if not exists public.cassa_voci (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  codice text not null,
  -- Una voce usata non si cancella: si archivia. Niente cascata sui figli.
  parent_id uuid references public.cassa_voci(id) on delete restrict,
  livello text not null check (livello in ('area', 'categoria', 'voce', 'sottovoce')),
  nome text not null check (length(btrim(nome)) between 1 and 120),
  descrizione text,
  esempio text,
  flusso text not null check (flusso in ('entrata', 'uscita', 'entrambi', 'nessuno')),
  sezione text not null,
  voce_cassa_in text,
  voce_cassa_out text,
  richiede_commessa boolean not null default false,
  attiva boolean not null default true,
  archiviata_il timestamptz,
  ordine integer not null default 0,
  origine text not null default 'azienda' check (origine in ('catalogo', 'azienda')),
  codice_base text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (company_id, codice),
  check (parent_id is null or parent_id <> id),
  check ((livello = 'area') = (parent_id is null))
);
create index if not exists cassa_voci_parent_idx on public.cassa_voci (parent_id);

alter table public.cassa_voci enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cassa_voci' and policyname = 'Categorie di cassa: legge') then
    create policy "Categorie di cassa: legge" on public.cassa_voci for select to authenticated using (
      company_id in (select unnest(public.aziende_con_permesso('can_view_tesoreria')))
      or company_id in (select unnest(public.aziende_con_permesso('can_view_controllo_gestione'))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cassa_voci' and policyname = 'blocco_utente_bloccato') then
    create policy blocco_utente_bloccato on public.cassa_voci as restrictive for all to authenticated
      using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
  end if;
end $p$;
-- Si scrive solo dalle funzioni qui sotto, che controllano permessi e gerarchia:
-- nessuna policy di scrittura, quindi dal browser niente insert né update.
revoke all on public.cassa_voci from anon;
grant select on public.cassa_voci to authenticated;

-- Il genitore deve essere della stessa azienda e del livello subito sopra: così
-- i cicli sono impossibili per costruzione.
create or replace function private.cassa_voci_gerarchia()
returns trigger language plpgsql set search_path to '' as $$
declare p record;
begin
  if new.parent_id is null then
    if new.livello <> 'area' then raise exception 'Una % deve stare dentro una categoria superiore', new.livello; end if;
    return new;
  end if;
  select company_id, livello into p from public.cassa_voci where id = new.parent_id;
  if p.company_id is distinct from new.company_id then raise exception 'La categoria superiore è di un''altra azienda'; end if;
  if (new.livello, p.livello) not in (('categoria','area'), ('voce','categoria'), ('sottovoce','voce')) then
    raise exception 'Una % non può stare dentro una %', new.livello, p.livello;
  end if;
  return new;
end $$;
do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.cassa_voci'::regclass and tgname = 'cassa_voci_gerarchia') then
    create trigger cassa_voci_gerarchia before insert or update of parent_id, livello, company_id on public.cassa_voci
      for each row execute function private.cassa_voci_gerarchia();
  end if;
end $t$;

-- ── 4. La categoria sul movimento ─────────────────────────────────────────────
alter table public.bank_transactions
  add column if not exists cassa_voce_id uuid references public.cassa_voci(id) on delete restrict,
  add column if not exists cassa_voce_origine text,
  add column if not exists cassa_voce_il timestamptz,
  add column if not exists cassa_voce_da uuid;
do $c$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.bank_transactions'::regclass and conname = 'bank_transactions_cassa_voce_origine_check') then
    alter table public.bank_transactions add constraint bank_transactions_cassa_voce_origine_check
      check (cassa_voce_origine is null or cassa_voce_origine in ('manuale', 'regola', 'documento', 'controparte', 'proposta'));
  end if;
end $c$;
create index if not exists bank_transactions_cassa_voce_idx on public.bank_transactions (cassa_voce_id) where cassa_voce_id is not null;

-- Il guardiano dei dati importati deve lasciar passare la categoria: è nostra,
-- non della banca. Stessa funzione di prima con quattro colonne in più.
create or replace function public.bank_transaction_operator_guard()
 returns trigger language plpgsql set search_path to '' as $function$
DECLARE row_company uuid; row_account uuid; manual_account boolean;
  liberi text[] := ARRAY['category','category_icon','note','linked_cost_id','linked_installment_id','linked_invoice_id','linked_scadenza_id','reconciled_at','reconciled_invoice_id','reconciliation_status','reconciliation_suggestions','chiuso_senza_documento','operativita_revision','proposta_rifiutata_at','proposta_rifiutata_da','proposta_controllata_at','cassa_voce_id','cassa_voce_origine','cassa_voce_il','cassa_voce_da'];
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' THEN RETURN coalesce(NEW,OLD); END IF;
 row_company:=CASE WHEN TG_OP='DELETE' THEN OLD.company_id ELSE NEW.company_id END;
 row_account:=CASE WHEN TG_OP='DELETE' THEN OLD.account_id ELSE NEW.account_id END;
 IF public.has_permission_for_company(auth.uid(),'__solo_amministratori__',row_company) THEN RETURN coalesce(NEW,OLD); END IF;
 SELECT is_manual INTO manual_account FROM public.bank_accounts WHERE id=row_account AND company_id=row_company;
 IF NOT coalesce(manual_account,false) AND (TG_OP IN ('INSERT','DELETE') OR (to_jsonb(NEW)-liberi) IS DISTINCT FROM (to_jsonb(OLD)-liberi)) THEN
  RAISE EXCEPTION 'I dati importati dalla banca non si possono riscrivere' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.account_id IS DISTINCT FROM OLD.account_id) THEN
  RAISE EXCEPTION 'Non puoi spostare un movimento tra conti o aziende' USING ERRCODE='42501';
 END IF;
 RETURN coalesce(NEW,OLD);
END $function$;

-- ── 5. Lo storico delle classificazioni ───────────────────────────────────────
create table if not exists public.cassa_voce_storico (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bank_transaction_id uuid not null references public.bank_transactions(id) on delete cascade,
  da_voce_id uuid references public.cassa_voci(id) on delete set null,
  a_voce_id uuid references public.cassa_voci(id) on delete set null,
  origine text,
  motivo text,
  autore uuid,
  il timestamptz not null default now()
);
create index if not exists cassa_voce_storico_tx_idx on public.cassa_voce_storico (bank_transaction_id, il desc);
alter table public.cassa_voce_storico enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cassa_voce_storico' and policyname = 'Storico categorie: legge') then
    create policy "Storico categorie: legge" on public.cassa_voce_storico for select to authenticated using (
      company_id in (select unnest(public.aziende_con_permesso('can_view_tesoreria'))));
  end if;
end $p$;
revoke all on public.cassa_voce_storico from anon;
grant select on public.cassa_voce_storico to authenticated;

create or replace function private.cassa_voce_registra_storico()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  insert into public.cassa_voce_storico (company_id, bank_transaction_id, da_voce_id, a_voce_id, origine, motivo, autore)
  values (new.company_id, new.id, old.cassa_voce_id, new.cassa_voce_id, new.cassa_voce_origine,
          nullif(current_setting('cassa.motivo', true), ''), auth.uid());
  return new;
end $$;
do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.bank_transactions'::regclass and tgname = 'cassa_voce_storico') then
    create trigger cassa_voce_storico after update of cassa_voce_id on public.bank_transactions
      for each row when (old.cassa_voce_id is distinct from new.cassa_voce_id)
      execute function private.cassa_voce_registra_storico();
  end if;
end $t$;

-- ── 6. Accesso ────────────────────────────────────────────────────────────────
-- Legge chi vede la tesoreria o il controllo di gestione; configura chi ha il
-- controllo di gestione e non è in sola lettura.
create or replace function private.cassa_accesso(p_company uuid, p_configura boolean default false)
returns void language plpgsql stable security definer set search_path to '' as $$
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or (coalesce(public.has_permission_for_company(auth.uid(), 'can_view_tesoreria', p_company), false)
         or coalesce(public.has_permission_for_company(auth.uid(), 'can_view_controllo_gestione', p_company), false)
         or coalesce(public.user_can_read_accountant_company(p_company), false)) is not true
     or (p_configura and (public.utente_sola_lettura(p_company)
         or coalesce(public.has_permission_for_company(auth.uid(), 'can_view_controllo_gestione', p_company), false) is not true)) then
    raise exception 'Non hai il permesso di gestire le categorie di cassa' using errcode = '42501';
  end if;
end $$;
revoke all on function private.cassa_accesso(uuid, boolean) from public, anon;

-- ── 7. Il catalogo dell'azienda nasce dal catalogo base ───────────────────────
create or replace function public.cassa_catalogo_prepara(p_company uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare prima integer; dopo integer;
begin
  perform private.cassa_accesso(p_company, false);
  -- Due prime aperture in parallelo non devono litigare sulle stesse righe.
  perform pg_advisory_xact_lock(hashtext('cassa_catalogo_prepara'), hashtext(p_company::text));
  select count(*) into prima from public.cassa_voci where company_id = p_company;

  insert into public.cassa_voci (company_id, codice, livello, nome, flusso, sezione, attiva, ordine, origine)
  select p_company, 'A.' || lower(regexp_replace(b.area, '[^A-Za-z]+', '_', 'g')), 'area', b.area, 'entrambi',
         min(b.sezione), bool_or(b.attiva_di_partenza), min(b.ordine), 'catalogo'
    from public.cassa_catalogo_base b group by b.area
  on conflict (company_id, codice) do nothing;

  insert into public.cassa_voci (company_id, codice, parent_id, livello, nome, flusso, sezione, voce_cassa_in, voce_cassa_out,
                                 attiva, ordine, origine, codice_base)
  select p_company, left(b.codice, 2), a.id, 'categoria', min(b.categoria),
         case when count(distinct b.flusso) = 1 then min(b.flusso) else 'entrambi' end,
         min(b.sezione),
         mode() within group (order by b.voce_cassa_in) filter (where b.voce_cassa_in is not null),
         mode() within group (order by b.voce_cassa_out) filter (where b.voce_cassa_out is not null),
         bool_or(b.attiva_di_partenza), min(b.ordine), 'catalogo', left(b.codice, 2)
    from public.cassa_catalogo_base b
    join public.cassa_voci a on a.company_id = p_company and a.codice = 'A.' || lower(regexp_replace(b.area, '[^A-Za-z]+', '_', 'g'))
   group by left(b.codice, 2), a.id
  on conflict (company_id, codice) do nothing;

  insert into public.cassa_voci (company_id, codice, parent_id, livello, nome, descrizione, esempio, flusso, sezione,
                                 voce_cassa_in, voce_cassa_out, attiva, ordine, origine, codice_base)
  select p_company, b.codice, c.id, 'voce', b.voce, b.descrizione, b.esempio, b.flusso, b.sezione,
         b.voce_cassa_in, b.voce_cassa_out, b.attiva_di_partenza, b.ordine, 'catalogo', b.codice
    from public.cassa_catalogo_base b
    join public.cassa_voci c on c.company_id = p_company and c.codice = left(b.codice, 2)
  on conflict (company_id, codice) do nothing;

  select count(*) into dopo from public.cassa_voci where company_id = p_company;
  return jsonb_build_object('create', dopo - prima, 'totale', dopo);
end $$;
revoke all on function public.cassa_catalogo_prepara(uuid) from public, anon;
grant execute on function public.cassa_catalogo_prepara(uuid) to authenticated;

-- ── 8. Configurare una voce ───────────────────────────────────────────────────
-- p_id null = nuova voce (serve `parent_id` e `nome`). Il codice di una voce del
-- catalogo non cambia mai; una voce nuova ne riceve uno con la X, che il
-- catalogo base non userà mai.
create or replace function public.cassa_voce_salva(p_company uuid, p_id uuid, p_dati jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v public.cassa_voci; p public.cassa_voci; nuovo_codice text; n integer := 0; righe text[] := private.cassa_righe_rendiconto();
begin
  perform private.cassa_accesso(p_company, true);
  if p_dati ? 'voce_cassa_in' and nullif(p_dati->>'voce_cassa_in', '') is not null and (p_dati->>'voce_cassa_in') <> all (righe) then
    raise exception 'Riga del cash flow sconosciuta: %', p_dati->>'voce_cassa_in'; end if;
  if p_dati ? 'voce_cassa_out' and nullif(p_dati->>'voce_cassa_out', '') is not null and (p_dati->>'voce_cassa_out') <> all (righe) then
    raise exception 'Riga del cash flow sconosciuta: %', p_dati->>'voce_cassa_out'; end if;
  if p_dati ? 'flusso' and (p_dati->>'flusso') not in ('entrata', 'uscita', 'entrambi', 'nessuno') then
    raise exception 'Verso non valido'; end if;

  if p_id is null then
    if coalesce(btrim(p_dati->>'nome'), '') = '' then raise exception 'Scrivi il nome della voce'; end if;
    select * into p from public.cassa_voci where id = (p_dati->>'parent_id')::uuid and company_id = p_company;
    if p.id is null then raise exception 'Scegli la categoria in cui mettere la voce'; end if;
    if p.livello not in ('categoria', 'voce') then raise exception 'Le voci si aggiungono dentro una categoria o una voce'; end if;
    loop
      n := n + 1;
      nuovo_codice := p.codice || '.X' || lpad(n::text, 2, '0');
      exit when not exists (select 1 from public.cassa_voci where company_id = p_company and codice = nuovo_codice);
    end loop;
    insert into public.cassa_voci (company_id, codice, parent_id, livello, nome, descrizione, esempio, flusso, sezione,
                                   voce_cassa_in, voce_cassa_out, richiede_commessa, attiva, ordine, origine, created_by, updated_by)
    values (p_company, nuovo_codice, p.id, case p.livello when 'categoria' then 'voce' else 'sottovoce' end,
            btrim(p_dati->>'nome'), nullif(btrim(p_dati->>'descrizione'), ''), nullif(btrim(p_dati->>'esempio'), ''),
            coalesce(p_dati->>'flusso', p.flusso), p.sezione,
            coalesce(nullif(p_dati->>'voce_cassa_in', ''), p.voce_cassa_in),
            coalesce(nullif(p_dati->>'voce_cassa_out', ''), p.voce_cassa_out),
            coalesce((p_dati->>'richiede_commessa')::boolean, false), true,
            coalesce((p_dati->>'ordine')::integer, (select coalesce(max(ordine), 0) + 1 from public.cassa_voci where parent_id = p.id)),
            'azienda', auth.uid(), auth.uid())
    returning * into v;
    return v.id;
  end if;

  select * into v from public.cassa_voci where id = p_id and company_id = p_company for update;
  if v.id is null then raise exception 'Voce non trovata'; end if;
  update public.cassa_voci set
    nome = coalesce(nullif(btrim(p_dati->>'nome'), ''), nome),
    descrizione = case when p_dati ? 'descrizione' then nullif(btrim(p_dati->>'descrizione'), '') else descrizione end,
    esempio = case when p_dati ? 'esempio' then nullif(btrim(p_dati->>'esempio'), '') else esempio end,
    flusso = coalesce(p_dati->>'flusso', flusso),
    voce_cassa_in = case when p_dati ? 'voce_cassa_in' then nullif(p_dati->>'voce_cassa_in', '') else voce_cassa_in end,
    voce_cassa_out = case when p_dati ? 'voce_cassa_out' then nullif(p_dati->>'voce_cassa_out', '') else voce_cassa_out end,
    richiede_commessa = coalesce((p_dati->>'richiede_commessa')::boolean, richiede_commessa),
    attiva = coalesce((p_dati->>'attiva')::boolean, attiva),
    archiviata_il = case
      when (p_dati->>'archiviata')::boolean is true then coalesce(archiviata_il, now())
      when (p_dati->>'archiviata')::boolean is false then null
      else archiviata_il end,
    ordine = coalesce((p_dati->>'ordine')::integer, ordine),
    updated_at = now(), updated_by = auth.uid()
  where id = v.id;
  return v.id;
end $$;
revoke all on function public.cassa_voce_salva(uuid, uuid, jsonb) from public, anon;
grant execute on function public.cassa_voce_salva(uuid, uuid, jsonb) to authenticated;

-- ── 9. Categoria di un movimento ──────────────────────────────────────────────
-- La categoria vale solo se è una voce (o sottovoce) attiva dell'azienda e il
-- verso torna: un'uscita non va in una voce di sole entrate, e una voce senza
-- cassa (ammortamenti, ratei) non va su un movimento di banca.
create or replace function public.bank_movimento_categoria(
  p_company uuid, p_tx uuid, p_voce uuid, p_revision integer, p_motivo text default null)
returns integer language plpgsql security definer set search_path to '' as $$
declare v public.cassa_voci; t record; rev integer;
begin
  perform private.bank_operativa_access(p_company, true);
  select id, amount, transaction_type into t from public.bank_transactions where id = p_tx and company_id = p_company;
  if t.id is null then raise exception 'Movimento non disponibile'; end if;
  if p_voce is not null then
    select * into v from public.cassa_voci where id = p_voce and company_id = p_company;
    if v.id is null then raise exception 'Categoria non trovata'; end if;
    if v.livello not in ('voce', 'sottovoce') then raise exception 'Scegli una voce, non una categoria intera'; end if;
    if not v.attiva or v.archiviata_il is not null then raise exception 'La voce «%» non è attiva', v.nome; end if;
    if v.flusso = 'nessuno' then raise exception 'La voce «%» non muove denaro: non si usa su un movimento di banca', v.nome; end if;
    if (t.amount >= 0 and v.flusso = 'uscita') or (t.amount < 0 and v.flusso = 'entrata') then
      raise exception 'La voce «%» è per le %', v.nome, case v.flusso when 'uscita' then 'uscite' else 'entrate' end;
    end if;
  end if;
  perform set_config('cassa.motivo', coalesce(p_motivo, ''), true);
  update public.bank_transactions set
    cassa_voce_id = p_voce,
    cassa_voce_origine = case when p_voce is null then null else 'manuale' end,
    cassa_voce_il = case when p_voce is null then null else now() end,
    cassa_voce_da = case when p_voce is null then null else auth.uid() end,
    -- Il testo resta allineato per chi lo legge ancora (filtri, esportazioni).
    category = case when p_voce is null then category else v.nome end,
    operativita_revision = operativita_revision + 1
  where id = p_tx and company_id = p_company and operativita_revision = p_revision
  returning operativita_revision into rev;
  if rev is null then
    raise exception 'Il movimento è stato modificato in un’altra finestra. Ricarica prima di salvare.' using errcode = 'PT409';
  end if;
  return rev;
end $$;
revoke all on function public.bank_movimento_categoria(uuid, uuid, uuid, integer, text) from public, anon;
grant execute on function public.bank_movimento_categoria(uuid, uuid, uuid, integer, text) to authenticated;

-- ── 10. Dalla vecchia categoria testuale a una PROPOSTA ──────────────────────
-- Mai riscritta sul movimento: è un indizio, non una scelta. Dove il testo non
-- dice abbastanza («altro», «pagamento_fornitore», «assicurazioni»: di casa,
-- di auto o di responsabilità?) non si propone niente.
create or replace function private.cassa_codice_da_testo(p_testo text)
returns text language sql immutable set search_path to '' as $$
  select case regexp_replace(regexp_replace(lower(btrim(coalesce(p_testo, ''))), '[^a-z0-9]+', '_', 'g'), '^_+|_+$', '', 'g')
    when 'incassi_fatture' then '01' when 'incasso_fattura' then '01' when 'incassi_clienti' then '01'
    when 'incasso_cliente' then '01' when 'incasso' then '01' when 'incassi' then '01' when 'clienti' then '01'
    when 'acconto' then '02.01' when 'acconti' then '02.01' when 'caparra' then '02.02'
    when 'materiali' then '04' when 'materiali_e_forniture' then '04' when 'materiali_edili' then '04.02'
    when 'merci' then '04.10' when 'materie_prime' then '04.01'
    when 'subappalti' then '05' when 'subappalto' then '05' when 'squadre' then '05.02' when 'manodopera' then '05'
    when 'stipendi' then '06.01' when 'stipendio' then '06.01' when 'personale' then '06' when 'salari' then '06.01'
    when 'affitti' then '08' when 'affitto' then '08' when 'immobili' then '08' when 'utenze' then '08'
    when 'telefonia' then '08.09' when 'manutenzione' then '08.11'
    when 'carburante' then '09.01' when 'carburanti' then '09.01' when 'trasporti_noleggi' then '09' when 'veicoli' then '09'
    when 'mezzi' then '09' when 'trasporti' then '09.12'
    when 'pubblicita' then '10' when 'marketing' then '10' when 'provvigioni' then '10.14'
    when 'commercialista' then '11.01' when 'consulenze' then '11' when 'professionisti' then '11' when 'servizi' then '11'
    when 'software' then '11.13'
    when 'iva' then '12.01' when 'imposte_e_contributi' then '12' when 'imposte' then '12' when 'tasse' then '12' when 'f24' then '12'
    when 'interessi' then '13' when 'spese_bancarie' then '13.09' when 'commissioni_bancarie' then '13.08'
    when 'attrezzature' then '14.06' when 'leasing' then '18'
    when 'giroconto' then '21' when 'giroconti' then '21'
    when 'trasferte' then '27'
    else null end
$$;
revoke all on function private.cassa_codice_da_testo(text) from public, anon;

-- Categoria di ogni movimento richiesto: quella confermata, oppure la proposta
-- ricavata dal testo. `confermata` dice quale delle due.
create or replace function public.cassa_voci_movimenti(p_company uuid, p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare r jsonb;
begin
  perform private.bank_operativa_access(p_company, false);
  if coalesce(array_length(p_ids, 1), 0) > 200 then raise exception 'Troppi movimenti in una volta'; end if;
  select coalesce(jsonb_object_agg(t.id, jsonb_build_object(
           'id', v.id, 'codice', v.codice, 'nome', v.nome, 'categoria', c.nome,
           'origine', case when t.cassa_voce_id is not null then t.cassa_voce_origine else 'storico' end,
           'confermata', t.cassa_voce_id is not null and t.cassa_voce_origine <> 'proposta',
           'il', t.cassa_voce_il)), '{}'::jsonb)
    into r
    from public.bank_transactions t
    join public.cassa_voci v on v.company_id = p_company
     and v.id = coalesce(t.cassa_voce_id,
           (select x.id from public.cassa_voci x where x.company_id = p_company and x.codice = private.cassa_codice_da_testo(t.category)))
    left join public.cassa_voci c on c.id = v.parent_id and v.livello in ('voce', 'sottovoce')
   where t.company_id = p_company and t.id = any (p_ids);
  return r;
end $$;
revoke all on function public.cassa_voci_movimenti(uuid, uuid[]) from public, anon;
grant execute on function public.cassa_voci_movimenti(uuid, uuid[]) to authenticated;

-- ── 11. I movimenti di banca per il cash flow consuntivo ──────────────────────
-- Il rendiconto legge la prima nota. Da qui gli arrivano:
--  - i movimenti di banca dell'anno SENZA una scrittura di prima nota (prima
--    sparivano dal consuntivo);
--  - quelli CON una scrittura, solo se hanno una categoria confermata: è la
--    categoria del movimento a dire in che riga vanno, non il testo copiato
--    nella prima nota al momento dell'import.
-- Più il netto dei movimenti senza prima nota dopo l'anno, che serve a
-- ricostruire all'indietro il saldo degli anni passati.
-- Restano fuori i movimenti non contabilizzati e quelli «ignorati».
create or replace function public.cassa_rendiconto_banca(p_company uuid, p_anno integer)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare r jsonb;
begin
  perform private.cassa_accesso(p_company, false);
  with tx as (
    select t.id, t.booking_date, t.category, t.description, t.cassa_voce_id, t.cassa_voce_origine,
           round(coalesce(t.amount_eur, t.amount) * 100)::bigint as cents,
           coalesce(nullif(t.counterparty_name, ''), case when t.amount >= 0 then t.debtor_name else t.creditor_name end) as controparte,
           exists (select 1 from public.prima_nota_entries p where p.bank_transaction_id = t.id and p.reversal_of is null
                     and not exists (select 1 from public.prima_nota_entries s where s.reversal_of = p.id)) as in_prima_nota
      from public.bank_transactions t
     where t.company_id = p_company and t.status = 'booked'
       and coalesce(t.reconciliation_status, '') <> 'ignored'
       and t.booking_date >= make_date(p_anno, 1, 1)
  )
  select jsonb_build_object(
    'movimenti', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tx.id, 'data', tx.booking_date, 'cents', tx.cents, 'categoria', tx.category,
        'descrizione', tx.description, 'controparte', tx.controparte, 'in_prima_nota', tx.in_prima_nota,
        'voce', case when v.id is null then null else jsonb_build_object(
          'id', v.id, 'nome', v.nome, 'codice', v.codice, 'in', v.voce_cassa_in, 'out', v.voce_cassa_out,
          'origine', tx.cassa_voce_origine) end) order by tx.booking_date, tx.id)
        from tx left join public.cassa_voci v on v.id = tx.cassa_voce_id and tx.cassa_voce_origine <> 'proposta'
       where tx.booking_date < make_date(p_anno + 1, 1, 1)
         and (not tx.in_prima_nota or v.id is not null)), '[]'::jsonb),
    'dopo_anno_cents', (select coalesce(sum(tx.cents), 0) from tx
                         where tx.booking_date >= make_date(p_anno + 1, 1, 1) and not tx.in_prima_nota))
  into r;
  return r;
end $$;
revoke all on function public.cassa_rendiconto_banca(uuid, integer) from public, anon;
grant execute on function public.cassa_rendiconto_banca(uuid, integer) to authenticated;

-- Le funzioni di trigger non hanno bisogno di EXECUTE.
revoke all on function private.cassa_voci_gerarchia() from public, anon, authenticated;
revoke all on function private.cassa_voce_registra_storico() from public, anon, authenticated;

comment on table public.treasury_categories is
  'SUPERATA dal 14/11/2026 da cassa_voci (catalogo di cassa per azienda). Nessuna schermata la usa; resta per company_costs.treasury_category_id, sempre vuota.';
