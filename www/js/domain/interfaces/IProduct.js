import { IEntity } from './IEntity.js';

/**
 * Interface de contrato para produtos de catálogo e estoque
 */
export class IProduct extends IEntity {
  getId() {
    throw new Error('Método getId() não implementado.');
  }

  getCode() {
    throw new Error('Método getCode() não implementado.');
  }

  getName() {
    throw new Error('Método getName() não implementado.');
  }

  getCategory() {
    throw new Error('Método getCategory() não implementado.');
  }

  getSalePrice() {
    throw new Error('Método getSalePrice() não implementado.');
  }

  getCostPrice() {
    throw new Error('Método getCostPrice() não implementado.');
  }

  getQuantity() {
    throw new Error('Método getQuantity() não implementado.');
  }

  getMinimumStock() {
    throw new Error('Método getMinimumStock() não implementado.');
  }

  isActive() {
    throw new Error('Método isActive() não implementado.');
  }
}
