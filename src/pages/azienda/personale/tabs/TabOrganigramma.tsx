import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useOrganigramma, useSyncFromEmployees } from "@/hooks/useOrganigramma";
import { useHrSedi } from "@/hooks/useHrSedi";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Search,
  RefreshCw,
  Users,
  UserPlus,
  List,
  Network,
  MapPin,
} from "lucide-react";
import type { HrProfilo } from "@/types/hr";
import { HrProfiloSheet } from "@/components/hr/HrProfiloSheet";
import { OrgTreeView } from "@/components/hr/OrgTreeView";
import { OrgNode } from "@/components/hr/OrgNode";
import {
  filterOrgTree,
  orgLinksToReview,
} from "@/lib/personale/organizzazione";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export function TabOrganigramma() {
  const companyId = useEffectiveCompanyId();
  return <OrganigrammaContent key={companyId || "no-company"} />;
}

function OrganigrammaContent() {
  const { data, isLoading, isError, refetch } = useOrganigramma();
  const sites = useHrSedi();
  const permissions = usePermissions();
  const canEdit =
    !permissions.isLoading &&
    !permissions.solaLettura &&
    (permissions.isAdmin || permissions.canViewPersone);
  const syncMutation = useSyncFromEmployees();
  const [params, setParams] = useSearchParams();
  const siteFilter = params.get("sede_hr") || "__all__";
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("__all__");
  const [editing, setEditing] = useState<HrProfilo | null>(null);
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"tree" | "list">("tree");
  const profili = useMemo(() => data?.profili || [], [data?.profili]);
  const siteNames = useMemo(
    () => new Map((sites.data || []).map((s) => [s.id, s.nome])),
    [sites.data],
  );
  const matches = useMemo(
    () => (p: HrProfilo) =>
      (!search.trim() ||
        `${p.nome} ${p.cognome} ${p.mansione || ""} ${p.email || ""}`
          .toLocaleLowerCase("it")
          .includes(search.trim().toLocaleLowerCase("it"))) &&
      (department === "__all__" || p.reparto === department) &&
      (siteFilter === "__all__" ||
        (siteFilter === "__none__" ? !p.sede_id : p.sede_id === siteFilter)),
    [search, department, siteFilter],
  );
  const filtered = useMemo(() => profili.filter(matches), [profili, matches]);
  const forest = useMemo(
    () => filterOrgTree(data?.tree || [], matches),
    [data?.tree, matches],
  );
  // Classify by the ORIGINAL tree: filters must not turn managers into unlinked people.
  const structuredIds = useMemo(
    () =>
      new Set(
        (data?.tree || []).filter((n) => n.children.length).map((n) => n.id),
      ),
    [data?.tree],
  );
  const connected = useMemo(
    () => forest.filter((n) => structuredIds.has(n.id)),
    [forest, structuredIds],
  );
  const independent = forest.filter((n) => !structuredIds.has(n.id));
  const roots = (data?.tree || []).filter((n) => n.children.length);
  const selectSite = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === "__all__") next.delete("sede_hr");
    else next.set("sede_hr", value);
    setParams(next, { replace: true });
  };
  const openProfile = (p: HrProfilo) => {
    setEditing(p);
    setOpen(true);
  };
  const newProfile = () => {
    if (!canEdit) return;
    setEditing(null);
    setOpen(true);
  };
  const reset = () => {
    setSearch("");
    setDepartment("__all__");
    selectSite("__all__");
  };
  const gotoSites = () => {
    const next = new URLSearchParams(params);
    next.set("tab", "sedi");
    setParams(next);
  };
  const profilesById = new Map(profili.map((p) => [p.id, p]));
  const linksToReview = orgLinksToReview(profili, data?.tree || []);

  if (isLoading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-[440px] w-full rounded-2xl" />
      </div>
    );
  if (isError)
    return (
      <div
        role="alert"
        className="rounded-xl border border-orange-200 bg-orange-50 p-5"
      >
        <h2 className="font-semibold">Organigramma non disponibile</h2>
        <p className="my-2 text-sm">
          Non è stato possibile caricare i profili. Non significa che l’azienda
          sia vuota.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Riprova
        </Button>
      </div>
    );

  return (
    <div className="space-y-4">
      {linksToReview.length > 0 && (
        <details className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <summary className="cursor-pointer font-medium">
            {linksToReview.length} collegamenti da verificare
          </summary>
          <p className="my-2 text-xs">
            Responsabile non presente tra gli attivi, riferimento a sé stessi o
            catena circolare. Per non nascondere persone l’albero interrompe
            questi collegamenti solo nella vista; i dati salvati non sono
            modificati.
          </p>
          <ul className="list-inside list-disc text-xs">
            {linksToReview.map((p) => (
              <li key={p.id}>
                {p.nome} {p.cognome}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Persone e responsabilità
          </h2>
          <p className="text-sm text-muted-foreground">
            {profili.length} persone attive · {data?.reparti.length || 0}{" "}
            reparti · {roots.length}{" "}
            {roots.length === 1
              ? "struttura con collaboratori"
              : "strutture con collaboratori"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={gotoSites}>
            <MapPin className="mr-1.5 h-4 w-4" />
            Gestisci sedi
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canEdit || syncMutation.isPending}
            onClick={() => {
              if (canEdit) syncMutation.mutate();
            }}
            title="Aggiunge soltanto i dipendenti che non hanno ancora un profilo HR"
          >
            <RefreshCw
              className={`mr-1.5 h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`}
            />
            {syncMutation.isPending
              ? "Sincronizzazione…"
              : "Importa dipendenti mancanti"}
          </Button>
          <Button size="sm" onClick={newProfile} disabled={!canEdit}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            Nuovo profilo
          </Button>
        </div>
      </div>
      {!canEdit && (
        <p className="text-sm text-muted-foreground">
          Consultazione in sola lettura.
        </p>
      )}
      {profili.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <Users className="mx-auto mb-3 h-10 w-10 text-blue-500" />
            <h3 className="font-semibold">Nessun profilo nell’organigramma</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Importa i dipendenti mancanti oppure crea il primo profilo con il
              pulsante in alto.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Cerca persona nell’organigramma"
                placeholder="Cerca nome, ruolo o email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              aria-label="Filtra reparto"
              className="h-10 max-w-full rounded-md border bg-white px-3 text-sm"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="__all__">Tutti i reparti</option>
              {data?.reparti.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtra sede"
              className="h-10 max-w-full rounded-md border bg-white px-3 text-sm"
              value={siteFilter}
              onChange={(e) => selectSite(e.target.value)}
            >
              <option value="__all__">Tutte le sedi</option>
              <option value="__none__">Sede da assegnare</option>
              {sites.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                  {!s.attiva ? " (inattiva)" : ""}
                </option>
              ))}
              {siteFilter !== "__all__" &&
                siteFilter !== "__none__" &&
                !siteNames.has(siteFilter) && (
                  <option value={siteFilter}>
                    Sede selezionata non disponibile
                  </option>
                )}
            </select>
            <div
              className="flex gap-1 rounded-lg bg-slate-100 p-1"
              role="group"
              aria-label="Vista organigramma"
            >
              <Button
                aria-pressed={viewMode === "tree"}
                size="sm"
                variant={viewMode === "tree" ? "default" : "ghost"}
                onClick={() => setViewMode("tree")}
              >
                <Network className="mr-1.5 h-4 w-4" />
                Albero
              </Button>
              <Button
                aria-pressed={viewMode === "list"}
                size="sm"
                variant={viewMode === "list" ? "default" : "ghost"}
                onClick={() => setViewMode("list")}
              >
                <List className="mr-1.5 h-4 w-4" />
                Lista
              </Button>
            </div>
          </div>
          {sites.isError && (
            <p role="alert" className="text-sm text-orange-700">
              Nomi delle sedi non disponibili.{" "}
              <button className="underline" onClick={() => sites.refetch()}>
                Riprova
              </button>
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p>
              {filtered.length} persone corrispondenti
              {viewMode === "tree"
                ? " · i responsabili restano visibili come contesto"
                : ""}
            </p>
            {(search ||
              department !== "__all__" ||
              siteFilter !== "__all__") && (
              <Button variant="ghost" size="sm" onClick={reset}>
                Azzera filtri
              </Button>
            )}
          </div>
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed p-12 text-center">
              <p>Nessuna persona corrisponde ai filtri.</p>
              <Button className="mt-3" variant="outline" onClick={reset}>
                Mostra tutte le persone
              </Button>
            </div>
          ) : viewMode === "tree" ? (
            <>
              <OrgTreeView
                tree={connected}
                onNodeClick={openProfile}
                siteNames={siteNames}
              />
              {independent.length > 0 && (
                <section
                  aria-label="Profili senza collegamenti"
                  className="rounded-2xl border bg-white p-4"
                >
                  <h3 className="text-sm font-semibold">
                    Profili senza collegamenti · {independent.length}
                  </h3>
                  <p className="mb-4 mt-1 text-xs text-muted-foreground">
                    Non hanno collegamenti visibili nell’albero. Possono essere
                    ruoli autonomi o profili da completare: non sono
                    automaticamente errori.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                    {independent.map((n) => (
                      <div key={n.id} className="h-[116px] min-w-0">
                        <OrgNode
                          node={n}
                          onClick={openProfile}
                          siteName={
                            n.sede_id ? siteNames.get(n.sede_id) : undefined
                          }
                        />
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Persona</TableHead>
                      <TableHead>Ruolo e reparto</TableHead>
                      <TableHead>Responsabile</TableHead>
                      <TableHead>Sede</TableHead>
                      <TableHead className="text-right">Profilo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => {
                      const manager = p.responsabile_id
                        ? profilesById.get(p.responsabile_id)
                        : null;
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            {p.nome} {p.cognome}
                          </TableCell>
                          <TableCell>
                            {p.mansione || "Da definire"}
                            <p className="text-xs text-muted-foreground">
                              {p.reparto || "Reparto da definire"}
                            </p>
                          </TableCell>
                          <TableCell>
                            {manager
                              ? `${manager.nome} ${manager.cognome}`
                              : p.responsabile_id
                                ? "Collegamento da verificare"
                                : "Nessuno assegnato"}
                          </TableCell>
                          <TableCell>
                            {p.sede_id
                              ? siteNames.get(p.sede_id) || "Sede assegnata"
                              : "Da assegnare"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Apri profilo di ${p.nome} ${p.cognome}`}
                              onClick={() => openProfile(p)}
                            >
                              Apri profilo
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
      {canEdit ? (
        <HrProfiloSheet
          open={open}
          onOpenChange={setOpen}
          profilo={editing}
          allProfili={profili}
        />
      ) : (
        <Sheet open={open && !!editing} onOpenChange={setOpen}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>
                {editing?.nome} {editing?.cognome}
              </SheetTitle>
              <SheetDescription>
                Profilo organizzativo · sola lettura
              </SheetDescription>
            </SheetHeader>
            <dl className="mt-6 space-y-4">
              <div>
                <dt className="text-xs text-muted-foreground">Ruolo</dt>
                <dd>{editing?.mansione || "Da definire"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Reparto</dt>
                <dd>{editing?.reparto || "Da definire"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Sede</dt>
                <dd>
                  {editing?.sede_id
                    ? siteNames.get(editing.sede_id) || "Sede assegnata"
                    : "Da assegnare"}
                </dd>
              </div>
            </dl>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
