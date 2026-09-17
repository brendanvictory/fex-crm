import { createClient } from '@supabase/supabase-js';

// Browser client — uses the ANON key only. Safe to ship to the browser;
// Row-Level Security is what protects the data.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
