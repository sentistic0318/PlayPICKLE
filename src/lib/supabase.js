import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && /^https?:\/\//.test(url) && key && !key.includes('your-'));
// Preserve the SDK's existing default key, while allowing explicit local cleanup
// when an expired session cannot be refreshed during an offline sign-out.
const storageKey=configured?'sb-'+new URL(url).hostname.split('.')[0]+'-auth-token':null;
export async function clearStoredSession(){
 if(storageKey)await AsyncStorage.multiRemove([storageKey,storageKey+'-code-verifier',storageKey+'-user']);
}
export const supabase = configured ? createClient(url, key, {auth:{storageKey,storage:AsyncStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'pkce',lock:processLock}}) : null;
