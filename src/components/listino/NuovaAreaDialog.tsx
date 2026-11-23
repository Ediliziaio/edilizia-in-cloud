/**
 * «+ Area», in due modi.
 *
 *  - Con i prodotti di un modello (25/09/2026): un modello di area pubblicato
 *    dal super admin — tipologie, prodotti con foto e schede, varianti — che
 *    diventa una copia dell'azienda (listino_modello_installa). Tipologie e
 *    linee con lo stesso nome si riusano, i prodotti già presenti si saltano.
 *  - Solo le tipologie: le aree standard che l'azienda non ha ancora
 *    (Serramenti, Fotovoltaico, Bagni…), ciascuna con le sue tipologie pronte.
 *    Un'area non è una tabella: nasce con la prima tipologia etichettata per il
 *    suo preventivatore (areeStandard.ts); le tipologie tolte restano fra le
 *    standard da aggiungere, nella colonna delle tipologie.
 */
import { useMemo, useRef, useState } from "react";
import { Check, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAnteprimaInstallazione, useModelliAreaMutations, useModelliDisponibili } from "@/hooks/useModelliArea";
import { cn } from "@/lib/utils";
import { nomeArea, type AreaStandard, type TipologiaStandard } from "@/lib/listino/areeStandard";
import type { AreaListino } from "@/lib/listino/lineeListino";
import {
  haMaggiorazioniDaCopiare,
  messaggioErroreInstallazione,
  testoContenuto,
  testoEsito,
  testoPrezzi,
  tipoErroreInstallazione,
} from "@/lib/listino/modelliArea";
import { areeDaAggiungere, nomeTipologiaLibero } from "@/lib/listino/organizzaListino";
import { AvvisoInstallazioneModello } from "./AvvisoInstallazioneModello";
import { iconaArea } from "./iconaArea";
import { preparaAreaPersonalizzata } from "@/lib/listino/nuovaArea";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  aree: AreaListino[];
  /** Tutte le tipologie dell'azienda: i nomi sono unici. */
  macrocategorie: ReadonlyArray<{ nome: string }>;
  inCorso: boolean;
  erroreCaricamento?: boolean;
  onRiprova?: () => void;
  onChiudi: () => void;
  onCrea: (area: AreaStandard, tipologie: TipologiaStandard[]) => void;
  /** Dopo l'installazione di un modello: l'area da aprire nel listino. */
  onAreaDaModello?: (area: string) => void;
}

type Modo = "modello" | "vuota" | "personalizzata";

const giorno = (iso: string) => new Date(iso).toLocaleDateString(intlCampo(), { day: "2-digit", month: "2-digit", year: "numeric" });

