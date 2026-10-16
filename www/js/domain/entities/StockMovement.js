import { IEntity } from '../interfaces/IEntity.js';

/**
 * Entidade de Negócio: Movimentação de Estoque
 */
export class StockMovement extends IEntity {
  _id;
  _produtoid;
  _produtonome;
  _tipo;
  _delta;
  _antes;
  _depois;
  _motivo;
  _data;
  _usuario;

  constructor(data = {}) {
    super();
    this._id = data.id || crypto.randomUUID();
    this._produtoid = data.produtoId || data.produtoid;
    this._produtonome = data.produtoNome || data.produtonome || 'Produto';
    this._tipo = data.tipo || 'Reposição';
    this._delta = Number(data.delta) || 0;
    this._antes = Number(data.antes) || 0;
    this._depois = Number(data.depois) || 0;
    this._motivo = String(data.motivo || '');
    this._data = data.data || new Date().toISOString();
    this._usuario = data.usuario || 'Sistema';
  }

  getId() { return this._id; }
  getProductId() { return this._produtoid; }
  getProductName() { return this._produtonome; }
  getType() { return this._tipo; }
  getDelta() { return this._delta; }
  getBefore() { return this._antes; }
  getAfter() { return this._depois; }
  getReason() { return this._motivo; }
  getDate() { return this._data; }
  getUser() { return this._usuario; }

  validate() {
    if (!this._produtoid) throw new Error('ID do produto é obrigatório.');
    if (!Number.isSafeInteger(this._delta)) throw new Error('Delta deve ser número inteiro.');
    return true;
  }

  toJSON() {
    return {
      id: this._id,
      produtoId: this._produtoid,
      produtoNome: this._produtonome,
      tipo: this._tipo,
      delta: this._delta,
      antes: this._antes,
      depois: this._depois,
      motivo: this._motivo,
      data: this._data,
      usuario: this._usuario
    };
  }
}
