/**
 * Il pannellino «Colonne» (26/11/2026): una spunta per ogni colonna e l'ordine.
 *
 * Due modi per spostare, non uno: il trascinamento (@dnd-kit, come
 * `OrderStatusConfig`) e le frecce su/giù. Le frecce non sono un ripiego per
 * l'accessibilità — da telefono trascinare dentro un popover che scorre non si governa, e
 * questi elenchi si guardano anche dal cantiere. Il trascinamento resta per chi ha il
 * mouse, dove è più rapido.
 *
 * Quello che il pannellino NON fa: le colonne ancorate (la spunta della selezione, il
 * menù delle azioni) non compaiono, perché non si spostano né si spengono; le colonne
 * fisse compaiono con il lucchetto, spuntate e non spuntabili. Le regole stanno in
 * `colonneTabella.ts`, non qui: questo file disegna.
 */

import React, { useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Columns3, GripVertical, Lock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ColonneTabella } from "@/hooks/useColonneTabella";

/**
 * Del hook il pannellino usa solo questi cinque campi, e li dichiara: così lo può passare
 * anche chi avvolge `useColonneTabella` in qualcos'altro (le fatture emesse restituiscono
 * `colonne` come elenco di chiavi, non di definizioni, per non riscrivere testata e celle).
 */
export type PannelloColonne = Pick<
  ColonneTabella,
  "stato" | "accendi" | "sposta" | "ripristina" | "toccata"
>;
import { siPuoNascondere } from "@/lib/tabelle/colonneTabella";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface RigaProps {
  chiave: string;
  etichetta: string;
  accesa: boolean;
  fissa: boolean;
  /** Spostabile solo se accesa: una colonna spenta non ha un posto nella tabella. */
  spostabile: boolean;
  prima: boolean;
  ultima: boolean;
  onAccendi: (accesa: boolean) => void;
  onSposta: (verso: -1 | 1) => void;
}

function RigaColonna({
  chiave,
  etichetta,
  accesa,
  fissa,
  spostabile,
  prima,
  ultima,
  onAccendi,
  onSposta,
}: RigaProps) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chiave,
    disabled: !spostabile,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm",
        isDragging && "bg-accent shadow-sm",
        !accesa && "text-muted-foreground",
      )}
    >
      {spostabile ? (
        <button
          type="button"
          aria-label={t("Trascina per spostare {etichetta}", { etichetta })}
          className="cursor-grab touch-none text-muted-foreground max-sm:hidden"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <span className="w-4 max-sm:hidden" />
      )}

      <Checkbox
        id={`colonna-${chiave}`}
        checked={accesa}
        disabled={fissa}
        onCheckedChange={(v) => onAccendi(v === true)}
      />
      <label
        htmlFor={`colonna-${chiave}`}
        className={cn("min-w-0 flex-1 truncate", fissa ? "cursor-default" : "cursor-pointer")}
      >
        {etichetta}
      </label>

      {fissa ? (
        <Lock
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-label={t("Sempre visibile: senza questa colonna la riga non si usa")}
        />
      ) : null}

      {spostabile ? (
        <span className="flex shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={prima}
            aria-label={t("Sposta {etichetta} a sinistra", { etichetta })}
            onClick={() => onSposta(-1)}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={ultima}
            aria-label={t("Sposta {etichetta} a destra", { etichetta })}
            onClick={() => onSposta(1)}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
        </span>
      ) : null}
    </div>
  );
}

/**
 * Solo l'elenco delle colonne, senza il contenitore: per una barra che ha già il suo
 * pannellino (le fatture emesse ci tengono dentro anche «Ordina per»).
 */
export function ElencoColonne({ colonne }: { colonne: PannelloColonne }) {
  const t = useT();
  const { stato, accendi, sposta } = colonne;
  const accese = stato.filter((s) => s.accesa);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function finitoTrascinamento({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const a = accese.findIndex((s) => s.colonna.chiave === over.id);
    if (a < 0) return;
    sposta(String(active.id), a);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={finitoTrascinamento}>
      <SortableContext
        items={accese.map((s) => s.colonna.chiave)}
        strategy={verticalListSortingStrategy}
      >
        {stato.map(({ colonna, accesa }) => {
          const posto = accese.findIndex((s) => s.colonna.chiave === colonna.chiave);
          return (
            <RigaColonna
              key={colonna.chiave}
              chiave={colonna.chiave}
              etichetta={t(colonna.etichetta)}
              accesa={accesa}
              fissa={!siPuoNascondere(colonna)}
              spostabile={accesa}
              prima={posto === 0}
              ultima={posto === accese.length - 1}
              onAccendi={(v) => accendi(colonna.chiave, v)}
              onSposta={(verso) => sposta(colonna.chiave, posto + verso)}
            />
          );
        })}
      </SortableContext>
    </DndContext>
  );
}

/** La testa del pannellino: a cosa serve, e «Predefinite» solo se c'è qualcosa da ripristinare. */
export function TestaSceltaColonne({ colonne }: { colonne: PannelloColonne }) {
  const t = useT();
  return (
    <div className="mb-1 flex items-center justify-between gap-2 px-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        {t("Quali colonne vedi, e in che ordine")}
      </p>
      {colonne.toccata ? (
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-xs" onClick={colonne.ripristina}>
          <RotateCcw className="h-3 w-3" />
          {t("Predefinite")}
        </Button>
      ) : null}
    </div>
  );
}

export function SceltaColonne({
  colonne,
  compatto,
  extra,
}: {
  colonne: PannelloColonne;
  /** Solo l'icona, senza la scritta: per le barre già piene. */
  compatto?: boolean;
  /** Qualcosa da mettere sopra l'elenco, nello stesso pannellino (es. «Ordina per»). */
  extra?: React.ReactNode;
}) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const nascoste = colonne.stato.filter((s) => !s.accesa).length;

  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs">
          <Columns3 className="h-3.5 w-3.5" />
          {compatto ? null : t("Colonne")}
          {/* Il contatore è un ornamento: dentro il nome accessibile il pulsante
              diventerebbe «Colonne 3» e nessuno lo troverebbe più per nome. */}
          {nascoste > 0 ? (
            <span aria-hidden="true" className="rounded bg-muted px-1 text-[11px] tabular-nums">{nascoste}</span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2 max-sm:w-[min(20rem,calc(100vw-2rem))]">
        {extra}
        <TestaSceltaColonne colonne={colonne} />
        <div className="max-h-[60vh] overflow-y-auto">
          <ElencoColonne colonne={colonne} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
