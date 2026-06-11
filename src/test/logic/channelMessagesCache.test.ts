/**
 * Test fix 2026-06: cache React Query condivisa InternalChat ↔ SilvioChatSheet.
 * Il crash "liveMessages.map is not a function" nasceva da shape incompatibili
 * sulla stessa entry ({items, hasOlder} vs array nudo). I reader devono
 * tollerare ENTRAMBE le shape; l'upsert deve sempre normalizzare alla canonica.
 */
import { describe, expect, it } from "vitest";
import {
  channelMessagesQueryKey,
  readChannelMessagesHasOlder,
  readChannelMessagesItems,
  upsertChannelMessage,
  type ChannelMessagesCache,
} from "@/lib/chat/channelMessagesCache";

type Msg = { id: string; content: string };

const m = (id: string, content = ""): Msg => ({ id, content });

describe("channelMessagesQueryKey", () => {
  it("è identica alla chiave storica usata da entrambi i componenti", () => {
    expect(channelMessagesQueryKey("ch1")).toEqual(["internal-chat-messages", "ch1"]);
    expect(channelMessagesQueryKey(null)).toEqual(["internal-chat-messages", null]);
  });
});

describe("readChannelMessagesItems", () => {
  it("legge la shape canonica { items, hasOlder }", () => {
    const cache: ChannelMessagesCache<Msg> = { items: [m("a")], hasOlder: true };
    expect(readChannelMessagesItems(cache)).toEqual([m("a")]);
  });

  it("tollera la shape legacy (array nudo scritto da chunk pre-fix)", () => {
    expect(readChannelMessagesItems<Msg>([m("a"), m("b")])).toEqual([m("a"), m("b")]);
  });

  it("ritorna [] per cache assente o malformata (MAI .map su non-array)", () => {
    expect(readChannelMessagesItems(undefined)).toEqual([]);
    expect(readChannelMessagesItems(null)).toEqual([]);
    // items non-array (corruzione): non deve propagare
    expect(readChannelMessagesItems({ items: "boom" as unknown as Msg[], hasOlder: false })).toEqual([]);
  });
});

describe("readChannelMessagesHasOlder", () => {
  it("legge hasOlder dalla shape canonica", () => {
    expect(readChannelMessagesHasOlder({ items: [], hasOlder: true })).toBe(true);
    expect(readChannelMessagesHasOlder({ items: [], hasOlder: false })).toBe(false);
  });

  it("ritorna undefined per shape legacy o cache assente", () => {
    expect(readChannelMessagesHasOlder<Msg>([m("a")])).toBeUndefined();
    expect(readChannelMessagesHasOlder(undefined)).toBeUndefined();
  });
});

describe("upsertChannelMessage", () => {
  it("appende un messaggio nuovo preservando hasOlder", () => {
    const prev: ChannelMessagesCache<Msg> = { items: [m("a")], hasOlder: true };
    const next = upsertChannelMessage(prev, m("b"));
    expect(next.items.map((x) => x.id)).toEqual(["a", "b"]);
    expect(next.hasOlder).toBe(true);
  });

  it("sostituisce in-place un messaggio esistente (streaming UPDATE)", () => {
    const prev: ChannelMessagesCache<Msg> = { items: [m("a", "ciao"), m("b")], hasOlder: false };
    const next = upsertChannelMessage(prev, m("a", "ciao mondo"));
    expect(next.items.map((x) => x.id)).toEqual(["a", "b"]);
    expect(next.items[0].content).toBe("ciao mondo");
  });

  it("normalizza ('heal') la shape legacy alla canonica", () => {
    const next = upsertChannelMessage<Msg>([m("a")], m("b"));
    expect(Array.isArray(next)).toBe(false);
    expect(next.items.map((x) => x.id)).toEqual(["a", "b"]);
    expect(next.hasOlder).toBe(false); // sconosciuto su legacy → prudente
  });

  it("parte da cache vuota senza crash", () => {
    const next = upsertChannelMessage<Msg>(undefined, m("a"));
    expect(next).toEqual({ items: [m("a")], hasOlder: false });
  });
});
