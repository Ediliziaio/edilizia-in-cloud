// src/components/orders/generali/piano/PianoEconomico.tsx
// La scheda «Piano economico» della commessa generale (piano §3.2 F6): il budget
// dell'appalto o il business plan dello sviluppo. Versioni (bozza → approvata → revisione),
// voci previsto · reale · a finire, flusso di cassa e indicatori con gli scenari, costi
// comuni ripartiti sulle commesse dentro, andamento dalle fotografie di fine mese.
// Si usa da tablet e computer (telefono: false).
import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ClipboardPaste, GitBranch, Loader2, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { Andamento } from "@/components/orders/generali/piano/Andamento";
import { CassaIndicatori } from "@/components/orders/generali/piano/CassaIndicatori";
import { CostiComuni } from "@/components/orders/generali/piano/CostiComuni";
import { DettaglioRighe, type DettaglioAperto } from "@/components/orders/generali/piano/DettaglioRighe";
import { IncollaExcelDialog } from "@/components/orders/generali/piano/IncollaExcelDialog";
import { PrimoPiano } from "@/components/orders/generali/piano/PrimoPiano";
import { TabellaVoci } from "@/components/orders/generali/piano/TabellaVoci";
import { TONI, dataBreve, euro, euroSegno, nomeMese, tonoScostamento } from "@/components/orders/generali/piano/formato";
import {
  messaggioPiano, useApprovaPiano, useEliminaBozzaPiano, useGeneralePianoNumeri, useNuovaVersionePiano,
} from "@/hooks/useGeneralePiano";
import type { RigaReale, Scenario } from "@/lib/orders/generali/pianoConti";
import type { VersionePiano } from "@/lib/orders/generali/pianoLettura";
import { cn } from "@/lib/utils";

type Vista = "voci" | "cassa" | "comuni" | "andamento";

const nomeVersione = (v: VersionePiano) =>
  `Versione ${v.numero} · ${v.stato === "bozza" ? "bozza" : v.stato === "approvata" ? `approvata${v.approvataIl ? ` il ${dataBreve(v.approvataIl)}` : ""}` : "superata"}`;

