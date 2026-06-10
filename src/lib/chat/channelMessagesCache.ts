/**
 * channelMessagesCache — shape CANONICA della cache React Query condivisa
 * tra InternalChat (Chat Team) e SilvioChatSheet per i messaggi canale:
 * queryKey ["internal-chat-messages", channelId].
 *
 * La condivisione del queryKey è VOLUTA (stessa conversazione, sync realtime,
 * nessun doppio fetch riaprendo la sheet). Fino al fix 2026-06 però i due
 * componenti scrivevano shape DIVERSE sulla stessa entry:
 *   - InternalChat:    { items: Message[], hasOlder: boolean }
 *   - SilvioChatSheet: SilvioMessage[]  (array nudo)
 * Risultato: aprendo la sheet dopo Chat Team sullo stesso canale,
 * `liveMessages.map is not a function` → crash della sheet (e viceversa
 * Chat Team vedeva la chat vuota dopo l'uso della sheet).
 *
 * REGOLA: chiunque scriva su questa cache usa la shape { items, hasOlder }.
 * In lettura usare i reader qui sotto, che tollerano la shape legacy (array
 * nudo) ancora possibile con chunk vecchi in cache browser durante un deploy.
 */

export interface ChannelMessagesCache<TMsg> {
  items: TMsg[];
  hasOlder: boolean;
}

/** Valore che può trovarsi in cache: canonico, legacy (array) o assente. */
export type ChannelMessagesCacheInput<TMsg> =
  | ChannelMessagesCache<TMsg>
  | TMsg[]
  | null
  | undefined;

export function channelMessagesQueryKey(channelId: string | null | undefined) {
  return ["internal-chat-messages", channelId] as const;
}

/** Estrae SEMPRE un array di messaggi, qualunque sia la shape in cache. */
export function readChannelMessagesItems<TMsg>(data: ChannelMessagesCacheInput<TMsg>): TMsg[] {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.items) ? data.items : [];
}

/** hasOlder dalla cache; undefined se assente o shape legacy. */
export function readChannelMessagesHasOlder<TMsg>(
  data: ChannelMessagesCacheInput<TMsg>,
): boolean | undefined {
  if (data == null || Array.isArray(data)) return undefined;
  return typeof data.hasOlder === "boolean" ? data.hasOlder : undefined;
}

/**
 * Upsert di un messaggio (INSERT/UPDATE realtime) preservando hasOlder.
 * Normalizza sempre alla shape canonica ("heal" della shape legacy).
 */
export function upsertChannelMessage<TMsg extends { id: string }>(
  prev: ChannelMessagesCacheInput<TMsg>,
  msg: TMsg,
): ChannelMessagesCache<TMsg> {
  const items = readChannelMessagesItems(prev);
  const hasOlder = readChannelMessagesHasOlder(prev) ?? false;
  const idx = items.findIndex((m) => m.id === msg.id);
  if (idx === -1) return { items: [...items, msg], hasOlder };
  const next = items.slice();
  next[idx] = msg;
  return { items: next, hasOlder };
}
