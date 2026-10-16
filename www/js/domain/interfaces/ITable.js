import { IEntity } from './IEntity.js';

/**
 * Interface de contrato para Mesas e Comandas de atendimento
 */
export class ITable extends IEntity {
  getName() {
    throw new Error('Método getName() não implementado.');
  }

  getClientName() {
    throw new Error('Método getClientName() não implementado.');
  }

  getItems() {
    throw new Error('Método getItems() não implementado.');
  }

  getTotal() {
    throw new Error('Método getTotal() não implementado.');
  }
}
