import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useHrSedi,
  useHrSedePeople,
  useCreateHrSede,
  useUpdateHrSede,
  useDeleteHrSede,
  useImportaSediAziendali,
  type HrSedePersona,
} from "@/hooks/useHrSedi";
import { usePermissions } from "@/hooks/usePermissions";
import type { HrSede } from "@/types/hr";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MapPin,
  Navigation,
  CircleDot,
  Users,
  Search,
  MoreHorizontal,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import {
  hasValidGps,
  validateSedeGps,
  parseGpsCoordinate,
} from "@/lib/personale/organizzazione";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
const HrSedeMap = lazy(() => import("@/components/hr/HrSedeMap"));

function GpsPreview({
  lat,
  lng,
  radius,
}: {
  lat: string;
  lng: string;
  radius: string;
}) {
  const [showMap, setShowMap] = useState(false);
  if (!lat.trim() || !lng.trim() || validateSedeGps(lat, lng, radius))
    return (
      <p className="text-xs text-orange-700">
        Area timbratura da configurare: servono entrambe le coordinate e un
        raggio valido.
      </p>
    );
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-dashed border-blue-400 bg-blue-100/60">
          <span className="h-2 w-2 rounded-full bg-orange-500" />
        </div>
        <div>
          <p className="text-sm font-medium text-blue-900">
            Raggio {Math.round(Number(radius))} m dal punto GPS
          </p>
          <p className="text-xs text-blue-700">
            {parseGpsCoordinate(lat).toFixed(6)},{" "}
            {parseGpsCoordinate(lng).toFixed(6)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Schema indicativo, non cartografico
          </p>
        </div>
      </div>
      {showMap ? (
        <Suspense
          fallback={
            <p className="py-6 text-center text-sm">Caricamento mappa…</p>
          }
        >
          <HrSedeMap
            lat={parseGpsCoordinate(lat)}
            lng={parseGpsCoordinate(lng)}
            radius={Number(radius)}
          />
        </Suspense>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowMap(true)}>
          <MapPin className="mr-1.5 h-4 w-4" />
          Mostra mappa e raggio
        </Button>
      )}
      <p className="text-[11px] text-muted-foreground">
        La mappa usa OpenStreetMap e carica l’area geografica da servizi esterni
        solo quando la apri.
      </p>
    </div>
  );
}

export function TabSedi() {
  const companyId = useEffectiveCompanyId();
  return <SediContent key={companyId || "no-company"} />;
}

