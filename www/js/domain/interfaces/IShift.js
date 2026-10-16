import { IEntity } from './IEntity.js';

/**
 * Interface de contrato para turnos operacionais de caixa
 */
export class IShift extends IEntity {
  getId() {
    throw new Error('Método getId() não implementado.');
  }

  getStatus() {
    throw new Error('Método getStatus() não implementado.');
  }

  getOperator() {
    throw new Error('Método getOperator() não implementado.');
  }

  getInitialFund() {
    throw new Error('Método getInitialFund() não implementado.');
  }

  getExpectedAmount() {
    throw new Error('Método getExpectedAmount() não implementado.');
  }

  getCountedAmount() {
    throw new Error('Método getCountedAmount() não implementado.');
  }

  getDifference() {
    throw new Error('Método getDifference() não implementado.');
  }
}
