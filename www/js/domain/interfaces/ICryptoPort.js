/**
 * Interface do Porto Secundário Criptográfico (Driven Port)
 */
export class ICryptoPort {
  deriveKey(password, salt, iterations) {
    throw new Error('Método deriveKey() não implementado.');
  }

  importAesKey(rawbytes) {
    throw new Error('Método importAesKey() não implementado.');
  }

  seal(plain, key, aad) {
    throw new Error('Método seal() não implementado.');
  }

  open(packet, key, aad) {
    throw new Error('Método open() não implementado.');
  }

  wrapKey(secret, rawkey) {
    throw new Error('Método wrapKey() não implementado.');
  }

  unwrapKey(secret, record) {
    throw new Error('Método unwrapKey() não implementado.');
  }

  sha256(data) {
    throw new Error('Método sha256() não implementado.');
  }

  randomBytes(length) {
    throw new Error('Método randomBytes() não implementado.');
  }
}
