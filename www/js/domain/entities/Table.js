import { ITable } from '../interfaces/ITable.js';
import { OrderItem } from './OrderItem.js';

/**
 * Entidade de Negócio: Mesa e Comanda de Atendimento
 */
export class Table extends ITable {
  _name;
  _clientname;
  _items = [];

  constructor(name, clientname = 'Cliente não informado', items = []) {
    super();
    if (typeof name === 'object' && name !== null) {
      const data = name;
      this._name = String(data.nome || data.name || '').trim();
      this._clientname = String(data.cliente || data.clientname || 'Cliente não informado').trim();
      this._items = (data.itens || data.items || []).map(item => item instanceof OrderItem ? item : new OrderItem(item));
    } else {
      this._name = String(name || '').trim();
      this._clientname = String(clientname || 'Cliente não informado').trim();
      this._items = (items || []).map(item => item instanceof OrderItem ? item : new OrderItem(item));
    }
  }

  getName() { return this._name; }
  getClientName() { return this._clientname; }
  getClient() { return this._clientname; }
  getItems() { return [...this._items]; }

  _setClientName(novocliente) {
    if (!novocliente || novocliente.trim().length > 90) {
      throw new Error('Nome do cliente deve ter até 90 caracteres.');
    }
    this._clientname = novocliente.trim();
  }

  _addItem(item) {
    const novoitem = item instanceof OrderItem ? item : new OrderItem(item);
    novoitem.validate();
    this._items.push(novoitem);
  }

  _removeItem(itemid) {
    const idx = this._items.findIndex(i => String(i.getId()) === String(itemid));
    if (idx < 0) throw new Error('Item não encontrado na comanda.');
    const [removido] = this._items.splice(idx, 1);
    return removido;
  }

  getTotal() {
    const soma = this._items.reduce((acc, item) => acc + Number(item.getTotal() || 0), 0);
    return Math.round((soma + Number.EPSILON) * 100) / 100;
  }

  validate() {
    if (!this._name) throw new Error('Identificação da mesa é obrigatória.');
    return true;
  }

  toJSON() {
    return {
      nome: this._name,
      cliente: this._clientname,
      itens: this._items.map(item => item.toJSON())
    };
  }
}
