import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, Medal, Award, Users } from "lucide-react";
import { useTableSort } from "@/hooks/useTableSort";
import { formatCurrency } from "@/lib/formatters";
import { RigaMobile } from "@/components/mobile/FiltriMobile";
import type { VendorKPI } from "@/hooks/useVendorReport";
import {
  aggregateTeamKPI,
  giorniTesto,
  semaforoVenditori,
  tassoTesto,
  type CampoConSoglia,
  type Semaforo,
} from "@/lib/reporting/venditoriRegole";

const RANK_ICONS = [Crown, Medal, Award];
const RANK_COLORS = ["text-yellow-500", "text-gray-400", "text-amber-600"];

const BADGE: Record<Semaforo, string> = {
  buono: "bg-green-50 text-green-700 border-green-200",
  medio: "bg-amber-50 text-amber-700 border-amber-200",
  critico: "bg-red-50 text-red-700 border-red-200",
};

/** Badge con le soglie comuni del report; «—» grigio quando il numero non c'è. */
function kpiBadge(val: number | null, field: CampoConSoglia, conVendite = true) {
  const isDays = field === "avg_giorni_chiusura";
  const s = isDays && !conVendite ? null : semaforoVenditori(field, isDays ? Math.max(val ?? 0, 0.1) : val);
  const display = isDays ? giorniTesto(val, conVendite) : tassoTesto(val);
  return (
    <Badge variant="outline" className={`text-xs font-medium ${s ? BADGE[s] : "text-muted-foreground"}`}>
      {display}
    </Badge>
  );
}

