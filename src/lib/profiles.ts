import { supabase } from "@/integrations/supabase/client";
import { normalizeUsername } from "./username";

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  username: string | null;
};

export async function getMyProfile(): Promise<Profile | null> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, bio, username")
    .eq("id", uid)
    .maybeSingle();
  if (error) throw new Error("Could not load your profile.");
  return (data as Profile) ?? null;
}

/** true when the username is free (or already owned by the current user). */
export async function isUsernameAvailable(username: string, currentUserId?: string) {
  const value = normalizeUsername(username);
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", value)
    .maybeSingle();
  if (error) throw new Error("Could not check that username.");
  if (!data) return true;
  return !!currentUserId && data.id === currentUserId;
}

export async function uploadAvatar(userId: string, file: File) {
  const ext = file.name.split(".").pop() ?? "png";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error("Avatar upload failed.");
  return path;
}

export async function updateMyProfile(patch: {
  display_name?: string | null;
  bio?: string | null;
  username?: string | null;
  avatar_url?: string | null;
}) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("You need to be signed in.");
  const { error } = await supabase.from("profiles").update(patch).eq("id", uid);
  if (error) {
    if (error.code === "23505") throw new Error("That username is already taken.");
    throw new Error("Could not save your profile. Please try again.");
  }
}
