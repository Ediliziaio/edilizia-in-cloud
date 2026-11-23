// src/components/orders/generali/NuovaGeneraleDialog.tsx
// Una schermata: tipo, nome, committente (o società dell'operazione), valore. Si può partire già
// pronti: unità preparate e piano con le voci tipiche. Il resto si completa dalla pagina della generale.
import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileText, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentGenerale as DialogContent } from "@/components/orders/generali/design/DialogGenerale";
import { Input } from "@/components/ui/input";
import { CampoIndirizzo } from "@/components/shared/CampoIndirizzo";
import { Label } from "@/components/ui/label";
import { ScegliCliente } from "@/components/orders/generali/ScegliCliente";
import { Switch } from "@/components/ui/switch";
import { useAvviaGenerale } from "@/hooks/useAvviaGenerale";
import { usePermissions } from "@/hooks/usePermissions";
import { messaggioGenerale } from "@/hooks/useCommesseGenerali";
import { leggiQuanteUnita, meseCorrente, unitaDiPartenza } from "@/lib/orders/generali/avvio";
import { mesePartenzaPiano, vociDiPartenzaDalleDate } from "@/lib/orders/generali/pianoCategorie";
import { format } from "date-fns";
import { dateFnsCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import { leggiImporto } from "@/lib/controlloGestione/formatCG";
import { DEFINIZIONI_MODELLI, type ModelloGenerale } from "@/lib/orders/commesseGenerali";
import { cn } from "@/lib/utils";
import { CreaDaDocumenti } from "@/components/orders/generali/daDocumenti/CreaDaDocumenti";
import { tipoDaDocumenti } from "@/lib/orders/generali/daDocumenti/catalogo";
import { ACCEPT_INPUT, MAX_MB_PER_FILE, problemaFile } from "@/lib/commesse/documentiCommessa";

/** «2027-03» → «mar 2027» nella lingua scelta (come nomeMese, ma tradotto). */
const nomeMese = (mese: string | null | undefined) =>
  mese && /^\d{4}-\d{2}/.test(mese)
    ? format(new Date(Number(mese.slice(0, 4)), Number(mese.slice(5, 7)) - 1, 1), "LLL yyyy", { locale: dateFnsCampo() })
    : "—";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** I modelli accesi dall'azienda; `iniziale` è quello scelto nella finestra precedente. */
  modelli: ModelloGenerale[];
  iniziale: ModelloGenerale | null;
}

export function NuovaGeneraleDialog(props: Props) {
  return props.open ? <DialogAperto {...props} /> : null;
}

