// src/components/orders/generali/contratto/SalContratto.tsx
// I SAL emessi sul contratto: ogni voce dice da quale ordine di lavoro arriva, ogni SAL mostra
// lordo → ritenuta → recupero dell'anticipazione → netto. Documento e firma del committente sono
// gli stessi dei SAL di commessa (generate-sal-pdf, firma via link).
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiltroAttivo } from "../design/ElementiScheda";
import { CheckCircle2, ChevronDown, FileText, Link2, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentGenerale as DialogContent } from "@/components/orders/generali/design/DialogGenerale";
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
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function SalContratto({ generaleId, dati, figlie, puoModificare, apriContratto }: {
  generaleId: string; dati: DatiContratto; figlie: FigliaGenerale[]; puoModificare: boolean; apriContratto: () => void;
}) {
  const tr = useT();
  const [nuovo, setNuovo] = useState(false);
  const [parametri, setParametri] = useSearchParams();
  const soloEmessi = parametri.get("stato-sal") === "emessi";
  const rimuoviFiltro = () => { const p = new URLSearchParams(parametri); p.delete("stato-sal"); setParametri(p, { replace: true }); };
  const t = totaliSal(dati.sal);
  const ordinati = [...dati.sal].filter(s => !soloEmessi || s.diContratto && salEmesso(s)).sort((a, b) => b.numero - a.numero);
  const perFiglia = useMemo(() => new Map(figlie.map((f) => [f.id, f])), [figlie]);

  if (!dati.contratto) {
    return (
      <ProssimoPasso
        testo={tr("Per emettere SAL sul contratto servono ritenuta e anticipazione: compila prima il contratto.")}
        azione={puoModificare ? <Button size="sm" onClick={apriContratto}>{tr("Compila il contratto")}</Button> : undefined}
      />
    );
  }

  return (
    <section aria-labelledby="sal-titolo" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="sal-titolo" className="text-sm font-semibold">{tr("SAL di contratto")}</h3>
        {puoModificare && (
          <Button size="sm" onClick={() => setNuovo(true)} disabled={!!t.bozza} title={t.bozza ? tr("Prima emetti o annulla la bozza del SAL n. {numero}", { numero: t.bozza.numero }) : undefined}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> {tr("Nuovo SAL")}
          </Button>
        )}
      </div>
      {soloEmessi && <FiltroAttivo onReset={rimuoviFiltro}>{tr("SAL emessi sul contratto: {n}. Bozze e SAL annullati sono esclusi.", { n: ordinati.length })}</FiltroAttivo>}
      {soloEmessi && ordinati.length === 0 ? <p className="generale-panel p-5 text-sm text-muted-foreground">{tr("Nessun SAL emesso sul contratto.")}</p> : ordinati.length === 0 ? (
        <ProssimoPasso
          testo={figlie.length === 0
            ? tr("Aggiungi gli ordini di lavoro: il SAL si compone dai loro avanzamenti e dalle misure.")
            : tr("Nessun SAL ancora: il primo si compone dagli avanzamenti e dalle misure degli ordini di lavoro.")}
          azione={puoModificare && figlie.length > 0 ? <Button size="sm" onClick={() => setNuovo(true)}>{tr("Componi il primo SAL")}</Button> : undefined}
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
  const t = useT();
  const tono = s.stato === "bozza" ? "outline" : s.stato === "firmato" ? "default" : "secondary";
  return <Badge variant={tono} className="font-normal">{STATI_SAL[s.stato] ? t(STATI_SAL[s.stato]) : s.stato}</Badge>;
}

function SchedaSal({ generaleId, sal: s, perFiglia, puoModificare, apertoDiPartenza }: {
  generaleId: string; sal: Sal; perFiglia: Map<string, FigliaGenerale>; puoModificare: boolean; apertoDiPartenza: boolean;
}) {
  const t = useT();
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
      toast.error(e instanceof Error ? e.message : t("Il documento del SAL non è disponibile."));
    } finally {
      setInCorso(null);
    }
  };

  const emettiSal = async () => {
    if (!(await confirm({
      title: t("Emettere il SAL n. {numero}?", { numero: s.numero }),
      description: t("Le voci e le misure dentro non si cambiano più; ritenuta e anticipazione si ricalcolano con il contratto di adesso."),
      confirmLabel: t("Emetti"),
    }))) return;
    emetti.mutate(s.id, {
      onSuccess: ({ registrata }) => toast.success(
        registrata || s.ritenuta <= 0
          ? t("SAL n. {numero} emesso. Ora puoi preparare il documento e il link per il committente.", { numero: s.numero })
          : t("SAL n. {numero} emesso. La ritenuta la mette nel registro un amministratore.", { numero: s.numero }),
      ),
      onError: (e) => toast.error(messaggioContratto(e, "il SAL")),
    });
  };

  const annullaSal = async () => {
    if (!(await confirm({ title: t("Annullare la bozza del SAL n. {numero}?", { numero: s.numero }), description: t("Le misure che conteneva tornano libere per il prossimo SAL."), confirmLabel: t("Annulla la bozza"), variant: "destructive" }))) return;
    annulla.mutate(s.id, {
      onSuccess: () => toast.success(t("Bozza annullata")),
      onError: (e) => toast.error(messaggioContratto(e, "il SAL")),
    });
  };

  const righe = s.diContratto
    ? [
      { etichetta: t("Lavori di questo SAL"), valore: s.lordo, nota: t("{cumulativo} dall'inizio − {precedente} già a SAL", { cumulativo: euro(s.cumulativo), precedente: euro(s.precedente) }) },
      { etichetta: t("Ritenuta {perc}", { perc: percentoIt(s.ritenutaPct) }), valore: -s.ritenuta },
      ...(s.recupero !== 0 ? [{ etichetta: t("Anticipazione {perc}", { perc: percentoIt(s.recuperoPct) }), valore: -s.recupero }] : []),
      { etichetta: t("Netto"), valore: s.netto, forte: true },
    ]
    : [{ etichetta: t("Totale cumulativo"), valore: s.cumulativo, forte: true }];

  return (
    <li className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold">{t("SAL n. {numero}", { numero: s.numero })}</h4>
            <StatoSal s={s} />
            {!s.diContratto && <Badge variant="outline" className="font-normal">{t("fatto a mano")}</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {s.al ? (s.dal ? t("Lavori dal {dal} al {al}", { dal: dataIt(s.dal), al: dataIt(s.al) }) : t("Lavori al {al}", { al: dataIt(s.al) })) : t("Periodo non indicato")}
            {s.data && (s.stato === "bozza" ? t(" · bozza del {data}", { data: dataIt(s.data) }) : t(" · emesso il {data}", { data: dataIt(s.data) }))}
            {s.firma?.da && (s.firma.il ? t(" · firmato da {nome} il {data}", { nome: s.firma.da, data: dataIt(s.firma.il) }) : t(" · firmato da {nome}", { nome: s.firma.da }))}
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
              {emetti.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} {t("Emetti")}
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void annullaSal()} disabled={annulla.isPending}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {t("Annulla la bozza")}
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" onClick={() => void chiediDocumento(false)} disabled={inCorso !== null}>
          {inCorso === "documento" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />} {t("Documento")}
        </Button>
        {puoModificare && ["emesso", "approvato"].includes(s.stato) && (
          <Button size="sm" variant="outline" onClick={() => void chiediDocumento(true)} disabled={inCorso !== null}>
            {inCorso === "link" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />} {t("Link per il committente")}
          </Button>
        )}
        {s.diContratto && salEmesso(s) && <BottoneFattura generaleId={generaleId} origine="sal" id={s.id} crea={puoModificare} />}
        {s.diContratto && salEmesso(s) && s.ritenuta > 0 && (
          s.registro ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {s.registro.stato === "svincolata" ? (s.registro.svincolataIl ? t("Ritenuta nel registro, svincolata il {data}", { data: dataIt(s.registro.svincolataIl) }) : t("Ritenuta nel registro, svincolata")) : t("Ritenuta nel registro")}
            </span>
          ) : puoModificare ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={registra.isPending}
              onClick={() => registra.mutate(s.id, {
                onSuccess: () => toast.success(t("Ritenuta messa nel registro delle ritenute")),
                onError: (e) => toast.error(messaggioContratto(e, "la ritenuta")),
              })}
            >
              {t("Metti la ritenuta nel registro")}
            </Button>
          ) : null
        )}
        <button
          type="button"
          onClick={() => setAperto((x) => !x)}
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={aperto}
        >
          {t(s.voci.length === 1 ? "1 voce" : "{n} voci", { n: s.voci.length })}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", aperto && "rotate-180")} />
        </button>
      </div>

      {aperto && s.voci.length > 0 && (
        <div className="overflow-x-auto border-t">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">{t("Voce")}</th>
                <th className="px-2 py-2 font-medium">{t("Da")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("Contrattuale")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("Avanzamento")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("Importo")}</th>
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
                        : v.tipo === "sicurezza" ? <span className="text-muted-foreground">{t("Contratto")}</span>
                          : v.figliaId ? <span className="text-muted-foreground">{t("Ordine tolto dal contratto")}</span>
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
          title={t("SAL n. {numero}", { numero: s.numero })}
          open={!!documento}
          onOpenChange={(o) => { if (!o) setDocumento(null); }}
        />
      )}
      <Dialog open={!!link} onOpenChange={(o) => { if (!o) setLink(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Link per il committente")}</DialogTitle>
            <DialogDescription>{t("Con questo link il committente legge e approva il SAL n. {numero}. Vale 7 giorni; non è stata mandata nessuna email.", { numero: s.numero })}</DialogDescription>
          </DialogHeader>
          <Input readOnly aria-label={t("Link per approvare il SAL")} value={link ?? ""} onFocus={(e) => e.currentTarget.select()} />
          <Button onClick={async () => {
            try { await navigator.clipboard.writeText(link!); toast.success(t("Link copiato")); }
            catch { toast.error(t("Copia non riuscita: seleziona e copia il link dal campo.")); }
          }}>{t("Copia il link")}</Button>
        </DialogContent>
      </Dialog>
    </li>
  );
}

/** Le fatture emesse sul contratto (non sugli ordini di lavoro), se ce ne sono. */
export function FattureContratto({ dati }: { dati: DatiContratto }) {
  const tr = useT();
  if (dati.fatture.length === 0) return null;
  const totale = dati.fatture.reduce((t, f) => t + f.totale, 0);
  const incassato = dati.fatture.reduce((t, f) => t + f.incassato, 0);
  return (
    <section aria-labelledby="fatture-contratto-titolo" className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
        <h3 id="fatture-contratto-titolo" className="text-sm font-semibold">{tr("Fatture sul contratto")}</h3>
        <span className="text-xs text-muted-foreground">{tr("Fatturato {totale} · incassato {incassato}", { totale: euro(totale), incassato: euro(incassato) })}</span>
      </header>
      <ul className="divide-y text-sm">
        {dati.fatture.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2">
            <span>{f.numero ? tr("Fattura {numero}", { numero: f.numero }) : tr("Fattura")} <span className="text-xs text-muted-foreground">{dataIt(f.data)}</span></span>
            <span className="tabular-nums">{euro(f.totale)} <span className="text-xs text-muted-foreground">{tr("incassati {importo}", { importo: euro(f.incassato) })}</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}
