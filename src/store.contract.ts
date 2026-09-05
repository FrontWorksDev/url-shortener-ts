import { describe, expect, test } from 'bun:test';
import type { EntryStore } from './store.ts';

export const storeContract = (describeLabel: string, createStore: () => EntryStore) => {
  describe(`${describeLabel} の契約テスト`, () => {
    test('保存したコードを解決すると元のURLが返る', async () => {
      const store = createStore();
      const entry = { originalUrl: 'https://example.com', shortCode: 'abc123' };
      const saveResult = await store.save(entry);
      const resolveResult = await store.resolve(entry.shortCode);
      expect(saveResult).toBe('completed');
      expect(resolveResult).toBe(entry.originalUrl);
    });

    test('保存したコードが既に存在した場合、"code_already_used"が返り、既存のURLは上書きされない', async () => {
      const store = createStore();
      const entry = { originalUrl: 'https://example.com', shortCode: 'abc123' };
      const secondEntry = { originalUrl: 'https://example2.com', shortCode: 'abc123' };
      await store.save(entry);

      const secondSaveResult = await store.save(secondEntry);
      expect(secondSaveResult).toBe('code_already_used');
      const secondResolveResult = await store.resolve(secondEntry.shortCode);
      expect(secondResolveResult).toBe(entry.originalUrl);
    });

    test('一度も保存していないコードを解決すると、undefinedが返る', async () => {
      const store = createStore();
      const entry = { originalUrl: 'https://example.com', shortCode: 'abc123' };

      const resolveResult = await store.resolve(entry.shortCode);
      expect(resolveResult).toBeUndefined();
    });
  });
};
