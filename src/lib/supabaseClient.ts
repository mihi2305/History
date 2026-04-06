import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const isConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));

if (!isConfigured) {
  console.warn('Supabase URL or Anon Key is missing or invalid. Please check your .env file.');
}

// Only create the client if we have valid config to avoid crashing on boot
export const supabase = isConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null as any;

