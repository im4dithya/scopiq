export const USERNAME_RE = /^[a-z0-9]([a-z0-9-]{1,18})[a-z0-9]$/;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

/** Returns an error message, or null when the username is structurally valid. */
export function validateUsername(value: string): string | null {
  const v = normalizeUsername(value);
  if (v.length < 3 || v.length > 20) return "Username must be 3–20 characters.";
  if (!USERNAME_RE.test(v))
    return "Use lowercase letters, numbers and hyphens only (cannot start or end with a hyphen).";
  return null;
}
