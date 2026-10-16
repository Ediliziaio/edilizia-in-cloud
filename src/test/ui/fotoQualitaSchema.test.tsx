import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({select:vi.fn(),invoke:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>{
  const q={select:(s:string)=>{mocks.select(s);return q;},eq:()=>q,maybeSingle:async()=>({data:{id:'f',ai_qualita_score:8,ai_qualita_livello:'buono',ai_dpi_compliance:{},ai_problemi:[] as string[],ai_riassunto:'Foto già analizzata',ai_analyzed_at:'2026-10-16'},error:null as null})};return q;
},functions:{invoke:mocks.invoke}}}));
import { FotoAIQualityBadge } from '@/components/foto-cantiere/FotoAIQualityBadge';
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('foto: nomi schema reali, nessuna AI ripetuta',()=>{
  it('legge i risultati esistenti con alias senza rilanciare AI',async()=>{
    render(<QueryClientProvider client={new QueryClient()}><FotoAIQualityBadge fotoId="f" companyId="c"/></QueryClientProvider>);
    await screen.findByText(/8/);
    expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining('ai_problemi:ai_problemi_rilevati'));
    expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining('ai_analyzed_at:ai_analizzata_at'));
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
