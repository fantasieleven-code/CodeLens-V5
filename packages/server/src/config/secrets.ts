/**
 * Secrets Provider (AR-12)
 *
 * Abstraction layer for loading secrets from different backends.
 * V1.0: Environment variables (EnvSecretsProvider)
 * Future: AWS Secrets Manager, HashiCorp Vault, etc.
 */

export interface SecretsProvider {
  /** Load a secret by key. Returns undefined if not found. */
  getSecret(key: string): Promise<string | undefined>;
  /** Load multiple secrets. Returns a map of key→value. */
  getSecrets(keys: string[]): Promise<Record<string, string | undefined>>;
}

/**
 * Default provider: reads from process.env.
 * Used in development and as fallback in production.
 */
export class EnvSecretsProvider implements SecretsProvider {
  async getSecret(key: string): Promise<string | undefined> {
    return process.env[key];
  }

  async getSecrets(keys: string[]): Promise<Record<string, string | undefined>> {
    const result: Record<string, string | undefined> = {};
    for (const key of keys) {
      result[key] = process.env[key];
    }
    return result;
  }
}

/**
 * Placeholder for AWS Secrets Manager integration.
 * Uncomment and implement when migrating to cloud.
 */
// export class AWSSecretsProvider implements SecretsProvider { ... }

/**
 * Placeholder for HashiCorp Vault integration.
 */
// export class VaultSecretsProvider implements SecretsProvider { ... }

// Singleton — swap provider in production by setting SECRETS_PROVIDER env var
let _provider: SecretsProvider = new EnvSecretsProvider();

export function getSecretsProvider(): SecretsProvider {
  return _provider;
}

export function setSecretsProvider(provider: SecretsProvider): void {
  _provider = provider;
}

/**
 * Convenience: load secrets into process.env before Zod validation.
 * Call this in server startup before loadEnv().
 */
export async function preloadSecrets(keys: string[]): Promise<void> {
  const provider = getSecretsProvider();
  const secrets = await provider.getSecrets(keys);
  for (const [key, value] of Object.entries(secrets)) {
    if (value !== undefined && !process.env[key]) {
      process.env[key] = value;
    }
  }
}
