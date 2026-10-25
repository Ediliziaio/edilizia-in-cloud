/** Release UX only. JWT, tenant membership, edit permission and company credit
 * are checked independently by the backend before each paid operation.
 * The laboratory remains restricted by localSimulation.ts.
 */
export function consentiPreventivoConversazionale(companyId: string | null | undefined): boolean {
  return import.meta.env.VITE_QUOTE_CHAT_ENABLED !== 'false'
    && typeof companyId === 'string'
    && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(companyId);
}

export const quoteChatReleaseFlag = () => import.meta.env.VITE_QUOTE_CHAT_ENABLED ?? 'true';
