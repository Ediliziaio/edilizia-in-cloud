import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, CloudUpload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCampoAssignments } from "@/hooks/campo/useCampoAssignments";
import { useRapportiniSospesi } from "@/hooks/campo/useRapportiniSospesi";
import { UniformSelect } from "@/components/ui/uniform-select";
import { listDraftKeys } from "@/hooks/campo/useFormDraft";
import { bozzeCantieriPrelievo } from "@/lib/campo/bozzaPrelievo";
import { syncItemScope, syncQueue, type RicevutaCampo, type SyncItem, type SyncItemType } from "@/lib/campo/sync-queue";
import { validWorkDay } from "@/lib/campo/workDay";
import { campoReportUrl, isClientReport } from "@/lib/campo/reportKind";

type Stato = "daCorreggere" | "inCoda" | "bozza" | "inviato";
type Riga = {
  id: string;
  tipo: SyncItemType | "merce";
  stato: Stato;
  orderId: string | null;
  cantiere?: string;
  dettaglio?: string;
  nome?: string;
  href?: string;
};

const NOME: Record<Riga["tipo"], string> = { documento_ddt: "Bolla", prelievo: "Prelievo", rapportino: "Rapportino",
  timbratura: "Timbratura", checklist: "Controllo sicurezza", foto: "Foto di cantiere", rapportino_vocale: "Nota vocale",
  generic: "Operazione da verificare", merce: "Ritiro merce" };
const GRUPPI = [
  ["daCorreggere", "Da controllare"], ["inCoda", "In coda"],
  ["bozza", "Bozze"], ["inviato", "Inviati da questo telefono"],
] as const;
const dataBreve = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });
const giornoBreve = (giorno: string) => dataBreve.format(new Date(`${giorno}T12:00:00`));

function righeLocali(coda: SyncItem[], ricevute: RicevutaCampo[], companyId: string, userId: string): Riga[] {
  const righe: Riga[] = [];
  const rapportiniAccodati = new Set<string>();
  for (const voce of [...coda].sort((a, b) => b.createdAt - a.createdAt)) {
    if (voce.status === "done") continue;
    const scope = syncItemScope(voce);
    if (scope.owner !== userId || (scope.companyId !== companyId && !scope.legacyAudio)) continue;
    const p = voce.payload as { order_id?: string | null; giorno?: string; fileNames?: string[]; source?: string;
      riga?: { order_id?: string | null }; locale?: { bozza?: { nomeCantiere?: string } } };
    if (p.source === "desktop") continue;
    const orderId = p.order_id ?? p.riga?.order_id ?? null;
    const query = new URLSearchParams();
    if (orderId) query.set("order", orderId);
    query.set("invio", voce.id);
    let href: string | undefined;
    if (voce.type === "rapportino" && orderId && p.giorno && validWorkDay(p.giorno)) {
      href = campoReportUrl(orderId, "daily", p.giorno);
      rapportiniAccodati.add(`${orderId}:${p.giorno}`);
    } else if (voce.type === "prelievo") href = "/campo/magazzino?tab=prelievi";
    else if (voce.type === "documento_ddt") href = `/campo/ddt?${query.toString()}`;
    else if (voce.type === "timbratura") href = "/campo/timbratura";
    else if (voce.type === "checklist") href = "/campo/sicurezza";
    else if (voce.type === "foto" && orderId) href = `/campo/lavoro/${encodeURIComponent(orderId)}/foto`;
    else if (voce.type === "rapportino_vocale" || scope.legacyAudio) href = "/campo/rapportino-vocale";
    righe.push({ id: voce.id, tipo: voce.type, stato: voce.status === "failed" ? "daCorreggere" : "inCoda",
      orderId, cantiere: p.locale?.bozza?.nomeCantiere, nome: p.fileNames?.[0], href,
      dettaglio: voce.status === "failed" ? voce.lastError : voce.status === "syncing" ? "Invio in corso" : undefined });
  }
  const prefisso = `rapportino:${companyId}:${userId}:`;
  for (const chiave of listDraftKeys()) {
    if (chiave === `merce:${companyId}:${userId}:ritiro`) {
      righe.push({ id: chiave, tipo: "merce", stato: "bozza", orderId: null, href: "/campo/merce" });
      continue;
    }
    if (!chiave.startsWith(prefisso)) continue;
    const [orderId, giorno, tipo] = chiave.slice(prefisso.length).split(":");
    if (!orderId || !giorno || !validWorkDay(giorno) || (tipo !== "daily" && tipo !== "client")) continue;
    if (tipo === "daily" && rapportiniAccodati.has(`${orderId}:${giorno}`)) continue;
    righe.push({ id: chiave, tipo: "rapportino", stato: "bozza", orderId, dettaglio: giornoBreve(giorno),
      nome: tipo === "client" ? "Collaudo col cliente" : undefined,
      href: campoReportUrl(orderId, tipo, giorno) });
  }
  const prelieviAccodati = new Set(coda.filter(v => v.type === "prelievo" && v.status !== "done" && syncItemScope(v).owner === userId
    && syncItemScope(v).companyId === companyId).map(v => v.operationId));
  for (const locale of bozzeCantieriPrelievo(companyId, userId)) {
    if (prelieviAccodati.has(locale.bozza.id)) continue;
    const n = locale.bozza.righe.length;
    righe.push({ id: locale.chiave, tipo: "prelievo", stato: "bozza", orderId: locale.cantiere,
      cantiere: locale.bozza.nomeCantiere, dettaglio: `${n} ${n === 1 ? "materiale" : "materiali"}`,
      href: `/campo/magazzino?order_id=${encodeURIComponent(locale.cantiere)}&riprendi=1` });
  }
  for (const r of ricevute) {
    const href = r.tipo === "prelievo" ? "/campo/magazzino?tab=prelievi"
      : r.tipo === "documento_ddt" ? "/campo/ddt" : `/campo/lavoro/${encodeURIComponent(r.orderId ?? "")}?tab=rapportini`;
    righe.push({ id: `ricevuta:${r.id}`, tipo: r.tipo, stato: "inviato", orderId: r.orderId, nome: r.nome,
      dettaglio: dataBreve.format(r.data), href });
  }
  return righe;
}

