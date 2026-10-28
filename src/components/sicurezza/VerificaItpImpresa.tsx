import { useState } from "react";
import { ApplicabilitaItp } from "./ApplicabilitaItp";
import { ProfiliPerVerifica } from "./ProfiliPerVerifica";
import { useProfiliRequisiti } from "@/hooks/useProfiliRequisiti";
import { avvisiProfili } from "@/lib/sicurezza/profiliRequisiti";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useContestoItp,
  useRegistraItp,
  useVerificheItp,
  leggiSoggettiItp,
  useSoggettiItp,
} from "@/hooks/useVerificheItp";
import { apriFileFascicolo } from "@/hooks/useFascicoloCantiere";
import type { EvidenzaFascicolo } from "@/lib/sicurezza/fascicolo";
import { CATALOGO_DOCUMENTI } from "@/lib/sicurezza/catalogoDocumenti";
import {
  avvisiVerificaItp,
  erroreVerificaItp,
  ESITI_ITP,
  nuovoCriterioItp,
  ultimaVerificaItp,
  type CriterioItp,
  type DatiVerificaItp,
  type VerificaItp,
} from "@/lib/sicurezza/itp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { SoggettoCriterioItp } from "./SoggettoCriterioItp";
import {
  avvisiSoggetti,
  destinatarioCriterio,
  evidenzaDelTitolare,
  espandiCopertura,
  MAX_CRITERI_ITP,
  nomeTitolare,
  riallineaSoggetti,
  resetNominativo,
} from "@/lib/sicurezza/soggettiItp";

type Sessione = {
  id: string;
  precedente: string | null;
  dati: DatiVerificaItp;
  evidenze: EvidenzaFascicolo[];
};
const stileSelect = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const copia = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const messaggio = (e: unknown) =>
  e instanceof Error
    ? e.message
    : typeof e === "object" && e && "message" in e
      ? String(e.message)
      : "Registrazione non riuscita. I dati compilati restano disponibili.";

