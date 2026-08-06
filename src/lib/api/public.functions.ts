import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export type PublicTeardownCard = {
  id: string;
  product_name: string;
  focus: string;
  created_at: string;
};

export const getPublicProfile = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ username: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const username = data.username.toLowerCase();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, bio, username")
      .ilike("username", username)
      .maybeSingle();
    if (error) throw new Error("Could not load this profile right now.");
    if (!profile) return { profile: null, teardowns: [] as PublicTeardownCard[] };

    const { data: teardowns } = await supabase
      .from("teardowns")
      .select("id, product_name, focus, created_at")
      .eq("user_id", profile.id)
      .eq("public", true)
      .order("created_at", { ascending: false });

    return { profile, teardowns: (teardowns ?? []) as PublicTeardownCard[] };
  });

export const getPublicTeardown = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { data: teardown } = await supabase
      .from("teardowns")
      .select("id, user_id, product_name, product_url, focus, notes, post, insights, sources, created_at")
      .eq("id", data.id)
      .eq("public", true)
      .maybeSingle();
    if (!teardown) return { teardown: null, author: null };

    const { data: author } = await supabase
      .from("profiles")
      .select("username, display_name, avatar_url")
      .eq("id", teardown.user_id)
      .maybeSingle();

    return { teardown, author };
  });
