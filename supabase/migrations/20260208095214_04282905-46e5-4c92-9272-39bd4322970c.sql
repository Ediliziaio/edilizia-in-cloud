-- =============================================
-- Fase 1: Aggiungere colonna user_id a employees
-- =============================================

-- Aggiungere collegamento dipendente-utente
ALTER TABLE public.employees ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Indice per ricerca veloce
CREATE INDEX idx_employees_user_id ON public.employees(user_id);

-- =============================================
-- Fase 2: Aggiungere ruolo "employee" all'enum
-- =============================================

-- Aggiungere valore all'enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'employee';

-- =============================================
-- Fase 3: Creare tabella work_logs
-- =============================================

CREATE TABLE public.work_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    work_date DATE NOT NULL,
    hours_worked NUMERIC NOT NULL DEFAULT 0 CHECK (hours_worked >= 0 AND hours_worked <= 24),
    description TEXT,
    activity_type TEXT DEFAULT 'lavoro',
    is_approved BOOLEAN DEFAULT false,
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    
    -- Vincolo: un dipendente può avere un solo log per giorno
    UNIQUE(employee_id, work_date)
);

-- Indici per ricerche veloci
CREATE INDEX idx_work_logs_employee_date ON public.work_logs(employee_id, work_date);
CREATE INDEX idx_work_logs_order ON public.work_logs(order_id);
CREATE INDEX idx_work_logs_is_approved ON public.work_logs(is_approved);

-- =============================================
-- Fase 4: RLS Policies per work_logs
-- =============================================

ALTER TABLE public.work_logs ENABLE ROW LEVEL SECURITY;

-- I dipendenti possono gestire i propri rapportini
CREATE POLICY "Employees can manage their own work logs"
ON public.work_logs FOR ALL
USING (
    employee_id IN (
        SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
);

-- Super admin può gestire tutti i work logs
CREATE POLICY "Super admins can manage all work logs"
ON public.work_logs FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Company admin può gestire i work logs della propria azienda
CREATE POLICY "Company admins can manage their work logs"
ON public.work_logs FOR ALL
USING (
    has_role(auth.uid(), 'company_admin'::app_role) AND
    EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = work_logs.employee_id
        AND e.company_id = get_user_company_id(auth.uid())
    )
);

-- Company staff con permesso can_view_employees può visualizzare
CREATE POLICY "Staff can view work logs if permitted"
ON public.work_logs FOR SELECT
USING (
    has_permission(auth.uid(), 'can_view_employees') AND
    EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = work_logs.employee_id
        AND e.company_id = get_user_company_id(auth.uid())
    )
);

-- =============================================
-- Fase 5: Trigger per updated_at
-- =============================================

CREATE TRIGGER update_work_logs_updated_at
BEFORE UPDATE ON public.work_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- Fase 6: Aggiornare RLS di employees per employee role
-- =============================================

-- I dipendenti possono vedere il proprio profilo
CREATE POLICY "Employees can view their own profile"
ON public.employees FOR SELECT
USING (user_id = auth.uid());

-- Staff con permesso può vedere i dipendenti
CREATE POLICY "Staff can view employees if permitted"
ON public.employees FOR SELECT
USING (
    has_permission(auth.uid(), 'can_view_employees') AND
    company_id = get_user_company_id(auth.uid())
);