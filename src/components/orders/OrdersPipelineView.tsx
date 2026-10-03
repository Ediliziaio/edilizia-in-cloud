import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { OrdersPipelineColumn, haPosaScaduta, inizioOggi } from "./OrdersPipelineColumn";
import { OrdersPipelineCard } from "./OrdersPipelineCard";
import { BarraScorrimentoOrizzontale } from "@/components/common/BarraScorrimentoOrizzontale";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronsLeft, ChevronsRight, Info } from "lucide-react";
import { type OrderWithDetails, type OrderStatus } from "@/lib/orderUtils";

interface OrdersPipelineViewProps {
  orders: OrderWithDetails[];
  statuses: OrderStatus[];
  onStatusChange?: (orderId: string, newStatusId: string) => Promise<void>;
}

type Ordinamento = "posa" | "recenti" | "valore";

const ORDINAMENTI: { value: Ordinamento; label: string }[] = [
  { value: "posa", label: "Data di posa" },
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
  if (!order.expected_date) return Number.MAX_SAFE_INTEGER;
  const timestamp = new Date(order.expected_date).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function perDataDiPosa(a: OrderWithDetails, b: OrderWithDetails) {
  const dateDiff = getExpectedTimestamp(a) - getExpectedTimestamp(b);
  if (dateDiff !== 0) return dateDiff;
  return (b.total_amount || 0) - (a.total_amount || 0);
}

function perPiuRecenti(a: OrderWithDetails, b: OrderWithDetails) {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function perValore(a: OrderWithDetails, b: OrderWithDetails) {
  return (b.total_amount || 0) - (a.total_amount || 0);
}

const CONFRONTO: Record<Ordinamento, (a: OrderWithDetails, b: OrderWithDetails) => number> = {
  posa: perDataDiPosa,
  recenti: perPiuRecenti,
  valore: perValore,
};

export function OrdersPipelineView({ orders, statuses, onStatusChange }: OrdersPipelineViewProps) {
  const [activeOrder, setActiveOrder] = useState<OrderWithDetails | null>(null);
  const [ordinamento, setOrdinamento] = useState<Ordinamento>(leggiOrdinamento);
  const [compresse, setCompresse] = useState<Set<string>>(leggiCompresse);
  // L'elemento che scorre: serve alla barra di scorrimento sotto le colonne.
  const [scorrimento, setScorrimento] = useState<HTMLDivElement | null>(null);

  // Sensors configuration
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  );

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

    const confronta = CONFRONTO[ordinamento];
    Object.values(grouped).forEach((statusOrders) => {
      statusOrders.sort(confronta);
    });

    return grouped;
  }, [orders, statuses, ordinamento]);

  // Ordini senza stato assegnato
  const ordersWithoutStatus = ordersByStatus[ID_SENZA_STATO] || [];

  const commesseInRitardo = useMemo(() => {
    const oggi = inizioOggi();
    return orders.filter((o) => haPosaScaduta(o, oggi)).length;
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

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const order = orders.find(o => o.id === active.id);
    if (order) {
      setActiveOrder(order);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveOrder(null);

    if (!over) return;

    const orderId = active.id as string;

    // Trova l'ordine corrente
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Risolvi lo status di destinazione (potrebbe essere una colonna o una card)
    let newStatusId = over.id as string;
    const overOrder = orders.find(o => o.id === over.id);
    if (overOrder) {
      newStatusId = overOrder.current_status_id || "";
    }

    // Se lo stato è lo stesso, non fare nulla
    if (order.current_status_id === newStatusId) return;

    // Verifica che lo stato di destinazione sia valido
    const isValidStatus = statuses.some(s => s.id === newStatusId);
    if (!isValidStatus) return;

    // Chiama il callback per aggiornare lo stato
    if (onStatusChange) {
      await onStatusChange(orderId, newStatusId);
    }
  };

  const handleDragCancel = () => {
    setActiveOrder(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* Barra della board: quante commesse, come ordinarle, comprimere le colonne */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-sm">
            <span className="font-bold tabular-nums">{orders.length}</span>{" "}
            <span className="text-muted-foreground">{orders.length === 1 ? "commessa" : "commesse"}</span>
            {commesseInRitardo > 0 && (
              <span className="ml-2 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-orange-200">
                {commesseInRitardo} in ritardo
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Ordina per</span>
            <Select value={ordinamento} onValueChange={(v) => cambiaOrdinamento(v as Ordinamento)}>
              <SelectTrigger className="h-8 w-[160px] text-xs" aria-label="Ordina le commesse nelle colonne">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDINAMENTI.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
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
                <ChevronsRight className="h-3.5 w-3.5" /> Espandi tutte
              </>
            ) : (
              <>
                <ChevronsLeft className="h-3.5 w-3.5" /> Comprimi tutte
              </>
            )}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs text-muted-foreground hover:bg-muted">
                <Info className="h-3.5 w-3.5" /> Come leggere le card
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[360px] space-y-2.5 text-xs">
              <p className="text-sm font-semibold">Cosa dice ogni riga</p>
              <dl className="space-y-2">
                <div><dt className="font-semibold">Importo e incasso</dt><dd className="text-muted-foreground">Il valore della commessa e quanto è già stato incassato (barra e percentuale).</dd></div>
                <div><dt className="font-semibold">Posa</dt><dd className="text-muted-foreground">La data di posa prevista. «Giorni di ritardo» = la data è passata e la commessa non è completata.</dd></div>
                <div><dt className="font-semibold">Materiali</dt><dd className="text-muted-foreground">Articoli pronti su totali (in magazzino, prenotati o installati). Rosso se non ne è pronto nessuno.</dd></div>
                <div><dt className="font-semibold">Squadra</dt><dd className="text-muted-foreground">Chi fa il lavoro: il primo nome e quanti altri sono assegnati. «Da assegnare» se manca.</dd></div>
                <div><dt className="font-semibold">Ora</dt><dd className="text-muted-foreground">Il prossimo passo da fare, scelto in quest'ordine: incassare l'acconto, sbloccare la posa, ordinare i materiali, verificare gli arrivi, preparare la posa.</dd></div>
                <div><dt className="font-semibold">«N in ritardo» sulla colonna</dt><dd className="text-muted-foreground">Quante commesse della colonna hanno la posa oltre la data prevista.</dd></div>
              </dl>
              <p className="text-muted-foreground">Passa il mouse su una riga per leggere la frase completa. Con la freccia in alto a destra di ogni colonna la comprimi.</p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Le colonne. La barra di sistema è nascosta: sotto c'è quella sempre visibile. */}
      <div
        ref={setScorrimento}
        className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex min-h-[500px] w-max gap-3">
          {/* Colonne per ogni stato */}
          {statuses.map(status => (
            <OrdersPipelineColumn
              key={status.id}
              status={status}
              orders={ordersByStatus[status.id] || []}
              isDragEnabled={!!onStatusChange}
              collapsed={compresse.has(status.id)}
              onToggleCollapse={alternaColonna}
            />
          ))}

          {/* Colonna per ordini senza stato (se ce ne sono) */}
          {ordersWithoutStatus.length > 0 && (
            <OrdersPipelineColumn
              status={STATO_SENZA}
              orders={ordersWithoutStatus}
              isDragEnabled={false}
              collapsed={compresse.has(ID_SENZA_STATO)}
              onToggleCollapse={alternaColonna}
            />
          )}
        </div>
      </div>
      <BarraScorrimentoOrizzontale contenitore={scorrimento} />

      {/* Drag Overlay - mostra la card durante il trascinamento */}
      <DragOverlay>
        {activeOrder ? (
          <div className="w-[260px]">
            <OrdersPipelineCard order={activeOrder} isDraggable={false} soloAnteprima />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