function SediContent() {
  const sites = useHrSedi();
  const people = useHrSedePeople();
  const sedi = sites.data || [];
  const permissions = usePermissions();
  const canEdit =
    !permissions.isLoading &&
    !permissions.solaLettura &&
    (permissions.isAdmin || permissions.canViewPersone);
  const importaMut = useImportaSediAziendali();
  const deleteMut = useDeleteHrSede();
  const [params, setParams] = useSearchParams();
  const [editSede, setEditSede] = useState<HrSede | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const shown = sedi.filter(
    (s) =>
      (!search.trim() ||
        [s.nome, s.indirizzo, s.citta, s.provincia]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("it")
          .includes(search.trim().toLocaleLowerCase("it"))) &&
      (filter === "all" ||
        (filter === "active" && s.attiva) ||
        (filter === "inactive" && !s.attiva) ||
        (filter === "gps" && hasValidGps(s)) ||
        (filter === "missing" && !hasValidGps(s))),
  );
  const selected = sedi.find((s) => s.id === detailsId);
  const assigned = (id: string) =>
    (people.data || []).filter((p) => p.sede_id === id);
  const gotoPeople = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", "organigramma");
    next.set("sede_hr", id);
    setParams(next);
  };
  const reset = () => {
    setSearch("");
    setFilter("all");
  };
  const pending = deleteMut.isPending || importaMut.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Sedi e aree di timbratura
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Indirizzi, persone assegnate e controllo della distanza: tutto nella
            stessa scheda.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!canEdit || pending || sites.isLoading || sites.isError}
            onClick={() => {
              if (canEdit) importaMut.mutate();
            }}
          >
            {importaMut.isPending ? "Importazione…" : "Importa sedi mancanti"}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (canEdit) setShowNew(true);
            }}
            disabled={!canEdit || sites.isError}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Nuova sede
          </Button>
        </div>
      </div>
      {!canEdit && (
        <p className="text-sm text-muted-foreground">
          Consultazione in sola lettura.
        </p>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">
          Come si collega alle Sedi aziendali?
        </summary>
        <p className="mt-2 max-w-3xl leading-relaxed">
          Le sedi HR e le Sedi aziendali nelle Impostazioni sono ancora due
          anagrafiche distinte. L’importazione aggiunge soltanto i nomi
          mancanti: non aggiorna indirizzi o GPS già presenti e non è una
          sincronizzazione automatica.
        </p>
      </details>
      {sites.isError ? (
        <div
          role="alert"
          className="rounded-xl border border-orange-200 bg-orange-50 p-5"
        >
          <h3 className="font-semibold">Sedi non disponibili</h3>
          <p className="my-2 text-sm">
            Non è stato possibile caricare le sedi. I dati non sono stati
            eliminati.
          </p>
          <Button variant="outline" onClick={() => sites.refetch()}>
            Riprova
          </Button>
        </div>
      ) : sites.isLoading ? (
        <p className="py-12 text-center text-muted-foreground">
          Caricamento sedi…
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm">
            <span>
              <strong>{sedi.length}</strong> sedi configurate
            </span>
            <span>
              <strong>{sedi.filter((s) => s.attiva).length}</strong> attive
            </span>
            <span className="text-orange-800">
              <strong>
                {sedi.filter((s) => s.attiva && !hasValidGps(s)).length}
              </strong>{" "}
              attive con GPS da completare
            </span>
          </div>
          <div className="flex flex-wrap gap-2 rounded-xl border bg-white p-3">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Cerca sede"
                placeholder="Cerca sede, città o indirizzo…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              aria-label="Filtra sedi"
              className="h-10 max-w-full rounded-md border bg-white px-3 text-sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">Tutte le sedi</option>
              <option value="active">Attive</option>
              <option value="inactive">Disattivate</option>
              <option value="missing">GPS da completare</option>
              <option value="gps">GPS configurato</option>
            </select>
            {(search || filter !== "all") && (
              <Button variant="ghost" onClick={reset}>
                Azzera filtri
              </Button>
            )}
          </div>
          {people.isError && (
            <p role="alert" className="text-sm text-orange-700">
              Persone assegnate non disponibili.{" "}
              <button onClick={() => people.refetch()} className="underline">
                Riprova caricamento persone
              </button>
            </p>
          )}
          {!sedi.length ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MapPin className="mx-auto mb-3 h-10 w-10 text-blue-500" />
                <h3 className="font-semibold">Nessuna sede configurata</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Importa le sedi mancanti dalle Impostazioni oppure crea una
                  nuova sede.
                </p>
              </CardContent>
            </Card>
          ) : !shown.length ? (
            <div className="rounded-xl border border-dashed p-12 text-center">
              <p>Nessuna sede corrisponde ai filtri.</p>
              <Button variant="outline" className="mt-3" onClick={reset}>
                Mostra tutte le sedi
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {shown.map((sede) => {
                const persons = assigned(sede.id);
                const active = persons.filter((p) => p.attivo).length;
                return (
                  <Card
                    key={sede.id}
                    className="rounded-2xl border-slate-200 shadow-sm"
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                            <MapPin className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <h3 className="break-words font-semibold">
                              {sede.nome}
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {sede.indirizzo || "Indirizzo da completare"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {[sede.cap, sede.citta, sede.provincia]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Azioni sede ${sede.nome}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={!canEdit}
                              onSelect={() => setEditSede(sede)}
                            >
                              Modifica o disattiva
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              disabled={
                                !canEdit ||
                                pending ||
                                people.isLoading ||
                                people.isError ||
                                persons.length > 0
                              }
                              onSelect={() => setDeleteId(sede.id)}
                            >
                              Elimina sede non assegnata
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="my-4 flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className={
                            sede.attiva
                              ? "border-blue-200 bg-blue-50 text-blue-800"
                              : "text-muted-foreground"
                          }
                        >
                          {sede.attiva ? "Sede attiva" : "Disattivata"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            hasValidGps(sede)
                              ? "text-blue-700"
                              : "border-orange-200 bg-orange-50 text-orange-800"
                          }
                        >
                          {hasValidGps(sede)
                            ? "GPS configurato"
                            : "Area timbratura da configurare"}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
                        <p className="flex items-center gap-1.5">
                          <Users className="h-4 w-4" />
                          {people.isLoading
                            ? "Caricamento persone…"
                            : people.isError
                              ? "Persone non disponibili"
                              : `${active} ${active === 1 ? "persona attiva" : "persone attive"}${persons.length > active ? ` · ${persons.length - active} ${persons.length - active === 1 ? "inattiva" : "inattive"}` : ""}`}
                        </p>
                        <p className="flex items-center gap-1">
                          <CircleDot className="h-3.5 w-3.5" />
                          Raggio {sede.raggio_mt} m
                        </p>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDetailsId(sede.id)}
                          aria-label={`Dettagli sede ${sede.nome}`}
                        >
                          Persone e area GPS
                        </Button>
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditSede(sede)}
                            aria-label={`Configura sede ${sede.nome}`}
                          >
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            Configura
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setDetailsId(null);
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{selected?.nome}</SheetTitle>
            <SheetDescription>
              Persone assegnate e area di timbratura
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="mt-6 space-y-6">
              <div>
                <p className="text-sm">
                  {[selected.indirizzo, selected.citta, selected.provincia]
                    .filter(Boolean)
                    .join(", ") || "Indirizzo da completare"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selected.attiva
                    ? "Sede attiva"
                    : "Sede disattivata: controlla le assegnazioni prima di riattivarla."}
                </p>
              </div>
              <GpsPreview
                lat={selected.lat?.toString() || ""}
                lng={selected.lng?.toString() || ""}
                radius={String(selected.raggio_mt)}
              />
              <div>
                <h3 className="mb-3 text-sm font-semibold">
                  Persone assegnate
                </h3>
                {people.isLoading ? (
                  <p className="text-sm">Caricamento persone…</p>
                ) : people.isError ? (
                  <p role="alert" className="text-sm">
                    Elenco non disponibile.
                  </p>
                ) : (
                  <>
                    <PeopleList people={assigned(selected.id)} />
                    <Button
                      className="mt-3"
                      variant="outline"
                      size="sm"
                      onClick={() => gotoPeople(selected.id)}
                    >
                      Vedi persone attive nell’organigramma
                    </Button>
                  </>
                )}
              </div>
              {canEdit && (
                <Button
                  onClick={() => {
                    setEditSede(selected);
                    setDetailsId(null);
                  }}
                >
                  Modifica configurazione
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
      {(showNew || editSede) && (
        <SedeDialog
          sede={editSede}
          onClose={() => {
            setShowNew(false);
            setEditSede(null);
          }}
          canEdit={canEdit}
        />
      )}
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open && !deleteMut.isPending) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa sede?</AlertDialogTitle>
            <AlertDialogDescription>
              L’eliminazione è definitiva. Se devi soltanto sospenderne l’uso,
              scegli Modifica e disattiva la sede. Non si possono eliminare sedi
              assegnate a profili HR.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMut.isError && (
            <p role="alert" className="text-sm text-destructive">
              Eliminazione non riuscita. La sede è ancora presente; verifica le
              assegnazioni e riprova.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>
              Annulla
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!canEdit || deleteMut.isPending}
              onClick={() => {
                if (deleteId && canEdit)
                  deleteMut.mutate(deleteId, {
                    onSuccess: () => setDeleteId(null),
                  });
              }}
            >
              {deleteMut.isPending
                ? "Eliminazione…"
                : "Elimina definitivamente"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PeopleList({ people }: { people: HrSedePersona[] }) {
  if (!people.length)
    return (
      <p className="text-sm text-muted-foreground">
        Nessuna persona assegnata a questa sede.
      </p>
    );
  return (
    <ul className="max-h-64 divide-y overflow-y-auto rounded-xl border">
      {people.map((p) => (
        <li key={p.id} className="flex justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {p.nome} {p.cognome}
            </p>
            <p className="text-xs text-muted-foreground">
              {p.mansione || "Ruolo da definire"}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {p.attivo ? "Attivo" : "Inattivo"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SedeDialog({
  sede,
  onClose,
  canEdit,
}: {
  sede: HrSede | null;
  onClose: () => void;
  canEdit: boolean;
}) {
  const createMut = useCreateHrSede();
  const updateMut = useUpdateHrSede();
  const [nome, setNome] = useState(sede?.nome || "");
  const [indirizzo, setIndirizzo] = useState(sede?.indirizzo || "");
  const [citta, setCitta] = useState(sede?.citta || "");
  const [provincia, setProvincia] = useState(sede?.provincia || "");
  const [cap, setCap] = useState(sede?.cap || "");
  const [lat, setLat] = useState(sede?.lat?.toString() || "");
  const [lng, setLng] = useState(sede?.lng?.toString() || "");
  const [radius, setRadius] = useState(String(sede?.raggio_mt ?? 200));
  const [attiva, setAttiva] = useState(sede?.attiva ?? true);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const pending = createMut.isPending || updateMut.isPending;
  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    extra = {},
  ) => (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => set(e.target.value)}
        {...extra}
      />
    </div>
  );
  function submit() {
    if (!canEdit || pending) return;
    const validation = !nome.trim()
      ? "Il nome è obbligatorio"
      : validateSedeGps(lat, lng, radius);
    if (validation) {
      setError(validation);
      return;
    }
    setError("");
    const payload = {
      nome: nome.trim(),
      indirizzo: indirizzo.trim() || null,
      citta: citta.trim() || null,
      provincia: provincia.trim().toUpperCase() || null,
      cap: cap.trim() || null,
      lat: lat.trim() ? parseGpsCoordinate(lat) : null,
      lng: lng.trim() ? parseGpsCoordinate(lng) : null,
      raggio_mt: Math.round(Number(radius)),
      attiva,
    };
    const options = {
      onSuccess: onClose,
      onError: () =>
        setError(
          "Salvataggio non riuscito. I dati inseriti sono ancora qui; riprova.",
        ),
    };
    if (sede) updateMut.mutate({ id: sede.id, ...payload }, options);
    else createMut.mutate(payload, options);
  }
  function getLocation() {
    if (!canEdit || locating) return;
    if (!navigator.geolocation) {
      toast.error("Geolocalizzazione non supportata");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast.error(
          "Posizione non disponibile. Puoi inserire le coordinate manualmente.",
        );
      },
      { timeout: 10000, maximumAge: 0 },
    );
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{sede ? "Configura sede" : "Nuova sede HR"}</DialogTitle>
          <DialogDescription>
            La sede può esistere senza GPS. Per configurare l’area di timbratura
            servono entrambe le coordinate.
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={!canEdit || pending} className="min-w-0 space-y-4">
          {field("hr-sede-nome", "Nome sede *", nome, setNome, {
            maxLength: 180,
          })}
          {field("hr-sede-indirizzo", "Indirizzo", indirizzo, setIndirizzo)}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {field("hr-sede-citta", "Città", citta, setCitta)}
            {field("hr-sede-provincia", "Provincia", provincia, setProvincia, {
              maxLength: 2,
            })}
            {field("hr-sede-cap", "CAP", cap, setCap, { maxLength: 5 })}
          </div>
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Area di timbratura</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={getLocation}
                disabled={locating}
              >
                <Navigation className="mr-1.5 h-3.5 w-3.5" />
                {locating ? "Acquisizione…" : "Usa la mia posizione"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Usa la tua posizione solo se ti trovi fisicamente nella sede.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {field("hr-sede-lat", "Latitudine", lat, setLat, {
                inputMode: "decimal",
                placeholder: "45.464200",
              })}
              {field("hr-sede-lng", "Longitudine", lng, setLng, {
                inputMode: "decimal",
                placeholder: "9.190000",
              })}
            </div>
            {field(
              "hr-sede-raggio",
              "Raggio consentito (metri)",
              radius,
              setRadius,
              { type: "number", min: 10, max: 5000 },
            )}
            <GpsPreview lat={lat} lng={lng} radius={radius} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
            <div>
              <Label htmlFor="hr-sede-attiva">Sede attiva</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Disattivare non elimina la sede né le assegnazioni esistenti.
              </p>
            </div>
            <Switch
              id="hr-sede-attiva"
              checked={attiva}
              onCheckedChange={setAttiva}
            />
          </div>
        </fieldset>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-orange-50 p-3 text-sm text-orange-800"
          >
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Annulla
          </Button>
          <Button onClick={submit} disabled={!canEdit || pending || locating}>
            {pending
              ? "Salvataggio…"
              : sede
                ? "Salva configurazione"
                : "Crea sede"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
