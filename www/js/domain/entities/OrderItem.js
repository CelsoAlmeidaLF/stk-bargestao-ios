import { IEntity } from '../interfaces/IEntity.js';

/**
 * Entidade de Negócio: Item de Pedido em Comanda
 */
export class OrderItem extends IEntity {
  _id;
  _produtoid;
  _nome;
  _precounit;
  _custounit;
  _qtd;
  _total;
  _data;
  _desconto;

  constructor(data = {}) {
    super();
    this._id = data.id || crypto.randomUUID();
    this._produtoid = data.produtoId || data.produtoid || null;
    this._nome = String(data.nome || '').trim();
    this._precounit = Number(data.precoUnit || data.precounit) || 0;
    this._custounit = Number(data.custoUnit || data.custounit) || 0;
    this._qtd = Number(data.qtd) || 1;
    this._total = Number(data.total) || Math.round((this._precounit * this._qtd + Number.EPSILON) * 100) / 100;
    this._data = data.data || new Date().toISOString();
    this._desconto = !!data.desconto;
  }

  getId() { return this._id; }
  getProductId() { return this._produtoid; }
  getName() { return this._nome; }
  getUnitPrice() { return this._precounit; }
  getUnitCost() { return this._custounit; }
  getQuantity() { return this._qtd; }
  getTotal() { return this._total; }
  getDate() { return this._data; }

  validate() {
    if (!this._nome) throw new Error('Nome do item é obrigatório.');
    if (!Number.isSafeInteger(this._qtd)) throw new Error('Quantidade deve ser inteira.');
    return true;
  }

  toJSON() {
    return {
      id: this._id,
      produtoId: this._produtoid,
      nome: this._nome,
      precoUnit: this._precounit,
      custoUnit: this._custounit,
      qtd: this._qtd,
      total: this._total,
      data: this._data,
      desconto: this._desconto
    };
  }
}
