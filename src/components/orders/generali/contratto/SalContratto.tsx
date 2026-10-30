// src/components/orders/generali/contratto/SalContratto.tsx
// I SAL emessi sul contratto: ogni voce dice da quale ordine di lavoro arriva, ogni SAL mostra
// lordo → ritenuta → recupero dell'anticipazione → netto. Documento e firma del committente sono
// gli stessi dei SAL di commessa (generate-sal-pdf, firma via link).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronDown, FileText, Link2, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";
import { BottoneFattura } from "@/components/orders/generali/fatture/BottoneFattura";
import { useAuth } from "@/contexts/AuthContext";
import { documentoSal, useAnnullaSal, useEmettiSal, useRegistraRitenuta } from "@/hooks/useGeneraleContrattoSal";
import type { FigliaGenerale } from "@/lib/orders/commesseGenerali";
import { STATI_SAL, messaggioContratto, salEmesso, totaliSal, type DatiContratto, type SalContratto as Sal } from "@/lib/orders/generali/contratto";
import { cn } from "@/lib/utils";
import { NuovoSalDialog } from "./NuovoSalDialog";
import { ProssimoPasso } from "./campi";
import { dataIt, euro, numeroIt, percentoIt } from "./formato";

export function SalContratto({ generaleId, dati, figlie, puoModificare, apriContratto }: {
  generaleId: string; dati: DatiContratto; figlie: FigliaGenerale[]; puoModificare: boolean; apriContratto: () => void;
}) {
  const [nuovo, setNuovo] = useState(false);
  const t = totaliSal(dati.sal);
  const ordinati = [...dati.sal].sort((a, b) => b.numero - a.numero);
  const perFiglia = useMemo(() => new Map(figlie.map((f) => [f.id, f])), [figlie]);

  if (!dati.contratto) {
    return (
      <ProssimoPasso
        testo="Per emettere SAL sul contratto servono ritenuta e anticipazione: compila prima il contratto."
        azione={puoModificare ? <Button size="sm" onClick={apriContratto}>Compila il contratto</Button> : undefined}
      />
    );
  }

  return (
    <section aria-labelledby="sal-titolo" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="sal-titolo" className="text-sm font-semibold">SAL di contratto</h3>
        {puoModificare && (
          <Button size="sm" onClick={() => setNuovo(true)} disabled={!!t.bozza} title={t.bozza ? `Prima emetti o annulla la bozza del SAL n. ${t.bozza.numero}` : undefined}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Nuovo SAL
          </Button>
        )}
      </div>
      {ordinati.length === 0 ? (
        <ProssimoPasso
          testo={figlie.length === 0
            ? "Aggiungi gli ordini di lavoro: il SAL si compone dai loro avanzamenti e dalle misure."
            : "Nessun SAL ancora: il primo si compone dagli avanzamenti e dalle misure degli ordini di lavoro."}
          azione={puoModificare && figlie.length > 0 ? <Button size="sm" onClick={() => setNuovo(true)}>Componi il primo SAL</Button> : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {ordinati.map((s, i) => (
            <SchedaSal key={s.id} generaleId={generaleId} sal={s} perFiglia={perFiglia} puoModificare={puoModificare} apertoDiPartenza={i === 0} />
          ))}
        </ul>
      )}
      {puoModificare && (
        <NuovoSalDialog open={nuovo} onOpenChange={setNuovo} generaleId={generaleId} contratto={dati.contratto} figlie={figlie} ultimoAl={t.ultimoAl} />
      )}
    </section>
  );
}

function StatoSal({ s }: { s: Sal }) {
  const tono = s.stato === "bozza" ? "outline" : s.stato === "firmato" ? "default" : "secondary";
  return <Badge variant={tono} className="font-normal">{STATI_SAL[s.stato] ?? s.stato}</Badge>;
}

function SchedaSal({ generaleId, sal: s, perFiglia, puoModificare, apertoDiPartenza }: {
  generaleId: string; sal: Sal; perFiglia: Map<string, FigliaGenerale>; puoModificare: boolean; apertoDiPartenza: boolean;
}) {
  const { effectiveCompany } = useAuth();
  const confirm = useConfirm();
  const emetti = useEmettiSal(generaleId);
  const annulla = useAnnullaSal(generaleId);
  const registra = useRegistraRitenuta(generaleId);
  const [aperto, setAperto] = useState(apertoDiPartenza);
  const [documento, setDocumento] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<"documento" | "link" | null>(null);

  const chiediDocumento = async (firma: boolean) => {
    if (!effectiveCompany?.id || inCorso) return;
    setInCorso(firma ? "link" : "documento");
    try {
      const r = await documentoSal(s.id, effectiveCompany.id, firma);
      if (firma) setLink(r.link); else setDocumento(r.html);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Il documento del SAL non è disponibile.");
    } finally {
      setInCorso(null);
    }
  };

  const emettiSal = async () => {
    if (!(await confirm({
      title: `Emettere il SAL n. ${s.numero}?`,
      description: "Le voci e le misure dentro non si cambiano più; ritenuta e anticipazione si ricalcolano con il contratto di adesso.",
      confirmLabel: "Emetti",
    }))) return;
    emetti.mutate(s.id, {
      onSuccess: ({ registrata }) => toast.success(
        registrata || s.ritenuta <= 0
          ? `SAL n. ${s.numero} emesso. Ora puoi preparare il documento e il link per il committente.`
          : `SAL n. ${s.numero} emesso. La ritenuta la mette nel registro un amministratore.`,
      ),
      onError: (e) => toast.error(messaggioContratto(e, "il SAL")),
    });
  };

  const annullaSal = async () => {
    if (!(await confirm({ title: `Annullare la bozza del SAL n. ${s.numero}?`, description: "Le misure che conteneva tornano libere per il prossimo SAL.", confirmLabel: "Annulla la bozza", variant: "destructive" }))) return;
    annulla.mutate(s.id, {
      onSuccess: () => toast.success("Bozza annullata"),
      onError: (e) => toast.error(messaggioContratto(e, "il SAL")),
    });
  };

  const righe = s.diContratto
    ? [
      { etichetta: "Lavori di questo SAL", valore: s.lordo, nota: `${euro(s.cumulativo)} dall'inizio − ${euro(s.precedente)} già a SAL` },
      { etichetta: `Ritenuta ${percentoIt(s.ritenutaPct)}`, valore: -s.ritenuta },
      ...(s.recupero !== 0 ? [{ etichetta: `Anticipazione ${percentoIt(s.recuperoPct)}`, valore: -s.recupero }] : []),
      { etichetta: "Netto", valore: s.netto, forte: true },
    ]
    : [{ etichetta: "Totale cumulativo", valore: s.cumulativo, forte: true }];

  return (
    <li className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold">SAL n. {s.numero}</h4>
            <StatoSal s={s} />
            {!s.diContratto && <Badge variant="outline" className="font-normal">fatto a mano</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {s.al ? `Lavori ${s.dal ? `dal ${dataIt(s.dal)} ` : ""}al ${dataIt(s.al)}` : "Periodo non indicato"}
            {s.data && (s.stato === "bozza" ? ` · bozza del ${dataIt(s.data)}` : ` · emesso il ${dataIt(s.data)}`)}
            {s.firma?.da && ` · firmato da ${s.firma.da}${s.firma.il ? ` il ${dataIt(s.firma.il)}` : ""}`}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-4">
          {righe.map((r) => (
            <div key={r.etichetta} className="text-right">
              <dt className="text-xs text-muted-foreground" title={"nota" in r ? r.nota : undefined}>{r.etichetta}</dt>
              <dd className={cn("tabular-nums", "forte" in r && r.forte && "font-semibold")}>{euro(r.valore)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2">
        {puoModificare && s.stato === "bozza" && s.diContratto && (
          <>
            <Button size="sm" onClick={() => void emettiSal()} disabled={emetti.isPending}>
              {emetti.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} Emetti
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void annullaSal()} disabled={annulla.isPending}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Annulla la bozza
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" onClick={() => void chiediDocumento(false)} disabled={inCorso !== null}>
          {inCorso === "documento" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />} Documento
        </Button>
        {puoModificare && ["emesso", "approvato"].includes(s.stato) && (
          <Button size="sm" variant="outline" onClick={() => void chiediDocumento(true)} disabled={inCorso !== null}>
            {inCorso === "link" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />} Link per il committente
          </Button>
        )}
        {s.diContratto && salEmesso(s) && <BottoneFattura generaleId={generaleId} origine="sal" id={s.id} crea={puoModificare} />}
        {s.diContratto && salEmesso(s) && s.ritenuta > 0 && (
          s.registro ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Ritenuta nel registro{s.registro.stato === "svincolata" ? `, svincolata${s.registro.svincolataIl ? ` il ${dataIt(s.registro.svincolataIl)}` : ""}` : ""}
            </span>
          ) : puoModificare ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={registra.isPending}
              onClick={() => registra.mutate(s.id, {
                onSuccess: () => toast.success("Ritenuta messa nel registro delle ritenute"),
                onError: (e) => toast.error(messaggioContratto(e, "la ritenuta")),
              })}
            >
              Metti la ritenuta nel registro
            </Button>
          ) : null
        )}
        <button
          type="button"
          onClick={() => setAperto((x) => !x)}
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={aperto}
        >
          {s.voci.length === 1 ? "1 voce" : `${s.voci.length} voci`}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", aperto && "rotate-180")} />
        </button>
      </div>

      {aperto && s.voci.length > 0 && (
        <div className="overflow-x-auto border-t">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Voce</th>
                <th className="px-2 py-2 font-medium">Da</th>
                <th className="px-2 py-2 text-right font-medium">Contrattuale</th>
                <th className="px-2 py-2 text-right font-medium">Avanzamento</th>
                <th className="px-4 py-2 text-right font-medium">Importo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {s.voci.map((v) => {
                const f = v.figliaId ? perFiglia.get(v.figliaId) : undefined;
                return (
                  <tr key={v.id}>
                    <td className="max-w-[26rem] px-4 py-1.5">{v.descrizione}</td>
                    <td className="px-2 py-1.5 text-xs">
                      {f ? <Link to={`/azienda/ordini/${f.id}`} className="hover:underline">{f.codice ?? f.nome}</Link>
                        : v.tipo === "sicurezza" ? <span className="text-muted-foreground">Contratto</span>
                          : v.figliaId ? <span className="text-muted-foreground">Ordine tolto dal contratto</span>
                            : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{euro(v.importoContrattuale)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {v.tipo === "misure" && v.quantita !== null ? `${numeroIt(v.quantita, 3)} ${v.unita ?? ""}` : percentoIt(v.percentuale)}
                    </td>
                    <td className="px-4 py-1.5 text-right font-medium tabular-nums">{euro(v.importo)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {documento && (
        <PrintPreviewModal
          htmlContent={documento}
          fileName={`SAL ${s.numero}`}
          title={`SAL n. ${s.numero}`}
          open={!!documento}
          onOpenChange={(o) => { if (!o) setDocumento(null); }}
        />
      )}
      <Dialog open={!!link} onOpenChange={(o) => { if (!o) setLink(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link per il committente</DialogTitle>
            <DialogDescription>Con questo link il committente legge e approva il SAL n. {s.numero}. Vale 7 giorni; non è stata mandata nessuna email.</DialogDescription>
          </DialogHeader>
          <Input readOnly aria-label="Link per approvare il SAL" value={link ?? ""} onFocus={(e) => e.currentTarget.select()} />
          <Button onClick={async () => {
            try { await navigator.clipboard.writeText(link!); toast.success("Link copiato"); }
            catch { toast.error("Copia non riuscita: seleziona e copia il link dal campo."); }
          }}>Copia il link</Button>
        </DialogContent>
      </Dialog>
    </li>
  );
}

/** Le fatture emesse sul contratto (non sugli ordini di lavoro), se ce ne sono. */
export function FattureContratto({ dati }: { dati: DatiContratto }) {
  if (dati.fatture.length === 0) return null;
  const totale = dati.fatture.reduce((t, f) => t + f.totale, 0);
  const incassato = dati.fatture.reduce((t, f) => t + f.incassato, 0);
  return (
    <section aria-labelledby="fatture-contratto-titolo" className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
        <h3 id="fatture-contratto-titolo" className="text-sm font-semibold">Fatture sul contratto</h3>
        <span className="text-xs text-muted-foreground">Fatturato {euro(totale)} · incassato {euro(incassato)}</span>
      </header>
      <ul className="divide-y text-sm">
        {dati.fatture.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2">
            <span>{f.numero ? `Fattura ${f.numero}` : "Fattura"} <span className="text-xs text-muted-foreground">{dataIt(f.data)}</span></span>
            <span className="tabular-nums">{euro(f.totale)} <span className="text-xs text-muted-foreground">incassati {euro(f.incassato)}</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}
