/**
 * ユニークなIDを生成するユーティリティ関数
 */

let idCounter = 0;

/**
 * ユニークなIDを生成します
 * @returns {string} ユニークなID文字列
 */
export const generateUniqueId = (): string => {
  const timestamp = Date.now().toString(36);
  const counter = (++idCounter).toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  
  return `${timestamp}-${counter}-${random}`;
};

/**
 * 指定されたプレフィックス付きのユニークなIDを生成します
 * @param prefix - IDのプレフィックス
 * @returns {string} プレフィックス付きユニークID
 */
export const generateUniqueIdWithPrefix = (prefix: string): string => {
  return `${prefix}-${generateUniqueId()}`;
};