/**
 * Pagina lista progetti FV — landing del modulo Fotovoltaico.
 * §52 — Dashboard analytics impresa con KPI principali + tabella progetti.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sun,
  Plus,
  Search,
  Calculator,
  TrendingUp,
  FileText,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useProgetti,
  useStatsAzienda,
  useEliminaProgetto,
  useFvModuloAttivo,
} from "@/lib/fotovoltaico/queries";
import { toast } from "sonner";

const STATI_LABEL = {
  bozza: { label: "Bozza", className: "bg-muted" },
  configurato: { label: "Configurato", className: "bg-blue-50 text-blue-700 border-blue-200" },
  emesso: { label: "Emesso", className: "bg-amber-50 text-amber-700 border-amber-200" },
  firmato: { label: "Firmato", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  annullato: { label: "Annullato", className: "bg-red-50 text-red-700 border-red-200" },
} as const;

const ARCHETIPI_LABEL = {
  privato_prima: "Privato 1ª casa",
  privato_seconda: "Privato 2ª casa",
  privato_isee: "Privato ISEE basso",
  pmi: "PMI",
  condominio: "Condominio",
  cer: "CER",
  industriale_grande: "Industriale grande",
} as const;

export default function FotovoltaicoIndex() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === "company_admin" || role === "super_admin";

  const { data: moduloStato, isLoading: loadingModulo } = useFvModuloAttivo();
  const { data: progetti = [], isLoading } = useProgetti();
  const { data: stats } = useStatsAzienda();
  const eliminaProgetto = useEliminaProgetto();

  const [search, setSearch] = useState("");
  const [filtroStato, setFiltroStato] = useState<string>("all");
  const [filtroArchetipo, setFiltroArchetipo] = useState<string>("all");

  const progettiFiltrati = useMemo(() => {
    const s = search.trim().toLowerCase();
    return progetti.filter((p) => {
      if (filtroStato !== "all" && p.stato !== filtroStato) return false;
      if (filtroArchetipo !== "all" && p.archetipo !== filtroArchetipo) return false;
      if (s) {
        const blob = `${p.numero ?? ""} ${p.titolo ?? ""} ${p.indirizzo ?? ""} ${p.cliente_nome ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });
  }, [progetti, search, filtroStato, filtroArchetipo]);

  if (loadingModulo) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Caricamento modulo Fotovoltaico…
      </div>
    );
  }

  // Modulo non attivo per questa azienda
  if (!moduloStato?.attivo) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <Sun className="h-16 w-16 mx-auto text-amber-500" />
            <h2 className="text-2xl font-semibold">Modulo Fotovoltaico</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Il modulo Fotovoltaico è una funzionalità avanzata disponibile su
              piano dedicato. Permette di generare preventivi fotovoltaici
              completi (analisi tetto, calcolo finanziario, PDF persuasivo)
              direttamente integrati con il tuo gestionale.
            </p>
            <p className="text-sm text-muted-foreground">
              Contatta il team Edilizia in Cloud per attivarlo per la tua azienda.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Setup non completato
  if (!moduloStato.setup_completato) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <Sun className="h-16 w-16 mx-auto text-amber-500" />
            <h2 className="text-2xl font-semibold">Benvenuto nel modulo Fotovoltaico!</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Prima di iniziare il primo preventivo, ti guidiamo in 5 minuti
              nel setup del modulo: dati impresa, listino base, manodopera,
              template PDF.
            </p>
            <Button asChild size="lg">
              <Link to="/azienda/marketing/fotovoltaico/setup">
                <Sun className="h-4 w-4 mr-2" />
                Avvia setup modulo
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleDelete = async (id: string, titolo: string) => {
    if (!confirm(`Annullare il progetto "${titolo}"? Sarà spostato in archivio.`)) return;
    try {
      await eliminaProgetto.mutateAsync(id);
      toast.success("Progetto annullato");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Sun className="h-8 w-8 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold">Fotovoltaico</h1>
            <p className="text-sm text-muted-foreground">
              I tuoi preventivi fotovoltaici, sempre sotto controllo.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/azienda/marketing/fotovoltaico/calcolatore">
              <Calculator className="h-4 w-4 mr-2" />
              Calcolatore
            </Link>
          </Button>
          {isAdmin && (
            <Button asChild>
              <Link to="/azienda/marketing/fotovoltaico/nuovo">
                <Plus className="h-4 w-4 mr-2" />
                Nuovo progetto
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* KPI Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          icon={<FileText className="h-4 w-4 text-primary" />}
          label="Progetti totali"
          value={String(stats?.progetti_totali ?? 0)}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
          label="Mese corrente"
          value={String(stats?.progetti_mese_corrente ?? 0)}
          delta={stats?.firmati_mese_corrente ? `${stats.firmati_mese_corrente} firmati` : undefined}
        />
        <KpiCard
          label="Tasso conversione"
          value={stats?.tasso_conversione != null ? `${(Number(stats.tasso_conversione) * 100).toFixed(0)}%` : "—"}
        />
        <KpiCard
          label="Ticket medio"
          value={stats?.ticket_medio != null ? `€ ${Number(stats.ticket_medio).toLocaleString("it-IT", { maximumFractionDigits: 0 })}` : "—"}
        />
        {isAdmin && (
          <KpiCard
            label="Margine medio"
            value={stats?.margine_medio != null ? `${(Number(stats.margine_medio) * 100).toFixed(1)}%` : "—"}
          />
        )}
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-64 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per numero, cliente, indirizzo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={filtroStato} onValueChange={setFiltroStato}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {Object.entries(STATI_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroArchetipo} onValueChange={setFiltroArchetipo}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Archetipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli archetipi</SelectItem>
            {Object.entries(ARCHETIPI_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {progettiFiltrati.length} di {progetti.length}
        </span>
      </div>

      {/* Tabella o empty state */}
      {!isLoading && progetti.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center space-y-4">
            <Sun className="h-16 w-16 mx-auto text-muted-foreground/50" />
            <div>
              <h3 className="text-lg font-medium">Nessun progetto ancora</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Crea il tuo primo progetto fotovoltaico in 15 minuti — analisi tetto,
                calcolo finanziario, PDF Vendita personalizzato.
              </p>
            </div>
            <Button asChild size="lg">
              <Link to="/azienda/marketing/fotovoltaico/nuovo">
                <Plus className="h-4 w-4 mr-2" />
                Crea il tuo primo progetto
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {progetti.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numero</TableHead>
                  <TableHead>Cliente / Titolo</TableHead>
                  <TableHead>Archetipo</TableHead>
                  <TableHead className="text-right">Potenza</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                  <TableHead className="text-right">Payback</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {progettiFiltrati.length === 0 && search && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nessun progetto trovato per "{search}".
                    </TableCell>
                  </TableRow>
                )}
                {progettiFiltrati.map((p) => {
                  const stato = STATI_LABEL[p.stato as keyof typeof STATI_LABEL] ?? STATI_LABEL.bozza;
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/azienda/marketing/fotovoltaico/${p.id}`)}
                    >
                      <TableCell className="font-medium">{p.numero}</TableCell>
                      <TableCell>
                        <div className="font-medium">{p.cliente_nome ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{p.titolo}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {ARCHETIPI_LABEL[p.archetipo as keyof typeof ARCHETIPI_LABEL] ?? p.archetipo}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.potenza_kwp != null ? `${Number(p.potenza_kwp).toFixed(2)} kWp` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.prezzo_vendita_iva_inclusa != null ? `€ ${Number(p.prezzo_vendita_iva_inclusa).toLocaleString("it-IT", { maximumFractionDigits: 0 })}` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.payback_anni != null ? `${p.payback_anni}a` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={stato.className}>
                          {stato.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" asChild aria-label="Apri">
                            <Link to={`/azienda/marketing/fotovoltaico/${p.id}`}>
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                          {isAdmin && p.stato !== "firmato" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(p.id, p.titolo)}
                              aria-label="Annulla"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  delta,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  delta?: string;
}) {
  return (
    <Card>
      <CardContent className="py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="font-bold text-xl tabular-nums mt-1">{value}</div>
        {delta && <div className="text-xs text-emerald-600 mt-0.5">{delta}</div>}
      </CardContent>
    </Card>
  );
}
