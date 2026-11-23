import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAnagraficaNative } from "@/hooks/useAnagraficheNative";
import { useDocumentiFiscali } from "@/hooks/useDocumentiFiscali";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { MovimentoCassa } from "@/hooks/useMovimentiCassa";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, FileText, Loader2, Pencil } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { DatiFiscaliClienteDialog } from "@/components/clients/DatiFiscaliClienteDialog";
import { UfficiPaCard } from "@/components/clients/UfficiPaCard";
import { useUfficiPa } from "@/hooks/useUfficiPa";
import { etichettaTipoCliente, formDaAnagrafica } from "@/lib/clienti/clienteFiscale";
import type { AnagraficaNative } from "@/types/fatturazione";
import { formatCurrency } from "@/lib/formatters";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

function useMovimentiCassaByDocIds(docIds: string[]) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["movimenti-cassa-by-docs", companyId, docIds],
    enabled: !!companyId && docIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimenti_cassa_native" as never)
        .select("*")
        .eq("company_id", companyId!)
        .in("documento_id", docIds)
        .order("data_movimento", { ascending: false });
      if (error) throw error;
      return (data as unknown as MovimentoCassa[]) ?? [];
    },
  });
}

function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export default function AnagraficaDetail() {
  const t = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: rawData, isLoading } = useAnagraficaNative(id);
  const anagrafica = rawData as unknown as AnagraficaNative | null;

  const { data: docData } = useDocumentiFiscali({ anagrafica_id: id });
  const documenti = docData?.documenti ?? [];
  const fatture = documenti.filter((d) => d.tipo !== "ddt");
  const ddts = documenti.filter((d) => d.tipo === "ddt");

  // Only fetch movimenti once we have document IDs to filter by
  const docIds = useMemo(() => documenti.map((d) => d.id), [documenti]);
  const { data: movimentiData } = useMovimentiCassaByDocIds(docIds);
  const movimentiFiltered = movimentiData ?? [];

  // Modifica secondo i permessi che già esistono: clienti o fatturazione, mai in sola lettura.
  const permessi = usePermissions();
  const puoModificare =
    !permessi.isLoading && !permessi.solaLettura && (permessi.isAdmin || permessi.canEditCustomers || permessi.canViewBilling);
  const [modifica, setModifica] = useState(false);
  const anaPa = (rawData as { tipo_cliente?: string } | undefined)?.tipo_cliente === "PA";
  const { tutti: uffici } = useUfficiPa(anaPa ? id : null);

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
        <Button variant="ghost" size="icon" aria-label={t("Torna indietro")} className="hidden md:inline-flex" onClick={() => navigate(-1)}>
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
            <Badge variant="secondary">{etichettaTipoCliente(anagrafica.tipo_cliente)}</Badge>
            <Badge variant={anagrafica.attivo ? "default" : "secondary"}>
              {anagrafica.attivo ? t("Attivo") : t("Inattivo")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono">{anagrafica.partita_iva ?? "—"}</p>
        </div>
        {puoModificare && (
          <Button size="sm" variant="outline" onClick={() => setModifica(true)}>
            <Pencil className="h-4 w-4 mr-1" /> {t("Modifica")}
          </Button>
        )}
        <Button size="sm" onClick={() => navigate(`/azienda/documenti/nuovo?tipo=fattura`)}>
          <FileText className="h-4 w-4 mr-1" /> {t("Nuova fattura")}
        </Button>
      </div>

      {/* KPI */}
      <DatiFiscaliClienteDialog
        open={modifica}
        onOpenChange={setModifica}
        iniziale={formDaAnagrafica(rawData as Record<string, unknown>)}
        clienteId={anagrafica.cliente_id ?? null}
        anagraficaId={anagrafica.id}
        chiediUfficio={!anaPa || uffici.length === 0}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">{t("Fatturato totale")}</p>
            <p className="text-lg font-semibold">{formatCurrency(fatturato)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">{t("Pagato")}</p>
            <p className="text-lg font-semibold text-emerald-600">{formatCurrency(pagato)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">{t("Saldo aperto")}</p>
            <p className={`text-lg font-semibold ${saldoAperto > 0 ? "text-destructive" : ""}`}>
              {formatCurrency(saldoAperto)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">{t("N. fatture")}</p>
            <p className="text-lg font-semibold">{anagrafica.numero_fatture ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Financial position widget */}
      {fatturato > 0 && saldoAperto > 0 && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="pt-4 pb-3 flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">{t("Posizione finanziaria:")}</span>{" "}
              {t("Fatturato YTD {fatturato} — Pagato {pagato} — Aperto", { fatturato: formatCurrency(fatturato), pagato: formatCurrency(pagato) })}{" "}
              <span className="font-semibold text-destructive">{formatCurrency(saldoAperto)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="dati">
        <TabsList>
          <TabsTrigger value="dati">{t("Dati")}</TabsTrigger>
          <TabsTrigger value="fatture">{t("Fatture ({n})", { n: fatture.length })}</TabsTrigger>
          <TabsTrigger value="ddt">{t("DDT ({n})", { n: ddts.length })}</TabsTrigger>
          <TabsTrigger value="movimenti">{t("Movimenti ({n})", { n: movimentiFiltered.length })}</TabsTrigger>
        </TabsList>

        <TabsContent value="dati" className="mt-4">
          <div className="grid sm:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">{t("Dati anagrafici")}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label={t("Ragione sociale")} value={anagrafica.ragione_sociale} />
                <Row label={t("Nome")} value={anagrafica.nome} />
                <Row label={t("Cognome")} value={anagrafica.cognome} />
                <Row label={t("Forma giuridica")} value={anagrafica.forma_giuridica} />
                <Row label={t("Tipo cliente")} value={etichettaTipoCliente(anagrafica.tipo_cliente)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">{t("Dati fiscali")}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="P.IVA" value={anagrafica.partita_iva} mono />
                <Row label={t("Codice fiscale")} value={anagrafica.codice_fiscale} mono />
                <Row
                  label={anaPa ? t("Codice univoco ufficio (predefinito)") : t("Codice destinatario")}
                  value={anagrafica.codice_sdi}
                  mono
                />
                <Row label="PEC" value={anagrafica.pec} />
                {anaPa && <Row label={t("Codice IPA dell'ente")} value={anagrafica.codice_ipa} mono />}
                {anaPa && (
                  <Row
                    label={t("Split payment")}
                    value={anagrafica.split_payment == null ? "Come l'impostazione dell'azienda" : anagrafica.split_payment ? "Sì" : "No"}
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">{t("Indirizzo")}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label={t("Via")} value={anagrafica.indirizzo_via} />
                <Row label="CAP" value={anagrafica.indirizzo_cap} />
                <Row label={t("Comune")} value={anagrafica.indirizzo_comune} />
                <Row label={t("Provincia")} value={anagrafica.indirizzo_provincia} />
                <Row label={t("Nazione")} value={anagrafica.indirizzo_nazione} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">{t("Contatti & Banca")}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Email" value={anagrafica.email} />
                <Row label={t("Telefono")} value={anagrafica.telefono} />
                <Row label={t("Referente amministrativo")} value={anagrafica.referente_amministrativo} />
                <Row label={t("Email amministrazione")} value={anagrafica.email_fatture} />
                <Row label="IBAN" value={anagrafica.iban_cliente} mono />
                <Row label={t("Sito web")} value={anagrafica.sito_web} />
              </CardContent>
            </Card>
            {anaPa && (
              <div className="sm:col-span-2">
                <UfficiPaCard anagraficaId={anagrafica.id} puoModificare={puoModificare} />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="fatture" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">{t("Numero")}</th>
                    <th className="p-3 text-left font-medium">{t("Tipo")}</th>
                    <th className="p-3 text-left font-medium">{t("Data")}</th>
                    <th className="p-3 text-right font-medium">{t("Totale")}</th>
                    <th className="p-3 text-left font-medium">{t("Stato")}</th>
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
                      <td className="p-3 text-right font-mono">{formatCurrency(d.totale_documento)}</td>
                      <td className="p-3">
                        <Badge variant="secondary">{d.stato}</Badge>
                      </td>
                    </tr>
                  ))}
                  {fatture.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">{t("Nessuna fattura")}</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ddt" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">{t("Numero")}</th>
                    <th className="p-3 text-left font-medium">{t("Data")}</th>
                    <th className="p-3 text-right font-medium">{t("Articoli")}</th>
                    <th className="p-3 text-left font-medium">{t("Stato")}</th>
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
                          {d.ddt_fatturato ? t("Fatturato") : t("Da fatturare")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {ddts.length === 0 && (
                    <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">{t("Nessun DDT")}</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movimenti" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">{t("Data")}</th>
                    <th className="p-3 text-right font-medium">{t("Importo")}</th>
                    <th className="p-3 text-left font-medium">{t("Metodo")}</th>
                    <th className="p-3 text-left font-medium">{t("Riferimento")}</th>
                  </tr>
                </thead>
                <tbody>
                  {movimentiFiltered.map((m) => (
                    <tr key={m.id} className="border-b">
                      <td className="p-3">{m.data_movimento}</td>
                      <td className="p-3 text-right font-mono">{formatCurrency(m.importo)}</td>
                      <td className="p-3 capitalize">{m.metodo ?? "—"}</td>
                      <td className="p-3">{m.riferimento ?? "—"}</td>
                    </tr>
                  ))}
                  {movimentiFiltered.length === 0 && (
                    <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">{t("Nessun movimento")}</td></tr>
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
