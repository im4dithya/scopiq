DROP POLICY IF EXISTS "Profiles are publicly viewable" ON public.profiles;

CREATE POLICY "Published profiles are viewable by everyone"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (username IS NOT NULL);

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);