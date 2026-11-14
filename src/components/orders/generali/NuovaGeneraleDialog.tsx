// src/components/orders/generali/NuovaGeneraleDialog.tsx
// Una schermata: tipo, nome, committente (o società dell'operazione), valore. Si può partire già
// pronti: unità preparate e piano con le voci tipiche. Il resto si completa dalla pagina della generale.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentGenerale as DialogContent } from "@/components/orders/generali/design/DialogGenerale";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScegliCliente } from "@/components/orders/generali/ScegliCliente";
import { Switch } from "@/components/ui/switch";
import { useAvviaGenerale } from "@/hooks/useAvviaGenerale";
import { usePermissions } from "@/hooks/usePermissions";
import { messaggioGenerale } from "@/hooks/useCommesseGenerali";
import { leggiQuanteUnita, meseCorrente, unitaDiPartenza } from "@/lib/orders/generali/avvio";
import { vociDiPartenza } from "@/lib/orders/generali/pianoCategorie";
import { leggiImporto } from "@/lib/controlloGestione/formatCG";
import { DEFINIZIONI_MODELLI, type ModelloGenerale } from "@/lib/orders/commesseGenerali";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** I modelli accesi dall'azienda; `iniziale` è quello scelto nella finestra precedente. */
  modelli: ModelloGenerale[];
  iniziale: ModelloGenerale | null;
}

export function NuovaGeneraleDialog({ open, onOpenChange, modelli, iniziale }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {/* Il modulo nasce a ogni apertura: si riparte sempre da campi vuoti. */}
        <Modulo onOpenChange={onOpenChange} modelli={modelli} iniziale={iniziale} />
      </DialogContent>
    </Dialog>
  );
}

