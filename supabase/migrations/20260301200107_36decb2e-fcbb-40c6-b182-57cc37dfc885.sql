-- Create platform_announcements table
CREATE TABLE IF NOT EXISTS public.platform_announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'banner' CHECK (type IN ('banner', 'changelog', 'maintenance')),
  target_status TEXT NOT NULL DEFAULT 'all' CHECK (target_status IN ('all', 'trial', 'active')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id)
);
