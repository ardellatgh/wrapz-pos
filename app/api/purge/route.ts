import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { PURGE_CONFIRM_PHRASE } from "@/lib/constants";

/**
 * Server-only purge: uses SUPABASE_SERVICE_ROLE_KEY so the destructive RPC is never
 * executable with the browser publishable key. Client still enforces export + phrase UX.
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    return NextResponse.json(
      {
        error:
          "Purge is not configured on this server. Set SUPABASE_SERVICE_ROLE_KEY in the deployment environment (never in client code).",
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const confirmPhrase = o.confirmPhrase;
  const includeMaster = o.includeMaster;

  if (confirmPhrase !== PURGE_CONFIRM_PHRASE) {
    return NextResponse.json({ error: "Confirmation phrase does not match." }, { status: 400 });
  }

  if (typeof includeMaster !== "boolean") {
    return NextResponse.json({ error: "includeMaster must be a boolean." }, { status: 400 });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.rpc("purge_event_data", {
    p_include_master: includeMaster,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
