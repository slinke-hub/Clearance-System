export function isSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  return Boolean(
    url &&
      anonKey &&
      /^https?:\/\//.test(url) &&
      !url.includes('your-project') &&
      !anonKey.includes('your-anon-key')
  );
}
