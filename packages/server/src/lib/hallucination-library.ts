/**
 * M1-5: Planted Hallucination Library
 *
 * 20+ Python hallucinations the AI assistant may suggest.
 * Each is a plausible-sounding but non-existent method, library, or API.
 *
 * Categories:
 * - stdlib: Non-existent Python stdlib methods
 * - framework: Non-existent framework features
 * - codebase: Methods that sound right but don't exist in the template code
 * - pattern: Plausible but incorrect design patterns
 *
 * Used by:
 * - AI assistant (CP2): randomly inject 1-2 hallucinations into suggestions
 * - CP4 voice probing: reference hallucinations to test V2 verification
 * - Scoring (V2): detect if candidate blindly accepts vs verifies
 */

export interface PlantedHallucinationEntry {
  id: string;
  category: 'stdlib' | 'framework' | 'codebase' | 'pattern';
  /** What the AI suggests (the hallucination) */
  trigger: string;
  /** What actually exists / is correct */
  reality: string;
  /** Human-readable description for scoring */
  description: string;
  /** Which checkpoint this is most relevant for */
  checkpointIndex: number;
  /** Scoring dimension */
  dimension: string;
  /** Difficulty: how hard is it to spot */
  difficulty: 'easy' | 'medium' | 'hard';
}

export const HALLUCINATION_LIBRARY: PlantedHallucinationEntry[] = [
  // ─── Codebase hallucinations (methods that don't exist in template) ───

  {
    id: 'H-C01',
    category: 'codebase',
    trigger: 'inventory.atomic_decrement(product_id, quantity)',
    reality: 'Only check_stock, deduct_stock, get_available_stock, restock methods exist',
    description: 'AI suggests atomic_decrement() which does not exist in inventory_service',
    checkpointIndex: 2,
    dimension: 'V2',
    difficulty: 'medium',
  },
  {
    id: 'H-C02',
    category: 'codebase',
    trigger: 'order_service.validate_order(order)',
    reality: 'There is no validate_order method; validation is inline in process_order()',
    description: 'AI suggests a dedicated validation method that was never implemented',
    checkpointIndex: 2,
    dimension: 'V2',
    difficulty: 'medium',
  },
  {
    id: 'H-C03',
    category: 'codebase',
    trigger: 'pricing_service.apply_discount(total, discount_percent)',
    reality: 'No apply_discount method exists; calculate_total does not support discounts',
    description: 'AI suggests a discount method that does not exist in pricing_service',
    checkpointIndex: 3,
    dimension: 'V2',
    difficulty: 'easy',
  },
  {
    id: 'H-C04',
    category: 'codebase',
    trigger: 'inventory.reserve_stock(product_id, quantity, ttl=300)',
    reality: 'No reservation system exists; only check_stock and deduct_stock',
    description: 'AI suggests stock reservation with TTL that was never implemented',
    checkpointIndex: 2,
    dimension: 'V2',
    difficulty: 'hard',
  },
  {
    id: 'H-C05',
    category: 'codebase',
    trigger: 'payment_client.refund(transaction_id, amount)',
    reality: 'payment_client only has charge(); no refund method exists',
    description: 'AI suggests a refund method on payment_client that does not exist',
    checkpointIndex: 2,
    dimension: 'V2',
    difficulty: 'medium',
  },
  {
    id: 'H-C06',
    category: 'codebase',
    trigger: 'order.set_status(OrderStatus.PROCESSING)',
    reality: 'Order status is set via direct attribute assignment, no set_status method',
    description: 'AI suggests a status setter method that does not exist on Order model',
    checkpointIndex: 2,
    dimension: 'V2',
    difficulty: 'easy',
  },

  // ─── Python stdlib hallucinations ───────────────────────────────────────

  {
    id: 'H-S01',
    category: 'stdlib',
    trigger: 'from collections import AtomicCounter',
    reality: 'AtomicCounter does not exist in Python stdlib; use threading.Lock + counter',
    description: 'AI suggests non-existent AtomicCounter from collections',
    checkpointIndex: 2,
    dimension: 'V2',
    difficulty: 'medium',
  },
  {
    id: 'H-S02',
    category: 'stdlib',
    trigger: 'import decimal; decimal.Money(amount, currency)',
    reality: 'decimal.Money does not exist; only decimal.Decimal is available',
    description: 'AI suggests Money class from decimal module that does not exist',
    checkpointIndex: 2,
    dimension: 'V2',
    difficulty: 'easy',
  },
  {
    id: 'H-S03',
    category: 'stdlib',
    trigger: 'threading.AtomicInteger(initial_value)',
    reality: 'threading.AtomicInteger does not exist in Python; no built-in atomic types',
    description: 'AI suggests Java-like AtomicInteger in Python threading module',
    checkpointIndex: 2,
    dimension: 'V2',
    difficulty: 'medium',
  },
  {
    id: 'H-S04',
    category: 'stdlib',
    trigger: 'from functools import synchronized',
    reality: 'No synchronized decorator in functools; must use threading.Lock manually',
    description: 'AI suggests Java-like synchronized decorator that does not exist',
    checkpointIndex: 2,
    dimension: 'V2',
    difficulty: 'hard',
  },
  {
    id: 'H-S05',
    category: 'stdlib',
    trigger: 'dict.get_or_create(key, default_factory)',
    reality: 'dict has get() and setdefault(), but no get_or_create; use defaultdict',
    description: 'AI suggests Django-like get_or_create on plain dict',
    checkpointIndex: 3,
    dimension: 'V2',
    difficulty: 'medium',
  },
  {
    id: 'H-S06',
    category: 'stdlib',
    trigger: 'from typing import Immutable',
    reality: 'typing.Immutable does not exist; use @dataclass(frozen=True) or NamedTuple',
    description: 'AI suggests non-existent Immutable type annotation',
    checkpointIndex: 3,
    dimension: 'V2',
    difficulty: 'hard',
  },

  // ─── Framework hallucinations ──────────────────────────────────────────

  {
    id: 'H-F01',
    category: 'framework',
    trigger: 'from sqlalchemy import atomic_transaction',
    reality: 'SQLAlchemy uses session.begin() for transactions, no atomic_transaction helper',
    description: 'AI suggests non-existent SQLAlchemy helper function',
    checkpointIndex: 2,
    dimension: 'V2',
    difficulty: 'medium',
  },
  {
    id: 'H-F02',
    category: 'framework',
    trigger: 'pytest.concurrent_test(threads=10)',
    reality: 'pytest has no built-in concurrent test runner; use pytest-xdist or manual threading',
    description: 'AI suggests non-existent pytest concurrent test decorator',
    checkpointIndex: 2,
    dimension: 'V2',
    difficulty: 'hard',
  },
  {
    id: 'H-F03',
    category: 'framework',
    trigger: 'from sqlalchemy.ext import retry_on_deadlock',
    reality: 'No such extension; deadlock retry must be implemented manually or via tenacity',
    description: 'AI suggests non-existent SQLAlchemy deadlock retry extension',
    checkpointIndex: 2,
    dimension: 'V2',
    difficulty: 'hard',
  },
  {
    id: 'H-F04',
    category: 'framework',
    trigger: 'from pydantic import MoneyField',
    reality: 'Pydantic has no MoneyField; use condecimal() or custom validator',
    description: 'AI suggests non-existent Pydantic field type for money',
    checkpointIndex: 3,
    dimension: 'V2',
    difficulty: 'medium',
  },

  // ─── Pattern hallucinations ────────────────────────────────────────────

  {
    id: 'H-P01',
    category: 'pattern',
    trigger: 'Use Python\'s built-in @transactional decorator for database operations',
    reality: 'Python has no built-in @transactional; this is a Java/Spring concept',
    description: 'AI suggests Java-style transaction decorator that Python does not have',
    checkpointIndex: 2,
    dimension: 'V2',
    difficulty: 'medium',
  },
  {
    id: 'H-P02',
    category: 'pattern',
    trigger: 'Use the Observer pattern via Python\'s built-in event module',
    reality: 'Python has no built-in event/observer module; must implement manually or use third-party',
    description: 'AI suggests non-existent built-in event module for observer pattern',
    checkpointIndex: 3,
    dimension: 'V2',
    difficulty: 'hard',
  },
  {
    id: 'H-P03',
    category: 'pattern',
    trigger: 'Enable optimistic locking with SQLAlchemy\'s @version_check decorator',
    reality: 'SQLAlchemy supports versioning via version_id_col, not a decorator',
    description: 'AI suggests incorrect API for SQLAlchemy optimistic locking',
    checkpointIndex: 2,
    dimension: 'V2',
    difficulty: 'hard',
  },
  {
    id: 'H-P04',
    category: 'pattern',
    trigger: 'Use contextlib.atomic() to wrap the inventory update in a transaction',
    reality: 'contextlib.atomic() does not exist; Django has transaction.atomic()',
    description: 'AI confuses Django ORM atomic() with Python stdlib contextlib',
    checkpointIndex: 2,
    dimension: 'V2',
    difficulty: 'medium',
  },
];

