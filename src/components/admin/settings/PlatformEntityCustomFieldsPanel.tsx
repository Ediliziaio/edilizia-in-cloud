import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Building2, CheckCircle2, Layers, Lock, Search, Variable, X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateShort } from "@/lib/formatters";
import { formatError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  BUILTIN_FIELDS,
  FOLDER_COLORS,
  FOLDER_LABELS,
  GROUP_OPTIONS,
  OBJECT_NAME_MAP,
  isObjectRendered,
  toSnakeCase,
} from "@/components/settings/CustomFieldsConfig";
import { PlatformCustomFieldsPanel } from "@/components/admin/settings/PlatformCustomFieldsPanel";

// Oggetti selezionabili (esclude "Tutto").
const OBJECTS = GROUP_OPTIONS.filter((g) => g.value !== "all");

interface CompanyFieldRow {
  id: string;
  company_id: string;
  name: string;
  field_type: string;
  object_type: string;
  section: string | null;
  is_required: boolean;
  created_at: string;
  deleted_at: string | null;
  companies: { name: string | null } | null;
}

function objectLabel(value: string): string {
  return OBJECT_NAME_MAP[value] ?? value;
}

function folderBadgeClass(folder: string): string {
  return FOLDER_COLORS[folder] ?? "bg-muted text-muted-foreground";
}

