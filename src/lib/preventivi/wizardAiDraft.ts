import type { RstComputoVoce } from "@/types/ristrutturazione";
import type { ChatDocument, ChatLine } from "./quoteChatDocument";
import { chatLineIssue } from "./quoteChatDocument";
import { quoteLineOverlaps } from "./quoteLineDuplicates";
import { wizardAiPriceSource, wizardAiPricingFromSource } from './wizardAiPriceSource';

/** These eight native engines share the computo row contract, not their forms or templates. */
export type NativeComputoRow = RstComputoVoce;
export type NativeComputoModule =
  | "bagni"
  | "climatizzazione"
  | "elettrico"
  | "termoidraulico"
  | "pavimenti"
  | "piscine"
  | "ristrutturazione"
  | "tetti";
export type WizardAiAmounts = { quantity: number; unit: string; price: number };
export type WizardAiChange = {
  id: string;
  title: string;
  kind: "aggiunta" | "modifica" | "esclusione";
  chapter: string;
  before?: WizardAiAmounts;
  after?: WizardAiAmounts;
};
export const cloneWizardDraft = <T>(value: T): T => structuredClone(value);
export const wizardDraftFingerprint = (value: unknown) => JSON.stringify(value);

/** A proposed edit resets inclusion until re-confirmed. That is not an explicit
 * deletion of the existing wizard row. Replacements must also be ready in full,
 * rather than removing a bundle while its details are still unpriced. */
export function assertConfirmedWizardChanges(seed: ChatDocument, draft: ChatDocument) {
  for (const prior of seed.lines.filter(line => line.included)) {
    const line = draft.lines.find(row => row.id === prior.id);
    if (!line) continue; // Missing native identities are checked by each adapter.
    if (line.supersededBy?.length) {
      const ready = line.supersededBy.every(id => {
        const child = draft.lines.find(row => row.id === id);
        return child && child.included && !chatLineIssue(child) &&
          Number.isFinite(child.quantity) && Number.isFinite(child.price) && child.quantity! > 0 && child.price! > 0;
      });
      if (!ready) throw new Error(`Completa e conferma tutte le voci sostitutive di «${prior.title}» prima di rimuoverla dal computo.`);
    } else if (!line.included && !chatLineIssue(line) &&
      (['title', 'description', 'quantity', 'unit', 'price'] as const).some(field => line[field] !== prior[field])) {
      throw new Error(`La voce esistente «${prior.title}» è stata modificata ma non inclusa. Conferma la voce modificata oppure ripristinala prima di escluderla: non verrà eliminata dal computo per errore.`);
    }
  }
}

export function assertNoNewWizardOverlaps(
  seed: ChatDocument,
  draft: ChatDocument,
) {
  const signature = (parentId: string, childIds: string[]) =>
    [parentId, ...childIds].sort().join("|");
  const baseline = new Set(
    quoteLineOverlaps(seed).map((group) =>
      signature(group.parentId, group.childIds),
    ),
  );
  for (const group of quoteLineOverlaps(draft)) {
    const ids = [group.parentId, ...group.childIds];
    const active = draft.lines.filter(
      (line) =>
        ids.includes(line.id) && line.included && !line.supersededBy?.length,
    );
    const conflicting = group.reason.startsWith("Stesso titolo")
      ? active.length > 1
      : active.some((line) => line.id === group.parentId) && active.length > 1;
    if (!conflicting) continue;
    // Repeated native rows may represent different rooms/products. Do not
    // reinterpret or delete a pre-existing, unchanged native arrangement.
    const unchangedScope =
      baseline.has(signature(group.parentId, group.childIds)) &&
      ids.every((id) => {
        const before = seed.lines.find((line) => line.id === id),
          after = draft.lines.find((line) => line.id === id);
        return (
          before &&
          after &&
          before.title === after.title &&
          before.description === after.description &&
          before.unit === after.unit
        );
      });
    if (!unchangedScope)
      throw new Error("Risolvi i possibili doppioni prima di applicare.");
  }
}

