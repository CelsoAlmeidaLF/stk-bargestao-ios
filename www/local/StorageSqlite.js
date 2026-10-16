/* Edição Android: a porta de persistência do BarGestão (IStoragePort) sobre o SQLite do aparelho.
   Substitui o StorageAdapter do PWA (OPFS e bancos do navegador). Tudo na tabela docs do boot.js:
   - slots/0 e slots/1   → pacotes cifrados A/B dos dados do bar (mesmo formato v7 do PWA);
   - <store>/<chave>     → o que o PWA guardava no IndexedDB (private/auth, private/settings, private/governance,
                           private/backup-candidates, private/auth-previous, device/device-wrap).
   CryptoKey (chave do aparelho do PIN v2) vai como bytes e volta como chave não exportável. */
import { IStoragePort } from '../js/domain/interfaces/IStoragePort.js';

const L = window.stkLocal;
const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
const unhex = s => Uint8Array.from(s.match(/.{2}/g) || [], h => parseInt(h, 16));

export class StorageAdapter extends IStoragePort {
  async init() { await L.aberto; }

  getStorageType() { return L.nativo ? 'SQLite (pasta privada do app)' : 'Memória (desenvolvimento)'; }

  _ler(path) { const v = L.docs.get(path); return v === undefined ? null : structuredClone(v); }
  _gravar(path, valor) { return L.gravarDocs([[path, valor]]); }

  async readOpfsSlot(slot) { await L.aberto; return this._ler('slots/' + slot); }
  async writeOpfsSlot(slot, packet) { await this._gravar('slots/' + slot, packet); }
  readSlot(slot) { return this.readOpfsSlot(slot); }
  writeSlot(slot, packet) { return this.writeOpfsSlot(slot, packet); }

  async readCandidates() {
    await L.aberto;
    const results = [this._ler('slots/0'), this._ler('slots/1')];
    const extras = this._ler('private/backup-candidates');
    if (Array.isArray(extras)) results.push(...extras);
    return results
      .filter(x => x && (x.app === 'BarGestao' || x.app === 'BarGestão') && x.v === 7 && Number.isSafeInteger(x.seq) && x.seq >= 1)
      .sort((a, b) => b.seq - a.seq);
  }

  async dbRead(store, key) {
    await L.aberto;
    const v = this._ler(`${store}/${key}`);
    if (v && typeof v === 'object' && typeof v.__cryptokey === 'string') {
      return crypto.subtle.importKey('raw', unhex(v.__cryptokey), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }
    return v === null ? undefined : v;
  }

  async dbWrite(store, key, value) {
    if (value instanceof CryptoKey) value = { __cryptokey: hex(await crypto.subtle.exportKey('raw', value)) };
    await this._gravar(`${store}/${key}`, value);
  }

  async dbDelete(store, key) { await L.gravarDocs([[`${store}/${key}`, null]]); }
}
