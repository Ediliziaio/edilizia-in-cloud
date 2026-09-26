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
import { useMemo, useState } from "react";
import { Check, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useModelliAreaMutations, useModelliDisponibili } from "@/hooks/useModelliArea";
import { cn } from "@/lib/utils";
import { nomeArea, type AreaStandard, type TipologiaStandard } from "@/lib/listino/areeStandard";
import type { AreaListino } from "@/lib/listino/lineeListino";
import { testoContenuto, testoEsito, testoPrezzi } from "@/lib/listino/modelliArea";
import { areeDaAggiungere, nomeTipologiaLibero } from "@/lib/listino/organizzaListino";
import { iconaArea } from "./iconaArea";

interface Props {
  aree: AreaListino[];
  /** Tutte le tipologie dell'azienda: i nomi sono unici. */
  macrocategorie: ReadonlyArray<{ nome: string }>;
  inCorso: boolean;
  onChiudi: () => void;
  onCrea: (area: AreaStandard, tipologie: TipologiaStandard[]) => void;
  /** Dopo l'installazione di un modello: l'area da aprire nel listino. */
  onAreaDaModello?: (area: string) => void;
}

type Modo = "modello" | "vuota";

const giorno = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

export function NuovaAreaDialog({ aree, macrocategorie, inCorso, onChiudi, onCrea, onAreaDaModello }: Props) {
  const disponibili = useMemo(() => areeDaAggiungere(aree), [aree]);
  const [scelta, setScelta] = useState<AreaStandard | null>(disponibili[0] ?? null);
  const [escluse, setEscluse] = useState<Set<string>>(() => new Set());
  const daCreare = scelta ? scelta.tipologie.filter((t) => !escluse.has(t.nome)) : [];

  const companyId = useEffectiveCompanyId();
  const { data: modelli = [], isLoading: caricoModelli } = useModelliDisponibili(true);
  const { installa } = useModelliAreaMutations();
  const [modoScelto, setModoScelto] = useState<Modo | null>(null);
  const modo: Modo = modoScelto ?? (modelli.length > 0 ? "modello" : "vuota");
  const [modelloId, setModelloId] = useState<string | null>(null);
  const modello = modelli.find((m) => m.id === modelloId) ?? modelli[0] ?? null;
  const occupato = inCorso || installa.isPending;

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
    if (!modello || !companyId || occupato) return;
    installa.mutate(
      { modelloId: modello.id, companyId },
      {
        onSuccess: (esito) => {
          const racconto = testoEsito(esito);
          toast.success(racconto.titolo, { description: racconto.dettaglio || undefined });
          onAreaDaModello?.(modello.area);
          onChiudi();
        },
        onError: (e) => toast.error("Area non aggiunta", { description: (e as Error).message }),
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
              ? "Parti da un'area già pronta, con i prodotti, le foto e le schede tecniche: diventa tua e la cambi come vuoi."
              : "Prepara le tipologie del tuo listino. Poi aggiungi le linee, importa i prodotti e imposta i tuoi prezzi."}
          </DialogDescription>
        </DialogHeader>

        {modelli.length > 0 && (
          <div role="tablist" aria-label="Come aggiungere l'area" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(
              [
                ["modello", "Con i prodotti di un modello"],
                ["vuota", "Solo le tipologie"],
              ] as const
            ).map(([valore, testo]) => (
              <button
                key={valore}
                type="button"
                role="tab"
                aria-selected={modo === valore}
                disabled={occupato}
                onClick={() => setModoScelto(valore)}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  modo === valore ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {testo}
              </button>
            ))}
          </div>
        )}

        {modo === "modello" && modello ? (
          <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
            <div role="radiogroup" aria-label="Modello da aggiungere" className="grid gap-2">
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
                          <Icona className="h-3 w-3" aria-hidden="true" /> Area {nomeArea(m.area)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{testoContenuto(m.riepilogo)}</span>
                      {m.descrizione && <span className="mt-1 block text-xs">{m.descrizione}</span>}
                      {m.installato_il && (
                        <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">
                          Già aggiunto il {giorno(m.installato_il)}: arriva solo quello che manca.
                        </span>
                      )}
                    </span>
                    {attivo && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              {testoPrezzi(modello.con_prezzi_vendita)} Se hai già tipologie o linee con lo stesso nome si usano quelle; i
              prodotti che hai già con lo stesso nome restano come sono.
            </p>
          </div>
        ) : modo === "modello" && caricoModelli ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carico i modelli…
          </p>
        ) : disponibili.length === 0 ? (
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            Hai già tutte le aree standard. Per un settore diverso crea una tipologia da «Tipologie» e scegli il suo
            verticale.
          </p>
        ) : (
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div role="radiogroup" aria-label="Area da aggiungere" className="grid gap-2 sm:grid-cols-2">
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
                      <span className="block text-sm font-medium">Area {a.nome}</span>
                      <span className="block text-xs text-muted-foreground">
                        {a.preventivatore
                          ? `Collegata al ${a.preventivatore.toLowerCase()}`
                          : `${a.tipologie.length} tipologie standard`}
                      </span>
                    </span>
                    {attiva && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            {scelta && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Tipologie da creare subito</legend>
                <p className="text-xs text-muted-foreground">
                  Quelle che togli restano fra le standard da aggiungere, nella colonna delle tipologie.
                </p>
                <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                  Questa operazione crea la struttura, non articoli pronti né prezzi. Gli esempi qui sotto indicano
                  cosa inserire. Le lavorazioni vanno in Manodopera e Servizi, non tra i prodotti.
                  {scelta.chiave === "ristrutturazione" && " Per una ristrutturazione completa usa anche i prodotti delle aree Bagni, Serramenti, Pavimenti e Impianti: non occorre ricopiarli qui."}
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
                          {t.accessorio && <span className="ml-1.5 text-xs text-muted-foreground">accessorio</span>}
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
            {modo === "vuota" && disponibili.length === 0 ? "Chiudi" : "Annulla"}
          </Button>
          {modo === "modello" && modello ? (
            <Button onClick={installaModello} disabled={occupato || !companyId} className="h-10 w-full sm:w-auto">
              {installa.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Aggiungo i prodotti…
                </>
              ) : (
                `Aggiungi «${modello.nome}»`
              )}
            </Button>
          ) : (
            modo === "vuota" &&
            scelta && (
              <Button
                onClick={() => onCrea(scelta, daCreare)}
                disabled={occupato || daCreare.length === 0}
                className="h-10 w-full sm:w-auto"
              >
                {inCorso ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Creazione…
                  </>
                ) : (
                  `Aggiungi l'area ${scelta.nome}`
                )}
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
