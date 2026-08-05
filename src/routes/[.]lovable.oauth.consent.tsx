import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type OAuthClient = { name?: string; redirect_uri?: string; client_uri?: string };
type AuthorizationDetails = {
  client?: OAuthClient;
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
};

type OAuthApi = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the session lives in localStorage, absent during SSR.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s['authorization_id'] === "string" ? s['authorization_id'] : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({
        to: "/auth",
        search: { next: location.pathname + location.searchStr },
      });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  errorComponent: ({ error }) => (
    <main className="teardown-bg flex min-h-screen items-center justify-center px-4">
      <div className="glass-card max-w-md p-6 text-sm text-[#d4cfc9]">
        Could not load this authorization request: {String((error as Error)?.message ?? error)}
      </div>
    </main>
  ),
  component: Consent,
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "this app";

  async function decide(approve: boolean) {
    setBusy(true);
    const api = oauthApi();
    const { data, error: err } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="teardown-bg flex min-h-screen items-center justify-center px-4 py-14">
      <div className="w-full max-w-[460px]">
        <div className="eyebrow mb-3 text-center">Authorize access</div>
        <section className="glass-card p-7">
          <h1 className="display-h1 text-3xl">Connect {clientName} to Teardown Canvas</h1>
          <p className="mono-sub mt-4">
            This lets {clientName} use Teardown Canvas as you — running the teardown and PRD tools
            on your behalf while you are signed in.
          </p>
          {details?.client?.redirect_uri && (
            <p className="mono-sub mt-2 text-xs break-all">
              Redirects to {details.client.redirect_uri}
            </p>
          )}
          <ul className="mt-5 space-y-2 text-sm text-[#d4cfc9]">
            <li>→ Share your basic profile and email address</li>
            <li>→ Generate product teardowns and PRDs as you</li>
          </ul>
          <p className="mono-sub mt-4 text-xs">
            This does not bypass this app&apos;s permissions or backend policies.
          </p>

          {error && <div className="error-box mt-4">{error}</div>}

          <div className="mt-7 flex gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => decide(true)}
              className="btn-white flex-1"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => decide(false)}
              className="reset-btn flex-1"
            >
              Cancel connection
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
