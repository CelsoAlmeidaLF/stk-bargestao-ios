import { ICryptoPort } from '../../domain/interfaces/ICryptoPort.js';

/**
 * Adaptador de Criptografia Baseado na Web Crypto API (SubtleCrypto)
 */
export class WebCryptoAdapter extends ICryptoPort {
  _enc = new TextEncoder();
  _dec = new TextDecoder();

  _hex(bytes) {
    return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
  }

  _unhex(str) {
    if (typeof str !== 'string' || str.length % 2 || !/^[0-9a-f]*$/i.test(str)) {
      throw new Error('Formato hexadecimal inválido.');
    }
    return Uint8Array.from(str.match(/.{2}/g) || [], h => parseInt(h, 16));
  }

  randomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  async sha256(data) {
    const bytes = typeof data === 'string' ? this._enc.encode(data) : data;
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return this._hex(digest);
  }

  equalHex(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  async deriveKey(password, salt, iterations = 650000) {
    if (!Number.isSafeInteger(iterations) || iterations < 450000 || iterations > 1400000) {
      throw new Error('Parâmetros de chave KDF inválidos. Mínimo de 450.000 iterações obrigatório.');
    }
    const base = await crypto.subtle.importKey('raw', this._enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      base,
      256
    );
    return new Uint8Array(derived);
  }

  async importAesKey(rawbytes) {
    return crypto.subtle.importKey('raw', rawbytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  async seal(plain, key, aad = '') {
    const iv = this.randomBytes(12);
    const opt = { name: 'AES-GCM', iv };
    if (aad) opt.additionalData = typeof aad === 'string' ? this._enc.encode(aad) : aad;
    const ciphertext = await crypto.subtle.encrypt(opt, key, this._enc.encode(JSON.stringify(plain)));
    return {
      iv: this._hex(iv),
      data: this._hex(ciphertext)
    };
  }

  async open(packet, key, aad = '') {
    if (!packet || typeof packet !== 'object') throw new Error('Cofre inválido.');
    const iv = this._unhex(packet.iv);
    if (iv.length !== 12) throw new Error('IV com comprimento incorreto.');
    const opt = { name: 'AES-GCM', iv };
    if (aad) opt.additionalData = typeof aad === 'string' ? this._enc.encode(aad) : aad;
    const decrypted = await crypto.subtle.decrypt(opt, key, this._unhex(packet.data));
    return JSON.parse(this._dec.decode(decrypted));
  }

  async wrapKey(secret, rawkey) {
    const salt = this.randomBytes(16);
    const iterations = 650000;
    const derived = await this.deriveKey(secret, salt, iterations);
    const wrapping = await this.importAesKey(derived);
    return {
      salt: this._hex(salt),
      iterations,
      wrapped: await this.seal({ key: this._hex(rawkey) }, wrapping)
    };
  }

  async unwrapKey(secret, record) {
    if (!record || !record.salt || !record.wrapped) {
      throw new Error('Credencial criptografada indisponível.');
    }
    const salt = this._unhex(record.salt);
    const derived = await this.deriveKey(secret, salt, record.iterations);
    const wrapping = await this.importAesKey(derived);
    const opened = await this.open(record.wrapped, wrapping);
    return this._unhex(opened.key);
  }
}
