/**
 * /azienda/mezzi/:id — scheda del mezzo: foto, dati e chi lo ha in carico in
 * testa, costo annuo stimato, attrezzi a bordo; poi scadenze, tagliandi, foto,
 * storico delle assegnazioni e segnalazioni dal campo.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Euro, Gauge, HardHat, Loader2, Package, Pencil, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import {
  useCopertineMezzi, useEliminaMezzo, useMezzi, useMezziScadenze, useMezzo, useMezzoDocumenti,
  useMezzoManutenzioni, useMezzoSegnalazioni,
} from "@/hooks/useMezzi";
import { MezzoFormDialog } from "@/components/mezzi/MezzoFormDialog";
import { MezzoDocumentiSection } from "@/components/mezzi/MezzoDocumentiSection";
import { MezzoManutenzioniSection } from "@/components/mezzi/MezzoManutenzioniSection";
import { MezzoFotoSection } from "@/components/mezzi/MezzoFotoSection";
import { MezzoStoricoSection } from "@/components/mezzi/MezzoStoricoSection";
import { MezzoSegnalazioniSection } from "@/components/mezzi/MezzoSegnalazioniSection";
import { IconaMezzo } from "@/components/mezzi/IconaMezzo";
import { formatCurrency } from "@/lib/formatters";
import {
  STATO_SCADENZA_BADGE, costoAnnuoMezzo, descriviScadenza, formatContatore, formatData, oggiIso,
  possessoLabel, statoMezzo, tipoMezzoLabel,
} from "@/types/mezzi";

export default function MezzoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const companyId = useEffectiveCompanyId();
  const perms = usePermissions();
  const puoModificare = (perms.canEditMezzi || perms.isAdmin) && !perms.solaLettura;

  const { data: mezzo, isLoading, error, refetch } = useMezzo(id);
  const { data: tutti = [] } = useMezzi();
  const { data: scadenze = [] } = useMezziScadenze();
  const { data: documenti = [] } = useMezzoDocumenti(id);
  const { data: manutenzioni = [] } = useMezzoManutenzioni(id);
  const { data: segnalazioni = [] } = useMezzoSegnalazioni(id);
  const { data: copertine } = useCopertineMezzi(mezzo?.foto_path ? [mezzo.foto_path] : []);
  const elimina = useEliminaMezzo();

  const [modificaAperta, setModificaAperta] = useState(false);
  const [confermaElimina, setConfermaElimina] = useState(false);
  // Finché non si sceglie un tab, si apre sulle segnalazioni se ce n'è una da
  // vedere (ci si arriva dalla campanella), anche se arrivano dopo la scheda.
  const [tabScelto, setTabScelto] = useState<string | null>(null);

  const allarmi = useMemo(
    () =>
      scadenze
        .filter((s) => s.mezzo_id === id && (s.stato === "scaduto" || s.stato === "in_scadenza"))
        .sort((a, b) => (a.stato === b.stato ? 0 : a.stato === "scaduto" ? -1 : 1)),
    [scadenze, id],
  );
  const aBordo = useMemo(() => tutti.filter((m) => m.su_mezzo_id === id), [tutti, id]);
  const aperte = segnalazioni.filter((s) => s.tipo !== "km" && s.stato !== "chiusa").length;
  const costo = useMemo(
    () => (mezzo ? costoAnnuoMezzo(mezzo, documenti, manutenzioni, oggiIso()) : null),
    [mezzo, documenti, manutenzioni],
  );

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (error || !mezzo || !companyId) {
    return (
      <div className="mx-auto max-w-md space-y-3 rounded-2xl border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {error ? "Non riesco a caricare il mezzo." : "Questo mezzo non c'è più, o non è della tua azienda."}
        </p>
        <div className="flex justify-center gap-2">
          {error && <Button variant="outline" onClick={() => refetch()}>Riprova</Button>}
          <Button asChild><Link to="/azienda/mezzi">Torna ai mezzi</Link></Button>
        </div>
      </div>
    );
  }

  const stato = statoMezzo(mezzo.stato);
  const fotoCopertina = mezzo.foto_path ? copertine?.get(mezzo.foto_path) : undefined;
  const sottotitolo = [tipoMezzoLabel(mezzo.tipo), [mezzo.marca, mezzo.modello].filter(Boolean).join(" "), mezzo.anno ? String(mezzo.anno) : null]
    .filter(Boolean).join(" · ");
  const dettagli = [
    possessoLabel(mezzo.possesso),
    mezzo.valore_acquisto != null ? `acquistato a ${formatCurrency(mezzo.valore_acquisto)}${mezzo.data_acquisto ? ` il ${formatData(mezzo.data_acquisto)}` : ""}` : null,
    mezzo.matricola ? `telaio/matricola ${mezzo.matricola}` : null,
    mezzo.note,
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-3 sm:space-y-4">
      <Link to="/azienda/mezzi" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Mezzi e attrezzature
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 p-3 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {fotoCopertina ? (
              <img
                src={fotoCopertina}
                alt={`Foto di ${mezzo.nome}`}
                className="h-16 w-20 shrink-0 rounded-xl border object-cover shadow-sm sm:h-20 sm:w-28"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)] sm:h-12 sm:w-12">
                <IconaMezzo tipo={mezzo.tipo} className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">{mezzo.nome}</h1>
                {mezzo.targa && <span className="rounded border bg-white px-1.5 font-mono text-xs text-slate-700">{mezzo.targa}</span>}
                <Badge variant="outline" className={`text-[11px] ${stato.cls}`}>{stato.label}</Badge>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">{sottotitolo}</p>
              {mezzo.su_mezzo_id && mezzo.su_mezzo_nome && (
                <p className="mt-1 text-sm">
                  Caricato su{" "}
                  <Link to={`/azienda/mezzi/${mezzo.su_mezzo_id}`} className="font-medium text-orange-700 hover:underline">{mezzo.su_mezzo_nome}</Link>
                </p>
              )}
            </div>
          </div>
          {puoModificare && (
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" onClick={() => setModificaAperta(true)}>
                <Pencil className="mr-1 h-4 w-4" />Modifica
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfermaElimina(true)} aria-label="Elimina mezzo">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2">
            <Gauge className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{mezzo.contatore_unita === "ore" ? "Ore di lavoro" : "Km"}</dt>
              <dd className="truncate font-medium">
                {formatContatore(mezzo.contatore, mezzo.contatore_unita)}
                {mezzo.contatore_aggiornato_il && (
                  <span className="font-normal text-muted-foreground"> · al {formatData(mezzo.contatore_aggiornato_il)}</span>
                )}
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2">
            <User className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">In carico a</dt>
              <dd className="truncate font-medium">{mezzo.assegnato_persona ?? "Nessuno"}</dd>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2">
            <HardHat className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Cantiere</dt>
              <dd className="truncate font-medium">
                {mezzo.assegnato_order_id && mezzo.assegnato_commessa ? (
                  <Link to={`/azienda/ordini/${mezzo.assegnato_order_id}`} className="text-orange-700 hover:underline">
                    {mezzo.assegnato_commessa}
                  </Link>
                ) : "Nessuno"}
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2">
            <Euro className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Costa circa, in un anno</dt>
              <dd
                className="truncate font-medium"
                title={costo ? `Assicurazione e bollo ${formatCurrency(costo.documenti)} · rate ${formatCurrency(costo.rate)} · manutenzioni ultimi 12 mesi ${formatCurrency(costo.manutenzioni)}` : undefined}
              >
                {costo && costo.totale > 0 ? (
                  <>
                    {formatCurrency(costo.totale)}
                    <span className="font-normal text-muted-foreground"> · {formatCurrency(costo.alGiorno)} al giorno</span>
                  </>
                ) : (
                  <span className="font-normal text-muted-foreground">Segna importi e rate</span>
                )}
              </dd>
            </div>
          </div>
        </dl>

        {dettagli && <p className="mt-2 text-xs text-muted-foreground">{dettagli}</p>}

        {aBordo.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Package className="h-4 w-4" aria-hidden="true" />A bordo:
            </span>
            {aBordo.map((a) => (
              <Link key={a.id} to={`/azienda/mezzi/${a.id}`} className="rounded-full border bg-white px-2.5 py-0.5 text-sm hover:border-orange-300">
                {a.nome}
              </Link>
            ))}
          </div>
        )}

        {allarmi.length > 0 && (
          <ul className="mt-3 space-y-1">
            {allarmi.map((s) => (
              <li key={`${s.origine}-${s.riferimento_id}`} className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className={`shrink-0 text-[11px] ${STATO_SCADENZA_BADGE[s.stato].cls}`}>
                  {STATO_SCADENZA_BADGE[s.stato].label}
                </Badge>
                <span className="truncate">{descriviScadenza(s)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Tabs value={tabScelto ?? (aperte > 0 ? "segnalazioni" : "scadenze")} onValueChange={setTabScelto}>
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList className="inline-flex w-max">
            <TabsTrigger value="scadenze">Scadenze</TabsTrigger>
            <TabsTrigger value="manutenzioni">Tagliandi</TabsTrigger>
            <TabsTrigger value="foto">Foto</TabsTrigger>
            <TabsTrigger value="storico">Storico</TabsTrigger>
            <TabsTrigger value="segnalazioni" className="gap-1.5">
              Segnalazioni
              {aperte > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">{aperte}</span>}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="scadenze" className="mt-3">
          <MezzoDocumentiSection mezzoId={mezzo.id} companyId={companyId} puoModificare={puoModificare} targa={mezzo.targa} />
        </TabsContent>
        <TabsContent value="manutenzioni" className="mt-3">
          <MezzoManutenzioniSection
            mezzoId={mezzo.id}
            companyId={companyId}
            contatoreAttuale={mezzo.contatore}
            unita={mezzo.contatore_unita}
            puoModificare={puoModificare}
          />
        </TabsContent>
        <TabsContent value="foto" className="mt-3">
          <MezzoFotoSection mezzoId={mezzo.id} copertina={mezzo.foto_path} puoModificare={puoModificare} />
        </TabsContent>
        <TabsContent value="storico" className="mt-3">
          <MezzoStoricoSection mezzoId={mezzo.id} puoModificare={puoModificare} />
        </TabsContent>
        <TabsContent value="segnalazioni" className="mt-3">
          <MezzoSegnalazioniSection mezzoId={mezzo.id} unita={mezzo.contatore_unita} puoModificare={puoModificare} />
        </TabsContent>
      </Tabs>

      <MezzoFormDialog open={modificaAperta} onOpenChange={setModificaAperta} mezzo={mezzo} />

      <AlertDialog open={confermaElimina} onOpenChange={setConfermaElimina}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare «{mezzo.nome}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Sparisce dall'elenco e non manda più avvisi. Documenti, interventi e storico restano archiviati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => elimina.mutate(mezzo.id, { onSuccess: () => navigate("/azienda/mezzi") })}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