/**
 * Get hallucinations suitable for a specific checkpoint.
 */
export function getHallucinationsForCheckpoint(checkpointIndex: number): PlantedHallucinationEntry[] {
  return HALLUCINATION_LIBRARY.filter((h) => h.checkpointIndex === checkpointIndex);
}

/**
 * Select hallucinations to plant in AI assistant responses.
 * Returns 1-2 per checkpoint, mixing difficulty levels.
 */
export function selectHallucinationsForSession(
  sessionSeed: string,
  checkpointIndex: number,
  count = 2,
): PlantedHallucinationEntry[] {
  const candidates = getHallucinationsForCheckpoint(checkpointIndex);
  if (candidates.length === 0) return [];

  // Simple seeded selection (deterministic per session)
  let hash = 0;
  for (let i = 0; i < sessionSeed.length; i++) {
    hash = ((hash << 5) - hash + sessionSeed.charCodeAt(i)) | 0;
  }

  // Shuffle deterministically
  const shuffled = [...candidates].sort((a, b) => {
    const ha = ((hash * 31 + a.id.charCodeAt(a.id.length - 1)) | 0) & 0x7FFFFFFF;
    const hb = ((hash * 31 + b.id.charCodeAt(b.id.length - 1)) | 0) & 0x7FFFFFFF;
    return ha - hb;
  });

  // Ensure difficulty mix: at least one medium or easy
  const result: PlantedHallucinationEntry[] = [];
  const easy = shuffled.filter((h) => h.difficulty !== 'hard');
  const hard = shuffled.filter((h) => h.difficulty === 'hard');

  if (easy.length > 0) result.push(easy[0]);
  if (count > 1 && hard.length > 0) result.push(hard[0]);
  if (result.length < count && easy.length > 1) result.push(easy[1]);

  return result.slice(0, count);
}
