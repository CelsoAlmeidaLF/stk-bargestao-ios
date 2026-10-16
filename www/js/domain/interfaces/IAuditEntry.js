import { IEntity } from './IEntity.js';

/**
 * Interface de contrato para nó na cadeia de auditoria SHA-256
 */
export class IAuditEntry extends IEntity {
  getId() {
    throw new Error('Método getId() não implementado.');
  }

  getDate() {
    throw new Error('Método getDate() não implementado.');
  }

  getUser() {
    throw new Error('Método getUser() não implementado.');
  }

  getAction() {
    throw new Error('Método getAction() não implementado.');
  }

  getPreviousHash() {
    throw new Error('Método getPreviousHash() não implementado.');
  }

  getHash() {
    throw new Error('Método getHash() não implementado.');
  }
}
