import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/components/AppNav";
import { getMyProfile, isUsernameAvailable, updateMyProfile, uploadAvatar } from "@/lib/profiles";
import { normalizeUsername, validateUsername } from "@/lib/username";
import { resolveAvatar } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (s: Record<string, unknown>) => ({ onboarding: s["onboarding"] === "1" }),
  head: () => ({
    meta: [
      { title: "Profile settings — Teardown Canvas" },
      { name: "description", content: "Edit your display name, username, bio and avatar." },
      { property: "og:title", content: "Profile settings — Teardown Canvas" },
      { property: "og:description", content: "Manage your Teardown Canvas public profile." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

type Status = "idle" | "checking" | "available" | "taken" | "invalid";

function SettingsPage() {
  const navigate = useNavigate();
  const { onboarding } = useSearch({ from: "/_authenticated/settings" });

  const [loaded, setLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [username, setUsername] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const initialUsername = useRef<string>("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (alive) setUserId(data.user?.id ?? null);
        const p = await getMyProfile();
        if (!alive) return;
        setDisplayName(p?.display_name ?? "");
        setBio(p?.bio ?? "");
        setUsername(p?.username ?? "");
        initialUsername.current = p?.username ?? "";
        setAvatarPath(p?.avatar_url ?? null);
        setAvatarPreview(await resolveAvatar(p?.avatar_url));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load your profile.");
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Real-time username availability check (debounced).
  useEffect(() => {
    const value = normalizeUsername(username);
    if (!value || value === initialUsername.current) {
      setStatus("idle");
      setStatusMsg(null);
      return;
    }
    const invalid = validateUsername(value);
    if (invalid) {
      setStatus("invalid");
      setStatusMsg(invalid);
      return;
    }
    setStatus("checking");
    setStatusMsg("Checking availability…");
    const t = setTimeout(async () => {
      try {
        const free = await isUsernameAvailable(value, userId ?? undefined);
        setStatus(free ? "available" : "taken");
        setStatusMsg(free ? `${value} is available.` : "That username is already taken.");
      } catch {
        setStatus("idle");
        setStatusMsg("Could not check that username right now.");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [username, userId]);

  async function onAvatarChange(file: File) {
    if (!userId) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Use a PNG, JPG or WEBP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Avatar must be under 2MB.");
      return;
    }
    try {
      const path = await uploadAvatar(userId, file);
      setAvatarPath(path);
      setAvatarPreview(URL.createObjectURL(file));
      toast.success("Avatar uploaded. Don't forget to save.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Avatar upload failed.");
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    const value = normalizeUsername(username);
    const invalid = validateUsername(value);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    if (status === "taken") {
      toast.error("That username is already taken.");
      return;
    }
    setSaving(true);
    try {
      await updateMyProfile({
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        username: value,
        avatar_url: avatarPath,
      });
      initialUsername.current = value;
      toast.success("Profile saved.");
      if (onboarding) void navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="teardown-bg min-h-screen px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-[620px]">
        <AppNav />

        <header className="mb-8">
          <div className="eyebrow">{onboarding ? "One last step" : "Account"}</div>
          <h1 className="display-h1 mt-3 text-4xl">
            {onboarding ? "Pick your username" : "Profile settings"}
          </h1>
          <p className="mono-sub mt-3">
            Your username is your public portfolio URL: /u/{normalizeUsername(username) || "yourname"}
          </p>
        </header>

        {!loaded ? (
          <div className="glass-card p-6">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton mt-3 h-11 w-full" />
            <div className="skeleton mt-6 h-4 w-24" />
            <div className="skeleton mt-3 h-11 w-full" />
            <div className="skeleton mt-6 h-11 w-full" />
          </div>
        ) : (
          <form onSubmit={onSave} className="glass-card p-6">
            <div className="mb-6 flex items-center gap-4">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Your avatar"
                  className="h-16 w-16 rounded-full object-cover ring-1 ring-[rgba(230,161,92,0.3)]"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-lg text-[#d4cfc9]">
                  {(displayName || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onAvatarChange(f);
                  }}
                />
                <button
                  type="button"
                  className="btn-white-sm"
                  onClick={() => fileRef.current?.click()}
                >
                  Upload avatar
                </button>
                <div className="mono-sub mt-2 text-xs">PNG, JPG or WEBP · max 2MB</div>
              </div>
            </div>

            <div className="mb-5">
              <label className="field-label" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                className="field-input"
                placeholder="ada-lovelace"
                maxLength={20}
                autoComplete="off"
              />
              {statusMsg && (
                <p
                  className={`mt-2 text-xs ${
                    status === "available"
                      ? "text-[#a7d18a]"
                      : status === "checking"
                        ? "text-[#8b857f]"
                        : "text-[#e89274]"
                  }`}
                >
                  {statusMsg}
                </p>
              )}
            </div>

            <div className="mb-5">
              <label className="field-label" htmlFor="display-name">
                Display name
              </label>
              <input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="field-input"
                maxLength={60}
                placeholder="Ada Lovelace"
              />
            </div>

            <div className="mb-6">
              <label className="field-label" htmlFor="bio">
                Short bio
              </label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="field-input min-h-[88px] resize-y leading-relaxed"
                maxLength={280}
                placeholder="Student PM writing product teardowns."
              />
              <div className="mono-sub mt-1 text-xs">{bio.length}/280</div>
            </div>

            <button
              type="submit"
              disabled={saving || status === "checking" || status === "taken"}
              className="btn-white w-full"
            >
              {saving ? "Saving…" : onboarding ? "Claim username" : "Save profile"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
