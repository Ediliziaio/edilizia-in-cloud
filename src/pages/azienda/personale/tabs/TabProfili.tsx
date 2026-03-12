import { useState, useMemo } from "react";
import { useAllHrProfili } from "@/hooks/useOrganigramma";
import type { HrProfilo } from "@/types/hr";
import { HrProfiloSheet } from "@/components/hr/HrProfiloSheet";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Users, UserCheck, UserX, Briefcase, Mail, Phone } from "lucide-react";

const CONTRATTO_LABELS: Record<string, string> = {
  indeterminato: "Indeterminato",
  determinato: "Determinato",
  apprendistato: "Apprendistato",
  tirocinio: "Tirocinio",
  consulenza: "Consulenza",
  part_time: "Part Time",
  interinale: "Interinale",
  collaborazione: "Collaborazione",
  partita_iva: "P. IVA",
  stagionale: "Stagionale",
};

export function TabProfili() {
  const { data: profili = [], isLoading } = useAllHrProfili();
  const [search, setSearch] = useState("");
  const [filterStato, setFilterStato] = useState<"tutti" | "attivi" | "cessati">("tutti");
  const [filterReparto, setFilterReparto] = useState<string>("tutti");
  const [selectedProfilo, setSelectedProfilo] = useState<HrProfilo | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Unique reparti
  const reparti = useMemo(() => {
    const set = new Set(profili.map((p) => p.reparto).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [profili]);

  const filtered = useMemo(() => {
    let list = profili;
    if (filterStato === "attivi") list = list.filter((p) => p.attivo);
    if (filterStato === "cessati") list = list.filter((p) => !p.attivo);
    if (filterReparto !== "tutti") list = list.filter((p) => p.reparto === filterReparto);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((p) =>
        `${p.nome} ${p.cognome} ${p.email ?? ""} ${p.matricola ?? ""} ${p.mansione ?? ""}`.toLowerCase().includes(s)
      );
    }
    return list;
  }, [profili, search, filterStato, filterReparto]);

  const kpis = useMemo(() => ({
    totali: profili.length,
    attivi: profili.filter((p) => p.attivo).length,
    cessati: profili.filter((p) => !p.attivo).length,
  }), [profili]);

  const handleNew = () => { setSelectedProfilo(null); setSheetOpen(true); };
  const handleEdit = (p: HrProfilo) => { setSelectedProfilo(p); setSheetOpen(true); };

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted"><Users className="h-5 w-5 text-muted-foreground" /></div>
            <div><p className="text-2xl font-bold">{kpis.totali}</p><p className="text-xs text-muted-foreground">Totali</p></div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted"><UserCheck className="h-5 w-5 text-muted-foreground" /></div>
            <div><p className="text-2xl font-bold">{kpis.attivi}</p><p className="text-xs text-muted-foreground">Attivi</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted"><UserX className="h-5 w-5 text-muted-foreground" /></div>
            <div><p className="text-2xl font-bold">{kpis.cessati}</p><p className="text-xs text-muted-foreground">Cessati</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Cerca nome, email, matricola..." className="pl-9 max-w-[250px] h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterStato} onValueChange={(v) => setFilterStato(v as any)}>
          <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti</SelectItem>
            <SelectItem value="attivi">Attivi</SelectItem>
            <SelectItem value="cessati">Cessati</SelectItem>
          </SelectContent>
        </Select>
        {reparti.length > 0 && (
          <Select value={filterReparto} onValueChange={setFilterReparto}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Reparto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti i reparti</SelectItem>
              {reparti.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="ml-auto">
          <Button size="sm" onClick={handleNew}><Plus className="h-4 w-4 mr-1" /> Nuovo Profilo</Button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nessun profilo trovato.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <ProfiloRow key={p.id} profilo={p} onClick={() => handleEdit(p)} />
          ))}
        </div>
      )}

      <HrProfiloSheet open={sheetOpen} onOpenChange={setSheetOpen} profilo={selectedProfilo} allProfili={profili} />
    </div>
  );
}

function ProfiloRow({ profilo: p, onClick }: { profilo: HrProfilo; onClick: () => void }) {
  return (
    <Card className={`cursor-pointer hover:shadow-md transition-shadow ${!p.attivo ? "opacity-60" : ""}`} onClick={onClick}>
      <CardContent className="p-3 flex items-center gap-3">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ backgroundColor: p.colore_avatar || "hsl(var(--primary))" }}
        >
          {p.nome?.[0]}{p.cognome?.[0]}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{p.nome} {p.cognome}</span>
            {p.matricola && <Badge variant="outline" className="text-xs font-mono">{p.matricola}</Badge>}
            {!p.attivo && <Badge variant="secondary" className="text-xs">Cessato</Badge>}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
            {p.mansione && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{p.mansione}</span>}
            {p.reparto && <span>· {p.reparto}</span>}
            {p.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{p.email}</span>}
            {p.telefono && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.telefono}</span>}
          </div>
        </div>

        {/* Contract badge */}
        <Badge variant="outline" className="text-xs shrink-0">
          {CONTRATTO_LABELS[p.tipo_contratto] || p.tipo_contratto}
        </Badge>
      </CardContent>
    </Card>
  );
}
