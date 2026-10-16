import { IShift } from '../interfaces/IShift.js';

/**
 * Entidade de Negócio: Turno Operacional de Caixa
 */
export class Shift extends IShift {
  _id;
  _status;
  _operador;
  _abertoem;
  _fechadoem;
  _fechadopor;
  _fundoinicial;
  _esperado;
  _contado;
  _diferenca;
  _observacoes;

  constructor(data = {}) {
    super();
    this._id = data.id || crypto.randomUUID();
    this._status = data.status || 'aberto';
    this._operador = data.operador || 'Sistema';
    this._abertoem = data.abertoEm || data.abertoem || new Date().toISOString();
    this._fechadoem = data.fechadoEm || data.fechadoem || null;
    this._fechadopor = data.fechadoPor || data.fechadopor || null;
    this._fundoinicial = Number(data.fundoInicial || data.fundoinicial) || 0;
    this._esperado = Number.isFinite(data.esperado) ? Number(data.esperado) : null;
    this._contado = Number.isFinite(data.contado) ? Number(data.contado) : null;
    this._diferenca = Number.isFinite(data.diferenca) ? Number(data.diferenca) : null;
    this._observacoes = String(data.observacoes || '');
  }

  getId() { return this._id; }
  getStatus() { return this._status; }
  getOperator() { return this._operador; }
  getInitialFund() { return this._fundoinicial; }
  getExpectedAmount() { return this._esperado; }
  getCountedAmount() { return this._contado; }
  getDifference() { return this._diferenca; }

  _close(contado, esperado, operador, observacoes = '') {
    if (this._status === 'fechado') throw new Error('Turno já se encontra fechado.');
    this._status = 'fechado';
    this._fechadoem = new Date().toISOString();
    this._fechadopor = operador;
    this._esperado = Math.round((esperado + Number.EPSILON) * 100) / 100;
    this._contado = Math.round((contado + Number.EPSILON) * 100) / 100;
    this._diferenca = Math.round((this._contado - this._esperado + Number.EPSILON) * 100) / 100;
    this._observacoes = observacoes;
  }

  validate() {
    if (!this._operador) throw new Error('Operador do turno é obrigatório.');
    if (this._fundoinicial < 0) throw new Error('Fundo inicial não pode ser negativo.');
    return true;
  }

  toJSON() {
    return {
      id: this._id,
      status: this._status,
      operador: this._operador,
      abertoEm: this._abertoem,
      fechadoEm: this._fechadoem,
      fechadoPor: this._fechadopor,
      fundoInicial: this._fundoinicial,
      esperado: this._esperado,
      contado: this._contado,
      diferenca: this._diferenca,
      observacoes: this._observacoes
    };
  }
}
