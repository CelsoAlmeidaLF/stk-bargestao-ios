/**
 * Adaptador de Concorrência e Sincronização Multi-Aba
 */
export class ConcurrencyAdapter {
  _channel = null;

  constructor() {
    if (typeof BroadcastChannel === 'function') {
      this._channel = new BroadcastChannel('bargestao_v7_revisions');
    }
  }

  async runExclusive(name, callback) {
    if (navigator.locks?.request) {
      return navigator.locks.request(name, { mode: 'exclusive' }, callback);
    }
    return callback();
  }

  postMessage(message) {
    this._channel?.postMessage(message);
  }

  _onMessage(handler) {
    if (this._channel) {
      this._channel.onmessage = handler;
    }
  }
}
