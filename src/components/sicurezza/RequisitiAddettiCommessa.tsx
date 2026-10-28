import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useProfiliRequisiti } from "@/hooks/useProfiliRequisiti";
import { useMezziPos } from "@/hooks/useMezziPos";
import {
  useAddettiCommessa,
  useStoricoAddetti,
  useRegistraRiesameAddetti,
  useDettaglioRiesameAddetti,
  type ScriviRiesameAddetti,
} from "@/hooks/useRequisitiAddetti";
import {
  criteriSelezionabili,
  preparaRiscontri,
  chiaveRequisito,
  chiavePersona,
  cambiaRiscontro,
  motivoQualifica,
  erroreRiesame,
  type DatiRiesameAddetti,
  type QuadroAddetti,
  type PersonaRequisiti,
  type RegistroRiesameAddetti,
} from "@/lib/sicurezza/requisitiAddetti";
import { chiaveFonteMezzo } from "../../../supabase/functions/_shared/posMezzi";
import { QualificheAddetto } from "./QualificheAddetto";
import { RiesameProprioPos } from "./RiesameProprioPos";
interface Props {
  companyId: string;
  orderId: string;
  dataRiferimento: string;
  faseRiferimento?: string;
  contestoNonDisponibile?: boolean;
  inizialmenteAperto?: boolean;
}
interface Bozza {
  contesto: QuadroAddetti;
  antecedente: RegistroRiesameAddetti | null;
  mezzoPrecedente: string | null;
  richiesta: string;
  precedente: string | null;
  impronta: string;
  dal: string;
  al: string;
  fase: string | null;
  dati: DatiRiesameAddetti;
}
export function RequisitiAddettiCommessa({
  companyId,
  orderId,
  dataRiferimento,
  faseRiferimento = "",
  contestoNonDisponibile = false,
  inizialmenteAperto = false,
}: Props) {
  const p = usePermissions();
  const [ricercaRiscontri, setRicercaRiscontri] = useState("");
  const [esitoFiltro, setEsitoFiltro] = useState("tutti");
  const [invioDaRitentare, setInvioDaRitentare] =
    useState<ScriviRiesameAddetti | null>(null);
  const [dettaglio, setDettaglio] = useState<string | null>(null);
  const [riesamePos, setRiesamePos] = useState<string | null>(null);
  const [aperto, setAperto] = useState(inizialmenteAperto),
    [fine, setFine] = useState({ dal: dataRiferimento, al: dataRiferimento }),
    [revisioni, setRevisioni] = useState(false),
    [selezione, setSelezione] = useState<string[]>([]),
    [bozza, setBozza] = useState<Bozza | null>(null),
    [personaAperta, setPersonaAperta] = useState<PersonaRequisiti | null>(null);
  const al = fine.dal === dataRiferimento ? fine.al : dataRiferimento,
    fase = faseRiferimento || null;
  const q = useAddettiCommessa(
      companyId,
      orderId,
      dataRiferimento,
      al,
      fase,
      aperto && !contestoNonDisponibile,
    ),
    storico = useStoricoAddetti(
      companyId,
      orderId,
      dataRiferimento,
      al,
      fase,
      revisioni,
      aperto && !contestoNonDisponibile,
    ),
    profili = useProfiliRequisiti(companyId),
    mezzi = useMezziPos(companyId, orderId, aperto && !contestoNonDisponibile),
    salva = useRegistraRiesameAddetti(companyId, orderId);
  const opzioni = criteriSelezionabili(profili.data || []),
    scrive = p.canViewSicurezzaCantiere && !p.solaLettura;
  const quadro = p.canViewSicurezzaCantiere ? q.data : undefined;
  const fontiNonDisponibili =
    contestoNonDisponibile ||
    q.isError ||
    q.isLoading ||
    q.isFetching ||
    profili.isError ||
    profili.isLoading ||
    profili.isFetching ||
    mezzi.isError ||
    mezzi.isLoading ||
    mezzi.isFetching;
  const coerente =
    !!bozza &&
    !!quadro &&
    bozza.impronta === quadro.impronta &&
    bozza.dal === dataRiferimento &&
    bozza.al === al &&
    bozza.fase === fase;
  const attrezzaturaCambiata =
    !!bozza?.dati.attrezzatura &&
    !mezzi.data?.fonti.some(
      (f) =>
        chiaveFonteMezzo(f) === chiaveFonteMezzo(bozza.dati.attrezzatura!) &&
        f.impronta === bozza.dati.attrezzatura!.impronta,
    );
  const requisitiDisponibili =
    !bozza ||
    bozza.dati.requisiti.every((r) =>
      opzioni.some((o) => chiaveRequisito(o.selezione) === chiaveRequisito(r)),
    );
  const resetConferme = (d: DatiRiesameAddetti) => ({
    ...d,
    righe: d.righe.map((r) => ({ ...r, confermata: false })),
  });
  const cambiaHeader = <
    K extends keyof Omit<DatiRiesameAddetti, "righe" | "requisiti">,
  >(
    k: K,
    v: DatiRiesameAddetti[K],
  ) =>
    setBozza((b) =>
      b
        ? {
            ...b,
            dati:
              k === "requisiti_definiti"
                ? { ...b.dati, [k]: v }
                : resetConferme({ ...b.dati, [k]: v }),
          }
        : b,
    );
  const prepara = (precedente: RegistroRiesameAddetti | null = null) => {
    if (!quadro || !scrive || fontiNonDisponibili) return;
    try {
      const antecedente = precedente || bozza?.antecedente || null;
      if (antecedente && antecedente.fase_id !== fase)
        throw new Error(
          "Per una fase diversa scarta la preparazione e crea un riesame distinto",
        );
      const requisiti = precedente
        ? precedente.dati.requisiti
        : opzioni
            .filter((o) => selezione.includes(chiaveRequisito(o.selezione)))
            .map((o) => o.selezione);
      if (
        !precedente &&
        requisiti.some(
          (r) =>
            !opzioni.some(
              (o) => chiaveRequisito(o.selezione) === chiaveRequisito(r),
            ),
        )
      )
        throw new Error(
          "Una versione del profilo non è disponibile: riesamina la selezione",
        );
      const famiglie = new Map<string, string>();
      for (const r of requisiti) {
        const o = opzioni.find(
          (o) => chiaveRequisito(o.selezione) === chiaveRequisito(r),
        );
        if (!o) continue;
        const vecchio = famiglie.get(o.profilo.famiglia_id);
        if (vecchio && vecchio !== o.profilo.id)
          throw new Error(
            "Scegli una sola versione di ogni famiglia di profili",
          );
        famiglie.set(o.profilo.famiglia_id, o.profilo.id);
      }
      const righe = preparaRiscontri(quadro, requisiti);
      if (precedente)
        setSelezione(
          requisiti
            .filter((r) =>
              opzioni.some(
                (o) => chiaveRequisito(o.selezione) === chiaveRequisito(r),
              ),
            )
            .map(chiaveRequisito),
        );
      setBozza({
        contesto: quadro,
        antecedente,
        mezzoPrecedente: antecedente?.dati.attrezzatura?.mezzo_id || null,
        richiesta: crypto.randomUUID(),
        precedente: antecedente?.id || null,
        impronta: quadro.impronta,
        dal: dataRiferimento,
        al,
        fase,
        dati: {
          attivita: antecedente?.dati.attivita || "",
          responsabile: "",
          ruolo_responsabile: "",
          requisiti,
          righe,
          requisiti_definiti: false,
          conferma_assegnazioni: false,
          attrezzatura: antecedente?.dati.attrezzatura || null,
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Controlla il contesto");
    }
  };
  const registra = async () => {
    if (
      !bozza ||
      !quadro ||
      !coerente ||
      !scrive ||
      fontiNonDisponibili ||
      attrezzaturaCambiata ||
      !requisitiDisponibili
    )
      return;
    try {
      const d = {
        ...bozza.dati,
        attivita: bozza.dati.attivita.trim(),
        responsabile: bozza.dati.responsabile.trim(),
        ruolo_responsabile: bozza.dati.ruolo_responsabile.trim(),
        righe: bozza.dati.righe.map((r) => ({
          ...r,
          motivazione: r.motivazione.trim(),
        })),
      };
      const errore = erroreRiesame(quadro, d);
      if (errore) throw new Error(errore);
      const payload: ScriviRiesameAddetti = {
        id: bozza.richiesta,
        precedente: bozza.precedente,
        fase: bozza.fase,
        dal: bozza.dal,
        al: bozza.al,
        impronta: bozza.impronta,
        dati: d,
      };
      setInvioDaRitentare(payload);
      await salva.mutateAsync(payload);
      setInvioDaRitentare(null);
      setBozza(null);
      toast.success(
        "Riscontri registrati nello storico. Nessuna approvazione del POS eseguita.",
      );
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Registrazione non confermata: rileggi e ritenta con la stessa richiesta",
      );
    }
  };
  const ritentaUltimo = async () => {
    if (!invioDaRitentare || !scrive || salva.isPending) return;
    const payload = invioDaRitentare;
    try {
      await salva.mutateAsync(payload);
      setInvioDaRitentare(null);
      setBozza((b) => (b?.richiesta === payload.id ? null : b));
      toast.success(
        "Ultimo invio confermato: consulta lo storico del periodo indicato.",
      );
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Ultimo invio non confermato: consulta lo storico prima di ricrearlo.",
      );
    }
  };
  if (!p.canViewSicurezzaCantiere) return null;
  const persona = personaAperta;
  return (
    <section className="rounded-xl border bg-card p-4 space-y-4">
      <button
        type="button"
        className="font-semibold text-base w-full text-left"
        aria-expanded={aperto}
        onClick={() => setAperto(!aperto)}
      >
        Requisiti e qualifiche degli addetti {aperto ? "−" : "+"}
      </button>
      {aperto && (
        <>
          <p className="text-sm text-muted-foreground">
            Confronta i requisiti scelti con le qualifiche degli addetti
            assegnati. Nomi e titoli non producono abbinamenti automatici. Il
            riesame riguarda questo contesto e non autorizza l’accesso al
            cantiere.
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label htmlFor={`req-fine-${orderId}`}>
                Periodo dal {dataRiferimento} al
              </Label>
              <Input
                id={`req-fine-${orderId}`}
                type="date"
                min={dataRiferimento}
                value={al}
                onChange={(e) =>
                  setFine({ dal: dataRiferimento, al: e.target.value })
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={revisioni}
                onChange={(e) => setRevisioni(e.target.checked)}
              />
              Mostra revisioni precedenti
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void q.refetch();
                void storico.refetch();
                void profili.refetch();
                void mezzi.refetch();
              }}
            >
              Rileggi fonti
            </Button>
          </div>
          {al < dataRiferimento || !al ? (
            <p role="alert" className="text-sm text-destructive">
              Seleziona una fine periodo non precedente all’inizio.
            </p>
          ) : fontiNonDisponibili ? (
            <p role="alert" className="text-sm">
              Organico, profili o attrezzature non ancora disponibili: attendi o
              rileggi le fonti.
            </p>
          ) : (
            quadro && (
              <>
                <p className="text-sm">
                  {quadro.persone.length} addetti collegati ·{" "}
                  {quadro.qualifiche.length} revisioni correnti delle qualifiche
                  · {quadro.da_collegare.length} collegamenti da sistemare
                </p>
                {quadro.da_collegare.length > 0 && (
                  <div className="rounded border border-amber-300 p-3">
                    <p className="font-medium text-sm">
                      Copertura nominativa parziale
                    </p>
                    <ul className="mt-1 space-y-1 text-xs">
                      {quadro.da_collegare.map((a) => (
                        <li key={a.fonte_id}>
                          {a.nome || a.cognome
                            ? `${a.nome || ""} ${a.cognome || ""}`
                            : a.fonte === "campo"
                              ? "Accesso Campo da collegare"
                              : "Assegnazione da correggere"}{" "}
                          · {a.motivo}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {quadro.persone.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nessun addetto collegato nel periodo e nella fase. Controlla
                    assegnazioni e collegamenti nominativi.
                  </p>
                )}
                <details className="rounded border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Addetti e periodi risultanti dalle assegnazioni
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {quadro.persone.map((a) => (
                      <li key={chiavePersona(a)} className="text-sm">
                        <p>
                          {a.nome} {a.cognome} ·{" "}
                          {a.mansione || "Mansione da definire"}
                          {a.impresa ? ` · ${a.impresa}` : " · Profilo HR"}
                          {!a.attivo ? " · Non attivo attualmente" : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {a.periodi
                            .map(
                              (v) =>
                                `${v.dal}–${v.al}${v.senza_date ? " (periodo dichiarato: fonte senza date)" : ""}`,
                            )
                            .join("; ")}
                        </p>
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => setPersonaAperta(a)}
                        >
                          Consulta qualifiche dell’addetto
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">
                    Le fonti correnti non ricostruiscono la storia dell’impiego.
                    Un’assegnazione senza date richiede conferma del periodo per
                    registrare un riscontro.
                  </p>
                </details>
                {scrive && (
                  <details className="rounded border p-3" open={!bozza}>
                    <summary className="cursor-pointer text-sm font-medium">
                      Scegli i requisiti nominativi dai profili versionati
                    </summary>
                    <div className="space-y-2 mt-2">
                      {opzioni.length === 0 ? (
                        <p className="text-sm">
                          Crea un profilo nel Contesto dei requisiti con criteri
                          nominativi da adattare. Non sono proposti requisiti
                          aziendali o sanitari.
                        </p>
                      ) : (
                        opzioni.map((o) => (
                          <label
                            key={chiaveRequisito(o.selezione)}
                            className="flex gap-2 text-sm items-start"
                          >
                            <input
                              type="checkbox"
                              checked={selezione.includes(
                                chiaveRequisito(o.selezione),
                              )}
                              onChange={(e) =>
                                setSelezione((v) =>
                                  e.target.checked
                                    ? [...v, chiaveRequisito(o.selezione)]
                                    : v.filter(
                                        (x) =>
                                          x !== chiaveRequisito(o.selezione),
                                      ),
                                )
                              }
                            />
                            <span>
                              {o.requisito.titolo}
                              <span className="block text-xs text-muted-foreground">
                                {o.profilo.nome} · v{o.profilo.versione} ·{" "}
                                {o.profilo.ruoli}
                              </span>
                            </span>
                          </label>
                        ))
                      )}
                      <Button
                        size="sm"
                        disabled={!selezione.length || salva.isPending}
                        onClick={() => prepara()}
                      >
                        {bozza
                          ? "Ricostruisci da zero"
                          : "Prepara riscontri nominativi"}
                      </Button>
                    </div>
                  </details>
                )}
              </>
            )
          )}
          {invioDaRitentare && (
            <div
              role="status"
              className="rounded border border-amber-300 p-3 text-sm"
            >
              <p>
                L’ultimo invio non è stato confermato:{" "}
                {invioDaRitentare.dati.attivita}, {invioDaRitentare.dal}–
                {invioDaRitentare.al}. Il ritentativo usa gli stessi dati e lo
                stesso identificatore, senza le modifiche successive.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!scrive || salva.isPending}
                onClick={ritentaUltimo}
              >
                Ritenta l’ultimo invio esatto
              </Button>
            </div>
          )}
          {bozza && (
            <div className="rounded border p-3 space-y-3">
              <p className="font-medium">
                {bozza.precedente
                  ? "Nuovo riesame della registrazione"
                  : "Riesame da registrare"}{" "}
                · {bozza.dati.righe.length} riscontri
              </p>
              {!coerente && (
                <p role="alert" className="text-sm text-amber-900">
                  Fonti o contesto cambiati: copia gli appunti che vuoi
                  conservare, rileggi e ricostruisci i riscontri da zero. Le
                  vecchie conferme non sono riutilizzabili.
                </p>
              )}
              {!requisitiDisponibili && (
                <p role="alert" className="text-sm text-amber-900">
                  Una versione dei requisiti non è disponibile: controlla la
                  selezione prima di ricostruire il riesame.
                </p>
              )}
              {attrezzaturaCambiata && (
                <p role="alert" className="text-sm text-amber-900">
                  La fonte dell’attrezzatura è cambiata. Scegli la fonte
                  corrente della stessa macchina; le conferme devono essere
                  rinnovate.
                </p>
              )}
              <Label htmlFor="req-attivita">Attività da verificare</Label>
              <Textarea
                id="req-attivita"
                maxLength={2000}
                disabled={!scrive || salva.isPending}
                value={bozza.dati.attivita}
                onChange={(e) => cambiaHeader("attivita", e.target.value)}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="req-responsabile">
                    Responsabile del riesame
                  </Label>
                  <Input
                    id="req-responsabile"
                    maxLength={200}
                    disabled={!scrive || salva.isPending}
                    value={bozza.dati.responsabile}
                    onChange={(e) =>
                      cambiaHeader("responsabile", e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="req-ruolo">Ruolo del responsabile</Label>
                  <Input
                    id="req-ruolo"
                    maxLength={300}
                    disabled={!scrive || salva.isPending}
                    value={bozza.dati.ruolo_responsabile}
                    onChange={(e) =>
                      cambiaHeader("ruolo_responsabile", e.target.value)
                    }
                  />
                </div>
              </div>
              <Label htmlFor="req-mezzo">
                Attrezzatura specifica del contesto (facoltativa)
              </Label>
              <select
                id="req-mezzo"
                className="h-10 w-full rounded border bg-background px-2 text-sm"
                disabled={
                  !scrive ||
                  salva.isPending ||
                  (!!bozza.precedente && !bozza.mezzoPrecedente)
                }
                value={
                  bozza.dati.attrezzatura
                    ? chiaveFonteMezzo(bozza.dati.attrezzatura)
                    : ""
                }
                onChange={(e) =>
                  cambiaHeader(
                    "attrezzatura",
                    mezzi.data?.fonti.find(
                      (f) => chiaveFonteMezzo(f) === e.target.value,
                    ) || null,
                  )
                }
              >
                <option
                  value=""
                  disabled={!!bozza.precedente && !!bozza.mezzoPrecedente}
                >
                  Nessuna attrezzatura specifica selezionata
                </option>
                {mezzi.data?.fonti
                  .filter(
                    (f) =>
                      !bozza.precedente || f.mezzo_id === bozza.mezzoPrecedente,
                  )
                  .map((f) => (
                    <option
                      key={chiaveFonteMezzo(f)}
                      value={chiaveFonteMezzo(f)}
                    >
                      {f.nome} ·{" "}
                      {f.matricola || f.codice || f.targa || f.mezzo_id} ·{" "}
                      {f.dal || "Assegnazione corrente"}–{f.al || "aperta"}
                    </option>
                  ))}
              </select>
              {attrezzaturaCambiata &&
                mezzi.data?.fonti.some(
                  (f) =>
                    bozza.dati.attrezzatura &&
                    chiaveFonteMezzo(f) ===
                      chiaveFonteMezzo(bozza.dati.attrezzatura),
                ) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!scrive || salva.isPending}
                    onClick={() =>
                      cambiaHeader(
                        "attrezzatura",
                        mezzi.data!.fonti.find(
                          (f) =>
                            bozza.dati.attrezzatura &&
                            chiaveFonteMezzo(f) ===
                              chiaveFonteMezzo(bozza.dati.attrezzatura),
                        )!,
                      )
                    }
                  >
                    Aggiorna fonte della stessa attrezzatura
                  </Button>
                )}
              <label className="flex gap-2 text-sm items-start">
                <input
                  type="checkbox"
                  disabled={!scrive || salva.isPending}
                  checked={bozza.dati.conferma_assegnazioni}
                  onChange={(e) =>
                    cambiaHeader("conferma_assegnazioni", e.target.checked)
                  }
                />
                Ho controllato le assegnazioni e dichiaro il periodo di impiego
                delle fonti prive di date. Non sto attestando la presenza
                storica.
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label="Cerca nei riscontri"
                  placeholder="Cerca addetto o requisito…"
                  value={ricercaRiscontri}
                  onChange={(e) => setRicercaRiscontri(e.target.value)}
                  className="sm:max-w-sm"
                />
                <select
                  aria-label="Filtra riscontri per esito"
                  className="h-10 rounded border bg-background px-2"
                  value={esitoFiltro}
                  onChange={(e) => setEsitoFiltro(e.target.value)}
                >
                  <option value="tutti">Tutti i riscontri</option>
                  <option value="da_verificare">Da verificare</option>
                  <option value="mancante">Evidenza mancante</option>
                  <option value="riesaminata">Evidenza riesaminata</option>
                  <option value="non_applicabile">Non applicabile</option>
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                {bozza.dati.righe.length} riscontri nella bozza. La
                registrazione comprende tutte le righe, anche quelle nascoste
                dai filtri.
              </p>
              <div className="space-y-3">
                {bozza.dati.righe.map((r, i) => {
                  const a = (coerente ? quadro : bozza.contesto)?.persone.find(
                      (p) => p.id === r.persona_id && p.tipo === r.persona_tipo,
                    ),
                    o = opzioni.find(
                      (o) =>
                        chiaveRequisito(o.selezione) === chiaveRequisito(r),
                    ),
                    qs =
                      (coerente ? quadro : bozza.contesto)?.qualifiche.filter(
                        (f) =>
                          f.persona_id === r.persona_id &&
                          f.persona_tipo === r.persona_tipo,
                      ) || [];
                  const ricerca = ricercaRiscontri
                    .trim()
                    .toLocaleLowerCase("it");
                  if (
                    (esitoFiltro !== "tutti" && r.esito !== esitoFiltro) ||
                    (ricerca &&
                      ![a?.nome, a?.cognome, o?.requisito.titolo]
                        .filter(Boolean)
                        .join(" ")
                        .toLocaleLowerCase("it")
                        .includes(ricerca))
                  )
                    return null;
                  const cambia = (
                    patch: Parameters<typeof cambiaRiscontro>[1],
                  ) =>
                    setBozza((b) =>
                      b
                        ? {
                            ...b,
                            dati: {
                              ...b.dati,
                              righe: b.dati.righe.map((v, n) =>
                                n === i ? cambiaRiscontro(v, patch) : v,
                              ),
                            },
                          }
                        : b,
                    );
                  return (
                    <details
                      key={`${r.persona_tipo}:${r.persona_id}:${chiaveRequisito(r)}`}
                      open={bozza.dati.righe.length <= 3}
                      className="rounded border p-3 space-y-2"
                    >
                      <summary className="cursor-pointer text-sm font-medium">
                        {a?.nome || r.persona_id} {a?.cognome} ·{" "}
                        {o?.requisito.titolo ||
                          "Versione del requisito da rileggere"}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {
                            {
                              da_verificare: "Da verificare",
                              mancante: "Evidenza mancante",
                              riesaminata: "Evidenza riesaminata",
                              non_applicabile: "Non applicabile",
                            }[r.esito]
                          }
                        </span>
                      </summary>
                      <p className="text-xs text-muted-foreground">
                        {o?.requisito.riferimento} · {o?.requisito.indicazioni}
                      </p>
                      <label className="text-sm">
                        Riscontro
                        <select
                          aria-label={`Riscontro ${i + 1}`}
                          className="mt-1 h-10 w-full rounded border bg-background px-2"
                          disabled={!scrive || !coerente || salva.isPending}
                          value={r.esito}
                          onChange={(e) =>
                            cambia({ esito: e.target.value as typeof r.esito })
                          }
                        >
                          {[
                            ["da_verificare", "Da verificare"],
                            ["mancante", "Evidenza mancante"],
                            [
                              "riesaminata",
                              "Evidenza riesaminata per questo requisito",
                            ],
                            [
                              "non_applicabile",
                              "Non applicabile, con motivazione",
                            ],
                          ].map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </label>
                      {r.esito === "riesaminata" && (
                        <>
                          <label className="text-sm">
                            Qualifica dell’addetto
                            <select
                              aria-label={`Qualifica ${i + 1}`}
                              className="mt-1 h-10 w-full rounded border bg-background px-2"
                              disabled={!scrive || !coerente || salva.isPending}
                              value={r.qualifica_id || ""}
                              onChange={(e) =>
                                cambia({ qualifica_id: e.target.value || null })
                              }
                            >
                              <option value="">
                                Scegli l’evidenza da riesaminare
                              </option>
                              {qs.map((f) => {
                                const motivo =
                                  a && quadro
                                    ? motivoQualifica(
                                        quadro,
                                        a,
                                        f,
                                        bozza.dati.conferma_assegnazioni,
                                      )
                                    : "Contesto da rileggere";
                                return (
                                  <option
                                    key={f.id}
                                    value={f.id}
                                    disabled={!!motivo}
                                  >
                                    {f.dati.titolo} · v{f.versione}
                                    {motivo ? ` · ${motivo}` : ""}
                                  </option>
                                );
                              })}
                            </select>
                          </label>
                          {qs
                            .filter((f) => f.id === r.qualifica_id)
                            .map((f) => (
                              <p
                                key={f.id}
                                className="text-xs text-muted-foreground"
                              >
                                Ambito: {f.dati.ambito} · Limiti:{" "}
                                {f.dati.limitazioni || "non indicati"} ·{" "}
                                {f.dati.validita_dal}–
                                {f.dati.validita_al ||
                                  "assenza scadenza motivata"}
                              </p>
                            ))}
                        </>
                      )}
                      <Label htmlFor={`req-motivo-${i}`}>
                        Motivazione e prossima azione
                      </Label>
                      <Textarea
                        id={`req-motivo-${i}`}
                        maxLength={2000}
                        disabled={!scrive || !coerente || salva.isPending}
                        value={r.motivazione}
                        onChange={(e) =>
                          cambia({ motivazione: e.target.value })
                        }
                      />
                      {(r.esito === "riesaminata" ||
                        r.esito === "non_applicabile") && (
                        <label className="flex gap-2 text-sm items-start">
                          <input
                            type="checkbox"
                            disabled={!scrive || !coerente || salva.isPending}
                            checked={
                              coerente &&
                              requisitiDisponibili &&
                              !attrezzaturaCambiata &&
                              r.confermata
                            }
                            onChange={(e) =>
                              setBozza((b) =>
                                b
                                  ? {
                                      ...b,
                                      dati: {
                                        ...b.dati,
                                        righe: b.dati.righe.map((v, n) =>
                                          n === i
                                            ? {
                                                ...v,
                                                confermata: e.target.checked,
                                              }
                                            : v,
                                        ),
                                      },
                                    }
                                  : b,
                              )
                            }
                          />
                          Confermo la pertinenza del riscontro per questo
                          addetto, requisito e contesto.
                        </label>
                      )}
                    </details>
                  );
                })}
              </div>
              <label className="flex gap-2 text-sm items-start">
                <input
                  type="checkbox"
                  disabled={!scrive || salva.isPending}
                  checked={bozza.dati.requisiti_definiti}
                  onChange={(e) =>
                    cambiaHeader("requisiti_definiti", e.target.checked)
                  }
                />
                Ho definito i requisiti nominativi applicabili a questa attività
                e a questo contesto. Il solo salvataggio non certifica
                l’idoneità.
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={
                    !scrive ||
                    !coerente ||
                    fontiNonDisponibili ||
                    attrezzaturaCambiata ||
                    !requisitiDisponibili ||
                    salva.isPending
                  }
                  onClick={registra}
                >
                  {salva.isPending ? "Registrazione…" : "Registra riscontri"}
                </Button>
                <Button
                  variant="outline"
                  disabled={salva.isPending}
                  onClick={() => setBozza(null)}
                >
                  Scarta preparazione
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <p className="font-medium text-sm">
              Riesami registrati nel periodo
            </p>
            {storico.isError ? (
              <p role="alert" className="text-sm">
                Storico non disponibile: rileggi le fonti.
              </p>
            ) : storico.isLoading ? (
              <p className="text-sm">Lettura storico…</p>
            ) : !storico.data?.length ? (
              <p className="text-sm text-muted-foreground">
                Nessun riesame registrato con questi filtri.
              </p>
            ) : (
              storico.data.map((r) => (
                <div key={r.id} className="rounded border p-3 text-sm">
                  <p className="font-medium">
                    {r.dati.attivita} · Rev. {r.versione}
                  </p>
                  <p>
                    {r.stato === "parziale"
                      ? "Riesame parziale"
                      : r.stato === "da_integrare"
                        ? "Evidenze da integrare"
                        : "Riscontri registrati per i requisiti selezionati"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.dal}–{r.al} · {r.riscontri} riscontri · {r.non_collegati}{" "}
                    collegamenti da sistemare · {r.dati.responsabile},{" "}
                    {r.dati.ruolo_responsabile} ·{" "}
                    {new Date(r.registrato_il).toLocaleString("it-IT", {
                      timeZone: "Europe/Rome",
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {quadro && r.impronta !== quadro.impronta
                      ? "Contesto o fonti diversi dalla lettura corrente: da riesaminare."
                      : "Fotografia registrata; non è una verifica automatica dell’idoneità attuale."}
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() =>
                      setDettaglio(dettaglio === r.id ? null : r.id)
                    }
                  >
                    {dettaglio === r.id
                      ? "Chiudi riscontri salvati"
                      : "Consulta riscontri salvati"}
                  </Button>
                  {dettaglio === r.id && (
                    <DettaglioRiscontri
                      companyId={companyId}
                      orderId={orderId}
                      id={r.id}
                    />
                  )}
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setRiesamePos(r.id)}
                  >
                    Controlla dati della propria impresa per il POS
                  </Button>
                  {scrive && !bozza && !revisioni && r.fase_id === fase && (
                    <Button
                      variant="link"
                      size="sm"
                      disabled={fontiNonDisponibili || salva.isPending}
                      onClick={() => prepara(r)}
                    >
                      Riesamina senza ereditare conferme
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
      {persona && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o) setPersonaAperta(null);
          }}
        >
          <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Qualifiche di {persona.nome} {persona.cognome}
              </DialogTitle>
              <DialogDescription>
                Classificazione dell’originale e pertinenza al requisito restano
                verifiche separate.
              </DialogDescription>
            </DialogHeader>
            <QualificheAddetto
              key={chiavePersona(persona)}
              companyId={companyId}
              tipo={persona.tipo}
              personaId={persona.id}
              apertoIniziale
            />
          </DialogContent>
        </Dialog>
      )}
      {riesamePos && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setRiesamePos(null);
          }}
        >
          <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Riesame per il POS della propria impresa
              </DialogTitle>
              <DialogDescription>
                Identità, requisiti e fonti rilette nel contesto della commessa.
              </DialogDescription>
            </DialogHeader>
            <RiesameProprioPos
              key={riesamePos}
              companyId={companyId}
              orderId={orderId}
              id={riesamePos}
            />
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}

function DettaglioRiscontri({
  companyId,
  orderId,
  id,
}: {
  companyId: string;
  orderId: string;
  id: string;
}) {
  const q = useDettaglioRiesameAddetti(companyId, orderId, id, true);
  if (q.isLoading)
    return <p className="text-xs">Lettura dei riscontri salvati…</p>;
  if (q.isError)
    return (
      <p role="alert" className="text-xs">
        Riscontri non disponibili.{" "}
        <Button variant="link" size="sm" onClick={() => q.refetch()}>
          Riprova dettaglio
        </Button>
      </p>
    );
  return (
    <ul className="mt-2 space-y-2">
      {q.data?.map((r, i) => (
        <li key={i} className="border-t pt-2 text-xs">
          <p className="font-medium">
            {r.persona_snapshot.nome} {r.persona_snapshot.cognome} ·{" "}
            {r.requisito_snapshot.requisito.titolo}
          </p>
          <p>
            {r.esito === "riesaminata"
              ? "Evidenza riesaminata"
              : r.esito === "mancante"
                ? "Evidenza mancante"
                : r.esito === "non_applicabile"
                  ? "Non applicabile"
                  : "Da verificare"}{" "}
            · {r.motivazione || "Motivazione non ancora registrata"}
          </p>
          {r.qualifica_snapshot && (
            <p>
              {r.qualifica_snapshot.dati.titolo} · v
              {r.qualifica_snapshot.versione} · Ambito{" "}
              {r.qualifica_snapshot.dati.ambito} · Limiti{" "}
              {r.qualifica_snapshot.dati.limitazioni || "non indicati"}
            </p>
          )}
          <p className="text-muted-foreground">
            Fotografia della registrazione; gli originali e le fonti attuali
            richiedono un controllo distinto.
          </p>
        </li>
      ))}
    </ul>
  );
}
