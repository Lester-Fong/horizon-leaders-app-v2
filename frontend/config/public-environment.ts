export interface PublicEnvironmentInput {
  VITE_API_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_URL?: string;
}

export interface PublicEnvironmentConfig {
  apiUrl: string;
  supabasePublicKey: string;
  supabaseUrl: string;
}

function readHttpOrigin(name: string, value: string | undefined): string {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new Error(`${name} is required`);
  }

  let url: URL;

  try {
    url = new URL(normalizedValue);
  } catch {
    throw new Error(`${name} must be a valid http(s) origin`);
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be a valid http(s) origin`);
  }

  return url.origin;
}

export function readApiUrl(environment: PublicEnvironmentInput): string {
  return readHttpOrigin('VITE_API_URL', environment.VITE_API_URL);
}

export function readSupabasePublicConfig(
  environment: PublicEnvironmentInput,
): Pick<PublicEnvironmentConfig, 'supabasePublicKey' | 'supabaseUrl'> {
  const publishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const legacyAnonKey = environment.VITE_SUPABASE_ANON_KEY?.trim();

  if (publishableKey && legacyAnonKey) {
    throw new Error(
      'Set only one of VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY',
    );
  }

  const supabasePublicKey = publishableKey || legacyAnonKey;

  if (!supabasePublicKey) {
    throw new Error(
      'VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY is required',
    );
  }

  return Object.freeze({
    supabasePublicKey,
    supabaseUrl: readHttpOrigin(
      'VITE_SUPABASE_URL',
      environment.VITE_SUPABASE_URL,
    ),
  });
}

export function readPublicEnvironment(
  environment: PublicEnvironmentInput,
): PublicEnvironmentConfig {
  return Object.freeze({
    apiUrl: readApiUrl(environment),
    ...readSupabasePublicConfig(environment),
  });
}
