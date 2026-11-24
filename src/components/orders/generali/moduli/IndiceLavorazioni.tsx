import { useId, useMemo, useState } from "react";
import { Building2, ChevronDown, FileSpreadsheet, Layers3, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEdificiPriorita } from "@/hooks/useDettagliPrioritaOperazione";
import { DEFINIZIONI_MODELLI, type RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { cercaNellOperazione } from "@/lib/orders/generali/registroOperazione";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const PER_GRUPPO = 20;
const ordine = new Intl.Collator("it", { numeric: true, sensitivity: "base" });

export function IndiceLavorazioni({ riepilogo, attiva, tutta, apriTutte, apriCommessa }: {
  riepilogo: RiepilogoGenerale;
  attiva: string;
  tutta: boolean;
  apriTutte: () => void;
  apriCommessa: (id: string) => void;
}) {
  const t = useT();
  const { generale, figlie } = riepilogo;
  const [ricerca, setRicerca] = useState("");
  const [mobileAperto, setMobileAperto] = useState(false);
  const corpo = useId();
  const { data: edifici } = useEdificiPriorita(generale.modello !== "appalto" ? generale.id : undefined);
  const gruppi = useMemo(() => {
    const edificioDi = new Map(edifici?.map(r => [r.order_id, r.edificio]));
    const perGruppo = new Map<string, typeof figlie>();
    const senzaEdificio = DEFINIZIONI_MODELLI[generale.modello].figlia.tante;
    for (const figlia of figlie) {
      const indirizzo = figlia.indirizzo?.trim() || generale.indirizzo?.trim();
      const gruppo = edificioDi.get(figlia.id)?.trim() || indirizzo || senzaEdificio;
      if (!cercaNellOperazione(ricerca, [figlia.codice, figlia.nome, indirizzo, gruppo])) continue;
      const elenco = perGruppo.get(gruppo);
      if (elenco) elenco.push(figlia);
      else perGruppo.set(gruppo, [figlia]);
    }
    for (const elenco of perGruppo.values()) elenco.sort((a, b) => ordine.compare(a.codice || a.nome, b.codice || b.nome));
    return [...perGruppo].sort(([a], [b]) => ordine.compare(a, b));
  }, [edifici, figlie, generale.indirizzo, generale.modello, ricerca]);
  const seleziona = (id?: string) => {
    setMobileAperto(false);
    if (id) apriCommessa(id);
    else apriTutte();
  };

  return <aside aria-label={t("Indice lavorazioni")} className="min-w-0 self-start rounded-xl border bg-card">
    <h3 className="hidden items-center gap-1.5 border-b px-2.5 py-2 text-xs font-semibold lg:flex">
      <Layers3 className="size-3.5 text-primary" aria-hidden="true" /> {t("Indice lavorazioni")}
    </h3>
    <Button type="button" size="sm" variant="ghost" className="w-full justify-between lg:hidden"
      aria-expanded={mobileAperto} aria-controls={corpo} onClick={() => setMobileAperto(v => !v)}>
      {t("Indice lavorazioni")} <ChevronDown className={cn("size-4", mobileAperto && "rotate-180")} aria-hidden="true" />
    </Button>
    <div id={corpo} className={cn("space-y-2 p-2 lg:block", !mobileAperto && "hidden")}>
      <div className="space-y-0.5">
        <VoceIndice attiva={tutta} onClick={() => seleziona()}>
          <Layers3 className="size-3.5 shrink-0" aria-hidden="true" /> {t("Tutte le fasi")}
        </VoceIndice>
        <VoceIndice attiva={!tutta && attiva === generale.id} onClick={() => seleziona(generale.id)}>
          <FileSpreadsheet className="size-3.5 shrink-0" aria-hidden="true" /> {t("Computo generale")}
        </VoceIndice>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-2 size-3.5 text-muted-foreground" aria-hidden="true" />
        <Input type="search" aria-label={t("Cerca unità, edificio o indirizzo")} placeholder={t("Cerca unità o edificio…")}
          className="h-8 pl-7 pr-1 text-xs md:text-xs" value={ricerca} onChange={e => setRicerca(e.target.value)} />
      </div>
      <div className="max-h-[24rem] space-y-1 overflow-y-auto" aria-label={DEFINIZIONI_MODELLI[generale.modello].figlia.tante}>
        {gruppi.map(([nome, elementi]) => <GruppoIndice key={nome} nome={nome} elementi={elementi}
          attiva={tutta ? undefined : attiva} cerca={ricerca.trim() !== ""} seleziona={seleziona} />)}
        {!gruppi.length && <p role="status" className="px-2 py-1 text-xs text-muted-foreground">{t("Nessuna corrispondenza.")}</p>}
      </div>
    </div>
  </aside>;
}

function GruppoIndice({ nome, elementi, attiva, cerca, seleziona }: {
  nome: string;
  elementi: RiepilogoGenerale["figlie"];
  attiva?: string;
  cerca: boolean;
  seleziona: (id: string) => void;
}) {
  const t = useT();
  const [limite, setLimite] = useState(PER_GRUPPO);
  const selezionata = elementi.findIndex(f => f.id === attiva);
  const visibili = elementi.slice(0, limite);
  if (selezionata >= limite) visibili.push(elementi[selezionata]);
  return <details open={cerca || selezionata >= 0 || undefined} className="group min-w-0">
    <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-1.5 text-xs font-semibold hover:bg-muted">
      <ChevronDown className="size-3 shrink-0 -rotate-90 group-open:rotate-0" aria-hidden="true" />
      <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate" title={nome}>{nome}</span>
      <span className="font-normal tabular-nums text-muted-foreground">{elementi.length}</span>
    </summary>
    <div className="ml-2 space-y-0.5 border-l pl-1.5">
      {visibili.map(f => <VoceIndice key={f.id} attiva={f.id === attiva} onClick={() => seleziona(f.id)}>
        {f.codice && <span className="shrink-0 font-mono">{f.codice}</span>}
        <span className={cn("min-w-0 truncate", f.codice && "text-muted-foreground")} title={f.nome}>
          {f.nome === f.codice ? "" : f.nome}
        </span>
      </VoceIndice>)}
      {elementi.length > visibili.length && <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-xs"
        onClick={() => setLimite(n => n + PER_GRUPPO)}>{t("Mostra altre ({n})", { n: elementi.length - visibili.length })}</Button>}
    </div>
  </details>;
}

function VoceIndice({ attiva, onClick, children }: { attiva: boolean; onClick: () => void; children: React.ReactNode }) {
  return <Button type="button" size="sm" variant={attiva ? "secondary" : "ghost"} aria-current={attiva ? "page" : undefined}
    className="h-8 w-full min-w-0 justify-start gap-1.5 px-1.5 text-xs" onClick={onClick}>{children}</Button>;
}
