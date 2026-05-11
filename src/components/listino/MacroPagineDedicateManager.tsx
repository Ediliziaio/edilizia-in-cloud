/**
 * MacroPagineDedicateManager — controllo opt-in delle pagine dedicate macro
 * nel PDF preventivo, scoperto per verticale.
 *
 * Use case: dentro il template preventivo (es. Serramenti) l'admin vede la
 * lista delle macrocategorie del listino abilitate per quel verticale e
 * può togglare quali avranno la "pagina dedicata" nel PDF (storytelling
 * con foto + descrizione estesa).
 *
 * Stato persistito su `listino_macrocategorie.mostra_pagina_dedicata_pdf`.
 * Il toggle qui modifica quel flag → completamente sincronizzato con il
 * form Modifica macrocategoria (single source of truth in DB).
 *
 * Requisiti UX:
 *  - Solo macro con descrizione_estesa OR descrizione non vuota possono
 *    essere attivate (servirebbe testo per la pagina). Quelle senza testo
 *    sono mostrate "disabilitate" con CTA "Aggiungi descrizione".
 *  - Avviso visivo per macro senza immagine_url (la pagina renderizza
 *    comunque ma è meno bella).
 *  - Bottone "Modifica" che apre il dialog macrocategoria.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileText, ImageIcon, Sparkles, AlertTriangle, ExternalLink, Loader2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useListinoMacrocategorie,
  useMacrocategorieMutations,
  type ListinoMacrocategoria,
} from "@/hooks/useListinoMacrocategorie";

interface Props {
  /**
   * Verticale di scoping (es. "serramentista"). Se non passato, mostra tutte
   * le macrocategorie con descrizione. Filtra su `verticali_abilitati`:
   * include la macro se l'array è vuoto (generica) o contiene il verticale.
   */
  vertical?: string;
}

export function MacroPagineDedicateManager({ vertical }: Props) {
  const { macrocategorie, isLoading } = useListinoMacrocategorie();
  const { updateMacrocategoria } = useMacrocategorieMutations();
  const qc = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Filtro per vertical: macro con verticali_abilitati = [] (generica) OR
  // contenente il vertical richiesto.
  const visible = macrocategorie.filter((m) => {
    if (!vertical) return true;
    const va = m.verticali_abilitati ?? [];
    return va.length === 0 || va.includes(vertical);
  });

  const hasText = (m: ListinoMacrocategoria) =>
    (m.descrizione_estesa ?? "").trim().length > 0 ||
    (m.descrizione ?? "").trim().length > 0;

  const handleToggle = async (m: ListinoMacrocategoria, next: boolean) => {
    setPendingId(m.id);
    try {
      await updateMacrocategoria.mutateAsync({
        id: m.id,
        patch: { mostra_pagina_dedicata_pdf: next },
      });
      // Forza un re-fetch immediato della lista per riflettere il nuovo stato.
      void qc.invalidateQueries({ queryKey: ["listino-macrocategorie"] });
      toast.success(next ? "Pagina dedicata attivata" : "Pagina dedicata disattivata");
    } finally {
      setPendingId(null);
    }
  };

  const attiveCount = visible.filter((m) => m.mostra_pagina_dedicata_pdf).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="text-muted-foreground">
          Scegli quali macrocategorie del listino avranno una <strong>pagina
          dedicata</strong> nel PDF preventivo (foto + descrizione). Le
          modifiche sono salvate sul listino e visibili anche nella scheda
          macrocategoria.
        </p>
        <Badge variant="secondary" className="shrink-0">
          {attiveCount} di {visible.length} attive
        </Badge>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Caricamento…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground space-y-2">
          <FileText className="h-6 w-6 mx-auto opacity-40" />
          <p>
            Nessuna macrocategoria configurata
            {vertical ? ` per il verticale "${vertical}"` : ""}.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/azienda/impostazioni/listino">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Vai al listino
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((m) => {
            const canActivate = hasText(m);
            const isActive = m.mostra_pagina_dedicata_pdf;
            const isPending = pendingId === m.id;
            return (
              <li
                key={m.id}
                className={`flex items-center gap-3 rounded-md border p-3 transition-colors ${
                  isActive
                    ? "border-orange-200 bg-orange-50/40 dark:border-orange-900/40 dark:bg-orange-950/20"
                    : "bg-card"
                }`}
              >
                {/* Thumb */}
                <div className="h-12 w-12 shrink-0 rounded-md overflow-hidden border bg-muted/40 flex items-center justify-center">
                  {m.immagine_url ? (
                    <img src={m.immagine_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground/60" />
                  )}
                </div>

                {/* Identità + warning */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{m.nome}</span>
                    {isActive && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-5 border-orange-200 bg-orange-100/50 text-orange-700 dark:bg-orange-950/40 dark:border-orange-900/50 dark:text-orange-300"
                      >
                        <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                        Attiva
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {!canActivate ? (
                      <span className="text-[11px] text-amber-700 dark:text-amber-400 inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Manca la descrizione
                      </span>
                    ) : !m.immagine_url ? (
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                        Aggiungi una foto per un risultato migliore
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground line-clamp-1">
                        {(m.descrizione_estesa ?? m.descrizione ?? "").slice(0, 90)}
                        {(m.descrizione_estesa ?? m.descrizione ?? "").length > 90 && "…"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Edit shortcut */}
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  <Link to="/azienda/impostazioni/listino" title="Modifica nel listino">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </Button>

                {/* Toggle */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  <Switch
                    checked={isActive}
                    onCheckedChange={(v) => void handleToggle(m, v)}
                    disabled={!canActivate || isPending}
                    aria-label={`Pagina dedicata per ${m.nome}`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
