import { ICashTransaction } from '../interfaces/ICashTransaction.js';

/**
 * Entidade de Negócio: Movimentação do Livro Caixa
 */
export class CashTransaction extends ICashTransaction {
  _id;
  _data;
  _descricao;
  _tipo;
  _origem;
  _formapagamento;
  _valor;
  _mesa;
  _cliente;
  _itens;
  _custoestimado;
  _turnoid;

  constructor(data = {}) {
    super();
    this._id = data.id || crypto.randomUUID();
    this._data = data.data || new Date().toISOString();
    this._descricao = String(data.descricao || '').trim();
    this._tipo = data.tipo === 'saida' ? 'saida' : 'entrada';
    this._origem = data.origem || (this._tipo === 'entrada' ? 'venda' : 'retirada');
    this._formapagamento = data.formaPagamento || data.formapagamento || null;
    this._valor = Number(data.valor) || 0;
    this._mesa = data.mesa || null;
    this._cliente = data.cliente || null;
    this._itens = Array.isArray(data.itens) ? structuredClone(data.itens) : null;
    this._custoestimado = Number.isFinite(data.custoEstimado) ? Number(data.custoEstimado) : null;
    this._turnoid = data.turnoId || data.turnoid || null;
  }

  getId() { return this._id; }
  getDate() { return this._data; }
  getDescription() { return this._descricao; }
  getType() { return this._tipo; }
  getOrigin() { return this._origem; }
  getPaymentMethod() { return this._formapagamento; }
  getValue() { return this._valor; }
  getTable() { return this._mesa; }
  getClient() { return this._cliente; }
  getEstimatedCost() { return this._custoestimado; }
  getShiftId() { return this._turnoid; }

  validate() {
    if (!this._descricao) throw new Error('Descrição da transação é obrigatória.');
    if (this._valor <= 0) throw new Error('Valor da transação deve ser positivo.');
    if (!['entrada', 'saida'].includes(this._tipo)) throw new Error('Tipo de transação inválido.');
    return true;
  }

  toJSON() {
    return {
      id: this._id,
      data: this._data,
      descricao: this._descricao,
      tipo: this._tipo,
      origem: this._origem,
      formaPagamento: this._formapagamento,
      valor: this._valor,
      mesa: this._mesa,
      cliente: this._cliente,
      itens: this._itens,
      custoEstimado: this._custoestimado,
      turnoId: this._turnoid
    };
  }
}
