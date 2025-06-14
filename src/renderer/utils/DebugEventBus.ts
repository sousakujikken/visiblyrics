/**
 * DebugEventBus
 * デバッグイベントを一元管理するユーティリティクラス
 */
export class DebugEventBus {
  // 最新のデバッグ情報を各カテゴリごとに保存
  private static debugInfo: Record<string, any> = {
    containers: {}, // コンテナ情報
    timing: {},     // タイミング情報
    errors: [],     // エラー情報
  };
  
  // 最終発火時刻を記録
  private static lastDispatchTime: Record<string, number> = {};
  
  // イベントリスナーを管理
  private static listeners: Record<string, Array<(data: any) => void>> = {};
  
  /**
   * デバッグ情報を更新し、適切な間隔でイベントを発火
   * @param category カテゴリ（containers, timing, errors）
   * @param id 識別子
   * @param info デバッグ情報
   * @param throttleMs イベント発火間隔（ミリ秒）
   */
  static updateInfo(category: string, id: string, info: any, throttleMs: number = 100): void {
    // カテゴリの初期化
    if (!this.debugInfo[category]) {
      this.debugInfo[category] = {};
    }
    
    // 情報を更新
    if (id) {
      this.debugInfo[category][id] = {
        ...info,
        timestamp: Date.now()
      };
    } else if (Array.isArray(this.debugInfo[category])) {
      // エラーなどの配列形式データの場合
      this.debugInfo[category].push({
        ...info,
        timestamp: Date.now()
      });
      
      // 配列が大きくなりすぎないよう制限
      if (this.debugInfo[category].length > 100) {
        this.debugInfo[category] = this.debugInfo[category].slice(-50);
      }
    }
    
    // イベント発火（スロットリング）
    const now = Date.now();
    if (!this.lastDispatchTime[category] || (now - this.lastDispatchTime[category] > throttleMs)) {
      this.dispatchEvent(category);
      this.lastDispatchTime[category] = now;
    }
  }
  
  /**
   * 指定カテゴリのデバッグ情報をカスタムイベントとして発火
   * @param category カテゴリ名
   */
  private static dispatchEvent(category: string): void {
    try {
      const event = new CustomEvent(`debug-${category}-updated`, {
        detail: {
          category,
          data: this.debugInfo[category],
          timestamp: Date.now()
        }
      });
      
      window.dispatchEvent(event);
      
      // 総合的なイベントも発火
      const allEvent = new CustomEvent('debug-info-updated', {
        detail: {
          data: this.debugInfo,
          timestamp: Date.now()
        }
      });
      
      window.dispatchEvent(allEvent);
    } catch (error) {
      console.error(`デバッグイベント発火エラー(${category}):`, error);
    }
  }
  
  /**
   * 全カテゴリのデバッグ情報を取得
   */
  static getAllInfo(): Record<string, any> {
    return { ...this.debugInfo };
  }
  
  /**
   * 特定カテゴリのデバッグ情報を取得
   * @param category カテゴリ名
   */
  static getCategoryInfo(category: string): any {
    return this.debugInfo[category] || {};
  }
  
  /**
   * 特定オブジェクトのデバッグ情報を取得
   * @param category カテゴリ名
   * @param id オブジェクトID
   */
  static getObjectInfo(category: string, id: string): any {
    return this.debugInfo[category]?.[id] || null;
  }
  
  /**
   * デバッグ情報をクリア
   * @param category 特定カテゴリのみクリアする場合は指定
   */
  static clearInfo(category?: string): void {
    if (category) {
      this.debugInfo[category] = Array.isArray(this.debugInfo[category]) ? [] : {};
    } else {
      Object.keys(this.debugInfo).forEach(key => {
        this.debugInfo[key] = Array.isArray(this.debugInfo[key]) ? [] : {};
      });
    }
  }
  
  /**
   * イベントリスナーを登録
   * @param eventName イベント名
   * @param callback コールバック関数
   */
  static on(eventName: string, callback: (data: any) => void): void {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [];
    }
    this.listeners[eventName].push(callback);
  }
  
  /**
   * イベントリスナーを削除
   * @param eventName イベント名
   * @param callback コールバック関数
   */
  static off(eventName: string, callback: (data: any) => void): void {
    if (this.listeners[eventName]) {
      this.listeners[eventName] = this.listeners[eventName].filter(cb => cb !== callback);
    }
  }
  
  /**
   * イベントを発火
   * @param eventName イベント名
   * @param data イベントデータ
   */
  static emit(eventName: string, data?: any): void {
    // カスタムイベントとして発火
    try {
      const event = new CustomEvent(eventName, {
        detail: data
      });
      window.dispatchEvent(event);
    } catch (error) {
      console.error(`イベント発火エラー(${eventName}):`, error);
    }
    
    // 登録されたリスナーを実行
    if (this.listeners[eventName]) {
      this.listeners[eventName].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`イベントリスナーエラー(${eventName}):`, error);
        }
      });
    }
  }
}

export default DebugEventBus;
