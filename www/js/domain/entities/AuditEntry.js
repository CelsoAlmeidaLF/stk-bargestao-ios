import { IAuditEntry } from '../interfaces/IAuditEntry.js';

/**
 * Entidade de Negócio: Nó na Trilha Criptográfica de Auditoria
 */
export class AuditEntry extends IAuditEntry {
  _id;
  _data;
  _usuario;
  _acao;
  _anterior;
  _hash;

  constructor(data = {}) {
    super();
    this._id = data.id || crypto.randomUUID();
    this._data = data.data || new Date().toISOString();
    this._usuario = data.usuario || 'Sistema';
    this._acao = String(data.acao || '').trim();
    this._anterior = data.anterior || 'GENESIS';
    this._hash = data.hash || null;
  }

  getId() { return this._id; }
  getDate() { return this._data; }
  getUser() { return this._usuario; }
  getAction() { return this._acao; }
  getPreviousHash() { return this._anterior; }
  getHash() { return this._hash; }

  _setHash(hashhex) {
    this._hash = hashhex;
  }

  getCanonicalPayload() {
    return {
      id: this._id,
      data: this._data,
      usuario: this._usuario,
      acao: this._acao,
      anterior: this._anterior
    };
  }

  validate() {
    if (!this._acao) throw new Error('Ação auditada é obrigatória.');
    if (!this._hash) throw new Error('Hash do nó de auditoria é obrigatório.');
    return true;
  }

  toJSON() {
    return {
      id: this._id,
      data: this._data,
      usuario: this._usuario,
      acao: this._acao,
      anterior: this._anterior,
      hash: this._hash
    };
  }
}
