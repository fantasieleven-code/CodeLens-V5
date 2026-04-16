/**
 * Template Variable System (M1-2: Anti-leak)
 *
 * Replaces {{VARIABLE}} placeholders in template files with randomly generated
 * values, so each candidate gets a unique variant of the same problem.
 *
 * Variables are deterministic per session (seeded by sessionId) to ensure
 * reproducibility for scoring and debugging.
 */

import crypto from 'crypto';

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'port' | 'id' | 'name' | 'enum';
  /** For enum type: possible values */
  options?: string[];
  /** For number type: min value (default 1) */
  min?: number;
  /** For number type: max value (default 100) */
  max?: number;
}

export interface ResolvedVariables {
  [key: string]: string | number;
}

/** Default variable definitions for the pilot template */
export const PILOT_TEMPLATE_VARIABLES: TemplateVariable[] = [
  { name: 'SERVICE_PORT', type: 'port' },
  { name: 'ORDER_PREFIX', type: 'string' },
  { name: 'MAX_ITEMS', type: 'number', min: 5, max: 20 },
  { name: 'DEFAULT_CURRENCY', type: 'enum', options: ['USD', 'EUR', 'GBP', 'JPY', 'CNY'] },
  { name: 'TAX_RATE', type: 'number', min: 5, max: 25 },
  { name: 'WAREHOUSE_ID', type: 'id' },
  { name: 'COMPANY_NAME', type: 'enum', options: ['Acme Corp', 'TechStore', 'MegaShop', 'CloudMart', 'DataBazaar'] },
  { name: 'DB_TABLE_PREFIX', type: 'enum', options: ['ord_', 'order_', 'tx_', 'shop_', 'ecom_'] },
];

/**
 * Generate a seeded PRNG from sessionId for deterministic variable generation.
 */
function seededRandom(seed: string): () => number {
  let hash = crypto.createHash('sha256').update(seed).digest();
  let offset = 0;

  return () => {
    if (offset >= hash.length - 4) {
      hash = crypto.createHash('sha256').update(hash).digest();
      offset = 0;
    }
    const value = hash.readUInt32BE(offset) / 0xFFFFFFFF;
    offset += 4;
    return value;
  };
}

/**
 * Resolve template variables for a session.
 * Uses sessionId as seed for deterministic random generation.
 */
export function resolveVariables(
  sessionId: string,
  variables: TemplateVariable[],
): ResolvedVariables {
  const rng = seededRandom(sessionId);
  const resolved: ResolvedVariables = {};

  for (const v of variables) {
    switch (v.type) {
      case 'port':
        resolved[v.name] = 3000 + Math.floor(rng() * 6000); // 3000-8999
        break;

      case 'number':
        resolved[v.name] = (v.min ?? 1) + Math.floor(rng() * ((v.max ?? 100) - (v.min ?? 1) + 1));
        break;

      case 'id':
        resolved[v.name] = `${Math.floor(rng() * 900000 + 100000)}`; // 6-digit ID
        break;

      case 'string': {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I/O to avoid confusion
        let str = '';
        for (let i = 0; i < 3; i++) {
          str += chars[Math.floor(rng() * chars.length)];
        }
        resolved[v.name] = str;
        break;
      }

      case 'name': {
        const prefixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Omega', 'Nova', 'Apex', 'Core'];
        resolved[v.name] = prefixes[Math.floor(rng() * prefixes.length)];
        break;
      }

      case 'enum':
        if (v.options && v.options.length > 0) {
          resolved[v.name] = v.options[Math.floor(rng() * v.options.length)];
        }
        break;
    }
  }

  return resolved;
}

/**
 * Apply variable substitutions to file content.
 * Replaces all {{VARIABLE_NAME}} occurrences with resolved values.
 */
export function applyVariables(content: string, variables: ResolvedVariables): string {
  let result = content;
  for (const [name, value] of Object.entries(variables)) {
    result = result.split(`{{${name}}}`).join(String(value));
  }
  return result;
}

/**
 * Apply variables to an array of template files.
 */
export function applyVariablesToFiles(
  files: Array<{ path: string; content: string }>,
  variables: ResolvedVariables,
): Array<{ path: string; content: string }> {
  return files.map((f) => ({
    path: f.path,
    content: applyVariables(f.content, variables),
  }));
}
