export type SaveResult = 'completed' | 'code_already_used';

export interface EntryStore {
  /**
   * 既存のコードで保存しても上書きはされない
   * 保存と存在確認を分けて実行せず、既に使われている場合は戻り値で返す
   */
  save: (entry: { originalUrl: string; shortCode: string }) => Promise<SaveResult>;
  resolve: (shortCode: string) => Promise<string | undefined>;
}