export function computoChatDocument(
  rows: NativeComputoRow[],
  title: string,
): ChatDocument {
  if (
    rows.length > 100 ||
    new Set(rows.map((row) => row.id)).size !== rows.length
  )
    throw new Error(
      "Computo troppo grande o con identità duplicate: nessuna conversione eseguita.",
    );
  return {
    revision: 0,
    title,
    lines: rows.map((row): ChatLine => {
      const pricing = wizardAiPricingFromSource(row.fonte);
      const proposal: ChatLine["original"] = {
        id: row.id,
        title: row.descrizione.slice(0, 200),
        description: (row.descrizione_estesa || row.descrizione).slice(0, 6000),
        unit: row.unita_misura,
        quantity: row.quantita > 0 ? row.quantita : null,
        quantityBasis: "Quantità già presente nel computo del wizard.",
        referenceId: null,
      };
      return {
        ...proposal,
        original: cloneWizardDraft(proposal),
        price: row.prezzo_unitario > 0 ? row.prezzo_unitario : null,
        included: row.quantita > 0 && row.prezzo_unitario > 0,
        manual: true,
        reference: null,
        ...(pricing ? { pricing } : {}),
      };
    }),
  };
}

const units: Record<string, NativeComputoRow["unita_misura"]> = {
  mq: "mq",
  "m²": "mq",
  m2: "mq",
  ml: "ml",
  m: "ml",
  cad: "cad",
  pz: "cad",
  corpo: "corpo",
  "a corpo": "a corpo",
  kg: "kg",
  h: "h",
  ore: "h",
};
export function nativeComputoUnit(unit: string) {
  return units[unit.trim().toLocaleLowerCase("it")] ?? null;
}

/** Suggested chapter only: deterministic, visible and editable before import. */
export function suggestedComputoChapter(title: string) {
  const rules: Array<[RegExp, string]> = [
    [/allestiment|protezi|sicurezza|ponteggi/i, "Allestimento e protezioni"],
    [/demolizi|rimozion|smaltiment|discarica/i, "Demolizioni e smaltimenti"],
    [/elettric|quadro|punt[oi] luce|illuminaz/i, "Impianto elettrico"],
    [/idric|idraulic|scarich|collettor|tubazion/i, "Impianto idraulico"],
    [/masset|impermeabil|sottofond/i, "Sottofondi e impermeabilizzazioni"],
    [
      /paviment|rivestiment|piastrell|gres|parquet/i,
      "Pavimenti e rivestimenti",
    ],
    [/sanitar|rubinett|doccia|vasca|lavabo|bidet/i, "Sanitari e rubinetterie"],
    [/tintegg|pittur|rasatur|intonac/i, "Finiture"],
    [/collaud|certificaz|pulizia finale|consegna/i, "Collaudo e consegna"],
  ];
  return (
    rules.find(([pattern]) => pattern.test(title))?.[1] ?? "Altre lavorazioni"
  );
}

/** Pure, atomic reconciliation. No persistence, no regenerated IDs for existing rows,
 * no missing→zero coercion, and no overwrite of catalogue, costs, photos or room. */
