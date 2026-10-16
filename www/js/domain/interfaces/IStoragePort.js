/**
 * Interface do Porto Secundário de Persistência (Driven Port)
 */
export class IStoragePort {
  readOpfsSlot(slot) {
    throw new Error('Método readOpfsSlot() não implementado.');
  }

  writeOpfsSlot(slot, packet) {
    throw new Error('Método writeOpfsSlot() não implementado.');
  }

  readCandidates() {
    throw new Error('Método readCandidates() não implementado.');
  }

  dbRead(store, key) {
    throw new Error('Método dbRead() não implementado.');
  }

  dbWrite(store, key, value) {
    throw new Error('Método dbWrite() não implementado.');
  }

  dbDelete(store, key) {
    throw new Error('Método dbDelete() não implementado.');
  }
}
