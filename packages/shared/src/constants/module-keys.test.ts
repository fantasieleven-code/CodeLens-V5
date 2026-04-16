import { describe, expect, it } from 'vitest';
import {
  MODULE_KEY_TO_TYPE,
  MODULE_TYPE_TO_KEY,
  V5_MODULE_KEYS,
  V5_MODULE_TYPES,
  isV5ModuleKey,
  isV5ModuleType,
  moduleKeyToType,
  moduleTypeToKey,
  type V5ModuleKey,
  type V5ModuleType,
} from './module-keys.js';

describe('module-keys bidirectional mapping (Fix 1)', () => {
  it('MODULE_KEY_TO_TYPE has all 6 keys', () => {
    expect(Object.keys(MODULE_KEY_TO_TYPE)).toHaveLength(6);
    expect(V5_MODULE_KEYS).toHaveLength(6);
    expect(V5_MODULE_TYPES).toHaveLength(6);
  });

  it('maps camelCase key → uppercase type per spec', () => {
    expect(MODULE_KEY_TO_TYPE.phase0).toBe('P0');
    expect(MODULE_KEY_TO_TYPE.moduleA).toBe('MA');
    expect(MODULE_KEY_TO_TYPE.mb).toBe('MB');
    expect(MODULE_KEY_TO_TYPE.moduleC).toBe('MC');
    expect(MODULE_KEY_TO_TYPE.moduleD).toBe('MD');
    expect(MODULE_KEY_TO_TYPE.selfAssess).toBe('SE');
  });

  it('MODULE_TYPE_TO_KEY is exact inverse of MODULE_KEY_TO_TYPE', () => {
    for (const key of V5_MODULE_KEYS) {
      const type = MODULE_KEY_TO_TYPE[key];
      expect(MODULE_TYPE_TO_KEY[type]).toBe(key);
    }
    for (const type of V5_MODULE_TYPES) {
      const key = MODULE_TYPE_TO_KEY[type];
      expect(MODULE_KEY_TO_TYPE[key]).toBe(type);
    }
  });

  it('moduleKeyToType / moduleTypeToKey are round-trip inverses', () => {
    for (const key of V5_MODULE_KEYS) {
      expect(moduleTypeToKey(moduleKeyToType(key))).toBe(key);
    }
    for (const type of V5_MODULE_TYPES) {
      expect(moduleKeyToType(moduleTypeToKey(type))).toBe(type);
    }
  });

  it('protects against the toUpperCase bug the mapping is replacing', () => {
    // `'moduleA'.toUpperCase()` === 'MODULEA' (WRONG). Mapping must return 'MA'.
    expect(moduleKeyToType('moduleA')).toBe('MA');
    expect('moduleA'.toUpperCase()).not.toBe(moduleKeyToType('moduleA'));

    // Same pitfall for 'phase0' / 'selfAssess'.
    expect(moduleKeyToType('phase0')).toBe('P0');
    expect('phase0'.toUpperCase()).not.toBe(moduleKeyToType('phase0'));

    expect(moduleKeyToType('selfAssess')).toBe('SE');
    expect('selfAssess'.toUpperCase()).not.toBe(moduleKeyToType('selfAssess'));
  });

  describe('type guards', () => {
    it('isV5ModuleKey accepts known keys, rejects everything else', () => {
      for (const key of V5_MODULE_KEYS) {
        expect(isV5ModuleKey(key)).toBe(true);
      }
      expect(isV5ModuleKey('modulec')).toBe(false); // pre-fix casing
      expect(isV5ModuleKey('MA')).toBe(false); // type is not key
      expect(isV5ModuleKey('')).toBe(false);
      expect(isV5ModuleKey(null)).toBe(false);
      expect(isV5ModuleKey(undefined)).toBe(false);
      expect(isV5ModuleKey(0)).toBe(false);
      expect(isV5ModuleKey({})).toBe(false);
    });

    it('isV5ModuleType accepts known types, rejects everything else', () => {
      for (const type of V5_MODULE_TYPES) {
        expect(isV5ModuleType(type)).toBe(true);
      }
      expect(isV5ModuleType('mc')).toBe(false); // lowercase
      expect(isV5ModuleType('MODULEA')).toBe(false); // toUpperCase bug output
      expect(isV5ModuleType('moduleA')).toBe(false); // key is not type
      expect(isV5ModuleType(null)).toBe(false);
    });
  });

  it('V5_MODULE_KEYS and V5_MODULE_TYPES cover the exact same set as the maps', () => {
    expect(new Set(V5_MODULE_KEYS)).toEqual(
      new Set(Object.keys(MODULE_KEY_TO_TYPE) as V5ModuleKey[]),
    );
    expect(new Set(V5_MODULE_TYPES)).toEqual(
      new Set(Object.keys(MODULE_TYPE_TO_KEY) as V5ModuleType[]),
    );
  });
});
