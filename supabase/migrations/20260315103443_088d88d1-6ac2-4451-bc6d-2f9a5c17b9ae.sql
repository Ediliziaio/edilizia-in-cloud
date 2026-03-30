-- 1. Enum tipo agente
DO $$ BEGIN
  DO $$ BEGIN
  CREATE TYPE tipo_agente_enum AS ENUM ('vocale','chat','whatsapp','interno','campagna');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