const questoMese = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function PianoEconomico({ riepilogo, puoModificare }: PropsScheda) {
  const g = riepilogo.generale;
  const [versioneId, setVersioneId] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("voci");
  const [scenario, setScenario] = useState<Scenario>({ prezzoPct: 0, ritardoMesi: 0, costiPct: 0 });
  const [dettaglio, setDettaglio] = useState<DettaglioAperto | null>(null);
  const [incolla, setIncolla] = useState(false);
  const [approva, setApprova] = useState(false);
  const n = useGeneralePianoNumeri(riepilogo, { versioneId, preferenza: "bozza", scenario });
  const nuova = useNuovaVersionePiano(g.id);
  const elimina = useEliminaBozzaPiano(g.id);
  const commesse = useMemo(
    () => new Map(riepilogo.figlie.map((f) => [f.id, f.codice ? `${f.codice} · ${f.nome}` : f.nome])),
    [riepilogo.figlie],
  );

  if (!riepilogo.permessi.margini) {
    return (
      <div className="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground">
        Il piano economico mostra costi e margini: lo vede chi ha il permesso di vedere i margini. Se ti serve, chiedilo al titolare.
      </div>
    );
  }
  if (n.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm">
        Non riesco a leggere il piano economico.
        <Button size="sm" variant="outline" onClick={n.refetch}>Riprova</Button>
      </div>
    );
  }
  if (n.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-80 w-full rounded-lg" />
      </div>
    );
  }
  if (n.vuoto) {
    return (
      <PrimoPiano
        riepilogo={riepilogo}
        puoModificare={puoModificare}
        mese={questoMese()}
        onCreato={(id, apriIncolla) => {
          setVersioneId(id);
          if (apriIncolla) setIncolla(true);
        }}
      />
    );
  }

  const v = n.inVista;
  const piano = n.piano;
  if (!v || !piano) {
    return <Skeleton className="h-80 w-full rounded-lg" />;
  }

  const modificabile = v.stato === "bozza" && puoModificare;
  const aFinireModificabile = puoModificare && v.stato !== "superata";
  const conApprovato = !!n.approvata && n.approvata.id !== v.id;
  const apriRighe = (titolo: string, righe: RigaReale[]) => setDettaglio({ titolo, righe });
  const t = piano.confronto.totali.margine;

  const nuovaRevisione = () =>
    nuova.mutate(null, {
      onSuccess: (id) => {
        setVersioneId(id);
        toast.success("Nuova revisione aperta: l'approvato resta in vigore finché non approvi questa");
      },
      onError: (e) => toast.error(messaggioPiano(e, "la revisione")),
    });

  const spiegazione =
    v.stato === "bozza"
      ? n.approvata
        ? `Stai rivedendo il piano: la versione ${n.approvata.numero} approvata resta il riferimento finché non approvi questa.`
        : "Bozza: si modifica tutto. «Approva» la blocca e diventa il riferimento per il confronto."
      : v.stato === "approvata"
        ? "Approvata: il previsto è bloccato. Puoi aggiornare l'a finire; per cambiare il previsto apri una nuova revisione."
        : "Versione superata: si guarda soltanto.";

  return (
    <div className="space-y-4">
      {/* Versione e azioni */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={v.id} onValueChange={(id) => setVersioneId(id)}>
              <SelectTrigger className="h-9 w-auto min-w-[16rem]" aria-label="Versione del piano">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {n.versioni.map((x) => <SelectItem key={x.id} value={x.id}>{nomeVersione(x)}</SelectItem>)}
              </SelectContent>
            </Select>
            {v.stato === "approvata" && <Badge variant="secondary" className="gap-1 font-normal"><Lock className="h-3 w-3" /> bloccata</Badge>}
            {v.stato === "bozza" && <Badge variant="outline" className="font-normal">bozza</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{spiegazione}{v.nota ? ` Nota: ${v.nota}` : ""}</p>
        </div>
        {puoModificare && (
          <div className="flex flex-wrap items-center gap-2">
            {v.stato === "bozza" && (
              <>
                <Button variant="outline" size="sm" onClick={() => setIncolla(true)}>
                  <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" /> Incolla da Excel
                </Button>
                {n.approvata && (
                  <Button
                    variant="ghost" size="sm" disabled={elimina.isPending}
                    onClick={() => elimina.mutate(v.id, {
                      onSuccess: () => { setVersioneId(null); toast.success("Revisione buttata via: resta l'approvato"); },
                      onError: (e) => toast.error(messaggioPiano(e, "la revisione")),
                    })}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Butta via la revisione
                  </Button>
                )}
                <Button size="sm" onClick={() => setApprova(true)} disabled={n.voci.length === 0}>
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approva
                </Button>
              </>
            )}
            {v.stato !== "bozza" && n.bozza && (
              <Button variant="outline" size="sm" onClick={() => setVersioneId(n.bozza!.id)}>
                <GitBranch className="mr-1.5 h-3.5 w-3.5" /> Vai alla revisione in corso
              </Button>
            )}
            {v.stato !== "bozza" && !n.bozza && (
              <Button variant="outline" size="sm" onClick={nuovaRevisione} disabled={nuova.isPending}>
                {nuova.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <GitBranch className="mr-1.5 h-3.5 w-3.5" />}
                Nuova revisione
              </Button>
            )}
          </div>
        )}
      </div>

      {/* I numeri in testa: stesse colonne della tabella */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Numero etichetta="Margine previsto" valore={euro(t.previsto)} punto={TONI.previsto.punto}
          nota={conApprovato && t.approvato !== null ? `approvato ${euro(t.approvato)}` : undefined} />
        <Numero etichetta="Margine stimato a fine lavori" valore={euro(t.stima)} punto={TONI.stima.punto}
          tono={t.stima < 0 ? "text-destructive" : undefined}
          nota={<span className={tonoScostamento(t.scostamento, "margine")}>{euroSegno(t.scostamento)} sul previsto</span>} />
        <Numero etichetta="Capitale massimo impegnato" valore={euro(piano.capitale.massimoStima)}
          nota={piano.capitale.meseMassimoStima ? `a ${nomeMese(piano.capitale.meseMassimoStima)} · previsto ${euro(piano.capitale.massimoPrevisto)}` : `previsto ${euro(piano.capitale.massimoPrevisto)}`} />
        <Numero etichetta="Capitale investito a oggi" valore={euro(piano.capitale.investitoOggi)} punto={TONI.reale.punto} nota="costi registrati meno incassi" />
      </div>

      {(piano.avvisi.length > 0 || (n.reale && !n.reale.permessi.costi)) && (
        <section aria-label="Cosa manca" className="space-y-1.5">
          {n.reale && !n.reale.permessi.costi && (
            <Avviso testo="Non hai il permesso di vedere i costi: la colonna «Reale a oggi» dei costi resta vuota." />
          )}
          {n.reale && !n.reale.permessi.importi && (
            <Avviso testo="Non hai il permesso di vedere gli importi delle commesse: le fatture emesse non compaiono nel reale." />
          )}
          {piano.avvisi.map((a) => <Avviso key={a} testo={a} />)}
        </section>
      )}

      <Tabs value={vista} onValueChange={(x) => setVista(x as Vista)}>
        <TabsList>
          <TabsTrigger value="voci">Voci</TabsTrigger>
          <TabsTrigger value="cassa">Cassa e indicatori</TabsTrigger>
          <TabsTrigger value="comuni">Costi comuni</TabsTrigger>
          <TabsTrigger value="andamento">Andamento</TabsTrigger>
        </TabsList>
        <TabsContent value="voci" className="mt-3">
          <TabellaVoci
            generaleId={g.id}
            modello={g.modello}
            versioneId={v.id}
            piano={piano}
            modificabile={modificabile}
            aFinireModificabile={aFinireModificabile}
            conApprovato={conApprovato}
            figlie={riepilogo.figlie}
            categorieAzienda={n.reale?.categorie ?? []}
            onApriRighe={apriRighe}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Importi al netto dell'IVA; l'IVA che non recuperi va nella voce «IVA non detraibile». Il reale viene dalle commesse
            dentro la generale e dalle spese portate sulla generale: consuntivo, ordini d'acquisto, fatture ricevute, fatture emesse.
          </p>
        </TabsContent>
        <TabsContent value="cassa" className="mt-3">
          <CassaIndicatori piano={piano} scenario={scenario} onScenario={setScenario} conUnita={n.unita !== null} />
        </TabsContent>
        <TabsContent value="comuni" className="mt-3">
          <CostiComuni piano={piano} riepilogo={riepilogo} onApriRighe={apriRighe} />
        </TabsContent>
        <TabsContent value="andamento" className="mt-3">
          <Andamento generaleId={g.id} puoModificare={puoModificare} />
        </TabsContent>
      </Tabs>

      <DettaglioRighe dettaglio={dettaglio} onClose={() => setDettaglio(null)} commesse={commesse} generaleId={g.id} />
      {modificabile && (
        <IncollaExcelDialog
          open={incolla}
          onOpenChange={setIncolla}
          generaleId={g.id}
          versioneId={v.id}
          figlie={riepilogo.figlie}
          partenza={piano.oggi}
        />
      )}
      {modificabile && approva && (
        <ApprovaDialog
          generaleId={g.id}
          versione={v}
          precedente={n.approvata}
          margine={t.previsto}
          onClose={() => setApprova(false)}
        />
      )}
    </div>
  );
}

function Numero({ etichetta, valore, nota, tono, punto }: { etichetta: string; valore: string; nota?: ReactNode; tono?: string; punto?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {punto && <span className={cn("h-2 w-2 rounded-full", punto)} aria-hidden="true" />}
        {etichetta}
      </p>
      <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", tono)}>{valore}</p>
      {nota && <p className="text-[11px] text-muted-foreground">{nota}</p>}
    </div>
  );
}

function Avviso({ testo }: { testo: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{testo}</span>
    </div>
  );
}

function ApprovaDialog({ generaleId, versione, precedente, margine, onClose }: {
  generaleId: string;
  versione: VersionePiano;
  precedente: VersionePiano | null;
  margine: number;
  onClose: () => void;
}) {
  const [nota, setNota] = useState("");
  const approva = useApprovaPiano(generaleId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Approvare la versione {versione.numero}?</DialogTitle>
          <DialogDescription>
            Il previsto si blocca e diventa il riferimento (margine previsto {euro(margine)}).
            {precedente ? ` La versione ${precedente.numero} resta nello storico come superata.` : ""} Per cambiarlo dopo si apre una nuova revisione.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota facoltativa: perché cambia, chi l'ha decisa…"
          aria-label="Nota dell'approvazione"
          maxLength={500}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            disabled={approva.isPending}
            onClick={() => approva.mutate({ versioneId: versione.id, nota: nota.trim() || null }, {
              onSuccess: () => { toast.success(`Versione ${versione.numero} approvata`); onClose(); },
              onError: (e) => toast.error(messaggioPiano(e, "l'approvazione")),
            })}
          >
            {approva.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Approva e blocca
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