/** Human assessment. A file count never produces a positive ITP outcome. */
export function VerificaItpImpresa({
  companyId,
  orderId,
  subId,
  evidenze,
  giorno,
  faseId,
}: {
  companyId: string;
  orderId: string;
  subId: string;
  evidenze: readonly EvidenzaFascicolo[];
  giorno: string;
  faseId?: string;
}) {
  const p = usePermissions();
  const profili = useProfiliRequisiti(companyId);
  const storico = useVerificheItp(companyId, orderId);
  const elenco = (storico.data ?? []).filter(
    (v) => v.subappaltatore_id === subId,
  );
  const ultima = ultimaVerificaItp(elenco, subId, giorno, faseId);
  const contesto = useContestoItp(companyId, orderId, subId, faseId);
  const contestoUltima = useContestoItp(
    companyId,
    orderId,
    ultima ? subId : undefined,
    ultima?.fase_id,
  );
  const salva = useRegistraItp(companyId, orderId, subId);
  const soggettiCorrenti = useSoggettiItp(
    companyId,
    orderId,
    ultima?.soggetti ? subId : undefined,
  );
  const [sessione, setSessione] = useState<Sessione | null>(null);
  const [prepara, setPrepara] = useState(false);
  const [errore, setErrore] = useState("");
  const [voce, setVoce] = useState("");
  const [rilettura, setRilettura] = useState(false);
  const avvisi = ultima
    ? [
        ...avvisiVerificaItp(ultima, evidenze, contestoUltima.data, giorno),
        ...(profili.data ? avvisiProfili(ultima.criteri, profili.data) : []),
        ...avvisiSoggetti(ultima.soggetti ?? undefined, soggettiCorrenti.data),
      ]
    : [];
  const dati = (patch: Partial<DatiVerificaItp>) =>
    setSessione((s) =>
      s ? { ...s, dati: { ...s.dati, completezza: false, ...patch } } : s,
    );
  const criterio = (id: string, patch: Partial<CriterioItp>) =>
    setSessione((s) =>
      s
        ? {
            ...s,
            dati: {
              ...s.dati,
              completezza: false,
              criteri: s.dati.criteri.map((c) =>
                c.id === id ? { ...c, ...patch } : c,
              ),
            },
          }
        : s,
    );
  async function apri(rettifica = false) {
    setPrepara(true);
    setErrore("");
    try {
      // Explicitly refresh before freezing the viewed context and history version.
      const h = await storico.refetch();
      if (h.error || !h.data)
        throw h.error ?? new Error("Storico non disponibile");
      const precedente = h.data
        .filter((v) => v.subappaltatore_id === subId)
        .sort((a, b) => b.versione - a.versione)[0];
      const q = rettifica ? contestoUltima : contesto;
      const ctx = await q.refetch();
      if (ctx.error || !ctx.data)
        throw ctx.error ?? new Error("Contesto non disponibile");
      if (rettifica && (!precedente || precedente.id !== ultima?.id))
        throw new Error(
          "Lo storico è cambiato: seleziona la verifica più recente prima di rettificarla.",
        );
      const sg = await leggiSoggettiItp(companyId, orderId, subId);
      const fonti = copia(
        evidenze.filter(
          (e) =>
            ((e.subappaltatore_id === subId &&
              (!e.order_id || e.order_id === orderId)) ||
              (!e.subappaltatore_id && e.order_id === orderId)) &&
            e.stato !== "superato",
        ),
      );
      setSessione({
        id: crypto.randomUUID(),
        precedente: precedente?.id ?? null,
        evidenze: fonti,
        dati: {
          soggetti_attesi: copia(sg),
          fase_id: rettifica ? precedente.fase_id : (faseId ?? null),
          dal: rettifica ? precedente.dal : giorno,
          al: rettifica ? precedente.al : null,
          esito: rettifica ? "annullata" : "da_integrare",
          attivita: rettifica ? precedente.attivita : "",
          responsabile: "",
          ruolo_responsabile: "",
          motivazione: "",
          completezza: false,
          criteri: [],
          contesto_atteso: copia(ctx.data),
          evidenze_attese: Object.fromEntries(
            fonti.map((e) => [e.id, e.updated_at]),
          ),
        },
      });
    } catch (e) {
      setErrore(messaggio(e));
    } finally {
      setPrepara(false);
    }
  }
  async function rileggiSoggetti() {
    if (!sessione) return;
    setRilettura(true);
    setErrore("");
    try {
      const nuovi = await leggiSoggettiItp(companyId, orderId, subId);
      const criteri = riallineaSoggetti(
        sessione.dati.criteri,
        nuovi,
        sessione.dati.dal,
        sessione.dati.fase_id,
      );
      setSessione((s) =>
        s
          ? {
              ...s,
              dati: {
                ...s.dati,
                soggetti_attesi: copia(nuovi),
                criteri,
                completezza: false,
              },
            }
          : s,
      );
      toast.success(
        "Soggetti riletti: criteri nominativi e coperture rimessi da verificare",
      );
    } catch (e) {
      setErrore(messaggio(e));
    } finally {
      setRilettura(false);
    }
  }
  function estendiCriterio(c: CriterioItp) {
    if (!sessione) return;
    const espansi = espandiCopertura(
      c,
      sessione.dati.soggetti_attesi ?? { operai: [], incarichi: [] },
      sessione.dati.dal,
      sessione.dati.fase_id,
    );
    const prima = sessione.dati.criteri.filter((x) =>
      c.gruppo_id ? x.gruppo_id !== c.gruppo_id : x.id !== c.id,
    );
    if (prima.length + espansi.length > MAX_CRITERI_ITP) {
      setErrore(
        "La copertura supera i 500 criteri: circoscrivi la verifica a una fase o attività.",
      );
      return;
    }
    dati({ criteri: [...prima, ...espansi] });
    setErrore("");
  }
  function riduciGruppo(c: CriterioItp) {
    if (!sessione) return;
    dati({
      criteri: [
        ...sessione.dati.criteri.filter((x) => x.gruppo_id !== c.gruppo_id),
        { ...resetNominativo(c), gruppo_id: undefined, copertura: undefined },
      ],
    });
  }
  async function registra() {
    if (!sessione) return;
    const err = erroreVerificaItp(sessione.dati);
    if (err) {
      setErrore(err);
      return;
    }
    setErrore("");
    try {
      await salva.mutateAsync({
        id: sessione.id,
        precedente: sessione.precedente,
        dati: sessione.dati,
      });
      setSessione(null);
      toast.success("Verifica registrata nello storico");
    } catch (e) {
      setErrore(messaggio(e));
    }
  }
  if (!p.canViewSicurezzaCantiere) return null;
  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">
          Verifica di idoneità tecnico professionale
        </h4>
        {!p.solaLettura && (
          <Button
            size="sm"
            variant="outline"
            disabled={prepara || storico.isLoading || storico.isError}
            onClick={() => void apri()}
          >
            {prepara ? "Caricamento…" : "Registra verifica ITP"}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Esito espresso dal responsabile per lavori, fase e periodo indicati. La
        presenza dei documenti non costituisce una verifica complessiva.
      </p>
      {storico.isError ? (
        <p role="alert">
          Storico delle verifiche non disponibile.{" "}
          <Button variant="link" onClick={() => void storico.refetch()}>
            Riprova
          </Button>
        </p>
      ) : storico.isLoading ? (
        <p>Caricamento verifiche…</p>
      ) : ultima ? (
        <div className="rounded-md border p-3 text-sm space-y-2">
          <Badge variant="outline">{ESITI_ITP[ultima.esito]}</Badge>
          <p>{ultima.attivita}</p>
          <p className="text-xs text-muted-foreground">
            {ultima.contesto.fase?.name ?? "Ambito commessa"} · {ultima.dal} →{" "}
            {ultima.al ?? "fine non indicata"} · v{ultima.versione}
          </p>
          <p>
            {ultima.responsabile} · {ultima.ruolo_responsabile}
          </p>
          {!faseId && ultima.fase_id && (
            <p className="text-amber-700">
              Esito relativo alla sola fase indicata; le altre fasi richiedono
              una valutazione propria.
            </p>
          )}
          {contestoUltima.isLoading ? (
            <p>Confronto con le fonti correnti…</p>
          ) : contestoUltima.isError ? (
            <p role="alert">
              Impossibile confrontare il contesto corrente: esito da
              riesaminare.
            </p>
          ) : null}
          {ultima.criteri.some((c) => c.profilo_id) &&
            (profili.isError || profili.isLoading) && (
              <p role={profili.isError ? "alert" : undefined}>
                {profili.isError
                  ? "Impossibile confrontare i profili correnti: riferimenti da riesaminare."
                  : "Confronto con i profili correnti…"}
              </p>
            )}
          {ultima.soggetti &&
            (soggettiCorrenti.isLoading || soggettiCorrenti.isError) && (
              <p role={soggettiCorrenti.isError ? "alert" : undefined}>
                {soggettiCorrenti.isError
                  ? "Organico e incarichi correnti non disponibili: copertura da riesaminare."
                  : "Confronto dell’organico corrente…"}
              </p>
            )}
          {avvisi.length > 0 && (
            <ul className="list-disc pl-4 text-amber-700">
              {avvisi.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          <ApplicabilitaItp key={ultima.id} verifica={ultima} evidenze={evidenze} riesame={avvisi.length > 0 || contestoUltima.isError || contestoUltima.isLoading || !!ultima.soggetti && (soggettiCorrenti.isLoading || soggettiCorrenti.isError) || ultima.criteri.some(c => c.profilo_id) && (profili.isError || profili.isLoading)} />
          {!p.solaLettura &&
            elenco[0]?.id === ultima.id &&
            ultima.esito !== "annullata" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={prepara}
                onClick={() => void apri(true)}
              >
                Registra annullamento motivato
              </Button>
            )}
        </div>
      ) : (
        <p className="text-sm text-amber-700">
          Nessuna valutazione registrata per questa data e fase.
        </p>
      )}
      {elenco.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer">
            Storico registrazioni · {elenco.length}
          </summary>
          <div className="mt-2 space-y-2">
            {elenco.map((v) => (
              <Registrazione key={v.id} verifica={v} />
            ))}
          </div>
        </details>
      )}
      {errore && !sessione && (
        <p role="alert" className="text-sm text-destructive">
          {errore}
        </p>
      )}
      <Dialog
        open={!!sessione}
        onOpenChange={(o) => {
          if (!o && !salva.isPending && !rilettura) setSessione(null);
        }}
      >
        <DialogContent
          className="max-w-4xl flex flex-col overflow-hidden gap-0 p-0"
          onEscapeKeyDown={(e) => {
            if (salva.isPending || rilettura) e.preventDefault();
          }}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b p-5 pr-12">
            <DialogTitle>
              {sessione?.dati.esito === "annullata"
                ? "Annullamento motivato della verifica"
                : "Registra verifica ITP"}
            </DialogTitle>
            <DialogDescription>
              Registrazione attribuita al tuo account e conservata nello
              storico. I dati esaminati restano quelli caricati all’apertura: se
              cambiano, il server richiede una nuova verifica.
            </DialogDescription>
          </DialogHeader>
          {sessione && (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <fieldset
                  disabled={salva.isPending || p.solaLettura || rilettura}
                  className="min-w-0 space-y-4"
                >
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <p>
                      {sessione.dati.contesto_atteso.impresa.ragione_sociale} ·{" "}
                      {sessione.dati.contesto_atteso.commessa.order_code}
                    </p>
                    <p>
                      {sessione.dati.contesto_atteso.fase?.name ??
                        "Ambito commessa senza fase specifica"}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      Valida dal
                      <Input
                        type="date"
                        value={sessione.dati.dal}
                        disabled={sessione.dati.esito === "annullata"}
                        onChange={(e) => dati({ dal: e.target.value })}
                      />
                    </label>
                    <label className="text-sm">
                      Valida fino al (se definito)
                      <Input
                        type="date"
                        value={sessione.dati.al ?? ""}
                        disabled={sessione.dati.esito === "annullata"}
                        onChange={(e) => dati({ al: e.target.value || null })}
                      />
                    </label>
                  </div>
                  <label className="block text-sm">
                    Lavori e ambito esaminati
                    <Textarea
                      value={sessione.dati.attivita}
                      onChange={(e) => dati({ attivita: e.target.value })}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      Responsabile della valutazione
                      <Input
                        value={sessione.dati.responsabile}
                        onChange={(e) => dati({ responsabile: e.target.value })}
                      />
                    </label>
                    <label className="text-sm">
                      Ruolo del responsabile
                      <Input
                        value={sessione.dati.ruolo_responsabile}
                        onChange={(e) =>
                          dati({ ruolo_responsabile: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="rounded-md border p-3 text-sm space-y-2">
                    <p>
                      I soggetti provengono dalle assegnazioni e dagli incarichi
                      della commessa. La data iniziale e la fase delimitano le
                      coperture di gruppo.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void rileggiSoggetti()}
                    >
                      Rileggi soggetti e azzera le verifiche nominative
                    </Button>
                  </div>
                  {sessione.dati.esito !== "annullata" && (
                    <>
                      <ProfiliPerVerifica
                        companyId={companyId}
                        criteri={sessione.dati.criteri}
                        onChange={(criteri) => dati({ criteri })}
                        onError={setErrore}
                      />
                      <div className="space-y-2">
                        <h4 className="font-medium">Criteri esaminati</h4>
                        <p className="text-xs text-muted-foreground">
                          Definisci i requisiti pertinenti al caso. Il catalogo
                          propone titoli documentali; applicabilità, riferimenti
                          ed esiti restano da valutare.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <select
                            aria-label="Aggiungi criterio dal catalogo"
                            className={stileSelect + " sm:max-w-md"}
                            value={voce}
                            onChange={(e) => setVoce(e.target.value)}
                          >
                            <option value="">
                              Scegli una voce del catalogo…
                            </option>
                            {CATALOGO_DOCUMENTI.voci
                              .filter((v) => v.destinazione === "sicurezza")
                              .map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.titolo}
                                </option>
                              ))}
                          </select>
                          <Button
                            variant="outline"
                            disabled={
                              !voce ||
                              sessione.dati.criteri.length >= MAX_CRITERI_ITP
                            }
                            onClick={() => {
                              const v = CATALOGO_DOCUMENTI.voci.find(
                                (v) => v.id === voce,
                              );
                              if (v)
                                dati({
                                  criteri: [
                                    ...sessione.dati.criteri,
                                    {
                                      ...nuovoCriterioItp(),
                                      titolo: v.titolo,
                                      catalogo_id: v.id,
                                      catalogo_versione: v.versione,
                                      destinatario: destinatarioCriterio({
                                        ...nuovoCriterioItp(),
                                        catalogo_id: v.id,
                                        catalogo_versione: v.versione,
                                      }),
                                    },
                                  ],
                                });
                              setVoce("");
                            }}
                          >
                            Aggiungi dal catalogo
                          </Button>
                          <Button
                            variant="outline"
                            disabled={
                              sessione.dati.criteri.length >= MAX_CRITERI_ITP
                            }
                            onClick={() =>
                              dati({
                                criteri: [
                                  ...sessione.dati.criteri,
                                  nuovoCriterioItp(),
                                ],
                              })
                            }
                          >
                            Criterio personalizzato
                          </Button>
                        </div>
                      </div>
                      {sessione.dati.criteri.map((c, i) => (
                        <div
                          className="space-y-3 rounded-lg border p-3"
                          key={c.id}
                        >
                          <div className="flex items-end gap-2">
                            <label className="flex-1 text-sm">
                              Criterio {i + 1}
                              <Input
                                value={c.titolo}
                                disabled={!!c.catalogo_id || !!c.profilo_id}
                                onChange={(e) =>
                                  criterio(c.id, { titolo: e.target.value })
                                }
                              />
                            </label>
                            <Button
                              variant="ghost"
                              disabled={!!c.profilo_id || !!c.gruppo_id}
                              title={
                                c.profilo_id
                                  ? "Mantieni i criteri del profilo espliciti oppure rimuovi l’intero profilo."
                                  : undefined
                              }
                              onClick={() =>
                                dati({
                                  criteri: sessione.dati.criteri.filter(
                                    (x) => x.id !== c.id,
                                  ),
                                })
                              }
                            >
                              Rimuovi criterio {i + 1}
                            </Button>
                          </div>
                          {c.profilo_snapshot && (
                            <p className="text-xs text-muted-foreground">
                              Profilo {c.profilo_snapshot.nome} · v
                              {c.profilo_snapshot.versione}.{" "}
                              {c.profilo_snapshot.requisito.indicazioni}
                            </p>
                          )}
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="text-sm">
                              Applicabilità
                              <select
                                className={stileSelect}
                                value={c.applicabilita}
                                onChange={(e) =>
                                  criterio(c.id, {
                                    applicabilita: e.target
                                      .value as CriterioItp["applicabilita"],
                                    esito:
                                      e.target.value === "non_applicabile"
                                        ? "non_applicabile"
                                        : "da_verificare",
                                  })
                                }
                              >
                                <option value="da_chiarire">Da chiarire</option>
                                <option value="applicabile">Applicabile</option>
                                <option value="non_applicabile">
                                  Non applicabile
                                </option>
                              </select>
                            </label>
                            <label className="text-sm">
                              Esito del criterio
                              <select
                                className={stileSelect}
                                value={c.esito}
                                onChange={(e) =>
                                  criterio(c.id, {
                                    esito: e.target
                                      .value as CriterioItp["esito"],
                                  })
                                }
                              >
                                {(c.applicabilita === "non_applicabile"
                                  ? ["non_applicabile"]
                                  : [
                                      "da_verificare",
                                      "conforme",
                                      "non_conforme",
                                    ]
                                ).map((x) => (
                                  <option key={x} value={x}>
                                    {
                                      {
                                        da_verificare: "Da verificare",
                                        conforme: "Conforme",
                                        non_conforme: "Non conforme",
                                        non_applicabile: "Non applicabile",
                                      }[x]
                                    }
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <SoggettoCriterioItp
                            criterio={c}
                            soggetti={
                              sessione.dati.soggetti_attesi ?? {
                                operai: [],
                                incarichi: [],
                              }
                            }
                            data={sessione.dati.dal}
                            faseId={sessione.dati.fase_id}
                            onChange={(nuovo) => criterio(c.id, nuovo)}
                            onEstendi={() => estendiCriterio(c)}
                            onRiduci={() => riduciGruppo(c)}
                          />
                          <label className="block text-sm">
                            Riferimento del criterio
                            <Input
                              value={c.riferimento}
                              onChange={(e) =>
                                criterio(c.id, { riferimento: e.target.value })
                              }
                            />
                          </label>
                          <label className="block text-sm">
                            Note e motivazione della non applicabilità
                            <Textarea
                              value={c.note}
                              onChange={(e) =>
                                criterio(c.id, { note: e.target.value })
                              }
                            />
                          </label>
                          <details>
                            <summary className="cursor-pointer text-sm">
                              Evidenze esaminate · {c.evidenze.length}
                            </summary>
                            <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
                              {sessione.evidenze
                                .filter(
                                  (e) =>
                                    (!e.fase_id ||
                                      e.fase_id === sessione.dati.fase_id) &&
                                    evidenzaDelTitolare(e, c, orderId, subId),
                                )
                                .map((e) => (
                                  <div
                                    className="flex items-center gap-2 rounded border p-2 text-sm"
                                    key={e.id}
                                  >
                                    <label className="flex flex-1 gap-2">
                                      <input
                                        type="checkbox"
                                        checked={c.evidenze.includes(e.id)}
                                        onChange={(ev) =>
                                          criterio(c.id, {
                                            evidenze: ev.target.checked
                                              ? [...c.evidenze, e.id]
                                              : c.evidenze.filter(
                                                  (x) => x !== e.id,
                                                ),
                                          })
                                        }
                                      />
                                      <span>
                                        {e.titolo}
                                        <span className="block text-xs text-muted-foreground">
                                          {e.stato} ·{" "}
                                          {e.file_name ?? "senza file"}
                                          {e.data_scadenza
                                            ? ` · scade ${e.data_scadenza}`
                                            : ""}
                                          {e.catalogo_id
                                            ? ` · ${e.catalogo_id}`
                                            : " · classificazione non definita"}
                                        </span>
                                      </span>
                                    </label>
                                    {e.file_path && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() =>
                                          void apriFileFascicolo(
                                            e.file_path!,
                                          ).catch(() =>
                                            toast.error(
                                              "Documento non disponibile",
                                            ),
                                          )
                                        }
                                      >
                                        Leggi
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              {!sessione.evidenze.length && (
                                <p className="text-sm text-muted-foreground">
                                  Nessuna evidenza disponibile nel fascicolo
                                  dell’impresa.
                                </p>
                              )}
                            </div>
                          </details>
                        </div>
                      ))}
                      <label className="block text-sm">
                        Esito complessivo
                        <select
                          className={stileSelect}
                          value={sessione.dati.esito}
                          onChange={(e) =>
                            dati({
                              esito: e.target.value as DatiVerificaItp["esito"],
                              completezza: false,
                            })
                          }
                        >
                          {(
                            [
                              "da_integrare",
                              "positivo",
                              "negativo",
                              "non_applicabile",
                            ] as const
                          ).map((x) => (
                            <option key={x} value={x}>
                              {ESITI_ITP[x]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={sessione.dati.completezza}
                          onChange={(e) =>
                            dati({ completezza: e.target.checked })
                          }
                        />
                        <span>
                          Ho definito ed esaminato tutti i requisiti applicabili
                          al soggetto e ai lavori indicati.
                        </span>
                      </label>
                    </>
                  )}
                  <label className="block text-sm">
                    Motivazione dell’esito e azioni richieste
                    <Textarea
                      value={sessione.dati.motivazione}
                      onChange={(e) => dati({ motivazione: e.target.value })}
                    />
                  </label>
                </fieldset>
                {errore && (
                  <p role="alert" className="text-sm text-destructive">
                    {errore}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 justify-end gap-2 border-t bg-background p-4">
                <Button
                  variant="outline"
                  disabled={salva.isPending}
                  onClick={() => setSessione(null)}
                >
                  Annulla
                </Button>
                <Button
                  disabled={salva.isPending || p.solaLettura || rilettura}
                  onClick={() => void registra()}
                >
                  {salva.isPending
                    ? "Registrazione…"
                    : "Registra nello storico"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function Registrazione({ verifica: v }: { verifica: VerificaItp }) {
  return (
    <details className="rounded border p-3">
      <summary className="cursor-pointer">
        v{v.versione} · {ESITI_ITP[v.esito]} · {v.dal} ·{" "}
        {v.contesto.fase?.name ?? "Commessa"}
      </summary>
      <div className="mt-3 space-y-2">
        <p>{v.attivita}</p>
        <p>{v.motivazione}</p>
        <p>
          Responsabile: {v.responsabile} · {v.ruolo_responsabile}
        </p>
        <p className="text-xs text-muted-foreground">
          Registrato da {v.registrato_da_nome} il{" "}
          {new Date(v.registrato_il).toLocaleString("it-IT")} · periodo {v.dal}{" "}
          → {v.al ?? "fine non indicata"}
        </p>
        {v.criteri.map((c) => (
          <div key={c.id} className="rounded bg-muted p-2">
            <p>
              {c.titolo} · {c.applicabilita.replaceAll("_", " ")} ·{" "}
              {c.esito.replaceAll("_", " ")}
            </p>
            {c.profilo_snapshot && (
              <p className="text-xs text-muted-foreground">
                Profilo utilizzato: {c.profilo_snapshot.nome} · v
                {c.profilo_snapshot.versione} · {c.profilo_snapshot.limiti}
              </p>
            )}
            <p className="text-sm">
              Titolare: {nomeTitolare(c)}
              {c.gruppo_id ? " · copertura nominativa di gruppo" : ""}
            </p>
            <p>{c.riferimento}</p>
            <p>{c.note}</p>
            <ul className="pl-4 list-disc">
              {c.evidenze.map((id) => {
                const e = v.evidenze.find((e) => e.id === id);
                return (
                  <li key={id}>
                    {e?.titolo ?? "Evidenza registrata"}
                    {e && (
                      <span className="block text-xs text-muted-foreground">
                        {e.file_name ?? "Senza file"} · {e.stato}
                        {e.data_scadenza
                          ? ` · scadenza ${e.data_scadenza}`
                          : ""}{" "}
                        · versione della fonte {e.updated_at}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Lo storico conserva l’esito e i metadati delle fonti esaminate; non è
          una copia conservativa dei file originali.
        </p>
      </div>
    </details>
  );
}