export function PlatformEntityCustomFieldsPanel() {
  const [tab, setTab] = useState("manage");
  const [search, setSearch] = useState("");
  const [objectFilter, setObjectFilter] = useState("all");
  const [systemSearch, setSystemSearch] = useState("");
  const [systemObject, setSystemObject] = useState("all");

  // Super-admin RLS ("Super admins can manage all custom fields") consente la
  // lettura cross-azienda di marketing_custom_fields.
  const fieldsQuery = useQuery({
    queryKey: ["platform-entity-custom-fields"],
    queryFn: async (): Promise<CompanyFieldRow[]> => {
      const { data, error } = await supabase
        .from("marketing_custom_fields")
        .select("id, company_id, name, field_type, object_type, section, is_required, created_at, deleted_at, companies(name)")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message || "Errore caricamento campi");
      return ((data ?? []) as unknown as CompanyFieldRow[]).filter((row) => !row.deleted_at);
    },
    staleTime: 30_000,
  });

  const companyFields = useMemo(() => fieldsQuery.data ?? [], [fieldsQuery.data]);

  // Conteggio campi creati dalle aziende, per object_type.
  const countByObject = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of companyFields) map.set(f.object_type, (map.get(f.object_type) ?? 0) + 1);
    return map;
  }, [companyFields]);

  // Conteggio campi di sistema (BUILTIN) per object_type, via label.
  const systemCountByObject = useMemo(() => {
    const byLabel = new Map<string, number>();
    for (const bf of BUILTIN_FIELDS) byLabel.set(bf.object, (byLabel.get(bf.object) ?? 0) + 1);
    const map = new Map<string, number>();
    for (const g of OBJECTS) map.set(g.value, byLabel.get(objectLabel(g.value)) ?? 0);
    return map;
  }, []);

  // KPI di copertura.
  const renderedCount = OBJECTS.filter((g) => isObjectRendered(g.value)).length;
  const apiOnlyCount = OBJECTS.length - renderedCount;
  const companiesUsing = useMemo(
    () => new Set(companyFields.map((f) => f.company_id)).size,
    [companyFields],
  );

  // Oggetti senza alcun campo di sistema seeded (gap "da inserire").
  const objectsWithoutSystemFields = useMemo(
    () => OBJECTS.filter((g) => (systemCountByObject.get(g.value) ?? 0) === 0),
    [systemCountByObject],
  );

  const coverageRows = useMemo(() => {
    return OBJECTS.map((g) => ({
      value: g.value,
      label: g.label,
      rendered: isObjectRendered(g.value),
      systemCount: systemCountByObject.get(g.value) ?? 0,
      companyCount: countByObject.get(g.value) ?? 0,
    })).sort((a, b) => {
      // Prima i "solo API" con campi creati (gap operativi reali), poi gli altri.
      const aGap = !a.rendered && a.companyCount > 0 ? 1 : 0;
      const bGap = !b.rendered && b.companyCount > 0 ? 1 : 0;
      if (aGap !== bGap) return bGap - aGap;
      if (a.rendered !== b.rendered) return a.rendered ? 1 : -1;
      return b.companyCount - a.companyCount;
    });
  }, [systemCountByObject, countByObject]);

  const filteredCompanyFields = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companyFields.filter((f) => {
      if (objectFilter !== "all" && f.object_type !== objectFilter) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        (f.companies?.name ?? "").toLowerCase().includes(q) ||
        objectLabel(f.object_type).toLowerCase().includes(q)
      );
    });
  }, [companyFields, search, objectFilter]);

  const filteredSystemFields = useMemo(() => {
    const q = systemSearch.trim().toLowerCase();
    return BUILTIN_FIELDS.filter((bf) => {
      if (systemObject !== "all" && bf.object !== objectLabel(systemObject)) return false;
      if (!q) return true;
      return (
        bf.name.toLowerCase().includes(q) ||
        bf.object.toLowerCase().includes(q) ||
        bf.uniqueKey.toLowerCase().includes(q)
      );
    });
  }, [systemSearch, systemObject]);

  return (
    <div className="space-y-4">
      {/* ── KPI ─────────────────────────────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Campi creati dalle aziende</p>
            <Variable className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-semibold">{companyFields.length}</p>
          <p className="text-xs text-muted-foreground">{companiesUsing} aziende con campi custom</p>
        </div>
        <div className="rounded-md border p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Oggetti totali</p>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-semibold">{OBJECTS.length}</p>
          <p className="text-xs text-muted-foreground">{BUILTIN_FIELDS.length} campi di sistema</p>
        </div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between">
            <p className="text-xs text-emerald-700 dark:text-emerald-300">Oggetti resi in UI</p>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-semibold text-emerald-800 dark:text-emerald-200">{renderedCount}</p>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">Campi visibili nei form</p>
        </div>
        <div className={cn(
          "rounded-md border p-4",
          apiOnlyCount > 0 ? "border-amber-300 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20" : "",
        )}>
          <div className="flex items-center justify-between">
            <p className="text-xs text-amber-700 dark:text-amber-300">Oggetti solo API</p>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-2xl font-semibold text-amber-800 dark:text-amber-200">{apiOnlyCount}</p>
          <p className="text-xs text-amber-700/80 dark:text-amber-300/80">Campi salvati ma non resi</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="manage">Gestione campi</TabsTrigger>
          <TabsTrigger value="coverage">Copertura oggetti</TabsTrigger>
          <TabsTrigger value="company">Campi aziende ({companyFields.length})</TabsTrigger>
          <TabsTrigger value="system">Dizionario sistema ({BUILTIN_FIELDS.length})</TabsTrigger>
        </TabsList>

        {/* ── Gestione campi (CRUD esclusivo superadmin) ────────────── */}
        <TabsContent value="manage" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Crea e gestisci i campi personalizzati <strong>esclusivi dell'area superadmin</strong>:
            variabili email per piattaforma, azienda cliente, piano/abbonamento, billing,
            partner/referral, vendite e supporto. I campi a livello contatto sono già risolti nelle
            campagne CRM cross-azienda; le variabili di piattaforma, azienda e referral sono catalogate
            qui e vengono collegate alla risoluzione a invio progressivamente per namespace.
          </p>
          <PlatformCustomFieldsPanel />
        </TabsContent>

        {/* ── Copertura ─────────────────────────────────────────────── */}
        <TabsContent value="coverage" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Ogni oggetto può ospitare campi personalizzati. Gli oggetti <strong>solo API</strong> salvano
            i valori in database ma non hanno ancora un renderer nei form della UI: i campi creati lì
            non sono visibili agli utenti. Questa è la principale lista di gap “da inserire”.
          </p>
          {objectsWithoutSystemFields.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50/60 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
              <strong>Oggetti senza campi di sistema seeded:</strong>{" "}
              {objectsWithoutSystemFields.map((g) => g.label).join(", ")}.
            </div>
          )}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Oggetto</TableHead>
                  <TableHead>Stato render</TableHead>
                  <TableHead className="text-right">Campi sistema</TableHead>
                  <TableHead className="text-right">Campi aziende</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coverageRows.map((row) => (
                  <TableRow key={row.value}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell>
                      {row.rendered ? (
                        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Reso in UI
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          <AlertTriangle className="mr-1 h-3 w-3" /> Solo API
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{row.systemCount}</TableCell>
                    <TableCell className="text-right">
                      {row.companyCount > 0 ? (
                        <span className={cn(
                          "font-semibold",
                          !row.rendered ? "text-amber-700 dark:text-amber-300" : "",
                        )}>
                          {row.companyCount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Campi aziende ─────────────────────────────────────────── */}
        <TabsContent value="company" className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca campo, azienda o oggetto"
                className="pl-8 pr-8"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
                  aria-label="Pulisci ricerca"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select value={objectFilter} onValueChange={setObjectFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli oggetti</SelectItem>
                {OBJECTS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Azienda</TableHead>
                  <TableHead>Campo</TableHead>
                  <TableHead>Oggetto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Variabile</TableHead>
                  <TableHead className="text-right">Creato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fieldsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      Caricamento campi…
                    </TableCell>
                  </TableRow>
                ) : fieldsQuery.isError ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm">
                      <div className="flex flex-col items-center gap-2 text-destructive">
                        <span>Errore caricamento: {formatError(fieldsQuery.error)}</span>
                        <Button variant="outline" size="sm" onClick={() => fieldsQuery.refetch()}>Riprova</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredCompanyFields.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      {companyFields.length === 0
                        ? "Nessuna azienda ha ancora creato campi personalizzati."
                        : "Nessun campo corrisponde ai filtri."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCompanyFields.map((f) => {
                    const rendered = isObjectRendered(f.object_type);
                    return (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            {f.companies?.name ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {f.name}
                          {f.is_required && <span className="ml-1 text-xs text-destructive">*</span>}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5">
                            {objectLabel(f.object_type)}
                            {!rendered && <span className="text-[10px] text-amber-600">(API)</span>}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{f.field_type}</TableCell>
                        <TableCell>
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                            {`{{ ${f.object_type}.${toSnakeCase(f.name)} }}`}
                          </code>
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {formatDateShort(f.created_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Dizionario sistema ────────────────────────────────────── */}
        <TabsContent value="system" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Catalogo completo dei campi di sistema disponibili per ogni oggetto. Sono le variabili
            sempre presenti (non eliminabili) che le aziende ritrovano nei template e nelle automazioni.
          </p>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={systemSearch}
                onChange={(e) => setSystemSearch(e.target.value)}
                placeholder="Cerca campo o variabile (es. contact.email)"
                className="pl-8 pr-8"
              />
              {systemSearch && (
                <button
                  type="button"
                  onClick={() => setSystemSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
                  aria-label="Pulisci ricerca"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select value={systemObject} onValueChange={setSystemObject}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli oggetti</SelectItem>
                {OBJECTS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Campo</TableHead>
                  <TableHead>Oggetto</TableHead>
                  <TableHead>Cartella</TableHead>
                  <TableHead>Variabile</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSystemFields.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      Nessun campo corrisponde ai filtri.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSystemFields.map((bf) => (
                    <TableRow key={bf.id}>
                      <TableCell>
                        <span className="inline-flex items-center gap-2 font-medium">
                          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                          {bf.name}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{bf.object}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={folderBadgeClass(bf.folder)}>
                          {FOLDER_LABELS[bf.folder] ?? bf.folder}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{bf.uniqueKey}</code>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
