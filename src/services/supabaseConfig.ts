/**
 * Supabase connection settings, kept free of the supabase-js import so any
 * module can ask "is cloud sync configured?" synchronously at start-up without
 * pulling the client library into the main bundle.
 */
export const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL || 'https://djismufvsorifvtsojmr.supabase.co'
export const supabaseAnonKey: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_CzY7QOf8A4WGHAzmFiLvMg_JrojyTjA'

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder') && !supabaseUrl.includes('your-project-id'),
)
