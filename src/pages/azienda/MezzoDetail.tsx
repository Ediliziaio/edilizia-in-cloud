/**
 * /azienda/mezzi/:id — scheda del mezzo o dell'attrezzatura: foto, dati e chi
 * lo ha in carico in testa, costo annuo stimato, attrezzi a bordo; poi
 * scadenze, tagliandi o manutenzioni, foto, storico (assegnazioni e letture del
 * QR) e segnalazioni dal campo. Le attrezzature a quantità (ponteggi,
 * transenne) hanno i montaggi sui cantieri. Aperta da una scansione
 * (?da=qr), propone di segnarla in magazzino con un tocco.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Euro, Eye, Gauge, HardHat, Layers, Loader2, Package, Pencil, QrCode, ScanLine, Trash2, User, Warehouse, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import {
  useAzioneAttrezzo, useCopertineMezzi, useEliminaMezzo, useMezzi, useMezziCategorie, useMezziDisponibilita,
  useMezziScadenze, useMezzo, useMezzoDocumenti, useMezzoManutenzioni, useMezzoSegnalazioni, useUltimeViste,
} from "@/hooks/useMezzi";
import { MezzoFormDialog } from "@/components/mezzi/MezzoFormDialog";
import { MezzoDocumentiSection } from "@/components/mezzi/MezzoDocumentiSection";
import { MezzoManutenzioniSection } from "@/components/mezzi/MezzoManutenzioniSection";
import { MezzoFotoSection } from "@/components/mezzi/MezzoFotoSection";
import { MezzoStoricoSection } from "@/components/mezzi/MezzoStoricoSection";
import { MezzoUsoCantieri } from "@/components/mezzi/MezzoUsoCantieri";
import { MezzoSegnalazioniSection } from "@/components/mezzi/MezzoSegnalazioniSection";
import { MezzoMontaggiSection } from "@/components/mezzi/MezzoMontaggiSection";
import { MezzoScansioniSection } from "@/components/mezzi/MezzoScansioniSection";
import { EtichetteQrDialog } from "@/components/mezzi/EtichetteQrDialog";
import { IconaMezzo } from "@/components/mezzi/IconaMezzo";
import { formatCurrency } from "@/lib/formatters";
import {
  STATO_SCADENZA_BADGE, TIPI_CON_TARGA, classeDi, costoAnnuoMezzo, descriviScadenza, formatContatore, formatData,
  formatQuantita, giornoItaliano, oggiIso, possessoLabel, statoMezzo, tipoMezzoLabel,
} from "@/types/mezzi";

const ORA = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });

export default function MezzoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const daQr = searchParams.get("da") === "qr";
  const companyId = useEffectiveCompanyId();
  const { effectiveCompany, company } = useAuth();
  const perms = usePermissions();
  const puoModificare = (perms.canEditMezzi || perms.isAdmin) && !perms.solaLettura;

  const { data: mezzo, isLoading, error, refetch } = useMezzo(id);
  const { data: tutti = [] } = useMezzi();
  const { data: scadenze = [] } = useMezziScadenze();
  const { data: documenti = [] } = useMezzoDocumenti(id);
  const { data: manutenzioni = [] } = useMezzoManutenzioni(id);
  const { data: segnalazioni = [] } = useMezzoSegnalazioni(id);
  const { data: categorie = [] } = useMezziCategorie();
  const { data: disponibilita } = useMezziDisponibilita();
  const { data: ultimeViste } = useUltimeViste();
  const { data: copertine } = useCopertineMezzi(mezzo?.foto_path ? [mezzo.foto_path] : []);
  const elimina = useEliminaMezzo();
  const azione = useAzioneAttrezzo();

  const [modificaAperta, setModificaAperta] = useState(false);
  const [confermaElimina, setConfermaElimina] = useState(false);
  const [etichetta, setEtichetta] = useState(false);
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
          <Button asChild><Link to="/azienda/manodopera?tab=mezzi">Torna ai mezzi</Link></Button>
        </div>
      </div>
    );
  }

  const classe = mezzo.classe ?? classeDi(mezzo.tipo);
  const attrezzo = classe === "attrezzatura";
  const aQuantita = mezzo.gestione === "quantita";
  const elenco = attrezzo ? "/azienda/manodopera?tab=mezzi&vista=attrezzature" : "/azienda/manodopera?tab=mezzi";
  const categoria = mezzo.categoria_id ? categorie.find((c) => c.id === mezzo.categoria_id)?.nome ?? null : null;
  const disp = disponibilita?.get(mezzo.id);
  const ultimaVista = ultimeViste?.get(mezzo.id);
  const stato = statoMezzo(mezzo.stato);
  const fotoCopertina = mezzo.foto_path ? copertine?.get(mezzo.foto_path) : undefined;
  const sottotitolo = [
    attrezzo ? categoria ?? "Attrezzatura" : tipoMezzoLabel(mezzo.tipo),
    [mezzo.marca, mezzo.modello].filter(Boolean).join(" "),
    mezzo.anno ? String(mezzo.anno) : null,
  ].filter(Boolean).join(" · ");
  const dettagli = [
    possessoLabel(mezzo.possesso),
    mezzo.valore_acquisto != null ? `acquistato a ${formatCurrency(mezzo.valore_acquisto)}${mezzo.data_acquisto ? ` il ${formatData(mezzo.data_acquisto)}` : ""}` : null,
    mezzo.matricola ? `${attrezzo ? "n° di serie" : "telaio/matricola"} ${mezzo.matricola}` : null,
    mezzo.note,
  ].filter(Boolean).join(" · ");
  const dove = mezzo.su_mezzo_nome
    ? `su ${mezzo.su_mezzo_nome}`
    : mezzo.assegnato_commessa ?? mezzo.assegnato_persona ?? "in magazzino";
  const inMagazzino = !mezzo.assegnato_order_id && !mezzo.assegnato_hr_profilo_id && !mezzo.su_mezzo_id;
  const puoSpostare = puoModificare && !aQuantita && !TIPI_CON_TARGA.includes(mezzo.tipo);
  const tabIniziale = aQuantita ? "montaggi" : aperte > 0 ? "segnalazioni" : "scadenze";

  const chiudiBannerQr = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("da");
    setSearchParams(next, { replace: true });
  };

  const cella = "flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2 max-sm:border max-sm:bg-card max-sm:px-2.5 max-sm:py-1.5";

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Mobile no: la freccia indietro è già nella barra in alto. */}
      <Link to={elenco} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground max-sm:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />{attrezzo ? "Attrezzature" : "Mezzi"}
      </Link>

      {daQr && (
        <div className="flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-3 max-sm:flex-wrap max-sm:gap-2">
          <ScanLine className="h-5 w-5 shrink-0 text-orange-600" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-orange-950">
            <span className="font-semibold">Letto dal QR.</span>{" "}
            {aQuantita ? "Segna qui sotto i montaggi e i rientri." : `Risulta ${dove}.`}
          </p>
          {puoSpostare && !inMagazzino && (
            <Button
              size="sm"
              className="shrink-0 gap-1.5 max-sm:flex-1"
              disabled={azione.isPending}
              onClick={() => azione.mutate({ mezzoId: mezzo.id, azione: "magazzino" }, { onSuccess: () => refetch() })}
            >
              {azione.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Warehouse className="h-4 w-4" />}
              È in magazzino
            </Button>
          )}
          {puoSpostare && (
            <Button size="sm" variant="outline" className="shrink-0 bg-white" onClick={() => setModificaAperta(true)}>Sposta…</Button>
          )}
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={chiudiBannerQr} aria-label="Chiudi">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="testata-pagina rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 p-3 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3 max-sm:flex-1 max-sm:basis-0 max-sm:gap-2.5">
            {fotoCopertina ? (
              <img
                src={fotoCopertina}
                alt={`Foto di ${mezzo.nome}`}
                className="h-16 w-20 shrink-0 rounded-xl border object-cover shadow-sm sm:h-20 sm:w-28 max-sm:h-11 max-sm:w-14 max-sm:rounded-lg"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)] sm:h-12 sm:w-12">
                <IconaMezzo tipo={mezzo.tipo} className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">{mezzo.nome}</h1>
                {mezzo.targa && <span className="rounded border bg-white px-1.5 font-mono text-xs text-slate-700">{mezzo.targa}</span>}
                {mezzo.codice && (
                  <span className="rounded border bg-white px-1.5 font-mono text-xs text-slate-500" title="Codice dell'etichetta QR">{mezzo.codice}</span>
                )}
                <Badge variant="outline" className={`text-[11px] ${stato.cls}`}>{stato.label}</Badge>
              </div>
              <p className="mt-0.5 text-sm text-slate-500 max-sm:text-xs">{sottotitolo}</p>
              {mezzo.su_mezzo_id && mezzo.su_mezzo_nome && (
                <p className="mt-1 text-sm">
                  Caricato su{" "}
                  <Link to={`/azienda/mezzi/${mezzo.su_mezzo_id}`} className="font-medium text-orange-700 hover:underline">{mezzo.su_mezzo_nome}</Link>
                </p>
              )}
            </div>
          </div>
          {puoModificare && (
            <div className="flex shrink-0 gap-2 max-sm:gap-1">
              {mezzo.codice && (
                <Button size="sm" variant="outline" className="max-sm:hidden" onClick={() => setEtichetta(true)}>
                  <QrCode className="mr-1 h-4 w-4" />Etichetta
                </Button>
              )}
              <Button size="sm" variant="outline" className="max-sm:h-8 max-sm:w-8 max-sm:p-0" aria-label="Modifica" onClick={() => setModificaAperta(true)}>
                <Pencil className="mr-1 h-4 w-4 max-sm:mr-0" /><span className="max-sm:hidden">Modifica</span>
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive max-sm:h-8 max-sm:w-8 max-sm:p-0" onClick={() => setConfermaElimina(true)} aria-label="Elimina">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Mobile: quattro dati in due colonne, senza icone. */}
        <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4 max-sm:mt-2 max-sm:grid-cols-2 max-sm:gap-1.5 max-sm:text-[13px]">
          {aQuantita ? (
            <>
              <div className={cella}>
                <Layers className="h-4 w-4 shrink-0 text-slate-400 max-sm:hidden" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Totale</dt>
                  <dd className="truncate font-medium">{formatQuantita(mezzo.quantita_totale, mezzo.unita_misura)}</dd>
                </div>
              </div>
              <div className={cella}>
                <HardHat className="h-4 w-4 shrink-0 text-slate-400 max-sm:hidden" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Montati</dt>
                  <dd className="truncate font-medium">
                    {formatQuantita(disp?.in_uso ?? 0, mezzo.unita_misura)}
                    {disp && disp.cantieri > 0 && <span className="font-normal text-muted-foreground"> · {disp.cantieri} {disp.cantieri === 1 ? "cantiere" : "cantieri"}</span>}
                  </dd>
                </div>
              </div>
              <div className={cella}>
                <Warehouse className="h-4 w-4 shrink-0 text-slate-400 max-sm:hidden" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">In magazzino</dt>
                  <dd className="truncate font-medium text-emerald-700">{formatQuantita(disp?.disponibile ?? mezzo.quantita_totale, mezzo.unita_misura)}</dd>
                </div>
              </div>
            </>
          ) : (
            <>
              {(!attrezzo || mezzo.contatore != null) ? (
                <div className={cella}>
                  <Gauge className="h-4 w-4 shrink-0 text-slate-400 max-sm:hidden" aria-hidden="true" />
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{mezzo.contatore_unita === "ore" ? "Ore di lavoro" : "Km"}</dt>
                    <dd className="truncate font-medium">
                      {formatContatore(mezzo.contatore, mezzo.contatore_unita)}
                      {mezzo.contatore_aggiornato_il && (
                        <span className="font-normal text-muted-foreground max-sm:hidden"> · al {formatData(mezzo.contatore_aggiornato_il)}</span>
                      )}
                    </dd>
                  </div>
                </div>
              ) : (
                <div className={cella}>
                  <Eye className="h-4 w-4 shrink-0 text-slate-400 max-sm:hidden" aria-hidden="true" />
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">Visto l'ultima volta</dt>
                    <dd className="truncate font-medium">
                      {ultimaVista ? `${formatData(giornoItaliano(ultimaVista))} alle ${ORA.format(new Date(ultimaVista))}` : <span className="font-normal text-muted-foreground">Mai letto dal QR</span>}
                    </dd>
                  </div>
                </div>
              )}
              <div className={cella}>
                <User className="h-4 w-4 shrink-0 text-slate-400 max-sm:hidden" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">In carico a</dt>
                  <dd className="truncate font-medium">{mezzo.assegnato_persona ?? "Nessuno"}</dd>
                </div>
              </div>
              <div className={`${cella} ${costo && costo.totale > 0 ? "" : "max-sm:col-span-2"}`}>
                <HardHat className="h-4 w-4 shrink-0 text-slate-400 max-sm:hidden" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Cantiere</dt>
                  <dd className="truncate font-medium">
                    {mezzo.assegnato_order_id && mezzo.assegnato_commessa ? (
                      <Link to={`/azienda/ordini/${mezzo.assegnato_order_id}`} className="text-orange-700 hover:underline">
                        {mezzo.assegnato_commessa}
                      </Link>
                    ) : attrezzo && inMagazzino ? "In magazzino" : "Nessuno"}
                  </dd>
                </div>
              </div>
            </>
          )}
          <div className={`${cella} ${costo && costo.totale > 0 ? "" : "max-sm:hidden"}`}>
            <Euro className="h-4 w-4 shrink-0 text-slate-400 max-sm:hidden" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Costa circa, in un anno</dt>
              <dd
                className="truncate font-medium"
                title={costo ? `${attrezzo ? "Assicurazione" : "Assicurazione e bollo"} ${formatCurrency(costo.documenti)} · rate ${formatCurrency(costo.rate)} · manutenzioni ultimi 12 mesi ${formatCurrency(costo.manutenzioni)}` : undefined}
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

        {dettagli && <p className="mt-2 text-xs text-muted-foreground max-sm:hidden">{dettagli}</p>}

        {aBordo.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 max-sm:mt-2 max-sm:gap-1.5">
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground max-sm:text-xs">
              <Package className="h-4 w-4 max-sm:h-3.5 max-sm:w-3.5" aria-hidden="true" />A bordo:
            </span>
            {aBordo.map((a) => (
              <Link key={a.id} to={`/azienda/mezzi/${a.id}`} className="tap-compact rounded-full border bg-white px-2.5 py-0.5 text-sm hover:border-orange-300 max-sm:text-xs">
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

      <Tabs value={tabScelto ?? tabIniziale} onValueChange={setTabScelto}>
        {/* Mobile: tre schede (quel che serve dal furgone o dal cantiere);
            le altre si guardano al computer. */}
        <div className="-mx-1 overflow-x-auto px-1 max-sm:mx-0 max-sm:px-0">
          <TabsList className="inline-flex w-max max-sm:grid max-sm:w-full max-sm:grid-cols-3">
            {aQuantita && <TabsTrigger value="montaggi">Montaggi</TabsTrigger>}
            <TabsTrigger value="scadenze" className={aQuantita ? "max-sm:hidden" : undefined}>{attrezzo ? "Documenti" : "Scadenze"}</TabsTrigger>
            <TabsTrigger value="manutenzioni" className="max-sm:hidden">{attrezzo ? "Manutenzioni" : "Tagliandi"}</TabsTrigger>
            <TabsTrigger value="foto">Foto</TabsTrigger>
            {!aQuantita && <TabsTrigger value="uso" className="max-sm:hidden">{attrezzo ? "Cantieri" : "Cantieri e km"}</TabsTrigger>}
            <TabsTrigger value="storico" className="max-sm:hidden">Storico</TabsTrigger>
            <TabsTrigger value="segnalazioni" className="gap-1.5">
              Segnalazioni
              {aperte > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">{aperte}</span>}
            </TabsTrigger>
          </TabsList>
        </div>
        {aQuantita && (
          <TabsContent value="montaggi" className="mt-3">
            <MezzoMontaggiSection
              mezzoId={mezzo.id}
              companyId={companyId}
              unita={mezzo.unita_misura ?? null}
              totale={Number(mezzo.quantita_totale ?? 0)}
              puoModificare={puoModificare}
            />
          </TabsContent>
        )}
        <TabsContent value="scadenze" className="mt-3">
          <MezzoDocumentiSection mezzoId={mezzo.id} companyId={companyId} puoModificare={puoModificare} targa={mezzo.targa} classe={classe} />
        </TabsContent>
        <TabsContent value="manutenzioni" className="mt-3">
          <MezzoManutenzioniSection
            mezzoId={mezzo.id}
            companyId={companyId}
            contatoreAttuale={mezzo.contatore}
            unita={mezzo.contatore_unita}
            puoModificare={puoModificare}
            classe={classe}
          />
        </TabsContent>
        <TabsContent value="foto" className="mt-3">
          <MezzoFotoSection mezzoId={mezzo.id} copertina={mezzo.foto_path} puoModificare={puoModificare} />
        </TabsContent>
        {!aQuantita && (
          <TabsContent value="uso" className="mt-3">
            <MezzoUsoCantieri mezzoId={mezzo.id} tipo={mezzo.tipo} />
          </TabsContent>
        )}
        <TabsContent value="storico" className="mt-3 space-y-5">
          {!aQuantita && <MezzoStoricoSection mezzoId={mezzo.id} puoModificare={puoModificare} />}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Letture del QR</h3>
            <MezzoScansioniSection mezzoId={mezzo.id} unita={mezzo.unita_misura} />
          </section>
        </TabsContent>
        <TabsContent value="segnalazioni" className="mt-3">
          <MezzoSegnalazioniSection mezzoId={mezzo.id} unita={mezzo.contatore_unita} puoModificare={puoModificare} />
        </TabsContent>
      </Tabs>

      <MezzoFormDialog open={modificaAperta} onOpenChange={setModificaAperta} mezzo={mezzo} />
      {mezzo.codice && (
        <EtichetteQrDialog
          open={etichetta}
          onOpenChange={setEtichetta}
          voci={[{ id: mezzo.id, codice: mezzo.codice, nome: mezzo.nome, sotto: mezzo.targa ?? categoria }]}
          preselezionati={[mezzo.id]}
          classe={classe}
          companyId={companyId}
          azienda={(effectiveCompany ?? company)?.name ?? ""}
        />
      )}

      <AlertDialog open={confermaElimina} onOpenChange={setConfermaElimina}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare «{mezzo.nome}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Sparisce dall'elenco e non manda più avvisi. Documenti, interventi e storico restano archiviati.
              {mezzo.codice ? ` Il codice ${mezzo.codice} non verrà riusato.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => elimina.mutate(mezzo.id, { onSuccess: () => navigate(elenco) })}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
