import type { EntryStore } from './store.ts';

export const memoryStore = (): EntryStore => {
  const storeMap = new Map<string, string>();

  return {
    save: async (entry) => {
      const hasShortCode = storeMap.has(entry.shortCode);

      if (hasShortCode) {
        return 'code_already_used';
      }

      storeMap.set(entry.shortCode, entry.originalUrl);
      return 'completed';
    },

    resolve: async (shortCode: string) => {
      return storeMap.get(shortCode);
    },
  };
};
