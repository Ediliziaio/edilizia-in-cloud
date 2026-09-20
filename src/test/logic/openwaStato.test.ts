import { describe, expect, it } from "vitest";
import { mappaStatoOpenWa, statoGrezzoDaPayload } from "../../../supabase/functions/_shared/openwaStato";

describe("statoGrezzoDaPayload", () => {
  it("legge lo stato anche quando il gateway lo mette dentro data (il bug del 12/09)", () => {
    expect(statoGrezzoDaPayload({ event: "session.status", data: { sessionId: "x", status: "ready" } })).toBe("ready");
  });

  it("legge le altre forme note", () => {
    expect(statoGrezzoDaPayload({ status: "CONNECTED" })).toBe("connected");
    expect(statoGrezzoDaPayload({ state: "DISCONNECTED" })).toBe("disconnected");
    expect(statoGrezzoDaPayload({ payload: { status: "ready" } })).toBe("ready");
    expect(statoGrezzoDaPayload({ session: { state: "opening" } })).toBe("opening");
  });

  it("payload senza stato → stringa vuota (e chi chiama non deve toccare nulla)", () => {
    expect(statoGrezzoDaPayload({ event: "message.ack", data: { id: "abc" } })).toBe("");
    expect(statoGrezzoDaPayload({})).toBe("");
  });
});

describe("mappaStatoOpenWa", () => {
  it("riconosce i connessi", () => {
    for (const s of ["ready", "connected", "authenticated", "open", "inchat", "online", "WORKING"]) {
      expect(mappaStatoOpenWa(s)).toBe("connected");
    }
  });

  it("«disconnected» non viene scambiato per «connected»", () => {
    expect(mappaStatoOpenWa("disconnected")).toBe("disconnected");
    expect(mappaStatoOpenWa("unpaired")).toBe("disconnected");
    expect(mappaStatoOpenWa("logged_out")).toBe("disconnected");
    expect(mappaStatoOpenWa("CONFLICT")).toBe("disconnected");
  });

  it("il ban vince su tutto", () => {
    expect(mappaStatoOpenWa("banned")).toBe("banned");
    expect(mappaStatoOpenWa("ban_detected")).toBe("banned");
  });

  it("gli stati di transito restano transito", () => {
    for (const s of ["connecting", "opening", "pairing", "qr", "syncing", "reconnecting"]) {
      expect(mappaStatoOpenWa(s)).toBe("connecting");
    }
  });

  it("«qr_ready» è un numero che aspetta il QR, non uno stato sconosciuto (20/09)", () => {
    // Il gateway lo manda così, anche maiuscolo e dentro data.
    expect(mappaStatoOpenWa("qr_ready")).toBe("connecting");
    expect(mappaStatoOpenWa("QR_READY")).toBe("connecting");
    expect(mappaStatoOpenWa(statoGrezzoDaPayload({ event: "session.status", data: { status: "qr_ready" } }))).toBe("connecting");
  });

  it("stato sconosciuto o vuoto → null: il numero NON si tocca", () => {
    expect(mappaStatoOpenWa("")).toBe(null);
    expect(mappaStatoOpenWa("sent")).toBe(null);
    expect(mappaStatoOpenWa("delivered")).toBe(null);
    expect(mappaStatoOpenWa("qualcosa_di_nuovo")).toBe(null);
  });
});
