ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles (lower(username));

DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are publicly viewable" ON public.profiles FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.profiles TO anon;

CREATE TABLE IF NOT EXISTS public.teardowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  product_url text,
  focus text NOT NULL DEFAULT 'overall',
  notes text,
  screenshot_url text,
  post text NOT NULL,
  insights jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teardowns TO authenticated;
GRANT SELECT ON public.teardowns TO anon;
GRANT ALL ON public.teardowns TO service_role;

ALTER TABLE public.teardowns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public teardowns are viewable by everyone" ON public.teardowns FOR SELECT TO anon, authenticated USING (public = true);
CREATE POLICY "Owners can view their own teardowns" ON public.teardowns FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners can insert their own teardowns" ON public.teardowns FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners can update their own teardowns" ON public.teardowns FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners can delete their own teardowns" ON public.teardowns FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS teardowns_user_id_created_at_idx ON public.teardowns (user_id, created_at DESC);

CREATE TRIGGER teardowns_set_updated_at BEFORE UPDATE ON public.teardowns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();