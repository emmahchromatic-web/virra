import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, isAuthRetryableFetchError } from '@supabase/supabase-js';

const supabaseUrl  = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey  = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage:            AsyncStorage,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,
  },
});

/**
 * True when an auth call's error is a fetch/network failure (no signal),
 * not a genuine auth rejection (wrong password, unconfirmed email, weak
 * password, etc.). supabase-js throws `AuthRetryableFetchError` for exactly
 * this case -- "fetch failed, likely due to a network or CORS error" -- so
 * this is a real signal, not a guess from message text. Card 284, J3c.
 */
export const isAuthNetworkError = isAuthRetryableFetchError;
