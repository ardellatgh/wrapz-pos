import { Card } from "@/components/ui/Card";

export function SupabaseSetupBanner() {
  return (
    <Card className="mb-6 border-brand-yellow/40 bg-brand-yellow/15">
      <p className="text-sm font-medium text-brand-text">
        Supabase is not configured. Add{" "}
        <code className="rounded bg-white/80 px-1 py-0.5 font-sans tabular-nums text-xs">
          NEXT_PUBLIC_SUPABASE_URL
        </code>{" "}
        and{" "}
        <code className="rounded bg-white/80 px-1 py-0.5 font-sans tabular-nums text-xs">
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        </code>{" "}
        to <code className="font-sans tabular-nums text-xs">.env.local</code>, run the Stage 1 SQL migration in
        Supabase, then restart <code className="font-sans tabular-nums text-xs">npm run dev</code>.
      </p>
    </Card>
  );
}
