-- 1. Aggiungere nuovo ruolo 'salesperson' all'enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'salesperson';

-- 2. Creare tabella venditori
CREATE TABLE public.salespeople (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    commission_type TEXT NOT NULL DEFAULT 'percentage_sold' CHECK (commission_type IN ('fixed', 'percentage_sold', 'percentage_collected')),
    commission_value NUMERIC NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indici per performance
CREATE INDEX idx_salespeople_company ON public.salespeople(company_id);
CREATE INDEX idx_salespeople_user ON public.salespeople(user_id);
CREATE INDEX idx_salespeople_active ON public.salespeople(company_id, is_active);

-- Trigger per updated_at
CREATE TRIGGER update_salespeople_updated_at
    BEFORE UPDATE ON public.salespeople
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- RLS per salespeople
ALTER TABLE public.salespeople ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their salespeople"
ON public.salespeople FOR ALL
USING (
    has_role(auth.uid(), 'company_admin'::app_role) AND 
    company_id = get_user_company_id(auth.uid())
);

CREATE POLICY "Salespeople can view themselves"
ON public.salespeople FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Super admins can manage all salespeople"
ON public.salespeople FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Staff can view salespeople if permitted"
ON public.salespeople FOR SELECT
USING (
    has_permission(auth.uid(), 'can_view_settings'::text) AND 
    company_id = get_user_company_id(auth.uid())
);

-- 3. Creare tabella provvigioni ordine
CREATE TABLE public.order_salespeople (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    salesperson_id UUID NOT NULL REFERENCES public.salespeople(id) ON DELETE CASCADE,
    commission_type TEXT NOT NULL CHECK (commission_type IN ('fixed', 'percentage_sold', 'percentage_collected')),
    commission_value NUMERIC NOT NULL DEFAULT 0,
    commission_amount NUMERIC NOT NULL DEFAULT 0,
    is_paid BOOLEAN NOT NULL DEFAULT false,
    paid_date DATE,
    payment_expected_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(order_id, salesperson_id)
);

-- Indici per performance
CREATE INDEX idx_order_salespeople_order ON public.order_salespeople(order_id);
CREATE INDEX idx_order_salespeople_salesperson ON public.order_salespeople(salesperson_id);
CREATE INDEX idx_order_salespeople_unpaid ON public.order_salespeople(salesperson_id, is_paid) WHERE is_paid = false;

-- RLS per order_salespeople
ALTER TABLE public.order_salespeople ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their order salespeople"
ON public.order_salespeople FOR ALL
USING (
    has_role(auth.uid(), 'company_admin'::app_role) AND
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_salespeople.order_id
        AND o.company_id = get_user_company_id(auth.uid())
    )
);

CREATE POLICY "Salespeople can view their commissions"
ON public.order_salespeople FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.salespeople s
        WHERE s.id = order_salespeople.salesperson_id
        AND s.user_id = auth.uid()
    )
);

CREATE POLICY "Super admins can manage all order salespeople"
ON public.order_salespeople FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Staff can view order salespeople if permitted"
ON public.order_salespeople FOR SELECT
USING (
    has_permission(auth.uid(), 'can_view_orders'::text) AND
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_salespeople.order_id
        AND o.company_id = get_user_company_id(auth.uid())
    )
);