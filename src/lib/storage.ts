import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, string>();

/** Resolves a storage object path in a private bucket to a temporary signed URL. */
export async function signedUrl(bucket: string, path: string | null | undefined) {
  if (!path) return null;
  const key = `${bucket}/${path}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  cache.set(key, data.signedUrl);
  return data.signedUrl;
}

export function isRemoteUrl(value: string | null | undefined) {
  return !!value && /^https?:\/\//.test(value);
}

/** Avatars may be an external OAuth URL or a storage path. */
export async function resolveAvatar(value: string | null | undefined) {
  if (!value) return null;
  if (isRemoteUrl(value)) return value;
  return signedUrl("avatars", value);
}
