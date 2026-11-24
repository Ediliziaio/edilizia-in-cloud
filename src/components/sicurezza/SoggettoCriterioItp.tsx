import { UniformSelect } from "@/components/ui/uniform-select";
import { Button } from "@/components/ui/button";
import { RUOLI_INCARICO } from "@/lib/sicurezza/fascicolo";
import type { CriterioItp } from "@/lib/sicurezza/itp";
import { voceCatalogo } from "@/lib/sicurezza/catalogoDocumenti";
import {
  cambiaDestinatario,
  destinatarioCriterio,
  incarichiNelContesto,
  operaiNelContesto,
  resetNominativo,
  type DestinatarioItp,
  type SoggettiItp,
} from "@/lib/sicurezza/soggettiItp";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
const stile = "w-full rounded-md border bg-background px-3 py-2 text-sm";
export function SoggettoCriterioItp({
  criterio: c,
  soggetti,
  data,
  faseId,
  onChange,
  onEstendi,
  onRiduci,
}: {
  criterio: CriterioItp;
  soggetti: SoggettiItp;
  data: string;
  faseId?: string | null;
  onChange: (c: CriterioItp) => void;
  onEstendi: () => void;
  onRiduci: () => void;
}) {
  const t = useT();
  const dest = destinatarioCriterio(c);
  const ambito = voceCatalogo(c.catalogo_id, c.catalogo_versione)?.ambito;
  const scelte: DestinatarioItp[] =
    ambito === "persona_o_incarico"
      ? ["operaio", "incarico"]
      : ambito === "incarico"
        ? ["incarico"]
        : ambito === "commessa"
          ? ["commessa"]
          : ambito === "impresa"
            ? ["impresa"]
            : ["impresa", "commessa", "operaio", "incarico"];
  const operai = operaiNelContesto(soggetti, data, faseId);
  const incarichi = incarichiNelContesto(soggetti, data, c.ruolo);
  return (
    <div className="rounded-md bg-muted/40 p-3 space-y-2">
      <label className="block text-sm">
        {t("Destinatario del criterio")}
        <UniformSelect
          className={stile}
          value={dest}
          disabled={!!c.gruppo_id}
          onChange={(e) =>
            onChange(cambiaDestinatario(c, e.target.value as DestinatarioItp))
          }
        >
          {scelte.map((d) => (
            <option key={d} value={d}>
              {t(
                {
                  impresa: "Impresa",
                  commessa: "Commessa",
                  operaio: "Singolo operaio esterno",
                  incarico: "Incarico nominativo",
                }[d],
              )}
            </option>
          ))}
        </UniformSelect>
      </label>
      {dest === "operaio" && (
        <label className="block text-sm">
          {t("Operaio titolare")}
          <UniformSelect
            className={stile}
            value={c.operaio_id ?? ""}
            disabled={!!c.gruppo_id}
            onChange={(e) =>
              onChange({
                ...resetNominativo(c),
                destinatario: dest,
                operaio_id: e.target.value || undefined,
                incarico_id: undefined,
              })
            }
          >
            <option value="">{t("Scegli l’operaio…")}</option>
            {c.operaio_id &&
              !soggetti.operai.some((o) => o.id === c.operaio_id) && (
                <option value={c.operaio_id}>
                  {t("Titolare non più disponibile")}
                </option>
              )}
            {soggetti.operai.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome} {o.cognome} · {o.mansione} {t("· rif.")} {o.id.slice(0, 8)}
                {!o.attivo ? ` ${t("· cessato")}` : ""}
                {!operai.some((x) => x.id === o.id)
                  ? ` ${t("· fuori assegnazione o fase")}`
                  : ""}
              </option>
            ))}
          </UniformSelect>
        </label>
      )}
      {dest === "incarico" && (
        <>
          <label className="block text-sm">
            {t("Ruolo da esaminare")}
            <UniformSelect
              className={stile}
              value={c.ruolo ?? ""}
              disabled={!!c.gruppo_id}
              onChange={(e) =>
                onChange({
                  ...resetNominativo(c),
                  destinatario: dest,
                  ruolo: (e.target.value || undefined) as CriterioItp["ruolo"],
                  incarico_id: undefined,
                  operaio_id: undefined,
                })
              }
            >
              <option value="">{t("Scegli il ruolo…")}</option>
              {Object.entries(RUOLI_INCARICO).map(([v, n]) => (
                <option key={v} value={v}>
                  {t(n)}
                </option>
              ))}
            </UniformSelect>
          </label>
          <label className="block text-sm">
            {t("Incarico titolare")}
            <UniformSelect
              className={stile}
              value={c.incarico_id ?? ""}
              disabled={!!c.gruppo_id}
              onChange={(e) => {
                const i = soggetti.incarichi.find(
                  (i) => i.id === e.target.value,
                );
                onChange({
                  ...resetNominativo(c),
                  destinatario: dest,
                  incarico_id: i?.id,
                  ruolo: i?.ruolo ?? c.ruolo,
                  operaio_id: undefined,
                });
              }}
            >
              <option value="">{t("Scegli l’incarico…")}</option>
              {c.incarico_id &&
                !soggetti.incarichi.some((i) => i.id === c.incarico_id) && (
                  <option value={c.incarico_id}>
                    {t("Incarico non più disponibile")}
                  </option>
                )}
              {soggetti.incarichi
                .filter((i) => !c.ruolo || i.ruolo === c.ruolo)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nominativo} · {t(RUOLI_INCARICO[i.ruolo])} · {i.stato} {t("· rif.")} {i.id.slice(0, 8)}
                    {!incarichi.some((x) => x.id === i.id)
                      ? ` ${t("· fuori periodo")}`
                      : ""}
                  </option>
                ))}
            </UniformSelect>
          </label>
        </>
      )}
      {["operaio", "incarico"].includes(dest) && (
        <div className="flex flex-wrap items-center gap-2">
          {c.gruppo_id ? (
            <>
              <p className="text-xs text-muted-foreground">
                {t("Copertura di gruppo: ogni titolare resta da valutare separatamente.")}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onRiduci}
              >
                {t("Torna a criterio singolo")}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={dest === "incarico" && !c.ruolo}
              onClick={onEstendi}
            >
              {dest === "operaio"
                ? t("Estendi agli addetti assegnati ({n})", { n: operai.length })
                : t("Estendi agli incarichi del ruolo ({n})", { n: incarichi.length })}
            </Button>
          )}
        </div>
      )}
      {["operaio", "incarico"].includes(dest) && (
        <p className="text-xs text-muted-foreground">
          {t("Se non c’è un titolare pertinente, registra la criticità o motiva la non applicabilità. Un documento individuale non viene attribuito all’intera squadra.")}
        </p>
      )}
    </div>
  );
}
