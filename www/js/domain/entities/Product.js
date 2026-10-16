import { IProduct } from '../interfaces/IProduct.js';

/**
 * Entidade de Negócio: Produto de Estoque e Catálogo
 */
export class Product extends IProduct {
  _id;
  _codigo;
  _nome;
  _categoria;
  _compra;
  _venda;
  _qtd;
  _min;
  _ativo;
  _criadoem;
  _atualizadoem;
  _ultimomovimentoem;

  constructor(data = {}) {
    super();
    this._id = data.id || crypto.randomUUID();
    this._codigo = (data.codigo || '').toUpperCase();
    this._nome = String(data.nome || '').trim();
    this._categoria = String(data.categoria || '').trim();
    this._compra = Number(data.compra) || 0;
    this._venda = Number(data.venda) || 0;
    this._qtd = Number(data.qtd) || 0;
    this._min = Number(data.min) || 0;
    this._ativo = data.ativo !== false;
    this._criadoem = data.criadoEm || data.criadoem || new Date().toISOString();
    this._atualizadoem = data.atualizadoEm || data.atualizadoem || new Date().toISOString();
    this._ultimomovimentoem = data.ultimoMovimentoEm || data.ultimomovimentoem || null;
  }

  getId() { return this._id; }
  getCode() { return this._codigo; }
  getName() { return this._nome; }
  getCategory() { return this._categoria; }
  getCostPrice() { return this._compra; }
  getSalePrice() { return this._venda; }
  getQuantity() { return this._qtd; }
  getMinimumStock() { return this._min; }
  isActive() { return this._ativo; }

  _setQuantity(novaquantidade) {
    if (!Number.isSafeInteger(novaquantidade) || novaquantidade < 0) {
      throw new Error('Quantidade física inválida.');
    }
    this._qtd = novaquantidade;
    this._atualizadoem = new Date().toISOString();
  }

  _debit(quantidade) {
    if (quantidade > this._qtd) {
      throw new Error(`Estoque insuficiente. Saldo disponível: ${this._qtd}`);
    }
    this._qtd -= quantidade;
    this._ultimomovimentoem = new Date().toISOString();
    this._atualizadoem = new Date().toISOString();
  }

  _credit(quantidade) {
    if (quantidade <= 0) {
      throw new Error('A quantidade de crédito deve ser positiva.');
    }
    this._qtd += quantidade;
    this._ultimomovimentoem = new Date().toISOString();
    this._atualizadoem = new Date().toISOString();
  }

  validate() {
    if (!this._nome) throw new Error('Nome do produto é obrigatório.');
    if (!this._categoria) throw new Error('Categoria é obrigatória.');
    if (this._venda <= 0) throw new Error('Preço de venda deve ser maior que zero.');
    if (this._compra < 0) throw new Error('Preço de custo não pode ser negativo.');
    return true;
  }

  toJSON() {
    return {
      id: this._id,
      codigo: this._codigo,
      nome: this._nome,
      categoria: this._categoria,
      compra: this._compra,
      venda: this._venda,
      qtd: this._qtd,
      min: this._min,
      ativo: this._ativo,
      criadoEm: this._criadoem,
      atualizadoEm: this._atualizadoem,
      ultimoMovimentoEm: this._ultimomovimentoem
    };
  }
}
