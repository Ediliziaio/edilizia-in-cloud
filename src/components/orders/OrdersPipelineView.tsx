import { useMemo, useState } from "react";
import { OrdersPipelineColumn } from "./OrdersPipelineColumn";
import { inizioOggi, ritardoLavori, scadenzaPipeline } from "@/lib/orders/etichettePipeline";
import { PipelineDragScope } from "./PipelineDrag";
import { BarraScorrimentoOrizzontale } from "@/components/common/BarraScorrimentoOrizzontale";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronsLeft, ChevronsRight, Info } from "lucide-react";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { type OrderWithDetails, type OrderStatus, getGrossOrderAmount } from "@/lib/orderUtils";

interface OrdersPipelineViewProps {
  controls?: React.ReactNode;
  onMove?: (order: OrderWithDetails) => void;
  onDelete?: (order: OrderWithDetails) => void;
  canEdit: boolean;
  showAmounts: boolean;
  orders: OrderWithDetails[];
  statuses: OrderStatus[];
  onStatusChange?: (orderId: string, newStatusId: string) => Promise<void>;
}

type Ordinamento = "posa" | "recenti" | "valore";

const ORDINAMENTI: { value: Ordinamento; label: string }[] = [
  { value: "posa", label: "Scadenza prevista" },
  { value: "recenti", label: "Più recenti" },
  { value: "valore", label: "Valore più alto" },
];

const CHIAVE_ORDINAMENTO = "ordini-pipeline-ordinamento";
const CHIAVE_COMPRESSE = "ordini-pipeline-colonne-compresse";
const ID_SENZA_STATO = "no-status";
const STATO_SENZA: OrderStatus = { id: ID_SENZA_STATO, name: "Senza stato", color: "#9ca3af" };

function leggiOrdinamento(): Ordinamento {
  try {
    const v = localStorage.getItem(CHIAVE_ORDINAMENTO);
    return v === "recenti" || v === "valore" ? v : "posa";
  } catch {
    return "posa";
  }
}

