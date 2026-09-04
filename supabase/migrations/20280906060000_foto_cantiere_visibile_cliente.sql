-- ════════════════════════════════════════════════════════════════════════════
-- foto_cantiere: la colonna che mancava per poterla aprire al committente
-- ════════════════════════════════════════════════════════════════════════════
--
-- Chiudendo l'accesso dei clienti avevo lasciato `foto_cantiere` senza alcuna
-- policy di lettura per loro, e avevo scritto perché: non c'è modo di
-- distinguere la foto da mostrare al committente da quella scattata per un
-- infortunio, un difetto o una contestazione. Inventare lì una regola di
-- visibilità sarebbe stato peggio che tenere la porta chiusa.
--
-- La colonna però posso aggiungerla io, e senza rischi: nasce a `false`, così
-- nel momento in cui esiste non rende visibile niente. Il portale committente
-- resta chiuso finché qualcuno non decide, foto per foto, cosa mostrare.
-- È lo stesso schema che `giornale_lavori` usa già con `visibile_cliente`.
ALTER TABLE public.foto_cantiere
  ADD COLUMN IF NOT EXISTS visibile_cliente boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.foto_cantiere.visibile_cliente IS
  'Se la foto si mostra al committente. Nasce false di proposito: una foto di cantiere può documentare un infortunio o un difetto, e il committente non deve vederla per il solo fatto che riguarda la sua commessa.';

-- Un indice sul caso che il portale interrogherà davvero.
CREATE INDEX IF NOT EXISTS idx_foto_cantiere_ordine_visibili
  ON public.foto_cantiere (order_id)
  WHERE visibile_cliente;

-- Ora la policy si può scrivere, e dice due cose insieme: la foto è di una
-- commessa del cliente, ED è stata marcata come mostrabile.
DROP POLICY IF EXISTS foto_cantiere_cliente_select ON public.foto_cantiere;
CREATE POLICY foto_cantiere_cliente_select ON public.foto_cantiere
  FOR SELECT TO authenticated
  USING (
    visibile_cliente IS TRUE
    AND EXISTS (SELECT 1 FROM public.orders o
                 WHERE o.id = foto_cantiere.order_id
                   AND o.customer_id = (SELECT auth.uid()))
  );

COMMENT ON TABLE public.foto_cantiere IS
  'Foto di cantiere. I clienti vedono solo quelle delle proprie commesse marcate visibile_cliente: la colonna nasce false, quindi aprire una foto al committente è sempre un gesto esplicito.';
