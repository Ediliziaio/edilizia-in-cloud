-- Enum per ruoli applicazione
CREATE TYPE public.app_role AS ENUM ('super_admin', 'company_admin', 'customer');

-- Enum per settori azienda (per template stati ordine)
CREATE TYPE public.company_sector AS ENUM (
  'serramenti',
  'infissi', 
  'bagni',
  'tetti',
  'fotovoltaico',
  'pittura',
  'ristrutturazioni',
  'altro'
);

-- Enum per stati ticket
CREATE TYPE public.ticket_status AS ENUM ('aperto', 'in_lavorazione', 'risolto');

-- Tabella aziende
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  sector public.company_sector NOT NULL DEFAULT 'altro',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabella profili utenti (collegata a auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabella ruoli utenti (separata per sicurezza)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Tabella stati ordine personalizzabili per azienda
CREATE TABLE public.order_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'circle',
  color TEXT NOT NULL DEFAULT '#2563EB',
  position INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabella ordini
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_status_id UUID REFERENCES public.order_statuses(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  deposit_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  balance_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  expected_date DATE,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabella storico cambi stato ordine
CREATE TABLE public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status_id UUID NOT NULL REFERENCES public.order_statuses(id) ON DELETE CASCADE,
  changed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabella ticket assistenza
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status public.ticket_status NOT NULL DEFAULT 'aperto',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabella messaggi ticket
CREATE TABLE public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to get user's company_id
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.profiles
  WHERE id = _user_id
$$;

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for companies
CREATE POLICY "Super admins can do everything with companies"
  ON public.companies FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company admins can view their own company"
  ON public.companies FOR SELECT
  TO authenticated
  USING (id = public.get_user_company_id(auth.uid()));

-- RLS Policies for profiles
CREATE POLICY "Super admins can do everything with profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Company admins can view profiles in their company"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'company_admin') 
    AND company_id = public.get_user_company_id(auth.uid())
  );

CREATE POLICY "Company admins can manage profiles in their company"
  ON public.profiles FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'company_admin') 
    AND company_id = public.get_user_company_id(auth.uid())
  );

-- RLS Policies for user_roles
CREATE POLICY "Super admins can manage all roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for order_statuses
CREATE POLICY "Super admins can manage all order statuses"
  ON public.order_statuses FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company admins can manage their order statuses"
  ON public.order_statuses FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'company_admin') 
    AND company_id = public.get_user_company_id(auth.uid())
  );

CREATE POLICY "Customers can view their company order statuses"
  ON public.order_statuses FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- RLS Policies for orders
CREATE POLICY "Super admins can manage all orders"
  ON public.orders FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company admins can manage their company orders"
  ON public.orders FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'company_admin') 
    AND company_id = public.get_user_company_id(auth.uid())
  );

CREATE POLICY "Customers can view their own orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid());

-- RLS Policies for order_status_history
CREATE POLICY "Super admins can manage all order history"
  ON public.order_status_history FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company admins can manage their order history"
  ON public.order_status_history FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'company_admin') 
    AND EXISTS (
      SELECT 1 FROM public.orders o 
      WHERE o.id = order_id 
      AND o.company_id = public.get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "Customers can view their order history"
  ON public.order_status_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o 
      WHERE o.id = order_id 
      AND o.customer_id = auth.uid()
    )
  );

-- RLS Policies for tickets
CREATE POLICY "Super admins can manage all tickets"
  ON public.tickets FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company admins can manage their company tickets"
  ON public.tickets FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'company_admin') 
    AND company_id = public.get_user_company_id(auth.uid())
  );

CREATE POLICY "Customers can manage their own tickets"
  ON public.tickets FOR ALL
  TO authenticated
  USING (customer_id = auth.uid());

-- RLS Policies for ticket_messages
CREATE POLICY "Super admins can manage all ticket messages"
  ON public.ticket_messages FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company admins can manage their ticket messages"
  ON public.ticket_messages FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'company_admin') 
    AND EXISTS (
      SELECT 1 FROM public.tickets t 
      WHERE t.id = ticket_id 
      AND t.company_id = public.get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "Customers can manage their ticket messages"
  ON public.ticket_messages FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t 
      WHERE t.id = ticket_id 
      AND t.customer_id = auth.uid()
    )
  );

-- Create indexes for performance
CREATE INDEX idx_profiles_company_id ON public.profiles(company_id);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_order_statuses_company_id ON public.order_statuses(company_id);
CREATE INDEX idx_order_statuses_position ON public.order_statuses(company_id, position);
CREATE INDEX idx_orders_company_id ON public.orders(company_id);
CREATE INDEX idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX idx_orders_status_id ON public.orders(current_status_id);
CREATE INDEX idx_order_history_order_id ON public.order_status_history(order_id);
CREATE INDEX idx_tickets_company_id ON public.tickets(company_id);
CREATE INDEX idx_tickets_customer_id ON public.tickets(customer_id);
CREATE INDEX idx_ticket_messages_ticket_id ON public.ticket_messages(ticket_id);