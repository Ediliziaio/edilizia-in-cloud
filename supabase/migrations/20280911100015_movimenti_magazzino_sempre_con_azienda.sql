-- Trovato provando la purga su TUTTE le aziende, non su una sola: venti
-- passavano, Demo Azienda S.r.l. no. Vale la pena raccontare perche', perche'
-- e' un difetto che si ripresenta.
--
-- Delle quindici tabelle portate a CASCADE nella …009, `warehouse_movements`
-- e' l'unica con `company_id` NULLABLE. Sedici movimenti su 124 ce l'avevano
-- nullo: il cascade dell'azienda non li raggiunge — non hanno azienda — quindi
-- sopravvivono, e quando la purga cancella l'articolo di magazzino a cui
-- puntano si becca
--     "update or delete on warehouse_stock violates foreign key constraint
--      warehouse_movements_stock_item_id_fkey".
-- Cioe': una riga senza azienda in una tabella "di possesso" e' invisibile al
-- cascade e blocca tutto dall'esterno. Ovunque `company_id` sia nullable, la
-- CASCADE e' una promessa che non copre tutte le righe.
--
-- All'origine ci sono due funzioni che inseriscono il movimento senza dire di
-- chi e': `create_order_atomic` e `trg_auto_deduct_stock`. Non le tocco —
-- `create_order_atomic` e' in mano a un'altra sessione in questo momento — e
-- la cosa si risolve meglio a destinazione: un trigger che completa il dato
-- da solo copre anche i percorsi che passano da PostgREST e quelli che
-- verranno. L'azienda si legge dall'articolo di magazzino, che ce l'ha NOT
-- NULL: il movimento e' per definizione dell'azienda dello stock che muove.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ── Il dato mancante, preso da dove non puo' mancare ────────────────────────
UPDATE public.warehouse_movements m
   SET company_id = s.company_id
  FROM public.warehouse_stock s
 WHERE s.id = m.stock_item_id
   AND m.company_id IS NULL;

-- ── E la garanzia che non si ripresenti ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.warehouse_movements_completa_azienda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  SELECT s.company_id INTO NEW.company_id
    FROM public.warehouse_stock s
   WHERE s.id = NEW.stock_item_id;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_warehouse_movements_completa_azienda ON public.warehouse_movements;
CREATE TRIGGER trg_warehouse_movements_completa_azienda
  BEFORE INSERT ON public.warehouse_movements
  FOR EACH ROW WHEN (NEW.company_id IS NULL)
  EXECUTE FUNCTION public.warehouse_movements_completa_azienda();

-- Ora la colonna puo' allinearsi alle altre quattordici. Il trigger gira
-- prima del vincolo, quindi i due percorsi che oggi non passano l'azienda
-- continuano a funzionare: il dato glielo mette il database.
ALTER TABLE public.warehouse_movements ALTER COLUMN company_id SET NOT NULL;