function leggiCompresse(): Set<string> {
  try {
    const raw = localStorage.getItem(CHIAVE_COMPRESSE);
    const elenco: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(elenco) ? elenco.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function salva(chiave: string, valore: string) {
  try {
    localStorage.setItem(chiave, valore);
  } catch {
    /* navigazione privata: la scelta vale solo per questa visita */
  }
}

function getExpectedTimestamp(order: OrderWithDetails) {
  const data = scadenzaPipeline(order);
  if (!data) return Number.MAX_SAFE_INTEGER;
  const timestamp = new Date(data).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function perScadenza(a: OrderWithDetails, b: OrderWithDetails) {
  const dateDiff = getExpectedTimestamp(a) - getExpectedTimestamp(b);
  if (dateDiff !== 0) return dateDiff;
  return getGrossOrderAmount(b) - getGrossOrderAmount(a);
}

function perPiuRecenti(a: OrderWithDetails, b: OrderWithDetails) {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function perValore(a: OrderWithDetails, b: OrderWithDetails) {
  return getGrossOrderAmount(b) - getGrossOrderAmount(a);
}

const CONFRONTO: Record<Ordinamento, (a: OrderWithDetails, b: OrderWithDetails) => number> = {
  posa: perScadenza,
  recenti: perPiuRecenti,
  valore: perValore,
};

export function OrdersPipelineView({ orders, statuses, onStatusChange, controls, onMove, onDelete, canEdit, showAmounts }: OrdersPipelineViewProps) {
  const t = useT();
  const [ordinamento, setOrdinamento] = useState<Ordinamento>(leggiOrdinamento);
  const [compresse, setCompresse] = useState<Set<string>>(leggiCompresse);
  // L'elemento che scorre: serve alla barra di scorrimento sotto le colonne.
  const [scorrimento, setScorrimento] = useState<HTMLDivElement | null>(null);

  // Raggruppa ordini per stato
  const ordersByStatus = useMemo(() => {
    const grouped: Record<string, OrderWithDetails[]> = {};

    // Inizializza tutte le colonne (anche vuote)
    statuses.forEach(status => {
      grouped[status.id] = [];
    });

    // Colonna per ordini senza stato
    grouped[ID_SENZA_STATO] = [];

    // Popola con ordini
    orders.forEach(order => {
      if (order.current_status_id && grouped[order.current_status_id]) {
        grouped[order.current_status_id].push(order);
      } else {
        grouped[ID_SENZA_STATO].push(order);
      }
    });

    const confronta = CONFRONTO[!showAmounts && ordinamento === "valore" ? "posa" : ordinamento];
    Object.values(grouped).forEach((statusOrders) => {
      statusOrders.sort(confronta);
    });

    return grouped;
  }, [orders, statuses, ordinamento, showAmounts]);

  // Ordini senza stato assegnato
  const ordersWithoutStatus = ordersByStatus[ID_SENZA_STATO] || [];

  const commesseInRitardo = useMemo(() => {
    const oggi = inizioOggi();
    return orders.filter((o) => ritardoLavori(o, oggi) > 0).length;
  }, [orders]);

  // Le colonne che si vedono davvero (con «Senza stato» solo se ha commesse).
  const idColonne = useMemo(
    () => [...statuses.map((s) => s.id), ...(ordersWithoutStatus.length > 0 ? [ID_SENZA_STATO] : [])],
    [statuses, ordersWithoutStatus.length]
  );
  const tutteCompresse = idColonne.length > 0 && idColonne.every((id) => compresse.has(id));

  const cambiaOrdinamento = (valore: Ordinamento) => {
    setOrdinamento(valore);
    salva(CHIAVE_ORDINAMENTO, valore);
  };

  const impostaCompresse = (prossime: Set<string>) => {
    setCompresse(prossime);
    salva(CHIAVE_COMPRESSE, JSON.stringify([...prossime]));
  };

  const alternaColonna = (id: string) => {
    const prossime = new Set(compresse);
    if (prossime.has(id)) prossime.delete(id);
    else prossime.add(id);
    impostaCompresse(prossime);
  };

  const destinazioni = statuses.map((status) => ({ id: status.id, label: status.name }));
  const spostaInFase = onStatusChange ? (orderId: string, faseId: string) => {
    if (!destinazioni.some((fase) => fase.id === faseId)) return;
    // Il salvataggio della fase mostra già il proprio errore all’utente.
    void onStatusChange(orderId, faseId).catch(() => {});
  } : undefined;

  return (
    <PipelineDragScope onMove={spostaInFase}>
      {/* Barra della board: quante commesse, come ordinarle, comprimere le colonne */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background px-3 py-2 shadow-sm">
        <div className="flex min-w-0 flex-auto flex-wrap items-center gap-2">
          {controls}
          <p className="rounded-full bg-muted px-2 py-1 text-xs">
            <span className="font-bold tabular-nums">{orders.length}</span>{" "}
            <span className="text-muted-foreground">{orders.length === 1 ? t("commessa") : t("commesse")}</span>
            {commesseInRitardo > 0 && (
              <span className="ml-2 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-orange-200">
                {t("{n} in ritardo", { n: commesseInRitardo })}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <span className="sr-only">{t("Ordina per")}</span>
            <Select value={!showAmounts && ordinamento === "valore" ? "posa" : ordinamento} onValueChange={(v) => cambiaOrdinamento(v as Ordinamento)}>
              <SelectTrigger className="h-8 w-36 text-xs" aria-label={t("Ordina le commesse nelle colonne")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDINAMENTI.filter((o) => showAmounts || o.value !== "valore").map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {t(o.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => impostaCompresse(tutteCompresse ? new Set() : new Set(idColonne))}
          >
            {tutteCompresse ? (
              <>
                <ChevronsRight className="h-3.5 w-3.5" /> {t("Espandi tutte")}
              </>
            ) : (
              <>
                <ChevronsLeft className="h-3.5 w-3.5" /> {t("Comprimi tutte")}
              </>
            )}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" aria-label={t("Come leggere le card")} title={t("Come leggere le card")} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs text-muted-foreground hover:bg-muted">
                <Info className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[360px] space-y-2.5 text-xs">
              <p className="text-sm font-semibold">{t("Cosa dice ogni riga")}</p>
              <dl className="space-y-2">
                <div><dt className="font-semibold">{t("Fasi e task ufficio")}</dt><dd className="text-muted-foreground">{t("Quante lavorazioni e quante attività d’ufficio sono completate, ciascuna sul proprio totale.")}</dd></div>
                {showAmounts && <div><dt className="font-semibold">{t("Importo contratto")}</dt><dd className="text-muted-foreground">{t("L’importo sulla scheda è con IVA. Nell’anteprima trovi anche incassato e residuo.")}</dd></div>}
                <div><dt className="font-semibold">{t("Materiali")}</dt><dd className="text-muted-foreground">{t("Articoli pronti su totali (in magazzino, prenotati o installati).")}</dd></div>
                <div><dt className="font-semibold">{t("Squadra")}</dt><dd className="text-muted-foreground">{t("Chi fa il lavoro: il primo nome e quanti altri sono assegnati. «Da assegnare» se manca.")}</dd></div>
                <div><dt className="font-semibold">{t("Ora")}</dt><dd className="text-muted-foreground">{t("Il collegamento apre la sezione dove gestire la prossima azione suggerita.")}</dd></div>
                <div><dt className="font-semibold">{t("«N in ritardo» sulla colonna")}</dt><dd className="text-muted-foreground">{t("Quante commesse della colonna hanno superato la scadenza prevista.")}</dd></div>
              </dl>
              <p className="text-muted-foreground">{t("Passa il mouse sulla scheda o usa Anteprima per leggere i dettagli. Per cambiare fase, trascina la scheda o usa Sposta.")}</p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Le colonne. La barra di sistema è nascosta: sotto c'è quella sempre visibile. */}
      <div
        ref={setScorrimento}
        className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-full gap-3">
          {/* Colonne per ogni stato */}
          {statuses.map(status => (
            <OrdersPipelineColumn
              key={status.id}
              status={status}
              orders={ordersByStatus[status.id] || []}
              canDrop={!!spostaInFase}
              canEdit={canEdit}
              showAmounts={showAmounts}
              destinazioni={destinazioni}
              onPhaseChange={spostaInFase}
              collapsed={compresse.has(status.id)}
              onMove={onMove} onDelete={onDelete} onToggleCollapse={alternaColonna}
            />
          ))}

          {/* Colonna per ordini senza stato (se ce ne sono) */}
          {ordersWithoutStatus.length > 0 && (
            <OrdersPipelineColumn
              status={{ ...STATO_SENZA, name: t(STATO_SENZA.name) }}
              orders={ordersWithoutStatus}
              canDrop={false}
              canEdit={canEdit}
              showAmounts={showAmounts}
              destinazioni={destinazioni}
              onPhaseChange={spostaInFase}
              collapsed={compresse.has(ID_SENZA_STATO)}
              onMove={onMove} onDelete={onDelete} onToggleCollapse={alternaColonna}
            />
          )}
        </div>
      </div>
      <BarraScorrimentoOrizzontale contenitore={scorrimento} />

    </PipelineDragScope>
  );
}