/** A che punto è il venditore sull'obiettivo del periodo. */
function Obiettivo({ fatto, obiettivo }: { fatto: number; obiettivo: number }) {
  if (!(obiettivo > 0)) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = Math.round((fatto / obiettivo) * 100);
  const colore = pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
  const testo = pct >= 100 ? "text-emerald-700" : pct >= 60 ? "text-amber-700" : "text-red-700";
  return (
    <div className="flex min-w-[92px] items-center gap-1.5" title={`${formatCurrency(fatto)} su ${formatCurrency(obiettivo)}`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <div className={`h-full rounded-full ${colore}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-[10px] font-semibold tabular-nums ${testo}`}>{pct}%</span>
    </div>
  );
}

export function VenditoriRanking({
  kpiList,
  isLoading,
  onApriVenditore,
  obiettivi,
}: {
  kpiList: VendorKPI[];
  isLoading: boolean;
  /** Clic su una riga: le opportunità di quel venditore. */
  onApriVenditore?: (agentId: string) => void;
  /** Obiettivi del periodo per venditore (somma dei mesi che tocca). */
  obiettivi?: Map<string, { fatturato: number; contratti: number }>;
}) {
  const accessors = useMemo(() => ({
    nome_agente: (k: VendorKPI) => k.nome_agente,
    fatturato_generato: (k: VendorKPI) => k.fatturato_generato,
    // null (non calcolabile) finisce sempre in fondo, in entrambi i versi
    tasso_chiusura: (k: VendorKPI) => k.tasso_chiusura,
    tasso_show_up: (k: VendorKPI) => k.tasso_show_up,
    importo_medio_chiusura: (k: VendorKPI) => k.importo_medio_chiusura,
    opp_vinte: (k: VendorKPI) => k.opp_vinte,
    tasso_app_to_close: (k: VendorKPI) => k.tasso_app_to_close,
    // crescente = il più veloce per primo; chi non ha vendite non ha un ciclo
    avg_giorni_chiusura: (k: VendorKPI) => (k.opp_vinte > 0 ? k.avg_giorni_chiusura : null),
    pipeline_valore: (k: VendorKPI) => k.pipeline_valore,
    nuovi_contatti: (k: VendorKPI) => k.nuovi_contatti,
  }), []);

  const { sortConfig, toggleSort, sortedItems } = useTableSort(kpiList, accessors);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (!kpiList.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-medium text-muted-foreground">Nessun dato agente</h3>
          <p className="text-sm text-muted-foreground/70 mt-1">Nessun dato disponibile per il periodo selezionato.</p>
        </CardContent>
      </Card>
    );
  }

  // Totale con le regole del database (tassi dai conteggi), lo stesso della Panoramica.
  const team = aggregateTeamKPI(sortedItems);
  const n = sortedItems.length;
  const obiettivoTeam = sortedItems.reduce((a, k) => a + (obiettivi?.get(k.agent_id)?.fatturato ?? 0), 0);
  const conObiettivi = obiettivoTeam > 0;

  // Telefono: una riga per venditore (fatturato, vinte su chiuse, chiusura) che
  // apre le sue opportunità; tabella a 11 colonne e legenda restano al computer.
  return (
    <Card className="max-sm:overflow-hidden">
      <CardContent className="p-0">
        <div className="divide-y sm:hidden">
          {sortedItems.map((k, idx) => (
            <RigaMobile
              key={k.agent_id}
              onClick={onApriVenditore ? () => onApriVenditore(k.agent_id) : undefined}
              sinistra={<span className="w-5 shrink-0 text-center text-[11px] font-semibold text-muted-foreground">{idx + 1}</span>}
              titolo={k.nome_agente}
              sottotitolo={`${k.opp_vinte} vinte su ${k.opp_vinte + k.opp_perse} chiuse · pipeline ${formatCurrency(k.pipeline_valore)}`}
              valore={formatCurrency(k.fatturato_generato)}
              stato={kpiBadge(k.tasso_chiusura, "tasso_chiusura")}
            />
          ))}
        </div>
        <Table className="max-sm:hidden">
          <TableHeader>
            <TableRow>
              <SortableTableHead column="" label="#" sortConfig={null} onSort={() => {}} className="w-10 text-center" />
              <SortableTableHead column="nome_agente" label="Agente" sortConfig={sortConfig} onSort={toggleSort} />
              <SortableTableHead column="fatturato_generato" label="Fatturato" sortConfig={sortConfig} onSort={toggleSort} className="text-right" />
              <SortableTableHead column="tasso_chiusura" label="Chiusura%" sortConfig={sortConfig} onSort={toggleSort} className="text-center" />
              <SortableTableHead column="tasso_show_up" label="Show-Up%" sortConfig={sortConfig} onSort={toggleSort} className="text-center" />
              <SortableTableHead column="importo_medio_chiusura" label="Deal Medio" sortConfig={sortConfig} onSort={toggleSort} className="text-right" />
              <SortableTableHead column="opp_vinte" label="Vinte / chiuse" sortConfig={sortConfig} onSort={toggleSort} className="text-center" />
              <SortableTableHead column="tasso_app_to_close" label="App→Close" sortConfig={sortConfig} onSort={toggleSort} className="text-center" />
              <SortableTableHead column="avg_giorni_chiusura" label="Ciclo" sortConfig={sortConfig} onSort={toggleSort} className="text-center" />
              <SortableTableHead column="pipeline_valore" label="Pipeline" sortConfig={sortConfig} onSort={toggleSort} className="text-right" />
              <SortableTableHead column="nuovi_contatti" label="Contatti" sortConfig={sortConfig} onSort={toggleSort} className="text-center" />
              {conObiettivi && <SortableTableHead column="" label="Obiettivo" sortConfig={null} onSort={() => {}} className="text-center" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedItems.map((k, idx) => {
              const RankIcon = sortConfig ? undefined : RANK_ICONS[idx];
              const rankColor = RANK_COLORS[idx] ?? "";
              return (
                <TableRow
                  key={k.agent_id}
                  className={onApriVenditore ? "cursor-pointer hover:bg-muted/50" : undefined}
                  onClick={onApriVenditore ? () => onApriVenditore(k.agent_id) : undefined}
                  onKeyDown={onApriVenditore ? (e) => { if (e.key === "Enter") onApriVenditore(k.agent_id); } : undefined}
                  tabIndex={onApriVenditore ? 0 : undefined}
                  title={onApriVenditore ? `Apri le opportunità di ${k.nome_agente}` : undefined}
                >
                  <TableCell className="text-center font-medium">
                    {RankIcon ? <RankIcon className={`h-4 w-4 mx-auto ${rankColor}`} /> : idx + 1}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{k.nome_agente}</div>
                    <div className="text-xs text-muted-foreground">{k.email_agente}</div>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(k.fatturato_generato)}</TableCell>
                  <TableCell className="text-center">{kpiBadge(k.tasso_chiusura, "tasso_chiusura")}</TableCell>
                  <TableCell className="text-center">{kpiBadge(k.tasso_show_up, "tasso_show_up")}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(k.importo_medio_chiusura)}</TableCell>
                  <TableCell className="text-center">
                    <span className="font-semibold">{k.opp_vinte}</span>
                    <span className="text-muted-foreground text-xs"> / {k.opp_vinte + k.opp_perse}</span>
                  </TableCell>
                  <TableCell className="text-center">{kpiBadge(k.tasso_app_to_close, "tasso_app_to_close")}</TableCell>
                  <TableCell className="text-center">{kpiBadge(k.avg_giorni_chiusura, "avg_giorni_chiusura", k.opp_vinte > 0)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(k.pipeline_valore)}</TableCell>
                  <TableCell className="text-center">{k.nuovi_contatti}</TableCell>
                  {conObiettivi && (
                    <TableCell className="text-center">
                      <Obiettivo fatto={k.fatturato_generato} obiettivo={obiettivi?.get(k.agent_id)?.fatturato ?? 0} />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
          {n > 1 && team && (
            <TableFooter>
              <TableRow>
                <TableCell />
                <TableCell className="font-semibold">Totale Team</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(team.fatturato_generato)}</TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">{tassoTesto(team.tasso_chiusura)}</TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">{tassoTesto(team.tasso_show_up)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(team.importo_medio_chiusura)}</TableCell>
                <TableCell className="text-center">
                  <span className="font-semibold">{team.opp_vinte}</span>
                  <span className="text-muted-foreground text-xs"> / {team.opp_vinte + team.opp_perse}</span>
                </TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">{tassoTesto(team.tasso_app_to_close)}</TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">{giorniTesto(team.avg_giorni_chiusura, team.opp_vinte > 0)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(team.pipeline_valore)}</TableCell>
                <TableCell className="text-center">{team.nuovi_contatti}</TableCell>
                {conObiettivi && (
                  <TableCell className="text-center">
                    <Obiettivo fatto={team.fatturato_generato} obiettivo={obiettivoTeam} />
                  </TableCell>
                )}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </CardContent>

      <div className="flex flex-wrap items-center gap-4 px-6 pb-4 text-xs text-muted-foreground max-sm:hidden">
        <span><Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">val</Badge> Ottimo</span>
        <span><Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">val</Badge> Da migliorare</span>
        <span><Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">val</Badge> Critico</span>
        <span>«—» = non calcolabile (niente chiuso o nessun appuntamento con esito)</span>
        {onApriVenditore && <span>Clic su un venditore per aprire le sue opportunità</span>}
      </div>
    </Card>
  );
}
