import { useMemo, useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Shield, Search, ChevronLeft, ChevronRight, UserCog, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useDebounce } from "@/hooks/useDebounce";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuditUnified, type AuditUnifiedRow } from "@/hooks/superadmin/useAuditUnified";

const PAGE_SIZE = 50;

const ETICHETTA_FONTE: Record<string, { testo: string; classe: string }> = {
  central: { testo: "Dato", classe: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  admin: { testo: "Admin", classe: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  flag: { testo: "Flag", classe: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" },
};

function valoreLeggibile(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Sì" : "No";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Mostra solo i campi realmente cambiati, non l'intera riga. */
function DiffCampi({ riga }: { riga: AuditUnifiedRow }) {
  const campi = riga.campi_modificati ?? [];
  if (campi.length === 0) {
    if (!riga.dopo) return <span className="text-muted-foreground">—</span>;
    return (
      <pre className="text-[11px] whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
        {JSON.stringify(riga.dopo, null, 2)}
      </pre>
    );
  }
  return (
    <div className="space-y-1">
      {campi.slice(0, 12).map((campo) => (
        <div key={campo} className="text-[11px] font-mono">
          <span className="text-muted-foreground">{campo}: </span>
          <span className="text-muted-foreground line-through">
            {valoreLeggibile(riga.prima?.[campo])}
          </span>
          {" → "}
          <span className="font-medium">{valoreLeggibile(riga.dopo?.[campo])}</span>
        </div>
      ))}
      {campi.length > 12 && (
        <p className="text-[11px] text-muted-foreground">e altri {campi.length - 12} campi</p>
      )}
    </div>
  );
}

function RigaAudit({ riga }: { riga: AuditUnifiedRow }) {
  const [aperta, setAperta] = useState(false);
  const fonte = ETICHETTA_FONTE[riga.fonte] ?? ETICHETTA_FONTE.central;

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => setAperta((v) => !v)}>
        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          {format(new Date(riga.avvenuto_il), "d MMM HH:mm", { locale: it })}
        </TableCell>
        <TableCell>
          <Badge variant="secondary" className={`text-[10px] ${fonte.classe}`}>{fonte.testo}</Badge>
        </TableCell>
        <TableCell className="text-sm font-medium">
          {riga.azione}
          {riga.in_impersonation && (
            <Badge variant="outline" className="ml-2 text-[10px] gap-1">
              <UserCog className="h-3 w-3" /> assistenza
            </Badge>
          )}
        </TableCell>
        <TableCell className="text-sm">
          {riga.azienda_nome ?? <span className="text-muted-foreground">—</span>}
        </TableCell>
        <TableCell className="text-sm">
          {riga.attore_email ?? (
            <span className="text-muted-foreground italic">non tracciato</span>
          )}
        </TableCell>
        <TableCell className="text-xs font-mono text-muted-foreground">
          {riga.ip ?? "—"}
        </TableCell>
      </TableRow>
      {aperta && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30">
            <div className="grid gap-3 py-2 md:grid-cols-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Cosa è cambiato
                </p>
                <DiffCampi riga={riga} />
              </div>
              <div className="space-y-1 text-xs">
                <p><span className="text-muted-foreground">Oggetto: </span>{riga.oggetto_tipo ?? "—"}</p>
                <p className="font-mono break-all">
                  <span className="text-muted-foreground font-sans">ID: </span>{riga.oggetto_id ?? "—"}
                </p>
                <p><span className="text-muted-foreground">Ruolo: </span>{riga.attore_ruolo ?? "—"}</p>
                {riga.dispositivo && (
                  <p className="break-all"><span className="text-muted-foreground">Dispositivo: </span>{riga.dispositivo}</p>
                )}
                {riga.note && <p className="text-amber-700 dark:text-amber-400">{riga.note}</p>}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/**
 * Registro attività unificato (F1-07).
 *
 * Sostituisce le due schermate che mostravano due tabelle diverse e ignoravano
 * la terza — quella con lo stato precedente e successivo di ogni modifica.
 */
export default function AuditUnifiedPage() {
  const [ricerca, setRicerca] = useState("");
  const [soloImpersonation, setSoloImpersonation] = useState(false);
  const [pagina, setPagina] = useState(0);
  const ricercaDebounced = useDebounce(ricerca, 350);
  const isMobile = useIsMobile();

  const { data, isLoading, error } = useAuditUnified({
    search: ricercaDebounced,
    soloImpersonation,
    page: pagina,
    pageSize: PAGE_SIZE,
  });

  const righe = data?.rows ?? [];
  const totale = data?.total ?? 0;
  const pagineTotali = Math.max(1, Math.ceil(totale / PAGE_SIZE));

  const senzaAttore = useMemo(
    () => righe.filter((r) => !r.attore_id).length,
    [righe],
  );

  return (
    <div className="p-3 md:p-6 space-y-4">
      <div className="hidden md:flex items-center gap-3">
        <Shield className="h-6 w-6 text-blue-500" />
        <div>
          <h1 className="text-xl font-semibold">Registro attività</h1>
          <p className="text-sm text-muted-foreground">
            Modifiche ai dati, azioni amministrative e cambi di configurazione, in un unico elenco
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-base">
              {isLoading ? "Caricamento…" : `${totale.toLocaleString("it-IT")} eventi`}
            </CardTitle>
            <div className="flex flex-1 items-center gap-2 md:max-w-lg">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={ricerca}
                  onChange={(e) => { setRicerca(e.target.value); setPagina(0); }}
                  placeholder="Azione, operatore, azienda…"
                  className="pl-8"
                />
              </div>
              <div className="flex items-center gap-2 whitespace-nowrap">
                <Switch
                  id="solo-assistenza"
                  checked={soloImpersonation}
                  onCheckedChange={(v) => { setSoloImpersonation(v); setPagina(0); }}
                />
                <Label htmlFor="solo-assistenza" className="text-xs">Solo assistenza</Label>
              </div>
            </div>
          </div>
          {senzaAttore > 0 && !isLoading && (
            <p className="text-xs text-muted-foreground pt-1">
              {senzaAttore} eventi in questa pagina risalgono a prima che l'operatore venisse
              registrato: da ora ogni azione amministrativa porta operatore e indirizzo.
            </p>
          )}
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          {error && (
            <p className="text-sm text-destructive p-6">
              Errore nel caricamento: {(error as Error).message}
            </p>
          )}

          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Azione</TableHead>
                <TableHead>Azienda</TableHead>
                <TableHead>Operatore</TableHead>
                <TableHead>Indirizzo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                [...Array(8)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(6)].map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}

              {!isLoading && !error && righe.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    Nessun evento corrisponde ai filtri
                  </TableCell>
                </TableRow>
              )}

              {!isLoading &&
                righe.map((riga) => <RigaAudit key={`${riga.fonte}-${riga.id}`} riga={riga} />)}
            </TableBody>
          </Table>
        </CardContent>

        {pagineTotali > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Pagina {pagina + 1} di {pagineTotali}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline" size="sm" disabled={pagina === 0}
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                {!isMobile && <span className="ml-1">Precedente</span>}
              </Button>
              <Button
                variant="outline" size="sm" disabled={pagina + 1 >= pagineTotali}
                onClick={() => setPagina((p) => p + 1)}
              >
                {!isMobile && <span className="mr-1">Successiva</span>}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
