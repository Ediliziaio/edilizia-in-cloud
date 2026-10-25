import type { LocalQuoteSnapshot, LocalDraftScope } from "@/lib/preventivi/localQuoteMemory";
import { emptyChatDocument, applyChatResult } from "@/lib/preventivi/quoteChatDocument";
import { confirmPlanRectangle, planCandidates, type PlanAttachment, type PlanReading } from "@/lib/preventivi/planReading";
import { planWorksResult } from "@/lib/preventivi/planChat";
export const memoryScope: LocalDraftScope = { ownerId: "a2000000-0000-4000-a000-000000000001", companyId: "d2000000-0000-4000-a000-000000000002", mode: "plan" };
export const reading: PlanReading = { version: 1, engine: "Apple Vision locale", page: 1, pages: 2, width: 1200, height: 900,
  lines: ["letto", "•4.61", "4,25", "wc", "letto", "(+0,80m)", "1:100", "- 3.90-"].map((text, i) => ({ text, confidence: .9, bbox: [.1, i * .1, .1, .03] })) };
export const plan: PlanAttachment = { id: "a".repeat(64), name: "pianta.jpg", mime: "image/jpeg", size: 3, reading };
export const room = planCandidates(reading).rooms[0];
export const rectangle = confirmPlanRectangle("confermo rettangolo 4,61 x 4,25 m", room.id, reading)!;
export const turnId = "b2000000-0000-4000-a000-000000000001";
export function localSnapshot(): LocalQuoteSnapshot {
  const empty = emptyChatDocument();
  const result = planWorksResult(empty, plan, room, rectangle, "rifai pavimento e tinteggiatura", turnId)!;
  return { version: 1, document: applyChatResult(empty, result, turnId, null).document,
    messages: [{ role: "user", text: "Il mio progetto" }, { role: "assistant", text: "Misure da confermare", actions: ["Rifai pavimento"] }],
    input: "Messaggio non ancora inviato", sessionId: turnId, sourceId: null, model: reading.engine, interrupted: false, plan, rooms: planCandidates(reading).rooms, selectedRoom: room.id, rectangle };
}