export function NuovaAreaDialog({ aree, macrocategorie, inCorso, erroreCaricamento = false, onRiprova, onChiudi, onCrea, onAreaDaModello }: Props) {
  const tr = useT();
  const disponibili = useMemo(() => areeDaAggiungere(aree), [aree]);
  const [scelta, setScelta] = useState<AreaStandard | null>(disponibili[0] ?? null);
  const [escluse, setEscluse] = useState<Set<string>>(() => new Set());
  const daCreare = scelta ? scelta.tipologie.filter((t) => !escluse.has(t.nome)) : [];

  const companyId = useEffectiveCompanyId();
  const { data: modelli = [], isLoading: caricoModelli } = useModelliDisponibili(true);
  const { installa } = useModelliAreaMutations();
  const [modoScelto, setModoScelto] = useState<Modo | null>(null);
  const [nomeLibero, setNomeLibero] = useState("");
  const [tipologieLibere, setTipologieLibere] = useState("");
  const personalizzata = preparaAreaPersonalizzata(nomeLibero, tipologieLibere, aree);
  const modo: Modo = modoScelto ?? (modelli.length > 0 ? "modello" : "vuota");
  const [modelloId, setModelloId] = useState<string | null>(null);
  const modello = modelli.find((m) => m.id === modelloId) ?? modelli[0] ?? null;
  const occupato = inCorso || installa.isPending;
  const creazioneBloccata = occupato || erroreCaricamento;
  // Cosa succederebbe alle maggiorazioni dell'azienda, prima di installare: il modello arriva «senza» e senza questo
  // controllo i prodotti nuovi perdono in silenzio quelle che l'azienda ha già (Renova, 05/10/2026).
  const anteprima = useAnteprimaInstallazione({ modelloId: modello?.id ?? null, companyId, enabled: modo === "modello" });
  const [copia, setCopia] = useState(true);
  const recente = !!anteprima.data?.installazione_recente;
  // Un secondo click prima che la finestra se ne accorga non parte: il database lo fermerebbe comunque, ma con un errore.
  const invioInCorso = useRef(false);

  const scegli = (area: AreaStandard) => {
    setScelta(area);
    setEscluse(new Set());
  };

  const alterna = (nome: string, dentro: boolean) =>
    setEscluse((prima) => {
      const dopo = new Set(prima);
      if (dentro) dopo.delete(nome);
      else dopo.add(nome);
      return dopo;
    });

  const installaModello = () => {
    if (!modello || !companyId || occupato || anteprima.isLoading || recente || invioInCorso.current) return;
    invioInCorso.current = true;
    // Se c'è da scegliere si passa la scelta; se non c'è niente da copiare non si passa nulla, così il database
    // resta la rete di sicurezza anche quando l'anteprima è vecchia.
    const daScegliere = haMaggiorazioniDaCopiare(anteprima.data);
    installa.mutate(
      { modelloId: modello.id, companyId, copiaMaggiorazioni: daScegliere ? copia : undefined },
      {
        onSuccess: (esito) => {
          const racconto = testoEsito(esito);
          toast.success(racconto.titolo, { description: racconto.dettaglio || undefined });
          onAreaDaModello?.(modello.area);
          onChiudi();
        },
        onError: (e) => {
          const tipo = tipoErroreInstallazione(e);
          if (tipo === "recente") {
            // Già aggiunto un attimo fa: non è un errore, il listino ce l'ha.
            toast.info(messaggioErroreInstallazione(e));
            onAreaDaModello?.(modello.area);
            onChiudi();
          } else if (tipo === "in_corso") {
            toast.info(messaggioErroreInstallazione(e));
          } else if (tipo === "scelta_maggiorazioni") {
            toast.warning(tr("Prima scegli cosa fare delle maggiorazioni"), { description: messaggioErroreInstallazione(e) });
            void anteprima.refetch();
          } else {
            toast.error(tr("Area non aggiunta"), { description: messaggioErroreInstallazione(e) });
          }
        },
        onSettled: () => {
          invioInCorso.current = false;
        },
      },
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !occupato) onChiudi();
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Aggiungi un&apos;area</DialogTitle>
          <DialogDescription>
            {modo === "modello"
              ? tr("Parti da un'area già pronta, con i prodotti, le foto e le schede tecniche: diventa tua e la cambi come vuoi.")
              : tr("Prepara le tipologie del tuo listino. Poi aggiungi le linee, importa i prodotti e imposta i tuoi prezzi.")}
          </DialogDescription>
        </DialogHeader>

          <div role="tablist" aria-label={tr("Come aggiungere l'area")} className={cn("grid grid-cols-2 gap-1 rounded-lg bg-muted p-1", modelli.length > 0 && "sm:grid-cols-3")}>
            {(
              [
                ...(modelli.length > 0 ? [["modello", tr("Con i prodotti di un modello")] as const] : []),
                ["vuota", tr("Solo le tipologie")],
                ["personalizzata", tr("Area personalizzata")],
              ] as const
            ).map(([valore, testo]) => (
              <button
                key={valore}
                type="button"
                role="tab"
                aria-selected={modo === valore}
                disabled={occupato}
                onClick={() => setModoScelto(valore as Modo)}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  modo === valore ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {testo}
              </button>
            ))}
          </div>

        {erroreCaricamento && (
          <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
            {tr("Le tipologie del listino non si sono caricate. Riprova prima di aggiungere un'area.")}
            {onRiprova && <Button variant="outline" size="sm" className="ml-2" onClick={onRiprova}>{tr("Riprova")}</Button>}
          </div>
        )}

        {modo === "personalizzata" ? (
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="nome-area-libera">{tr("Nome dell'area")}</Label>
              <Input id="nome-area-libera" value={nomeLibero} onChange={(e) => setNomeLibero(e.target.value)} maxLength={80} disabled={occupato} placeholder={tr("Per esempio Tende da sole")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipologie-area-libera">{tr("Tipologie iniziali, una per riga")}</Label>
              <Textarea id="tipologie-area-libera" value={tipologieLibere} onChange={(e) => setTipologieLibere(e.target.value)} rows={5} disabled={occupato} placeholder={tr("Tende a bracci\nPergole\nAccessori")} aria-describedby="area-libera-aiuto area-libera-problema" />
            </div>
            <p id="area-libera-aiuto" className="text-sm text-muted-foreground">{tr("Crei la struttura del listino. Poi puoi aggiungere linee e prodotti. L'area personalizzata non attiva un preventivatore specializzato.")}</p>
            <p id="area-libera-problema" aria-live="polite" className="text-sm text-muted-foreground">{personalizzata.problema ?? tr("{n} tipologie pronte da creare.", { n: personalizzata.area?.tipologie.length })}</p>
          </div>
        ) : modo === "modello" && modello ? (
          <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
            <div role="radiogroup" aria-label={tr("Modello da aggiungere")} className="grid gap-2">
              {modelli.map((m) => {
                const attivo = m.id === modello.id;
                const Icona = iconaArea(m.area);
                const copertina = m.immagine_url ?? m.riepilogo?.copertina ?? null;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={attivo}
                    disabled={occupato}
                    onClick={() => setModelloId(m.id)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      attivo ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
                      {copertina ? (
                        <img src={copertina} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground/50" aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-medium">{m.nome}</span>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Icona className="h-3 w-3" aria-hidden="true" /> {tr("Area")} {nomeArea(m.area)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{testoContenuto(m.riepilogo)}</span>
                      {m.descrizione && <span className="mt-1 block text-xs">{m.descrizione}</span>}
                      {m.installato_il && (
                        <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">
                          {tr("Già aggiunto il {installato_il}: arriva solo quello che manca.", { installato_il: giorno(m.installato_il) })}
                        </span>
                      )}
                    </span>
                    {attivo && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              {tr("{con_prezzi_vendita} Se hai già tipologie o linee con lo stesso nome si usano quelle; i prodotti che hai già con lo stesso nome restano come sono.", { con_prezzi_vendita: testoPrezzi(modello.con_prezzi_vendita) })}
            </p>
            <AvvisoInstallazioneModello
              anteprima={anteprima.data}
              caricamento={anteprima.isLoading}
              copia={copia}
              onCopia={setCopia}
              disabilitato={occupato}
            />
          </div>
        ) : modo === "modello" && caricoModelli ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {tr("Carico i modelli…")}
          </p>
        ) : disponibili.length === 0 ? (
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            {tr("Hai già tutte le aree standard. Per un settore diverso scegli «Area personalizzata».")}
          </p>
        ) : (
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div role="radiogroup" aria-label={tr("Area da aggiungere")} className="grid gap-2 sm:grid-cols-2">
              {disponibili.map((a) => {
                const Icona = iconaArea(a.chiave);
                const attiva = a.chiave === scelta?.chiave;
                return (
                  <button
                    key={a.chiave}
                    type="button"
                    role="radio"
                    aria-checked={attiva}
                    disabled={occupato}
                    onClick={() => scegli(a)}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      attiva ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        attiva ? "bg-primary text-primary-foreground" : "bg-muted",
                      )}
                    >
                      <Icona className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{tr("Area {nome}", { nome: a.nome })}</span>
                      <span className="block text-xs text-muted-foreground">
                        {a.preventivatore
                          ? tr("Collegata al {toLowerCase}", { toLowerCase: a.preventivatore.toLowerCase() })
                          : tr("{n} tipologie standard", { n: a.tipologie.length })}
                      </span>
                    </span>
                    {attiva && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            {scelta && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{tr("Tipologie da creare subito")}</legend>
                <p className="text-xs text-muted-foreground">
                  {tr("Quelle che togli restano fra le standard da aggiungere, nella colonna delle tipologie.")}
                </p>
                <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                  {tr("Questa operazione crea la struttura, non articoli pronti né prezzi. Gli esempi qui sotto indicano cosa inserire. Le lavorazioni vanno in Manodopera e Servizi, non tra i prodotti.")}
                  {scelta.chiave === "ristrutturazione" && ` ${tr("Per una ristrutturazione completa usa anche i prodotti delle aree Bagni, Serramenti, Pavimenti e Impianti: non occorre ricopiarli qui.")}`}
                </p>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {scelta.tipologie.map((t) => {
                    const id = `nuova-area-${scelta.chiave}-${t.nome}`;
                    const nomeFinale = nomeTipologiaLibero(t.nome, macrocategorie, scelta.nome);
                    return (
                      <li key={t.nome} className="flex items-start gap-2">
                        <Checkbox
                          id={id}
                          className="mt-0.5"
                          checked={!escluse.has(t.nome)}
                          disabled={occupato}
                          onCheckedChange={(v) => alterna(t.nome, v === true)}
                        />
                        <label htmlFor={id} className="text-sm leading-snug">
                          {nomeFinale}
                          {t.accessorio && <span className="ml-1.5 text-xs text-muted-foreground">{tr("accessorio")}</span>}
                          {t.esempi && <span className="mt-1 block text-xs text-muted-foreground">{t.esempi.join(" · ")}</span>}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
          <Button variant="ghost" onClick={onChiudi} disabled={occupato} className="h-10 w-full sm:w-auto">
            {modo === "vuota" && disponibili.length === 0 ? tr("Chiudi") : tr("Annulla")}
          </Button>
          {modo === "personalizzata" ? (
            <Button disabled={creazioneBloccata || !personalizzata.area} className="h-10 w-full sm:w-auto" onClick={() => {
              if (personalizzata.area) onCrea(personalizzata.area, personalizzata.area.tipologie);
            }}>{inCorso ? tr("Creazione…") : tr("Crea area personalizzata")}</Button>
          ) : modo === "modello" && modello ? (
            <Button
              onClick={installaModello}
              disabled={creazioneBloccata || !companyId || anteprima.isLoading || recente}
              className="h-10 w-full sm:w-auto"
            >
              {installa.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  {tr("Aggiungo i prodotti…")}
                </>
              ) : (
                tr("Aggiungi «{nome}»", { nome: modello.nome })
              )}
            </Button>
          ) : (
            modo === "vuota" &&
            scelta && (
              <Button
                onClick={() => onCrea(scelta, daCreare)}
                disabled={creazioneBloccata || daCreare.length === 0}
                className="h-10 w-full sm:w-auto"
              >
                {inCorso ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    {tr("Creazione…")}
                  </>
                ) : (
                  tr("Aggiungi l'area {nome}", { nome: scelta.nome })
                )}
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
