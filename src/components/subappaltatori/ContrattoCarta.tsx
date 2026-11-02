import { useCallback, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileCheck2, Upload, FileText, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import {
  BUCKET_CONTRATTI_CARTA,
  validaScansioneContratto,
} from "@/lib/subappaltatori/contrattoCarta";

type Copia = {
  id: string;
  firmato_il: string;
  firmato_da: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  archiviato_il: string;
};
export function ContrattoCarta({
  companyId,
  contratto,
  firmaElettronica,
  onSaved,
  children,
}: {
  companyId: string;
  contratto: {
    id: string;
    numero_contratto: string | null;
    firmato_il: string | null;
    firmato_da: string | null;
  };
  firmaElettronica: boolean;
  onSaved: () => void;
  children?: ReactNode;
}) {
  const p = usePermissions();
  const lettura = p.canViewCosts && p.canViewSubappaltatoriAmministrazione;
  const scrittura =
    lettura && p.canEditOrders && !p.solaLettura && !firmaElettronica;
  const [open, setOpen] = useState(false),
    [modulo, setModulo] = useState(false);
  const [file, setFile] = useState<File | null>(null),
    [mime, setMime] = useState("");
  const [data, setData] = useState(
    contratto.firmato_il?.slice(0, 10) ??
      new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(
        new Date(),
      ),
  );
  const [nome, setNome] = useState(contratto.firmato_da ?? "");
  const [conferma, setConferma] = useState(false),
    [busy, setBusy] = useState(false),
    [errore, setErrore] = useState("");
  const [selezionata, setSelezionata] = useState<Copia | null>(null),
    [immagine, setImmagine] = useState("");
  const [uscita, setUscita] = useState(false);
  const richiesta = useRef(crypto.randomUUID()),
    inCorso = useRef(false);
  const q = useQuery({
    queryKey: ["contratto-carta", companyId, contratto.id],
    enabled: lettura,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subappalto_contratti_carta" as never)
        .select(
          "id,firmato_il,firmato_da,file_path,file_name,mime_type,archiviato_il",
        )
        .eq("company_id", companyId)
        .eq("contratto_id", contratto.id)
        .eq("stato", "archiviato")
        .order("archiviato_il", { ascending: false })
        .limit(21);
      if (error) throw Error("Copie firmate non disponibili. Riprova.");
      return (data ?? []) as unknown as Copia[];
    },
  });
  const renderPdf = useCallback(async () => {
    if (!selezionata) throw Error("Seleziona una copia");
    const { data, error } = await supabase.storage
      .from(BUCKET_CONTRATTI_CARTA)
      .createSignedUrl(selezionata.file_path, 300);
    if (error || !data?.signedUrl)
      throw Error("File non disponibile. Riprova.");
    return data.signedUrl;
  }, [selezionata]);
  const cambia = () => {
    richiesta.current = crypto.randomUUID();
    setErrore("");
  };
  const chiudi = () => {
    if (inCorso.current) return;
    if (file) setUscita(true);
    else setOpen(false);
  };
  const scegli = async (f: File | undefined) => {
    cambia();
    setFile(null);
    setConferma(false);
    if (!f) return;
    try {
      const m = await validaScansioneContratto(f);
      setMime(m);
      setFile(f);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "File non leggibile");
    }
  };
  const registra = async () => {
    if (inCorso.current || !scrittura || !file || !conferma) return;
    inCorso.current = true;
    setBusy(true);
    setErrore("");
    try {
      const { data: r, error } = await supabase.rpc(
        "subappalto_carta_prepara" as never,
        {
          p_company: companyId,
          p_contratto: contratto.id,
          p_id: richiesta.current,
          p_data: data,
          p_firmato_da: nome,
          p_nome: file.name,
          p_mime: mime,
          p_dimensione: file.size,
        } as never,
      );
      if (error) throw Error(error.message);
      const d = r as unknown as {
        id?: string;
        file_path?: string;
        file_caricato?: boolean;
        stato?: string;
      };
      if (d?.id !== richiesta.current || !d.file_path)
        throw Error("Caricamento non confermato. Riprova.");
      if (!d.file_caricato) {
        const u = await supabase.storage
          .from(BUCKET_CONTRATTI_CARTA)
          .upload(d.file_path, file, { contentType: mime, upsert: false });
        if (u.error)
          throw Error("File non caricato. Controlla la connessione e riprova.");
      }
      const f = await supabase.rpc(
        "subappalto_carta_conferma" as never,
        { p_company: companyId, p_id: d.id } as never,
      );
      if (f.error) {
        // Il contratto è cambiato tra preparazione e conferma: la prossima prova riparte da una richiesta nuova,
        // altrimenti riuserebbe la fotografia vecchia e fallirebbe per sempre.
        if (/cambiato durante il caricamento/i.test(f.error.message)) richiesta.current = crypto.randomUUID();
        throw Error(f.error.message);
      }
      if ((f.data as unknown as { id?: string })?.id !== d.id)
        throw Error("Registrazione non confermata. Riprova.");
      setFile(null);
      setConferma(false);
      setModulo(false);
      richiesta.current = crypto.randomUUID();
      onSaved();
      await q.refetch();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Registrazione non riuscita");
    } finally {
      inCorso.current = false;
      setBusy(false);
    }
  };
  const consulta = async (d: Copia) => {
    setErrore("");
    setSelezionata(d);
    setImmagine("");
    if (d.mime_type !== "application/pdf") {
      try {
        const r = await supabase.storage
          .from(BUCKET_CONTRATTI_CARTA)
          .createSignedUrl(d.file_path, 300);
        if (r.error || !r.data?.signedUrl)
          throw Error("Immagine non disponibile");
        setImmagine(r.data.signedUrl);
      } catch (e) {
        setErrore(e instanceof Error ? e.message : "File non disponibile");
      }
    }
  };
  if (!lettura) return null;
  return (
    <>
      <section
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50/60 p-3"
        aria-label="Copia firmata del contratto"
      >
        <div className="flex min-w-0 items-start gap-2">
          <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium">Contratto e firma</p>
            <p className="text-xs text-muted-foreground">
              {q.isLoading
                ? "Caricamento copie…"
                : q.isError
                  ? "Verifica copie non disponibile"
                  : q.data?.length
                    ? "Copia cartacea archiviata"
                    : contratto.firmato_il
                      ? "Firma registrata · copia cartacea non allegata"
                      : "Prepara il contratto o allega la scansione già firmata."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {children}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setErrore("");
              setSelezionata(null);
              setModulo(!q.data?.length && !firmaElettronica);
              setOpen(true);
            }}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            {q.data?.length ? "Copie firmate" : "Carica firmato su carta"}
          </Button>
        </div>
      </section>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) chiudi();
        }}
      >
        <DialogContent
          className={`flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 ${selezionata ? "h-[90dvh] max-w-5xl" : "max-w-xl"}`}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b p-4 pr-12">
            <DialogTitle>
              {selezionata ? "Copia firmata" : "Contratto firmato su carta"}
            </DialogTitle>
            <DialogDescription>
              {contratto.numero_contratto ?? "Contratto di subappalto"} · La
              scansione resta collegata a questo contratto.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
            {selezionata ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelezionata(null)}
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Torna alle copie
                </Button>
                <p className="break-words text-sm">
                  {selezionata.file_name} ·{" "}
                  {selezionata.firmato_il.split("-").reverse().join("/")} ·{" "}
                  {selezionata.firmato_da}
                </p>
                {selezionata.mime_type === "application/pdf" ? (
                  <div className="h-[60dvh]">
                    <PdfBlobLivePreviewPanel
                      renderBlobUrl={renderPdf}
                      depsKey={selezionata.id}
                      allowOpenInNewTab={false}
                      headerLabel="Copia firmata"
                      downloadFileName={selezionata.file_name}
                    />
                  </div>
                ) : immagine ? (
                  <img
                    className="mx-auto max-h-[65dvh] max-w-full object-contain"
                    src={immagine}
                    alt={`Copia firmata: ${selezionata.file_name}`}
                  />
                ) : (
                  <p role="status">Caricamento immagine…</p>
                )}
              </>
            ) : (
              <>
                {q.isError && (
                  <p role="alert" className="text-sm text-destructive">
                    {q.error.message}
                    <Button variant="link" onClick={() => void q.refetch()}>
                      Riprova
                    </Button>
                  </p>
                )}
                {!!q.data?.length && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={modulo ? "outline" : "default"}
                      disabled={busy}
                      onClick={() => {
                        if (file) {
                          setErrore(
                            "Completa o annulla prima il caricamento in corso.",
                          );
                          return;
                        }
                        setModulo(false);
                      }}
                    >
                      Copie archiviate
                    </Button>
                    <Button
                      size="sm"
                      variant={modulo ? "default" : "outline"}
                      disabled={!scrittura || busy}
                      onClick={() => setModulo(true)}
                    >
                      Carica nuova copia
                    </Button>
                  </div>
                )}
                {!modulo &&
                  q.data?.slice(0, 20).map((d) => (
                    <button
                      key={d.id}
                      className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => void consulta(d)}
                    >
                      <FileText className="h-5 w-5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <strong className="block break-words text-sm">
                          {d.file_name}
                        </strong>
                        <small className="text-muted-foreground">
                          Firmato il{" "}
                          {d.firmato_il.split("-").reverse().join("/")} ·{" "}
                          {d.firmato_da}
                        </small>
                      </span>
                      <span className="text-xs text-primary">Apri</span>
                    </button>
                  ))}
                {!modulo && q.data && q.data.length > 20 && (
                  <p className="text-xs text-muted-foreground">
                    Sono mostrate le 20 copie più recenti.
                  </p>
                )}
                {firmaElettronica && (
                  <p className="rounded-lg border bg-muted p-3 text-sm">
                    È presente una richiesta di firma elettronica attiva o
                    completata. Gestiscila prima di registrare una firma
                    cartacea.
                  </p>
                )}
                {modulo && (
                  <fieldset disabled={!scrittura || busy} className="space-y-4">
                    <div className="rounded-xl border-2 border-dashed bg-muted/30 p-4">
                      <Label
                        htmlFor={`carta-file-${contratto.id}`}
                        className="mb-2 block"
                      >
                        Scansione del contratto firmato
                      </Label>
                      <Input
                        id={`carta-file-${contratto.id}`}
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                        onChange={(e) => void scegli(e.target.files?.[0])}
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                        PDF, JPG o PNG · fino a 20 MB. Includi tutte le pagine e
                        le firme.
                      </p>
                      {file && (
                        <p className="mt-2 break-words text-sm font-medium">
                          {file.name} ·{" "}
                          {(file.size / 1024 / 1024).toLocaleString("it-IT", {
                            maximumFractionDigits: 2,
                          })}{" "}
                          MB
                        </p>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="carta-data">
                          Data della firma su carta
                        </Label>
                        <Input
                          id="carta-data"
                          type="date"
                          value={data}
                          max={new Intl.DateTimeFormat("sv-SE", {
                            timeZone: "Europe/Rome",
                          }).format(new Date())}
                          onChange={(e) => {
                            cambia();
                            setData(e.target.value);
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="carta-firmatario">
                          Firmatario per il subappaltatore
                        </Label>
                        <Input
                          id="carta-firmatario"
                          value={nome}
                          maxLength={200}
                          placeholder="Nome e cognome"
                          onChange={(e) => {
                            cambia();
                            setNome(e.target.value);
                          }}
                        />
                      </div>
                    </div>
                    <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={conferma}
                        onChange={(e) => setConferma(e.target.checked)}
                      />
                      <span>
                        Ho verificato che il file sia la copia firmata di questo
                        contratto.
                      </span>
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Il caricamento conserva una copia della firma già raccolta
                      su carta. Le copie precedenti non vengono sostituite e non
                      viene avviata una firma elettronica.
                    </p>
                  </fieldset>
                )}
              </>
            )}
            {errore && (
              <p
                role="alert"
                className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                {errore}
              </p>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t p-3">
            <Button variant="outline" disabled={busy} onClick={chiudi}>
              Chiudi
            </Button>
            {modulo && !selezionata && (
              <Button
                disabled={
                  !scrittura ||
                  busy ||
                  !file ||
                  !conferma ||
                  !data ||
                  nome.trim().length < 2
                }
                onClick={() => void registra()}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {busy ? "Caricamento…" : "Archivia copia firmata"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={uscita} onOpenChange={setUscita}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chiudere il caricamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Il file selezionato non risulta ancora archiviato come copia
              firmata. Le copie già registrate restano conservate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continua caricamento</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setFile(null);
                setConferma(false);
                setUscita(false);
                setOpen(false);
                richiesta.current = crypto.randomUUID();
              }}
            >
              Chiudi senza archiviare
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
