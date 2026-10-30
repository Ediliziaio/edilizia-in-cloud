/**
 * WarehouseUsciteTab — elenco delle USCITE merce registrate (Fase 1) con il
 * "doppio controllo": ogni uscita registrata può poi diventare un DDT (Fase 2)
 * tramite il bottone "Crea DDT" (RPC create_ddt_from_uscita).
 *
 * Le uscite con DDT già creato mostrano il link al documento. In testa, quante
 * uscite non hanno ancora il documento: al 29/10/2026 erano 53 su 53, perché
 * il secondo passo non lo ricordava nessuno.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpFromLine, FileText, User, HardHat, PencilLine, ExternalLink, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useWarehouseUscite, type UscitaRow } from "@/hooks/warehouse/useWarehouseUscita";
import { CreaDdtDaUscitaDialog } from "@/components/warehouse/CreaDdtDaUscitaDialog";
import { destinatarioLabel, uscitaPerDdt, type UscitaPerDdt } from "@/lib/magazzino/usciteDdt";

type Filtro = "tutte" | "senza_ddt" | "con_ddt";

const STATO_BADGE: Record<UscitaRow["stato"], { label: string; variant: "default" | "secondary" | "outline" }> = {
  registrata: { label: "Registrata", variant: "secondary" },
  ddt_creato: { label: "DDT creato", variant: "default" },
  annullata: { label: "Annullata", variant: "outline" },
};

const TIPO_ICON = { cliente: User, cantiere: HardHat, libero: PencilLine } as const;

export function WarehouseUsciteTab({ warehouseFilter }: { warehouseFilter: string | null }) {
  const navigate = useNavigate();
  const { data: uscite = [], isLoading } = useWarehouseUscite(warehouseFilter);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("tutte");
  const [perDdt, setPerDdt] = useState<UscitaPerDdt | null>(null);

  const senzaDdt = useMemo(() => uscite.filter((u) => u.stato === "registrata").length, [uscite]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return uscite.filter((u) => {
      if (filtro === "senza_ddt" && u.stato !== "registrata") return false;
      if (filtro === "con_ddt" && u.stato !== "ddt_creato") return false;
      return !q || `${u.numero} ${destinatarioLabel(u)}`.toLowerCase().includes(q);
    });
  }, [uscite, search, filtro]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowUpFromLine className="h-4 w-4 text-muted-foreground" /> Uscite merce
        </CardTitle>
        <CardDescription>
          Le uscite registrate. Da qui crei il <strong>DDT</strong> quando vuoi (doppio controllo): prima registri l'uscita, poi generi il documento.
        </CardDescription>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input className="max-w-xs" placeholder="Cerca per numero o destinatario…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div role="group" aria-label="Filtra le uscite" className="flex gap-1">
            {([
              ["tutte", `Tutte · ${uscite.length}`],
              ["senza_ddt", `Senza DDT · ${senzaDdt}`],
              ["con_ddt", `Con DDT · ${uscite.length - senzaDdt}`],
            ] as const).map(([valore, etichetta]) => (
              <Button
                key={valore}
                size="sm"
                variant={filtro === valore ? "default" : "outline"}
                aria-pressed={filtro === valore}
                className="h-8 text-xs"
                onClick={() => setFiltro(valore)}
              >
                {etichetta}
              </Button>
            ))}
          </div>
        </div>
        {senzaDdt > 0 && (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {senzaDdt === 1
              ? "1 uscita è partita senza DDT."
              : `${senzaDdt} uscite sono partite senza DDT.`}{" "}
            La merce che viaggia su strada deve avere il suo documento: crealo con «Crea DDT».
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {isLoading && <div className="py-10 text-center text-sm text-muted-foreground">Caricamento…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {uscite.length === 0 ? (
                <>Nessuna uscita registrata. Usa <strong>"Uscita merce"</strong> per registrarne una.</>
              ) : (
                "Nessuna uscita con questi filtri."
              )}
            </div>
          )}
          {filtered.map((u) => {
            const Icon = TIPO_ICON[u.destinatario_tipo] ?? PencilLine;
            const badge = STATO_BADGE[u.stato];
            const nRighe = Array.isArray(u.righe) ? u.righe.length : 0;
            return (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium">{u.numero}</span>
                    <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Icon className="h-3 w-3" /> {destinatarioLabel(u)}
                    </span>
                    {u.vettore && u.vettore.tipo !== "mittente" && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Truck className="h-3 w-3" /> {"ragione_sociale" in u.vettore ? u.vettore.ragione_sociale : "vettore"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(u.data).toLocaleDateString("it-IT")} · {nRighe} {nRighe === 1 ? "articolo" : "articoli"}
                    {u.note ? ` · ${u.note}` : ""}
                  </div>
                </div>
                {u.stato === "registrata" ? (
                  <Button size="sm" onClick={() => setPerDdt(uscitaPerDdt(u))}>
                    <FileText className="h-4 w-4 mr-2" />
                    Crea DDT
                  </Button>
                ) : u.documento_id ? (
                  <Button size="sm" variant="outline" onClick={() => navigate(`/azienda/documenti/${u.documento_id}`)}>
                    <ExternalLink className="h-4 w-4 mr-2" /> Apri DDT
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
      <CreaDdtDaUscitaDialog uscita={perDdt} onOpenChange={(open) => !open && setPerDdt(null)} />
    </Card>
  );
}