function Modulo({ onOpenChange, modelli, iniziale }: Omit<Props, "open">) {
  const navigate = useNavigate();
  const crea = useAvviaGenerale();
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
  const [tipoAppalto, setTipoAppalto] = useState<"" | "Pubblico" | "Privato">("");
  const [indirizzo, setIndirizzo] = useState("");
  const [inizio, setInizio] = useState("");
  const [prezzoTesto, setPrezzoTesto] = useState("");
  const [rogito, setRogito] = useState("");

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
  const puoCreare = !!modello && nome.trim().length > 0 && !valoreSbagliato && !prezzoSbagliato && !senzaCommittente && quante !== null && !crea.isPending;

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
  /** Compravendita: il prezzo e il mese del rogito diventano la voce d'acquisto del piano. */
  const vociIniziali = () => {
    if (!modello) return null;
    const voci = vociDiPartenza(modello, meseCorrente(), valore);
    if (modello !== "compravendita" || !prezzo) return voci;
    return voci.map((v) => (v.tipo === "costo" && v.categoria === "terreno" ? { ...v, importo: prezzo, nota: null, mese: rogito ? rogito.slice(0, 7) : v.mese } : v));
  };

  const conferma = () => {
    if (!modello || !puoCreare) return;
    crea.mutate(
      {
        nuova: { modello, nome: nome.trim(), clienteId, valore },
        unita: unitaDiPartenza(quante ?? 0),
        voci: conPiano && puoFarePiano && originePiano === "tipiche" ? vociIniziali() : null,
        dati: datiIniziali(),
      },
      {
        onSuccess: ({ id, rimasti }) => {
          if (rimasti.length > 0) {
            toast.warning("Commessa generale creata", { description: `Non sono riuscito a preparare ${rimasti.map((x) => (x === "unita" ? "le unità" : x === "piano" ? "il piano" : "i dati")).join(" e ")}: fallo dalla sua pagina.` });
          } else {
            toast.success("Commessa generale creata");
          }
          onOpenChange(false);
          navigate(`/azienda/ordini/${id}${modello === "appalto" && importaContratto ? "?scheda=contratto&importa-contratto=1" : conPiano && puoFarePiano && originePiano === "excel" ? "?scheda=piano&importa=1" : ""}`);
        },
        onError: (e) => toast.error(messaggioGenerale(e, "la commessa generale")),
      },
    );
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>Nuova commessa generale</DialogTitle>
          <DialogDescription>Gestisci budget, documenti e lavoro dell'intera operazione. Puoi aggiungere le unità o collegare le commesse anche in seguito.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); conferma(); }}
        >
          {modelli.length > 1 && (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Tipo</legend>
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
                    {DEFINIZIONI_MODELLI[m].nome}
                    <span className="mt-0.5 block text-[11px] font-normal leading-snug text-muted-foreground">{DEFINIZIONI_MODELLI[m].perChi}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {modelli.length <= 1 && def && <p className="-mt-1 text-xs text-muted-foreground">{def.perChi}</p>}
          {!modello && <p className="text-sm text-muted-foreground">Scegli il tipo: i dati da chiedere dipendono da questo.</p>}
          {modello && <>

          <div className="space-y-1.5">
            <Label htmlFor="generale-nome">Nome</Label>
            <Input id="generale-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={def?.esempio ?? ""} autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="generale-cliente">
              {def?.cliente.etichetta ?? "Cliente"} {!appalto && <span className="font-normal text-muted-foreground">(facoltativo)</span>}
            </Label>
            <ScegliCliente id="generale-cliente" valore={clienteId} onCambia={setClienteId} />
            {conUnita && <p className="text-xs text-muted-foreground">È un riferimento dell'anagrafica clienti. La commessa e i documenti appartengono all'azienda attiva nel gestionale.</p>}
            {senzaCommittente && <p className="text-xs text-muted-foreground">Scegli il committente: senza, il contratto e le fatture non hanno a chi andare.</p>}
          </div>

          {appalto && (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Appalto <span className="font-normal text-muted-foreground">(facoltativo)</span></legend>
              <div className="flex gap-2" role="radiogroup">
                {(["Pubblico", "Privato"] as const).map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={tipoAppalto === t} onClick={() => setTipoAppalto(tipoAppalto === t ? "" : t)}
                    className={cn("rounded-md border px-3 py-1.5 text-xs font-medium", tipoAppalto === t ? "border-primary bg-primary/5" : "text-muted-foreground hover:border-primary/50")}>
                    {t}
                  </button>
                ))}
              </div>
              {tipoAppalto === "Pubblico" && <p className="text-xs text-muted-foreground">CIG, CUP, RUP e scissione dei pagamenti si completano nella scheda Dati e nel contratto.</p>}
            </fieldset>
          )}

          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <div className="space-y-1.5">
              <Label htmlFor="generale-indirizzo">
                {modello === "compravendita" ? "Indirizzo dell'immobile" : modello === "sviluppo" ? "Indirizzo dell'area" : "Indirizzo del cantiere"} <span className="font-normal text-muted-foreground">(facoltativo)</span>
              </Label>
              <Input id="generale-indirizzo" value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)} placeholder="Via, numero, comune" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="generale-inizio">{appalto ? "Consegna lavori" : "Inizio lavori"}</Label>
              <Input id="generale-inizio" type="date" value={inizio} onChange={(e) => setInizio(e.target.value)} />
            </div>
          </div>

          {modello === "compravendita" && (
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
              <div className="space-y-1.5">
                <Label htmlFor="generale-prezzo">Prezzo d'acquisto <span className="font-normal text-muted-foreground">(facoltativo, al netto dell'IVA)</span></Label>
                <Input id="generale-prezzo" inputMode="decimal" value={prezzoTesto} onChange={(e) => setPrezzoTesto(e.target.value)} placeholder="es. 185.000" aria-invalid={prezzoSbagliato || undefined} />
                {prezzoSbagliato && <p className="text-xs text-destructive">Scrivi un importo, ad esempio 185.000.</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="generale-rogito">Rogito d'acquisto</Label>
                <Input id="generale-rogito" type="date" value={rogito} onChange={(e) => setRogito(e.target.value)} />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="generale-valore">
              {def?.valore.etichetta ?? "Valore"} <span className="font-normal text-muted-foreground">(facoltativo, al netto dell'IVA)</span>
            </Label>
            <Input
              id="generale-valore"
              inputMode="decimal"
              value={valoreTesto}
              onChange={(e) => setValoreTesto(e.target.value)}
              placeholder="es. 3.000.000"
              aria-invalid={valoreSbagliato || undefined}
              aria-describedby="generale-valore-aiuto"
            />
            <p id="generale-valore-aiuto" className={cn("text-xs", valoreSbagliato ? "text-destructive" : "text-muted-foreground")}>
              {valoreSbagliato ? "Scrivi un importo, ad esempio 3.000.000 o 2500,50." : def?.valore.aiuto}
            </p>
          </div>

          {conUnita && (
            <div className="space-y-1.5">
              <Label htmlFor="generale-quante">Quante unità? <span className="font-normal text-muted-foreground">(facoltativo)</span></Label>
              <Input
                id="generale-quante"
                inputMode="numeric"
                value={quanteTesto}
                onChange={(e) => setQuanteTesto(e.target.value)}
                placeholder="es. 6"
                className="w-28"
                aria-invalid={quante === null || undefined}
                aria-describedby="generale-quante-aiuto"
              />
              <p id="generale-quante-aiuto" className={cn("text-xs", quante === null ? "text-destructive" : "text-muted-foreground")}>
                {quante === null ? "Scrivi un numero da 1 a 100." : quante > 0 ? `Le prepariamo come A1…A${quante}: nomi e prezzi li completi dopo.` : "Le puoi aggiungere dopo. Costi e rapportini possono stare sulla generale."}
              </p>
            </div>
          )}

          {modello === "appalto" && <label className="flex items-start gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={importaContratto} onChange={e => setImportaContratto(e.target.checked)} className="mt-1"/><span>Importa il contratto con l’AI dopo la creazione<span className="mt-1 block text-xs text-muted-foreground">PDF o immagine, poi verifica i dati in Contratto e SAL prima di salvarli.</span></span></label>}
          {puoFarePiano && <div className="flex items-center gap-2">
            <Switch id="generale-con-piano" checked={conPiano} onCheckedChange={setConPiano} />
            <Label htmlFor="generale-con-piano" className="text-sm font-normal">Prepara il piano economico</Label>
          </div>}
          {puoFarePiano && conPiano && modello === "compravendita" && prezzo ? <p className="-mt-2 text-xs text-muted-foreground">Il prezzo d'acquisto entra nel piano come voce d'acquisto{rogito ? ", nel mese del rogito" : ""}.</p> : null}
          {puoFarePiano && conPiano && <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-xs font-medium">Da dove vuoi partire?</legend>
            <label className="flex items-start gap-2 text-sm"><input type="radio" name="origine-piano" value="tipiche" checked={originePiano === "tipiche"} onChange={() => setOriginePiano("tipiche")} /><span>Voci tipiche da compilare</span></label>
            <label className="flex items-start gap-2 text-sm"><input type="radio" name="origine-piano" value="excel" checked={originePiano === "excel"} onChange={() => setOriginePiano("excel")} /><span>Ho già un business plan Excel o PDF<span className="mt-0.5 block text-xs text-muted-foreground">Dopo la creazione scegli il file e lo scenario. Le voci tipiche non vengono aggiunte.</span></span></label>
          </fieldset>}
          </>}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="submit" disabled={!puoCreare}>
              {crea.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crea commessa generale
            </Button>
          </DialogFooter>
        </form>
    </>
  );
}
