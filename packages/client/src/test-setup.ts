import '@testing-library/jest-dom/vitest';

// Node 25+ injects a method-less `globalThis.localStorage` via its
// experimental webstorage flag, which shadows jsdom's working one. Replace
// it with an in-memory Storage-shaped stub so components/stores that touch
// localStorage at module-import time don't blow up under vitest.
function installLocalStorageStub(): void {
  const store = new Map<string, string>();
  const stub: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: stub,
    configurable: true,
    writable: true,
  });
}
installLocalStorageStub();
