import { IEntity } from './IEntity.js';

/**
 * Interface de contrato para lançamentos no Livro Caixa
 */
export class ICashTransaction extends IEntity {
  getId() {
    throw new Error('Método getId() não implementado.');
  }

  getType() {
    throw new Error('Método getType() não implementado.');
  }

  getValue() {
    throw new Error('Método getValue() não implementado.');
  }

  getDescription() {
    throw new Error('Método getDescription() não implementado.');
  }

  getPaymentMethod() {
    throw new Error('Método getPaymentMethod() não implementado.');
  }

  getDate() {
    throw new Error('Método getDate() não implementado.');
  }
}
