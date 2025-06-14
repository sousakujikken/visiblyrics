import { PhraseUnit, WordUnit, CharUnit } from '../types/types';

/**
 * パラメータ管理サービス
 * グローバル/フレーズ/単語/文字の各レベルでパラメータを管理し、
 * 上位の変更が下位に伝播するようにする
 */
export class ParamService {
  // グローバルパラメータ
  private globalParams: Record<string, any> = {};
  // フレーズの配列
  private phrases: PhraseUnit[] = [];

  /**
   * コンストラクタ
   * @param initialGlobalParams 初期グローバルパラメータ
   */
  constructor(initialGlobalParams: Record<string, any> = {}) {
    this.globalParams = { ...initialGlobalParams };
  }

  /**
   * フレーズデータを設定
   * @param phrases フレーズの配列
   */
  setPhrases(phrases: PhraseUnit[]): void {
    this.phrases = phrases;
  }

  /**
   * グローバルパラメータを取得
   */
  getGlobalParams(): Record<string, any> {
    return { ...this.globalParams };
  }

  /**
   * グローバルパラメータを更新
   * すべてのフレーズ/単語/文字に変更を伝播する
   * @param key パラメータキー
   * @param value パラメータ値
   */
  updateGlobal<K extends string>(key: K, value: any): void {
    // グローバル値を更新
    this.globalParams[key] = value;

    // 下位すべてに一括適用
    for (const phrase of this.phrases) {
      this.updatePhrase(phrase.id, key, value);
    }
  }

  /**
   * グローバルパラメータを一括更新
   * @param params 更新するパラメータオブジェクト
   */
  updateGlobalBatch(params: Record<string, any>): void {
    // 各パラメータに対して更新を実行
    for (const [key, value] of Object.entries(params)) {
      this.updateGlobal(key, value);
    }
  }

  /**
   * フレーズのパラメータを更新
   * フレーズ配下のすべての単語/文字に変更を伝播する
   * @param phraseId フレーズID
   * @param key パラメータキー
   * @param value パラメータ値
   */
  updatePhrase<K extends string>(phraseId: string, key: K, value: any): void {
    const phrase = this.phrases.find(p => p.id === phraseId);
    if (!phrase) return;

    // フレーズのパラメータを更新
    phrase.params = { ...(phrase.params || {}), [key]: value };

    // 配下のすべての単語に適用
    for (const word of phrase.words) {
      this.updateWord(word.id, key, value);
    }
  }

  /**
   * フレーズのパラメータを一括更新
   * @param phraseId フレーズID
   * @param params 更新するパラメータオブジェクト
   */
  updatePhraseBatch(phraseId: string, params: Record<string, any>): void {
    for (const [key, value] of Object.entries(params)) {
      this.updatePhrase(phraseId, key, value);
    }
  }

  /**
   * 単語のパラメータを更新
   * 単語配下のすべての文字に変更を伝播する
   * @param wordId 単語ID
   * @param key パラメータキー
   * @param value パラメータ値
   */
  updateWord<K extends string>(wordId: string, key: K, value: any): void {
    let found = false;

    // すべてのフレーズから単語を検索
    for (const phrase of this.phrases) {
      const word = phrase.words.find(w => w.id === wordId);
      if (!word) continue;

      // 単語のパラメータを更新
      word.params = { ...(word.params || {}), [key]: value };
      found = true;

      // 配下のすべての文字に適用
      for (const char of word.chars) {
        this.updateChar(char.id, key, value);
      }

      // 見つかったらループを抜ける
      break;
    }

    if (!found) {
      console.warn(`Word with id ${wordId} not found.`);
    }
  }

  /**
   * 単語のパラメータを一括更新
   * @param wordId 単語ID
   * @param params 更新するパラメータオブジェクト
   */
  updateWordBatch(wordId: string, params: Record<string, any>): void {
    for (const [key, value] of Object.entries(params)) {
      this.updateWord(wordId, key, value);
    }
  }

  /**
   * 文字のパラメータを更新
   * @param charId 文字ID
   * @param key パラメータキー
   * @param value パラメータ値
   */
  updateChar<K extends string>(charId: string, key: K, value: any): void {
    let found = false;

    // すべてのフレーズ/単語から文字を検索
    for (const phrase of this.phrases) {
      for (const word of phrase.words) {
        const char = word.chars.find(c => c.id === charId);
        if (!char) continue;

        // 文字のパラメータを更新
        char.params = { ...(char.params || {}), [key]: value };
        found = true;
        return;
      }
    }

    if (!found) {
      console.warn(`Char with id ${charId} not found.`);
    }
  }

  /**
   * 文字のパラメータを一括更新
   * @param charId 文字ID
   * @param params 更新するパラメータオブジェクト
   */
  updateCharBatch(charId: string, params: Record<string, any>): void {
    for (const [key, value] of Object.entries(params)) {
      this.updateChar(charId, key, value);
    }
  }

  /**
   * 対象タイプとIDに基づいてパラメータを更新
   * GUIからの呼び出しに便利なユーティリティメソッド
   * @param targetType 対象タイプ ('global', 'phrase', 'word', 'char')
   * @param targetId 対象ID (globalの場合は不要)
   * @param params 更新するパラメータオブジェクト
   */
  updateParams(
    targetType: 'global' | 'phrase' | 'word' | 'char',
    targetId: string | null,
    params: Record<string, any>
  ): void {
    switch (targetType) {
      case 'global':
        this.updateGlobalBatch(params);
        break;
      case 'phrase':
        if (targetId) this.updatePhraseBatch(targetId, params);
        break;
      case 'word':
        if (targetId) this.updateWordBatch(targetId, params);
        break;
      case 'char':
        if (targetId) this.updateCharBatch(targetId, params);
        break;
      default:
        console.warn(`Unknown target type: ${targetType}`);
    }
  }

  /**
   * 特定のオブジェクトのパラメータを取得
   * @param targetType オブジェクトタイプ ('phrase', 'word', 'char')
   * @param targetId オブジェクトID
   * @returns パラメータオブジェクト
   */
  getObjectParams(
    targetType: 'phrase' | 'word' | 'char',
    targetId: string
  ): Record<string, any> {
    switch (targetType) {
      case 'phrase': {
        const phrase = this.phrases.find(p => p.id === targetId);
        return phrase?.params || {};
      }
      case 'word': {
        for (const phrase of this.phrases) {
          const word = phrase.words.find(w => w.id === targetId);
          if (word) return word.params || {};
        }
        return {};
      }
      case 'char': {
        for (const phrase of this.phrases) {
          for (const word of phrase.words) {
            const char = word.chars.find(c => c.id === targetId);
            if (char) return char.params || {};
          }
        }
        return {};
      }
      default:
        return {};
    }
  }


}

export default ParamService;