export function reconcileComputoDraft(
  base: NativeComputoRow[],
  seed: ChatDocument,
  draft: ChatDocument,
  identity: { companyId: string; projectId: string },
  chapters: Record<string, string> = {},
) {
  const original = new Map(base.map((row) => [row.id, row]));
  const seedLines = new Map(seed.lines.map((row) => [row.id, row]));
  const ids = new Set<string>();
  if (
    base.some(
      (row) =>
        row.company_id !== identity.companyId ||
        row.progetto_id !== identity.projectId,
    )
  )
    throw new Error("Il computo non appartiene a questo preventivo e azienda.");
  if (
    draft.lines.length > 100 ||
    draft.lines.some((row) => !row.id || ids.has(row.id) || !ids.add(row.id))
  )
    throw new Error(
      "Identità duplicate o troppe voci. Nessuna modifica applicata.",
    );
  if (base.some((row) => !draft.lines.some((line) => line.id === row.id)))
    throw new Error(
      "Una voce originale manca dalla bozza: riapri la finestra prima di applicare.",
    );
  assertNoNewWizardOverlaps(seed, draft);
  assertConfirmedWizardChanges(seed, draft);
  const changes: WizardAiChange[] = [];
  const rows: NativeComputoRow[] = [];
  for (const line of draft.lines) {
    const old = original.get(line.id);
    const prior = seedLines.get(line.id);
    // An unchanged native row is never reinterpreted, including a zero/unfinished row.
    if (
      old &&
      prior &&
      JSON.stringify(prior) === JSON.stringify(line) &&
      (chapters[line.id] ?? old.capitolo_nome).trim() === old.capitolo_nome
    ) {
      rows.push(cloneWizardDraft(old));
      continue;
    }
    if (!line.included || line.supersededBy?.length) {
      if (old && !line.supersededBy?.length && chatLineIssue(line))
        throw new Error(
          `La voce esistente «${line.title}» è incompleta. Completala o ripristinala: un dato cancellato non deve eliminare la riga dal computo.`,
        );
      if (old)
        changes.push({
          id: line.id,
          title: old.descrizione,
          chapter: old.capitolo_nome,
          kind: "esclusione",
          before: {
            quantity: old.quantita,
            unit: old.unita_misura,
            price: old.prezzo_unitario,
          },
        });
      continue;
    }
    if (
      chatLineIssue(line) ||
      !Number.isFinite(line.quantity) ||
      !Number.isFinite(line.price) ||
      line.quantity! <= 0 ||
      line.price! <= 0 ||
      line.quantity! > 1e6 ||
      line.price! > 1e6
    )
      throw new Error(`Completa quantità e prezzo di «${line.title}».`);
    const unit = nativeComputoUnit(line.unit);
    if (!unit)
      throw new Error(
        `Unità «${line.unit}» non supportata dal computo: scegli un’unità valida, senza conversioni automatiche.`,
      );
    if (
      old &&
      unit !== old.unita_misura &&
      (old.costo_materiali || old.costo_manodopera || old.listino_voce_id)
    )
      throw new Error(
        `«${line.title}»: cambia l’unità nell’editor nativo e verifica prima costi e listino collegato.`,
      );
    const chapter = (
      chapters[line.id] ??
      old?.capitolo_nome ??
      suggestedComputoChapter(line.title)
    ).trim();
    if (!chapter || chapter.length > 200)
      throw new Error("Indica un capitolo valido per ogni voce.");
    // Titles and descriptions have separate excerpt limits in the AI protocol.
    // Renaming a row must not replace its complete native description with the excerpt.
    const changedDescription = !prior || prior.description !== line.description;
    const row: NativeComputoRow = {
      ...(old ?? {
        id: line.id,
        progetto_id: identity.projectId,
        company_id: identity.companyId,
        costo_materiali: 0,
        costo_manodopera: 0,
        sconto_pct: 0,
        listino_voce_id: null,
        fonte: wizardAiPriceSource(line),
      }),
      capitolo_nome: chapter,
      descrizione:
        old && prior?.title === line.title ? old.descrizione : line.title,
      descrizione_estesa:
        old && !changedDescription ? old.descrizione_estesa : line.description,
      unita_misura: unit,
      quantita: line.quantity!,
      prezzo_unitario: line.price!,
      ordine: rows.length,
      // Derived values must be recalculated by the native editor/save, not trusted from AI.
      importo: 0,
      margine_eur: 0,
      margine_pct: 0,
    };
    rows.push(row);
    changes.push({
      id: line.id,
      title: line.title,
      chapter,
      kind: old ? "modifica" : "aggiunta",
      ...(old
        ? {
            before: {
              quantity: old.quantita,
              unit: old.unita_misura,
              price: old.prezzo_unitario,
            },
          }
        : {}),
      after: {
        quantity: row.quantita,
        unit: row.unita_misura,
        price: row.prezzo_unitario,
      },
    });
  }
  return {
    rows: changes.length
      ? rows.map((row, index) => ({ ...row, ordine: index }))
      : rows,
    changes,
    pending: draft.lines.filter(
      (line) =>
        !original.has(line.id) && (!line.included || !!chatLineIssue(line)),
    ).length,
  };
}
