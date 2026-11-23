/**
 * La scheda di una linea: foto del profilo, descrizione, dati tecnici e scheda
 * del produttore, scritti una volta per tutti i prodotti della linea.
 *
 * Il modulo parte dalla scheda salvata quando si apre (il contenitore lo monta
 * a ogni apertura); foto e PDF scelti restano in attesa finché non si salva.
 */
import { useRef, useState, type ChangeEvent } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { GalleriaImmaginiCatalogo } from "./GalleriaImmaginiCatalogo";
import { leggiImmaginiCatalogo, type BozzaImmagineCatalogo } from "@/lib/listino/immaginiCatalogo";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { controllaFileScheda, useSalvaSchedaLinea } from "@/hooks/useSchedeLinea";
import type { LineaListino, TipologiaListino } from "@/lib/listino/lineeListino";
import {
  bozzaDaScheda,
  DESCRIZIONE_SCHEDA_MAX,
  leggiBozzaScheda,
  type BozzaScheda,
  type SchedaLinea,
} from "@/lib/listino/schedeLinea";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  tipologia: TipologiaListino;
  linea: LineaListino;
  scheda: SchedaLinea | null;
  onChiudi: () => void;
}

export function SchedaLineaDialog({ tipologia, linea, scheda, onChiudi }: Props) {
  const t = useT();
  const salva = useSalvaSchedaLinea();
  const [bozza, setBozza] = useState<BozzaScheda>(() => bozzaDaScheda(scheda));
  const [errori, setErrori] = useState<Partial<Record<keyof BozzaScheda, string>>>({});
  const [immagini, setImmagini] = useState<BozzaImmagineCatalogo[]>(() => leggiImmaginiCatalogo(scheda?.immagini, scheda?.immagine_url));
  const [pdf, setPdf] = useState<File | null>(null);
  const [togliPdf, setTogliPdf] = useState(false);
  const inputPdf = useRef<HTMLInputElement>(null);

  const pdfSalvato = togliPdf ? null : (scheda?.scheda_tecnica_url ?? null);
  const pdfNome = pdf?.name ?? (pdfSalvato ? scheda?.scheda_tecnica_nome || t("Scheda del produttore") : null);

  const campo = (chiave: keyof BozzaScheda) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const valore = e.target.value;
    setBozza((prima) => ({ ...prima, [chiave]: valore }));
    if (errori[chiave]) setErrori((prima) => ({ ...prima, [chiave]: undefined }));
  };

  const scegliPdf = (file: File | undefined) => {
    if (!file) return;
    const errore = controllaFileScheda("pdf", file);
    if (errore) {
      toast.error(errore);
      return;
    }
    setPdf(file);
    setTogliPdf(false);
  };

  const conferma = async () => {
    const esito = leggiBozzaScheda(bozza);
    // «in» restringe il tipo anche senza strictNullChecks, il booleano no.
    if ("errori" in esito) {
      setErrori(esito.errori);
      return;
    }
    try {
      await salva.mutateAsync({
        esistente: scheda,
        macrocategoriaId: tipologia.macrocategoriaId,
        nomeLinea: linea.nome,
        ...esito.valori,
        immagini,
        foto: null,
        togliFoto: false,
        pdf,
        togliPdf,
      });
      toast.success(t("Scheda di {nome} salvata", { nome: linea.nome }), {
        description: t("Compare nel preventivatore quando si sceglie la linea e nel PDF del preventivo."),
      });
      onChiudi();
    } catch (err) {
      toast.error(t("Scheda non salvata"), { description: err instanceof Error ? err.message : t("Errore sconosciuto") });
    }
  };

  const prodotti = linea.righe.length;

  return (
    <Dialog
      open
      onOpenChange={(aperta) => {
        if (!aperta && !salva.isPending) onChiudi();
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Scheda di {nome}", { nome: linea.nome })}</DialogTitle>
          <DialogDescription>
            {prodotti === 1
              ? t("Vale per il prodotto della linea in {tipologia}. Il commerciale la vede quando sceglie la linea nel preventivatore; il cliente la trova nel PDF del preventivo, in una pagina tutta sua.", { tipologia: tipologia.nome })
              : t("Vale per i {n} prodotti della linea in {tipologia}. Il commerciale la vede quando sceglie la linea nel preventivatore; il cliente la trova nel PDF del preventivo, in una pagina tutta sua.", { n: prodotti, tipologia: tipologia.nome })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <GalleriaImmaginiCatalogo value={immagini} onChange={setImmagini} disabled={salva.isPending} />

          <div className="min-w-0 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="scheda-descrizione">{t("Descrizione")}</Label>
              <Textarea
                id="scheda-descrizione"
                rows={6}
                value={bozza.descrizione}
                onChange={campo("descrizione")}
                maxLength={DESCRIZIONE_SCHEDA_MAX}
                aria-invalid={!!errori.descrizione}
                aria-describedby="scheda-descrizione-aiuto"
                placeholder={t("Es. Sistema in PVC a 6 camere con 3 guarnizioni e 76 mm di profondità: tiene fuori freddo e rumore, con rinforzi in acciaio e ferramenta di sicurezza di serie.")}
              />
              <p id="scheda-descrizione-aiuto" className="text-xs text-muted-foreground">
                {t("Poche frasi per il cliente. Una riga vuota fa un nuovo paragrafo; le righe che iniziano con «- » diventano un elenco.")}
              </p>
              {errori.descrizione && <p className="text-xs text-destructive">{errori.descrizione}</p>}
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("Dati tecnici del profilo")}</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CampoNumero
                  id="scheda-profondita"
                  etichetta={t("Profondità")}
                  unita="mm"
                  valore={bozza.profondita}
                  onChange={campo("profondita")}
                  errore={errori.profondita}
                  placeholder="76"
                  inputMode="numeric"
                />
                <CampoNumero
                  id="scheda-camere"
                  etichetta={t("Camere")}
                  valore={bozza.camere}
                  onChange={campo("camere")}
                  errore={errori.camere}
                  placeholder="6"
                  inputMode="numeric"
                />
                <CampoNumero
                  id="scheda-guarnizioni"
                  etichetta={t("Guarnizioni")}
                  valore={bozza.guarnizioni}
                  onChange={campo("guarnizioni")}
                  errore={errori.guarnizioni}
                  placeholder="3"
                  inputMode="numeric"
                />
                <CampoNumero
                  id="scheda-uw"
                  etichetta={t("Uw fino a")}
                  unita="W/m²K"
                  valore={bozza.uw}
                  onChange={campo("uw")}
                  errore={errori.uw}
                  placeholder="0,9"
                  inputMode="decimal"
                />
              </div>
              <p className="text-xs text-muted-foreground">{t("Quelli lasciati vuoti non compaiono.")}</p>
            </fieldset>

            <div className="space-y-1.5">
              <Label>{t("Scheda del produttore (PDF)")}</Label>
              {pdfNome && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{pdfNome}</span>
                  {!pdf && pdfSalvato && (
                    <a
                      href={pdfSalvato}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {t("Apri")}
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPdf(null);
                      setTogliPdf(true);
                    }}
                    className="tap-compact p-1 text-muted-foreground hover:text-destructive"
                    aria-label={t("Togli la scheda del produttore")}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => inputPdf.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                {pdfNome ? t("Sostituisci il PDF") : t("Carica il PDF")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("Fino a 15 MB. Nel PDF del preventivo diventa un link.")}</p>
              <input
                ref={inputPdf}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  scegliPdf(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
          <Button variant="ghost" onClick={onChiudi} disabled={salva.isPending} className="h-10 w-full sm:w-auto">
            {t("Annulla")}
          </Button>
          <Button onClick={() => void conferma()} disabled={salva.isPending} className="h-10 w-full sm:w-auto">
            {salva.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                {t("Salvataggio…")}
              </>
            ) : (
              t("Salva la scheda")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampoNumero({
  id,
  etichetta,
  unita,
  valore,
  onChange,
  errore,
  placeholder,
  inputMode,
}: {
  id: string;
  etichetta: string;
  unita?: string;
  valore: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  errore?: string;
  placeholder: string;
  inputMode: "numeric" | "decimal";
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {etichetta}
        {unita && <span className="font-normal text-muted-foreground"> ({unita})</span>}
      </Label>
      <Input
        id={id}
        value={valore}
        onChange={onChange}
        placeholder={placeholder}
        inputMode={inputMode}
        className="h-9 tabular-nums"
        aria-invalid={!!errore}
        aria-describedby={errore ? `${id}-errore` : undefined}
      />
      {errore && (
        <p id={`${id}-errore`} className="text-xs text-destructive">
          {errore}
        </p>
      )}
    </div>
  );
}
