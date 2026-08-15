DROP POLICY IF EXISTS "Avatar images are readable" ON storage.objects;
DROP POLICY IF EXISTS "Screenshots are readable" ON storage.objects;

CREATE POLICY "Avatars readable by owner or for public profiles"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.username IS NOT NULL
    )
  )
);

CREATE POLICY "Screenshots readable by owner or when teardown is public"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'screenshots'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.teardowns t
      WHERE t.public = true
        AND t.screenshot_url = storage.objects.name
    )
  )
);