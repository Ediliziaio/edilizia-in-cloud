/**
 * «Nuovo modello»: la fotografia di un'area del listino di un'azienda.
 * Azienda → area → tipologie → nome e regole (prezzi di vendita, visibile alle
 * aziende). La crea il database (listino_modello_crea): i prezzi e gli sconti
 * d'acquisto, i fornitori e il magazzino non entrano mai.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SceltaAzienda } from "@/components/admin/listino/SceltaAzienda";
import { iconaArea } from "@/components/listino/iconaArea";
import { useAziendeLibreria, useListinoPerModello, useModelliAreaMutations } from "@/hooks/useModelliArea";
import { areeModellabili, nomeModelloProposto, tipologieModellabili } from "@/lib/listino/modelliArea";
import { cn } from "@/lib/utils";

interface Props {
  nomiEsistenti: string[];
  onChiudi: () => void;
}

function Passo({ numero, titolo, children }: { numero: number; titolo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
          {numero}
        </span>
        {titolo}
      </h3>
      {children}
    </section>
  );
}

export function NuovoModelloDialog({ nomiEsistenti, onChiudi }: Props) {
  const [aziendaId, setAziendaId] = useState<string | null>(null);
  const [areaChiave, setAreaChiave] = useState<string | null>(null);
  const [escluse, setEscluse] = useState<Set<string>>(() => new Set());
  const [nome, setNome] = useState<string | null>(null);
  const [descrizione, setDescrizione] = useState("");
  const [conPrezzi, setConPrezzi] = useState(false);
  const [pubblicato, setPubblicato] = useState(false);

  const [cambiaAzienda, setCambiaAzienda] = useState(false);

  const listino = useListinoPerModello(aziendaId);
  const { data: aziende = [] } = useAziendeLibreria();
  const aziendaScelta = aziende.find((a) => a.id === aziendaId) ?? null;
  const { crea } = useModelliAreaMutations();

  const aree = useMemo(() => areeModellabili(listino.data?.aree ?? []), [listino.data]);
  const area = aree.find((a) => a.chiave === areaChiave) ?? null;
  const tipologie = area ? tipologieModellabili(area) : [];
  const scelte = tipologie.filter((t) => !escluse.has(t.macrocategoriaId!));
  const prodotti = scelte.reduce((n, t) => n + t.articoli, 0);
  const foto = scelte.reduce((n, t) => n + (listino.data?.fotoPerTipologia.get(t.macrocategoriaId!) ?? 0), 0);
  const nomeFinale = nome ?? (area ? nomeModelloProposto(area.chiave, nomiEsistenti) : "");
  const inCorso = crea.isPending;
  const pronto = !!aziendaId && !!area && scelte.length > 0 && nomeFinale.trim() !== "" && !inCorso;

  const scegliAzienda = (id: string) => {
    setAziendaId(id);
    setCambiaAzienda(false);
    setAreaChiave(null);
    setEscluse(new Set());
  };
  const scegliArea = (chiave: string) => {
    setAreaChiave(chiave);
    setEscluse(new Set());
  };
  const alterna = (id: string, dentro: boolean) =>
    setEscluse((prima) => {
      const dopo = new Set(prima);
      if (dentro) dopo.delete(id);
      else dopo.add(id);
      return dopo;
    });

  const creaModello = () => {
    if (!pronto || !aziendaId || !area) return;
    crea.mutate(
      {
        companyId: aziendaId,
        tipologie: scelte.map((t) => t.macrocategoriaId!),
        area: area.chiave,
        nome: nomeFinale.trim(),
        descrizione: descrizione.trim() || null,
        conPrezzi,
        pubblicato,
      },
      {
        onSuccess: () => {
          toast.success(`Modello «${nomeFinale.trim()}» creato`, {
            description: `${prodotti} ${prodotti === 1 ? "prodotto" : "prodotti"} in ${scelte.length} ${scelte.length === 1 ? "tipologia" : "tipologie"}${pubblicato ? ", già visibile alle aziende" : ""}.`,
          });
          onChiudi();
        },
        onError: (e) => toast.error("Modello non creato", { description: (e as Error).message }),
      },
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !inCorso) onChiudi();
      }}
    >
      <DialogContent className="flex max-h-[92dvh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nuovo modello di area</DialogTitle>
          <DialogDescription>
            Prendi un&apos;area già pronta dal listino di un&apos;azienda. Chi installa il modello se ne trova una copia sua,
            da modificare come vuole.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
          <Passo numero={1} titolo="Da quale azienda">
            {aziendaId && !cambiaAzienda ? (
              // Scelta fatta: resta il nome, e l'elenco non spinge giù i passi dopo.
              <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
                <span className="truncate text-sm font-medium">{aziendaScelta?.name ?? "Azienda scelta"}</span>
                <Button variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => setCambiaAzienda(true)} disabled={inCorso}>
                  Cambia
                </Button>
              </div>
            ) : (
              <SceltaAzienda
                valore={aziendaId}
                onScegli={scegliAzienda}
                etichetta="Azienda da cui prendere l'area"
                disabilitata={inCorso}
              />
            )}
          </Passo>

          {aziendaId && (
            <Passo numero={2} titolo="Quale area">
              {listino.isLoading && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Leggo il listino…
                </p>
              )}
              {listino.isError && <p className="text-sm text-destructive">Non riesco a leggere il listino di quest&apos;azienda.</p>}
              {!listino.isLoading && !listino.isError && aree.length === 0 && (
                <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  Quest&apos;azienda non ha tipologie con prodotti attivi: non c&apos;è niente da mettere in un modello.
                </p>
              )}
              <div role="radiogroup" aria-label="Area" className="grid gap-2 sm:grid-cols-2">
                {aree.map((a) => {
                  const Icona = iconaArea(a.chiave);
                  const attiva = a.chiave === areaChiave;
                  const buone = tipologieModellabili(a);
                  const n = buone.reduce((s, t) => s + t.articoli, 0);
                  return (
                    <button
                      key={a.chiave}
                      type="button"
                      role="radio"
                      aria-checked={attiva}
                      disabled={inCorso}
                      onClick={() => scegliArea(a.chiave)}
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
                          {buone.length} {buone.length === 1 ? "tipologia" : "tipologie"} · {n} {n === 1 ? "prodotto" : "prodotti"}
                        </span>
                      </span>
                      {attiva && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </Passo>
          )}

          {area && (
            <Passo numero={3} titolo="Cosa entra nel modello">
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {tipologie.map((t) => {
                  const id = `modello-tipologia-${t.macrocategoriaId}`;
                  const conFoto = listino.data?.fotoPerTipologia.get(t.macrocategoriaId!) ?? 0;
                  return (
                    <li key={t.chiave} className="flex items-start gap-2 rounded-md border px-2.5 py-2">
                      <Checkbox
                        id={id}
                        className="mt-0.5"
                        checked={!escluse.has(t.macrocategoriaId!)}
                        disabled={inCorso}
                        onCheckedChange={(v) => alterna(t.macrocategoriaId!, v === true)}
                      />
                      <label htmlFor={id} className="min-w-0 text-sm leading-snug">
                        <span className="font-medium">{t.nome}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {t.articoli} {t.articoli === 1 ? "prodotto" : "prodotti"}
                          {conFoto > 0 && ` · ${conFoto} con foto`}
                          {!t.attiva && " · spenta nei preventivi"}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted-foreground">
                Entrano i prodotti attivi con foto, schede tecniche, varianti, griglie e schede delle linee. Mai: prezzi e
                sconti d&apos;acquisto, fornitori, tariffe di posa, magazzino.
              </p>
            </Passo>
          )}

          {area && (
            <Passo numero={4} titolo="Nome e regole">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="modello-nome">Nome del modello</Label>
                  <Input
                    id="modello-nome"
                    value={nomeFinale}
                    onChange={(e) => setNome(e.target.value)}
                    disabled={inCorso}
                    maxLength={80}
                  />
                </div>
                <div className="space-y-1.5 sm:row-span-2">
                  <Label htmlFor="modello-descrizione">Descrizione per le aziende</Label>
                  <Textarea
                    id="modello-descrizione"
                    value={descrizione}
                    onChange={(e) => setDescrizione(e.target.value)}
                    disabled={inCorso}
                    rows={4}
                    placeholder="Es. Moduli, inverter e accumuli delle marche più usate, con schede tecniche."
                  />
                </div>
              </div>
              <div className="space-y-2 rounded-md border p-3">
                <label className="flex items-start gap-3">
                  <Switch checked={conPrezzi} onCheckedChange={setConPrezzi} disabled={inCorso} className="mt-0.5" />
                  <span className="text-sm">
                    <span className="font-medium">Con i prezzi di vendita</span>
                    <span className="block text-xs text-muted-foreground">
                      Di base no: ogni azienda mette i suoi, e senza prezzo i prodotti restano fuori dai preventivi.
                      Le percentuali delle varianti (colori, vetri) passano comunque.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3">
                  <Switch checked={pubblicato} onCheckedChange={setPubblicato} disabled={inCorso} className="mt-0.5" />
                  <span className="text-sm">
                    <span className="font-medium">Visibile alle aziende</span>
                    <span className="block text-xs text-muted-foreground">
                      Gli amministratori lo trovano in «+ Area» nel loro listino. Puoi deciderlo anche dopo.
                    </span>
                  </span>
                </label>
              </div>
            </Passo>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:items-center sm:gap-2">
          {area && scelte.length > 0 && (
            <p className="mr-auto text-xs text-muted-foreground">
              {prodotti} {prodotti === 1 ? "prodotto" : "prodotti"} in {scelte.length}{" "}
              {scelte.length === 1 ? "tipologia" : "tipologie"}
              {foto > 0 && ` · ${foto} con foto`}
            </p>
          )}
          <Button variant="ghost" onClick={onChiudi} disabled={inCorso} className="h-10 w-full sm:w-auto">
            Annulla
          </Button>
          <Button onClick={creaModello} disabled={!pronto} className="h-10 w-full sm:w-auto">
            {inCorso ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Fotografo l&apos;area…
              </>
            ) : (
              "Crea il modello"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
