import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Admin client bypasses RLS — use ONLY in server-side code for admin operations
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