export default function CampoInvii() {
  const { user, profile, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id;
  return user?.id && companyId ? <Invii key={`${companyId}:${user.id}`} companyId={companyId} userId={user.id} /> : null;
}

function Invii({ companyId, userId }: { companyId: string; userId: string }) {
  const assegnazioni = useCampoAssignments();
  const sospesi = useRapportiniSospesi(true);
  const [righe, setRighe] = useState<Riga[] | null>(null);
  const [errore, setErrore] = useState(false);
  const [tentativo, setTentativo] = useState(0);
  const [filtro, setFiltro] = useState("");
  useEffect(() => {
    let lettura = 0;
    const carica = () => {
      const versione = ++lettura;
      void Promise.all([syncQueue.getAll(), syncQueue.getRicevute(companyId, userId)]).then(([coda, ricevute]) => {
        if (versione !== lettura) return;
        setRighe(righeLocali(coda, ricevute, companyId, userId));
        setErrore(false);
      }).catch(() => { if (versione === lettura) setErrore(true); });
    };
    carica();
    const scollega = syncQueue.on("change", carica);
    window.addEventListener("storage", carica);
    return () => { lettura++; scollega(); window.removeEventListener("storage", carica); };
  }, [companyId, userId, tentativo]);

  const cantieri = new Map((assegnazioni.data ?? []).map(c => [c.order_id,
    [c.order.order_code, c.order.description || c.order.indirizzo_lavori].filter(Boolean).join(" · ")]));
  const voci = [...(righe ?? [])];
  for (const r of sospesi.data ?? []) {
    if (!r.order_id || !validWorkDay(r.data_lavoro)) continue;
    const href = campoReportUrl(r.order_id, isClientReport(r) ? "client" : "daily", r.data_lavoro);
    if (voci.some(v => v.href === href && v.stato !== "inviato")) continue;
    voci.push({ id: r.id, tipo: "rapportino", stato: r.stato === "rifiutato" ? "daCorreggere" : "bozza", orderId: r.order_id,
      cantiere: [r.order?.order_code, r.order?.description].filter(Boolean).join(" · "),
      dettaglio: r.stato === "rifiutato" ? r.motivo_rifiuto || "L’ufficio chiede una correzione" : giornoBreve(r.data_lavoro), href });
  }
  const nomeCantiere = (r: Riga) => r.cantiere || (r.orderId ? cantieri.get(r.orderId) || "Cantiere"
    : r.tipo === "merce" || r.tipo === "documento_ddt" ? "Magazzino" : "Senza cantiere");
  const idFiltro = (r: Riga) => r.orderId ?? nomeCantiere(r);
  const filtri = [...new Map(voci.map(r => [idFiltro(r), nomeCantiere(r)]))];
  const filtroAttivo = filtri.some(([id]) => id === filtro) ? filtro : "";

  return <div className="mx-auto max-w-2xl space-y-4 pb-4">
    <h1 className="text-xl font-bold">Invii e bozze</h1>
    {errore && <p role="alert" className="rounded-xl border p-3 text-sm">Non riesco a leggere gli invii sul telefono.{" "}
      <button type="button" className="min-h-11 font-semibold text-primary underline" onClick={() => setTentativo(n => n + 1)}>Riprova</button></p>}
    {!righe && !errore && <p role="status" className="text-sm text-muted-foreground">Carico gli invii…</p>}
    {filtri.length > 1 && <UniformSelect aria-label="Filtra per cantiere" value={filtroAttivo}
      onChange={event => setFiltro(event.target.value)} className="min-h-11 w-full bg-card">
      <option value="">Tutti i cantieri</option>
      {filtri.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
    </UniformSelect>}
    {righe && voci.length === 0 && <div className="flex items-center gap-2 rounded-xl border bg-card p-3 text-sm text-muted-foreground">
      <CloudUpload className="size-5 shrink-0" aria-hidden="true" /> Nessuna bozza o invio da mostrare.
    </div>}
    {GRUPPI.map(([stato, titolo]) => {
      const gruppo = voci.filter(v => v.stato === stato && (!filtroAttivo || idFiltro(v) === filtroAttivo));
      if (!gruppo.length) return null;
      return <section aria-label={titolo} key={stato} className="space-y-1.5">
        <h2 className="text-sm font-semibold">{titolo} <span className="font-normal text-muted-foreground">· {gruppo.length}</span></h2>
        <ul className="divide-y rounded-xl border bg-card">
          {gruppo.map(r => {
            const nome = r.tipo === "documento_ddt" && r.nome ? `Bolla · ${r.nome}` : r.nome || NOME[r.tipo];
            const dettaglio = <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{nome}</p>
                <p className="truncate text-xs text-muted-foreground">{nomeCantiere(r)}</p>
                {r.dettaglio && <p className="line-clamp-2 text-xs text-muted-foreground">{r.dettaglio}</p>}
              </div>;
            return <li key={r.id}>
              {r.href ? <Link to={r.href} className="flex min-h-14 items-center gap-2 px-3 py-2 text-sm hover:bg-muted">
                {dettaglio}<ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link> : <div className="min-h-14 px-3 py-2 text-sm">{dettaglio}</div>}
            </li>;
          })}
        </ul>
      </section>;
    })}
  </div>;
}
