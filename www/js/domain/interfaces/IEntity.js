/**
 * Interface base para entidades de domínio
 */
export class IEntity {
  validate() {
    throw new Error('Método validate() deve ser implementado na subclasse.');
  }

  toJSON() {
    throw new Error('Método toJSON() deve ser implementado na subclasse.');
  }
}
