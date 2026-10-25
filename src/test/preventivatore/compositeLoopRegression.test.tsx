import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { latestQuoteConversationAssistant } from '@/lib/preventivi/quoteChoiceState';
import { quoteLineOverlaps, replaceQuoteLine } from '@/lib/preventivi/quoteLineDuplicates';
import { QuoteChatChoices } from '@/components/quotes/dev/QuoteChatChoices';
import { localSnapshot } from './localPlanFixtures';
afterEach(cleanup);
it('un avviso diagnostico non disabilita una scelta della conversazione corrente', () => {
  const messages = [{ role: 'user' as const }, { role: 'assistant' as const }, { role: 'assistant' as const, diagnostic: true }];
  expect(latestQuoteConversationAssistant(messages)).toBe(1);
  render(<QuoteChatChoices choices={[{ id: 'esterna', label: 'Cassetta esterna', reply: 'Scelgo cassetta esterna' }]} active={latestQuoteConversationAssistant(messages) === 1} busy={false} onChoose={vi.fn()} onCustomize={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Cassetta esterna' })).toBeEnabled();
  expect(latestQuoteConversationAssistant([...messages, { role: 'user' }])).toBe(-1);
});
it('sostituisce un impianto generico con dettagli ma non inserisce il comando WC nell’elettrico', () => {
  const doc = localSnapshot().document, base = doc.lines[0];
  doc.lines = ['Elettrico nuovo bagno', 'Prese elettriche', 'Punti luce', 'Comando luce', 'Cassetta WC con comando'].map((title, n) => ({ ...base, id: `r${n}`, title, included: false }));
  const group = quoteLineOverlaps(doc).find(g => g.parentId === 'r0');
  expect(group?.childIds).toEqual(['r1', 'r2', 'r3']);
  const next = replaceQuoteLine(doc, 'r0', group!.childIds, doc.revision);
  expect(next.lines[0].supersededBy).toEqual(['r1', 'r2', 'r3']); expect(next.lines[4].supersededBy).toBeUndefined();
  expect(() => replaceQuoteLine(next, 'r0', group!.childIds, doc.revision)).toThrow();
});
it('montaggi separati non archiviano le forniture WC e bidet', () => {
  const doc = localSnapshot().document, base = doc.lines[0];
  doc.lines = ['Montaggio e collegamento sanitari', 'Fornitura WC', 'Fornitura bidet', 'Montaggio WC', 'Montaggio bidet', 'Montaggio lavabo', 'Montaggio piatto doccia con box'].map((title, n) => ({ ...base, id: `r${n}`, title }));
  expect(quoteLineOverlaps(doc).find(g => g.parentId === 'r0')?.childIds).toEqual(['r3', 'r4', 'r5', 'r6']);
});
