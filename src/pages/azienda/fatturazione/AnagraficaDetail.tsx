import { useParams, useNavigate } from "react-router-dom";
import { useAnagraficaNative } from "@/hooks/useAnagraficheNative";
import { useDocumentiFiscali } from "@/hooks/useDocumentiFiscali";
import { useMovimentiCassa } from "@/hooks/useMovimentiCassa";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import type { AnagraficaNative } from "@/types/fatturazione";

function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export default function AnagraficaDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: rawData, isLoading } = useAnagraficaNative(id);
  const anagrafica = rawData as unknown as AnagraficaNative | null;

  const { data: docData } = useDocumentiFiscali({ anagrafica_id: id });
  const documenti = docData?.documenti ?? [];
  const fatture = documenti.filter((d) => d.tipo !== "ddt");
  const ddts = documenti.filter((d) => d.tipo === "ddt");

  const { data: movimenti } = useMovimentiCassa({ documento_id: undefined });
  // Filter movimenti for documents of this anagrafica
  const docIds = new Set(documenti.map((d) => d.id));
  const movimentiFiltered = (movimenti ?? []).filter((m) => m.documento_id && docIds.has(m.documento_id));

  if (isLoading || !anagrafica) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const displayName = anagrafica.ragione_sociale ?? `${anagrafica.nome ?? ""} ${anagrafica.cognome ?? ""}`.trim();
  const fatturato = anagrafica.fatturato_totale ?? 0;
  const pagato = movimentiFiltered.reduce((sum, m) => sum + m.importo, 0);
  const saldoAperto = fatturato - pagato;

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-14 w-14">
          <AvatarFallback className="text-lg bg-primary/10 text-primary">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{displayName}</h1>
            <Badge variant="secondary">{anagrafica.tipo_cliente}</Badge>
            <Badge variant={anagrafica.attivo ? "default" : "secondary"}>
              {anagrafica.attivo ? "Attivo" : "Inattivo"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono">{anagrafica.partita_iva ?? "—"}</p>
        </div>
        <Button size="sm" onClick={() => navigate(`/azienda/documenti/nuovo?tipo=fattura`)}>
          <FileText className="h-4 w-4 mr-1" /> Nuova fattura
        </Button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Fatturato totale</p>
            <p className="text-lg font-semibold">€ {fatturato.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Pagato</p>
            <p className="text-lg font-semibold text-emerald-600">€ {pagato.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Saldo aperto</p>
            <p className={`text-lg font-semibold ${saldoAperto > 0 ? "text-destructive" : ""}`}>
              € {saldoAperto.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">N. fatture</p>
            <p className="text-lg font-semibold">{anagrafica.numero_fatture ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Financial position widget */}
      {fatturato > 0 && saldoAperto > 0 && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="pt-4 pb-3 flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">Posizione finanziaria:</span>{" "}
              Fatturato YTD € {fatturato.toFixed(2)} — Pagato € {pagato.toFixed(2)} — Aperto{" "}
              <span className="font-semibold text-destructive">€ {saldoAperto.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="dati">
        <TabsList>
          <TabsTrigger value="dati">Dati</TabsTrigger>
          <TabsTrigger value="fatture">Fatture ({fatture.length})</TabsTrigger>
          <TabsTrigger value="ddt">DDT ({ddts.length})</TabsTrigger>
          <TabsTrigger value="movimenti">Movimenti ({movimentiFiltered.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="dati" className="mt-4">
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Dati anagrafici</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Ragione sociale" value={anagrafica.ragione_sociale} />
                <Row label="Nome" value={anagrafica.nome} />
                <Row label="Cognome" value={anagrafica.cognome} />
                <Row label="Forma giuridica" value={anagrafica.forma_giuridica} />
                <Row label="Tipo soggetto" value={anagrafica.tipo_soggetto} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Dati fiscali</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="P.IVA" value={anagrafica.partita_iva} mono />
                <Row label="Codice fiscale" value={anagrafica.codice_fiscale} mono />
                <Row label="Codice SDI" value={anagrafica.codice_sdi} mono />
                <Row label="PEC" value={anagrafica.pec} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Indirizzo</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Via" value={anagrafica.indirizzo_via} />
                <Row label="CAP" value={anagrafica.indirizzo_cap} />
                <Row label="Comune" value={anagrafica.indirizzo_comune} />
                <Row label="Provincia" value={anagrafica.indirizzo_provincia} />
                <Row label="Nazione" value={anagrafica.indirizzo_nazione} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Contatti & Banca</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Email" value={anagrafica.email} />
                <Row label="Telefono" value={anagrafica.telefono} />
                <Row label="IBAN" value={anagrafica.iban_cliente} mono />
                <Row label="Sito web" value={anagrafica.sito_web} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="fatture" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">Numero</th>
                    <th className="p-3 text-left font-medium">Tipo</th>
                    <th className="p-3 text-left font-medium">Data</th>
                    <th className="p-3 text-right font-medium">Totale</th>
                    <th className="p-3 text-left font-medium">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {fatture.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/azienda/documenti/${d.id}/dettaglio`)}
                    >
                      <td className="p-3 font-mono">{d.numero}</td>
                      <td className="p-3 capitalize">{d.tipo.replace("_", " ")}</td>
                      <td className="p-3">{d.data_emissione}</td>
                      <td className="p-3 text-right font-mono">€ {d.totale_documento.toFixed(2)}</td>
                      <td className="p-3">
                        <Badge variant="secondary">{d.stato}</Badge>
                      </td>
                    </tr>
                  ))}
                  {fatture.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nessuna fattura</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ddt" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">Numero</th>
                    <th className="p-3 text-left font-medium">Data</th>
                    <th className="p-3 text-right font-medium">Articoli</th>
                    <th className="p-3 text-left font-medium">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {ddts.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/azienda/documenti/${d.id}/dettaglio`)}
                    >
                      <td className="p-3 font-mono">{d.numero}</td>
                      <td className="p-3">{d.data_emissione}</td>
                      <td className="p-3 text-right">{d.righe?.length ?? 0}</td>
                      <td className="p-3">
                        <Badge variant={d.ddt_fatturato ? "default" : "outline"}>
                          {d.ddt_fatturato ? "Fatturato" : "Da fatturare"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {ddts.length === 0 && (
                    <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Nessun DDT</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movimenti" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">Data</th>
                    <th className="p-3 text-right font-medium">Importo</th>
                    <th className="p-3 text-left font-medium">Metodo</th>
                    <th className="p-3 text-left font-medium">Riferimento</th>
                  </tr>
                </thead>
                <tbody>
                  {movimentiFiltered.map((m) => (
                    <tr key={m.id} className="border-b">
                      <td className="p-3">{m.data_movimento}</td>
                      <td className="p-3 text-right font-mono">€ {m.importo.toFixed(2)}</td>
                      <td className="p-3 capitalize">{m.metodo ?? "—"}</td>
                      <td className="p-3">{m.riferimento ?? "—"}</td>
                    </tr>
                  ))}
                  {movimentiFiltered.length === 0 && (
                    <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Nessun movimento</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono" : ""}>{value ?? "—"}</span>
    </div>
  );
}
