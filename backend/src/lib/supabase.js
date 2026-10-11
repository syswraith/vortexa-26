import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

let cachedClient = null;

/**
 * Returns the shared server-side Supabase client.
 *
 * This client is created once per process from environment variables and must
 * only be used on the server (it is intended for the service role key, which
 * bypasses Row Level Security). Never expose these credentials to a browser.
 */
export function getSupabaseClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing required Supabase environment variable(s): ${missing.join(", ")}. ` +
        "Create backend/.env (see backend/.env.example) and set SUPABASE_URL " +
        "and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedClient;
}
