import { supabase } from "@/integrations/supabase/client";

export type Insight = { type: "good" | "improve"; text: string };
export type Source = { url: string; title: string };

export type SavedTeardown = {
  id: string;
  user_id: string;
  product_name: string;
  product_url: string | null;
  focus: string;
  notes: string | null;
  screenshot_url: string | null;
  post: string;
  insights: Insight[];
  sources: Source[];
  public: boolean;
  created_at: string;
};

export const FOCUS_LABELS: Record<string, string> = {
  overall: "Overall product experience",
  onboarding: "Onboarding flow",
  retention: "Retention & engagement",
  ux: "UX & usability",
  notifications: "Notifications & nudges",
  monetization: "Monetization",
};

export async function uploadScreenshot(userId: string, file: File) {
  const ext = file.name.split(".").pop() ?? "png";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("screenshots").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error("Screenshot upload failed.");
  return path;
}

export async function saveTeardown(input: {
  productName: string;
  productUrl?: string | undefined;
  focus: string;
  notes?: string | undefined;
  screenshotFile?: File | undefined;
  post: string;
  insights: Insight[];
  sources: Source[];
}) {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("You need to be signed in to save teardowns.");
  const userId = userData.user.id;

  let screenshotPath: string | null = null;
  if (input.screenshotFile) {
    try {
      screenshotPath = await uploadScreenshot(userId, input.screenshotFile);
    } catch {
      screenshotPath = null;
    }
  }

  const { data, error } = await supabase
    .from("teardowns")
    .insert({
      user_id: userId,
      product_name: input.productName,
      product_url: input.productUrl ?? null,
      focus: input.focus,
      notes: input.notes || null,
      screenshot_url: screenshotPath,
      post: input.post,
      insights: input.insights,
      sources: input.sources,
    })
    .select("id")
    .single();

  if (error) throw new Error("Could not save this teardown. Please try again.");
  return data.id as string;
}

export async function listMyTeardowns(): Promise<SavedTeardown[]> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("You need to be signed in.");
  const { data, error } = await supabase
    .from("teardowns")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load your teardowns.");
  return (data ?? []) as unknown as SavedTeardown[];
}

export async function getMyTeardown(id: string): Promise<SavedTeardown | null> {
  const { data, error } = await supabase.from("teardowns").select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return (data as unknown as SavedTeardown) ?? null;
}

export async function updateTeardown(
  id: string,
  patch: {
    focus?: string;
    notes?: string | null;
    post?: string;
    screenshotFile?: File | undefined;
    removeScreenshot?: boolean;
  },
) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("You need to be signed in.");

  const update: Record<string, unknown> = {};
  if (patch.focus !== undefined) update["focus"] = patch.focus;
  if (patch.notes !== undefined) update["notes"] = patch.notes || null;
  if (patch.post !== undefined) update["post"] = patch.post;

  if (patch.screenshotFile) {
    update["screenshot_url"] = await uploadScreenshot(uid, patch.screenshotFile);
  } else if (patch.removeScreenshot) {
    update["screenshot_url"] = null;
  }

  const { error } = await supabase.from("teardowns").update(update).eq("id", id);
  if (error) throw new Error("Could not save your changes. Please try again.");
}

export async function setTeardownPublic(id: string, isPublic: boolean) {
  const { error } = await supabase.from("teardowns").update({ public: isPublic }).eq("id", id);
  if (error) throw new Error("Could not update visibility.");
}

export async function deleteTeardown(id: string) {
  const { error } = await supabase.from("teardowns").delete().eq("id", id);
  if (error) throw new Error("Could not delete this teardown.");
}
