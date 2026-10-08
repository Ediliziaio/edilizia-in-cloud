/** Safe to retry the webhook: no inbound reservation means no AI/tool was dispatched. */
export class WhatsAppReservationError extends Error {
  constructor(message: string) { super(message); this.name = "WhatsAppReservationError"; }
}