function DialogAperto({ open, onOpenChange, modelli, iniziale }: Props) {
  const crea = useAvviaGenerale();
  return (
    <Dialog open={open} onOpenChange={o => { if (!crea.isPending) onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {/* Il modulo nasce a ogni apertura: si riparte sempre da campi vuoti. */}
        <Modulo onOpenChange={onOpenChange} modelli={modelli} iniziale={iniziale} crea={crea} />
      </DialogContent>
    </Dialog>
  );
}

function Modulo({ onOpenChange, modelli, iniziale, crea }: Omit<Props, "open"> & { crea: ReturnType<typeof useAvviaGenerale> }) {
  const navigate = useNavigate();
  // `t` è già il nome del tipo d'appalto nel ciclo qui sotto.
  const tr = useT();
  const fileContrattoRef = useRef<HTMLInputElement>(null);
  // Il piano è dentro il permesso sui margini: chi non lo ha non può prepararlo.
  const permessi = usePermissions();
  const puoFarePiano = !!permessi.canViewMargins || !!permessi.isAdmin;
  // La tipologia decide i campi: si sceglie per prima, senza preselezione (se ce n'è più d'una).
  const [modello, setModello] = useState<ModelloGenerale | null>(iniziale ?? (modelli.length === 1 ? modelli[0] : null));
  const [nome, setNome] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [valoreTesto, setValoreTesto] = useState("");
  const [quanteTesto, setQuanteTesto] = useState("");
  const [conPiano, setConPiano] = useState(true);
  const [originePiano, setOriginePiano] = useState<"tipiche" | "excel">("tipiche");
  const [importaContratto, setImportaContratto] = useState(false);
  const [fileContratto, setFileContratto] = useState<File | null>(null);
  const [erroreContratto, setErroreContratto] = useState<string | null>(null);
  const [tipoAppalto, setTipoAppalto] = useState<"" | "Pubblico" | "Privato">("");
  const [indirizzo, setIndirizzo] = useState("");
  const [inizio, setInizio] = useState("");
  const [prezzoTesto, setPrezzoTesto] = useState("");
  const [rogito, setRogito] = useState("");
  // Commessa generale dai documenti (docs/piano-commessa-generale-da-documenti.md): con
  // ?prova-lettura=1 c'è anche la lettura di prova, con documenti e cifre inventati.
  const [cercaParametri] = useSearchParams();
  const provaLettura = cercaParametri.get("prova-lettura") === "1";

  const def = modello ? DEFINIZIONI_MODELLI[modello] : null;
  const valore = valoreTesto.trim() === "" ? null : leggiImporto(valoreTesto);
  const valoreSbagliato = valoreTesto.trim() !== "" && (valore === null || valore < 0);
  const conUnita = modello === "sviluppo" || modello === "compravendita";
  const quante = conUnita ? leggiQuanteUnita(quanteTesto) : 0;
  const appalto = modello === "appalto";
  const prezzo = prezzoTesto.trim() === "" ? null : leggiImporto(prezzoTesto);
  const prezzoSbagliato = prezzoTesto.trim() !== "" && (prezzo === null || prezzo < 0);
  // Un appalto senza committente non si fattura: lo chiede il modello (DEFINIZIONI_MODELLI).
  const senzaCommittente = appalto && !clienteId;
  const puoCreare = !!modello && nome.trim().length > 0 && !valoreSbagliato && !prezzoSbagliato && !senzaCommittente && quante !== null && !crea.isPending && !(appalto && erroreContratto);

  /** I dati chiesti qui vanno nella scheda «Dati»: solo quelli scritti. */
  const datiIniziali = (): Record<string, unknown> => {
    const d: Record<string, unknown> = {};
    if (indirizzo.trim()) d.indirizzo = indirizzo.trim();
    if (inizio) d.inizio = inizio;
    if (appalto && tipoAppalto) d.appalto = { tipo: tipoAppalto };
    if (modello === "compravendita" && (indirizzo.trim() || prezzo || rogito)) {
      d.immobile = { indirizzo: indirizzo.trim() || null, prezzo: prezzo || null, data_rogito: rogito || null };
    }
    return d;
  };
  /**
   * Le voci tipiche sul calendario delle date scritte qui: inizio lavori (o consegna) e, per la
   * compravendita, rogito e prezzo d'acquisto. Senza date partono dal mese corrente.
   */
  const dateScritte = { inizio, rogito: modello === "compravendita" ? rogito : null, prezzo: modello === "compravendita" ? prezzo : null };
  const vociIniziali = () => (modello ? vociDiPartenzaDalleDate(modello, valore, dateScritte, meseCorrente()) : null);
  const partenzaPiano = modello ? mesePartenzaPiano(modello, dateScritte, meseCorrente()) : null;
  const pianoDaDate = !!inizio || (modello === "compravendita" && !!rogito);
  const meseInizio = inizio ? nomeMese(inizio.slice(0, 7)) : null;
  const mesePiano = nomeMese(partenzaPiano);
  const calendario = !partenzaPiano ? null
    : !pianoDaDate
      ? (appalto ? tr("Il calendario parte da {mese}: con la consegna lavori si sposta da solo.", { mese: mesePiano })
        : modello === "compravendita" ? tr("Il calendario parte da {mese}: con il rogito o l'inizio della ristrutturazione si sposta da solo.", { mese: mesePiano })
          : tr("Il calendario parte da {mese}: con l'inizio dei lavori si sposta da solo.", { mese: mesePiano }))
      : appalto ? tr("Il calendario parte da {mese}, dalla consegna lavori.", { mese: mesePiano })
        : modello === "compravendita" && rogito
          ? (meseInizio
            ? tr("Il calendario parte dal rogito, {mese}; la ristrutturazione da {inizio}.", { mese: mesePiano, inizio: meseInizio })
            : tr("Il calendario parte dal rogito, {mese}.", { mese: mesePiano }))
          : modello === "compravendita"
            ? tr("La ristrutturazione parte da {inizio}; acquisto e pratiche prima, da {mese}.", { inizio: meseInizio ?? "", mese: mesePiano })
            : tr("La costruzione parte da {inizio}; terreno e progetto prima, da {mese}.", { inizio: meseInizio ?? "", mese: mesePiano });
  const conVociTipiche = puoFarePiano && conPiano && originePiano === "tipiche";
  // Appalto: contratto con l'AI e budget da Excel insieme. Si apre il contratto; il file si carica dopo.
  const excelDopoContratto = appalto && importaContratto && puoFarePiano && conPiano && originePiano === "excel";

  const conferma = () => {
    if (!modello || !puoCreare) return;
    crea.mutate(
      {
        nuova: { modello, nome: nome.trim(), clienteId, valore },
        unita: unitaDiPartenza(quante ?? 0),
        voci: conVociTipiche ? vociIniziali() : null,
        dati: datiIniziali(),
        ...(appalto && fileContratto ? { contratto: fileContratto } : {}),
      },
      {
        onSuccess: ({ id, rimasti }) => {
          if (rimasti.length > 0) {
            toast.warning(tr("Commessa generale creata"), { description: tr("Non sono riuscito a preparare {cosa}: completa dalla sua pagina, senza creare un'altra commessa.", { cosa: rimasti.map((x) => (x === "unita" ? tr("le unità") : x === "piano" ? tr("il piano") : x === "contratto" ? tr("il documento del contratto") : tr("i dati"))).join(` ${tr("e")} `) }) });
          } else {
            toast.success(tr("Commessa generale creata"));
          }
          onOpenChange(false);
          navigate(`/azienda/ordini/${id}${modello === "appalto" && importaContratto ? "?scheda=contratto&importa-contratto=1" : modello === "appalto" && fileContratto ? "?scheda=contratto" : conPiano && puoFarePiano && originePiano === "excel" ? "?scheda=piano&importa=1" : ""}`);
        },
        onError: (e) => toast.error(messaggioGenerale(e, "la commessa generale")),
      },
    );
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>{tr("Nuova commessa generale")}</DialogTitle>
          <DialogDescription>
            {tr("Gestisci budget, documenti e lavoro dell'intera operazione.")}{" "}
            {def ? tr("{tante} e commesse da collegare si aggiungono anche dopo, dalla sua pagina.", { tante: tr(def.figlia.tante) }) : tr("Unità, lotti e commesse da collegare si aggiungono anche dopo.")}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          aria-busy={crea.isPending}
          onSubmit={(e) => { e.preventDefault(); conferma(); }}
        >
          <fieldset disabled={crea.isPending} className="contents">
          {modelli.length > 1 && (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">{tr("Tipo")}</legend>
              <div className="grid gap-1.5 sm:grid-cols-3" role="radiogroup">
                {modelli.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={modello === m}
                    onClick={() => setModello(m)}
                    className={cn(
                      "rounded-md border px-2.5 py-2 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      modello === m ? "border-primary bg-primary/5 text-foreground" : "text-muted-foreground hover:border-primary/50",
                    )}
                  >
                    {tr(DEFINIZIONI_MODELLI[m].nome)}
                    <span className="mt-0.5 block text-[11px] font-normal leading-snug text-muted-foreground">{tr(DEFINIZIONI_MODELLI[m].perChi)}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {modelli.length <= 1 && def && <p className="-mt-1 text-xs text-muted-foreground">{tr(def.perChi)}</p>}
          {!modello && <p className="text-sm text-muted-foreground">{tr("Scegli il tipo: i dati da chiedere dipendono da questo.")}</p>}
          {modello && <>

          <div className="space-y-1.5">
            <Label htmlFor="generale-nome">{tr("Nome")}</Label>
            <Input id="generale-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={def ? tr(def.esempio) : ""} autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="generale-cliente">
              {def ? tr(def.cliente.etichetta) : tr("Cliente")} {!appalto && <span className="font-normal text-muted-foreground">{tr("(facoltativo)")}</span>}
            </Label>
            <ScegliCliente id="generale-cliente" valore={clienteId} onCambia={setClienteId} consentiNuovo />
            {conUnita && <p className="text-xs text-muted-foreground">{tr("È un riferimento dell'anagrafica clienti. La commessa e i documenti appartengono all'azienda attiva nel gestionale.")}</p>}
            {senzaCommittente && <p className="text-xs text-muted-foreground">{tr("Scegli il committente, o crealo con «Nuovo» se non è in anagrafica: senza, il contratto e le fatture non hanno a chi andare.")}</p>}
          </div>

          {appalto && (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">{tr("Appalto")} <span className="font-normal text-muted-foreground">{tr("(facoltativo)")}</span></legend>
              <div className="flex gap-2" role="radiogroup">
                {(["Pubblico", "Privato"] as const).map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={tipoAppalto === t} onClick={() => setTipoAppalto(tipoAppalto === t ? "" : t)}
                    className={cn("rounded-md border px-3 py-1.5 text-xs font-medium", tipoAppalto === t ? "border-primary bg-primary/5" : "text-muted-foreground hover:border-primary/50")}>
                    {t === "Pubblico" ? tr("Pubblico") : tr("Privato")}
                  </button>
                ))}
              </div>
              {tipoAppalto === "Pubblico" && <p className="text-xs text-muted-foreground">{tr("CIG, CUP, RUP e scissione dei pagamenti si completano nella scheda Dati e nel contratto.")}</p>}
            </fieldset>
          )}

          {appalto && (
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <Label htmlFor="generale-file-contratto" className="flex items-center gap-2"><FileText className="h-4 w-4" aria-hidden="true" />{tr("Contratto d’appalto originale")} <span className="font-normal text-muted-foreground">{tr("(facoltativo)")}</span></Label>
              <p id="generale-file-aiuto" className="text-xs text-muted-foreground">{tr("Carica qui il contratto della commessa principale, anche con molte pagine. I contratti applicativi e gli ordini di lavoro avranno i propri documenti.")}</p>
              <Input ref={fileContrattoRef} id="generale-file-contratto" type="file" accept={ACCEPT_INPUT} disabled={crea.isPending} aria-describedby={`generale-file-aiuto generale-file-limite${erroreContratto ? " generale-file-errore" : ""}`} aria-invalid={!!erroreContratto} onChange={e => {
                const file = e.target.files?.[0] ?? null;
                const errore = file ? problemaFile(file) : null;
                setErroreContratto(errore); setFileContratto(errore ? null : file);
              }} />
              <p id="generale-file-limite" className="text-xs text-muted-foreground">{tr("PDF, documenti firmati e altri formati dell’archivio · massimo {mb} MB. L’originale viene conservato integralmente; l’AI è facoltativa.", { mb: MAX_MB_PER_FILE })}</p>
              {erroreContratto && <p id="generale-file-errore" role="alert" className="text-xs text-destructive">{erroreContratto}</p>}
              {(fileContratto || erroreContratto) && <Button type="button" variant="ghost" size="sm" disabled={crea.isPending} onClick={() => { setFileContratto(null); setErroreContratto(null); if (fileContrattoRef.current) fileContrattoRef.current.value = ""; }}><X className="mr-1 h-3.5 w-3.5" />{tr("Rimuovi file selezionato")}</Button>}
            </div>
          )}

          {appalto && (
            <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <input type="checkbox" checked={importaContratto} onChange={(e) => setImportaContratto(e.target.checked)} className="mt-1" />
              <span>
                {tr("Ho il contratto: importalo con l’AI dopo la creazione")}
                <span className="mt-1 block text-xs text-muted-foreground">{tr("Facoltativo, per leggere i dati da PDF o immagini fino a 18 MB. Il caricamento dell’originale qui sopra funziona anche senza AI e non cambia importi, date o SAL.")}</span>
              </span>
            </label>
          )}

          {modello && <CreaDaDocumenti tipo={tipoDaDocumenti(modello, tipoAppalto)} prova={provaLettura} onCreata={() => onOpenChange(false)} />}

          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <div className="space-y-1.5">
              <Label htmlFor="generale-indirizzo">
                {modello === "compravendita" ? tr("Indirizzo dell'immobile") : modello === "sviluppo" ? tr("Indirizzo dell'area") : tr("Indirizzo del cantiere")} <span className="font-normal text-muted-foreground">{tr("(facoltativo)")}</span>
              </Label>
              <CampoIndirizzo id="generale-indirizzo" value={indirizzo} onChange={setIndirizzo} placeholder={tr("Via, numero, comune")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="generale-inizio">
                {appalto ? tr("Consegna lavori") : modello === "compravendita" ? tr("Inizio ristrutturazione") : tr("Inizio lavori")}
              </Label>
              <Input id="generale-inizio" type="date" value={inizio} onChange={(e) => setInizio(e.target.value)} />
            </div>
          </div>

          {modello === "compravendita" && (
            <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
              <div className="space-y-1.5">
                <Label htmlFor="generale-prezzo">{tr("Prezzo d'acquisto")} <span className="font-normal text-muted-foreground">{tr("(facoltativo, al netto dell'IVA)")}</span></Label>
                <Input id="generale-prezzo" inputMode="decimal" value={prezzoTesto} onChange={(e) => setPrezzoTesto(e.target.value)} placeholder={tr("es. 185.000")} aria-invalid={prezzoSbagliato || undefined} />
                {prezzoSbagliato && <p className="text-xs text-destructive">{tr("Scrivi un importo, ad esempio 185.000.")}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="generale-rogito">{tr("Rogito d'acquisto")}</Label>
                <Input id="generale-rogito" type="date" value={rogito} onChange={(e) => setRogito(e.target.value)} />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="generale-valore">
              {def ? tr(def.valore.etichetta) : tr("Valore")} <span className="font-normal text-muted-foreground">{tr("(facoltativo, al netto dell'IVA)")}</span>
            </Label>
            <Input
              id="generale-valore"
              inputMode="decimal"
              value={valoreTesto}
              onChange={(e) => setValoreTesto(e.target.value)}
              placeholder={tr("es. 3.000.000")}
              aria-invalid={valoreSbagliato || undefined}
              aria-describedby="generale-valore-aiuto"
            />
            <p id="generale-valore-aiuto" className={cn("text-xs", valoreSbagliato ? "text-destructive" : "text-muted-foreground")}>
              {valoreSbagliato ? tr("Scrivi un importo, ad esempio 3.000.000 o 2500,50.") : appalto && importaContratto ? tr("Puoi lasciarlo vuoto: lo legge l’AI dal contratto.") : def ? tr(def.valore.aiuto) : null}
            </p>
          </div>

          {conUnita && (
            <div className="space-y-1.5">
              <Label htmlFor="generale-quante">{modello === "compravendita" ? tr("In quante parti lo rivendi?") : tr("Quante unità?")} <span className="font-normal text-muted-foreground">{tr("(facoltativo)")}</span></Label>
              <Input
                id="generale-quante"
                inputMode="numeric"
                value={quanteTesto}
                onChange={(e) => setQuanteTesto(e.target.value)}
                placeholder={modello === "compravendita" ? tr("es. 2") : tr("es. 6")}
                className="w-28"
                aria-invalid={quante === null || undefined}
                aria-describedby="generale-quante-aiuto"
              />
              <p id="generale-quante-aiuto" className={cn("text-xs", quante === null ? "text-destructive" : "text-muted-foreground")}>
                {quante === null
                  ? tr("Scrivi un numero da 1 a 100.")
                  : modello === "compravendita" && quante === 1
                    ? tr("Lo rivendi intero: prepariamo un'unità, A1. Prezzo e dati li completi dopo.")
                    : quante > 0
                      ? tr("Le prepariamo come A1…A{n}: nomi e prezzi li completi dopo.", { n: quante })
                      : modello === "compravendita"
                        ? tr("1 se lo rivendi intero, 2 o più se lo dividi. Puoi deciderlo anche dopo.")
                        : tr("Le puoi aggiungere dopo. Costi e rapportini possono stare sulla generale.")}
              </p>
            </div>
          )}

          {puoFarePiano && <div className="flex items-center gap-2">
            <Switch id="generale-con-piano" checked={conPiano} onCheckedChange={setConPiano} />
            <Label htmlFor="generale-con-piano" className="text-sm font-normal">{tr("Prepara il piano economico")}</Label>
          </div>}
          {conVociTipiche && modello === "compravendita" && prezzo ? <p className="-mt-2 text-xs text-muted-foreground">{rogito ? tr("Il prezzo d'acquisto entra nel piano come voce d'acquisto, nel mese del rogito.") : tr("Il prezzo d'acquisto entra nel piano come voce d'acquisto.")}</p> : null}
          {puoFarePiano && conPiano && <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-xs font-medium">{tr("Da dove vuoi partire?")}</legend>
            <label className="flex items-start gap-2 text-sm"><input type="radio" name="origine-piano" value="tipiche" checked={originePiano === "tipiche"} onChange={() => setOriginePiano("tipiche")} /><span>{tr("Voci tipiche da compilare")}{originePiano === "tipiche" && calendario && <span className="mt-0.5 block text-xs text-muted-foreground">{calendario}</span>}</span></label>
            <label className="flex items-start gap-2 text-sm"><input type="radio" name="origine-piano" value="excel" checked={originePiano === "excel"} onChange={() => setOriginePiano("excel")} /><span>{appalto ? tr("Ho già il budget in Excel o PDF") : tr("Ho già un business plan Excel o PDF")}<span className="mt-0.5 block text-xs text-muted-foreground">{excelDopoContratto ? tr("Prima si apre il contratto da importare: il file lo carichi poi dalla scheda Piano. Le voci tipiche non vengono aggiunte.") : appalto ? tr("Dopo la creazione scegli il file. Le voci tipiche non vengono aggiunte.") : tr("Dopo la creazione scegli il file e lo scenario. Le voci tipiche non vengono aggiunte.")}</span></span></label>
          </fieldset>}
          </>}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{tr("Annulla")}</Button>
            <Button type="submit" disabled={!puoCreare}>
              {crea.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tr("Crea commessa generale")}
            </Button>
          </DialogFooter>
          </fieldset>
          {crea.isPending && fileContratto && <p role="status" className="text-sm text-muted-foreground">{tr("Creazione della commessa e archiviazione del contratto originale in corso…")}</p>}
        </form>
    </>
  );
}
