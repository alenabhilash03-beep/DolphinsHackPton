/** Public sign-in configuration read at runtime, so one container image works on any host.
 *  Only the Supabase project URL and its publishable (public) key are returned. */
export const dynamic = "force-dynamic";
export function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? null;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? null;
  return Response.json(url && key ? { url, key } : { url: null, key: null }, { headers: { "Cache-Control": "no-store" } });
}
