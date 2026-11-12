const { URL } = require('node:url');
const developmentSupabase = 'https://dxpiqttvtxjhmlvxstbb.supabase.co';
const variants = ['development', 'preview', 'production'];
function requireValue(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing mobile build configuration: ${name}`);
  return value;
}
function publicHttps(value, name, rootOnly = false) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const privateHost =
      !host.includes('.') ||
      host.startsWith('[') ||
      host === 'localhost' ||
      host === '[::]' ||
      host === '[::1]' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^(0|10|127)\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^\[(fc|fd|fe80)/i.test(host);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      privateHost ||
      (rootOnly && url.pathname !== '/')
    )
      throw new Error();
    return url;
  } catch {
    throw new Error(`Invalid public HTTPS URL: ${name}`);
  }
}
function resolveMobileConfig(config, env) {
  const variant = env.APP_VARIANT ?? 'development';
  if (!variants.includes(variant)) throw new Error('Invalid APP_VARIANT');
  const managed =
    env.EAS_BUILD === 'true' ||
    !!env.EAS_BUILD_PROFILE ||
    variant !== 'development';
  if (env.EAS_BUILD_PROFILE && env.EAS_BUILD_PROFILE !== variant)
    throw new Error('APP_VARIANT does not match EAS_BUILD_PROFILE');
  for (const name of Object.keys(env)) {
    if (
      env[name] &&
      /^EXPO_PUBLIC_.*(?:SECRET|SERVICE_ROLE|PRIVATE_KEY|EXPO_TOKEN|DEEPSEEK_API_KEY|OPENAI_API_KEY|MODERATION_API_KEY|AI_PROVIDER_API_KEY)/.test(
        name,
      )
    )
      throw new Error(`Server credential cannot be public: ${name}`);
  }
  if (managed && env.EXPO_PUBLIC_DISCOVER_PREVIEW === '1')
    throw new Error('Design preview is not allowed in device builds');
  const storedProject = config.extra?.eas?.projectId;
  const storedBundle = config.ios?.bundleIdentifier;
  const project = env.EAS_PROJECT_ID?.trim() || storedProject;
  const bundle = env.IOS_BUNDLE_IDENTIFIER?.trim() || storedBundle;
  if (
    storedProject &&
    env.EAS_PROJECT_ID &&
    storedProject !== env.EAS_PROJECT_ID.trim()
  )
    throw new Error('EAS_PROJECT_ID conflicts with app.json');
  if (
    storedBundle &&
    env.IOS_BUNDLE_IDENTIFIER &&
    storedBundle !== env.IOS_BUNDLE_IDENTIFIER.trim()
  )
    throw new Error('IOS_BUNDLE_IDENTIFIER conflicts with app.json');
  if (managed) {
    if (!project)
      throw new Error('Missing mobile build configuration: EAS_PROJECT_ID');
    if (!bundle)
      throw new Error(
        'Missing mobile build configuration: IOS_BUNDLE_IDENTIFIER',
      );
    for (const name of [
      'EXPO_PUBLIC_API_URL',
      'EXPO_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    ])
      requireValue(env, name);
    publicHttps(env.EXPO_PUBLIC_API_URL, 'EXPO_PUBLIC_API_URL', true);
    publicHttps(env.EXPO_PUBLIC_SUPABASE_URL, 'EXPO_PUBLIC_SUPABASE_URL', true);
  }
  if (
    project &&
    (typeof project !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        project,
      ))
  )
    throw new Error('Invalid EAS_PROJECT_ID');
  if (
    bundle &&
    (typeof bundle !== 'string' ||
      !/^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/i.test(bundle))
  )
    throw new Error('Invalid IOS_BUNDLE_IDENTIFIER');
  const publishable = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (publishable && !/^sb_publishable_[a-z0-9_-]+$/i.test(publishable))
    throw new Error('Only a Supabase publishable key may enter the app');
  if (variant === 'production') {
    if (new URL(env.EXPO_PUBLIC_SUPABASE_URL).origin === developmentSupabase)
      throw new Error('Production cannot use the development Supabase project');
    publicHttps(
      requireValue(env, 'EXPO_PUBLIC_PRIVACY_URL'),
      'EXPO_PUBLIC_PRIVACY_URL',
    );
    publicHttps(
      requireValue(env, 'EXPO_PUBLIC_TERMS_URL'),
      'EXPO_PUBLIC_TERMS_URL',
    );
  }
  const suffix =
    variant === 'production'
      ? ''
      : variant === 'preview'
        ? '.preview'
        : '.development';
  return {
    ...config,
    name:
      config.name +
      (variant === 'production'
        ? ''
        : variant === 'preview'
          ? ' Preview'
          : ' Dev'),
    scheme:
      variant === 'production'
        ? config.scheme
        : `aicompanion-${variant === 'preview' ? 'preview' : 'dev'}`,
    ...(env.EXPO_ACCOUNT_OWNER ? { owner: env.EXPO_ACCOUNT_OWNER } : {}),
    plugins: [
      ...(config.plugins ?? []).filter(
        (plugin) =>
          (Array.isArray(plugin) ? plugin[0] : plugin) !== 'expo-dev-client',
      ),
      ['expo-dev-client', { addGeneratedScheme: variant === 'development' }],
    ],
    ios: {
      ...config.ios,
      ...(bundle ? { bundleIdentifier: bundle + suffix } : {}),
    },
    updates: project
      ? {
          url: `https://u.expo.dev/${project}`,
          enabled: true,
          checkAutomatically: 'ON_LOAD',
          fallbackToCacheTimeout: 0,
        }
      : { enabled: false },
    ...(project ? { runtimeVersion: { policy: 'fingerprint' } } : {}),
    extra: {
      ...config.extra,
      appVariant: variant,
      ...(project ? { eas: { projectId: project } } : {}),
    },
  };
}
module.exports = { resolveMobileConfig };
