import { BG12_LEGACY_WORDS } from '../../domain/values/Bg12LegacyWords.js';

/**
 * Serviço de Aplicação: Protocolo de Recuperação de Emergência (BG12-v1)
 *
 * Padrão Systekna: as 12 palavras usam a lista BIP39 em português do kit de segurança
 * (FinancVault.seed, PACOTES/stk-pkg-security). O token só depende da entropia, então frases
 * antigas em inglês (lista BG12 legada) continuam abrindo o mesmo registro de recuperação.
 */
const TOKEN_PREFIX = 'BarGestao:Recovery-BG12:v1:';
const hex = bytes => Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');

export class RecoveryService {
  _crypto;
  _seed;

  /**
   * @param {object} crypto adaptador WebCrypto
   * @param {object} [seed] codificador de 12 palavras do kit ({ wordsFromEntropy, entropyFromWords })
   */
  constructor(crypto, seed = globalThis.FinancVault?.seed) {
    this._crypto = crypto;
    this._seed = seed;
  }

  _requireSeed() {
    if (!this._seed?.wordsFromEntropy || !this._seed?.entropyFromWords) {
      throw new Error('Kit de segurança Systekna não carregado.');
    }
    return this._seed;
  }

  async _token(entropy) {
    return this._crypto.sha256(TOKEN_PREFIX + hex(entropy));
  }

  async generatePhrase() {
    const entropy = this._crypto.randomBytes(16);
    const words = await this._requireSeed().wordsFromEntropy(entropy);
    return { phrase: words.join(' '), token: await this._token(entropy) };
  }

  async parsePhrase(phrase) {
    const seed = this._requireSeed();
    let entropy;
    try {
      entropy = await seed.entropyFromWords(phrase);
    } catch (error) {
      entropy = await this._legacyEntropy(phrase);
      if (!entropy) throw error;
    }
    const words = await seed.wordsFromEntropy(entropy);
    return { phrase: words.join(' '), token: await this._token(entropy) };
  }

  /** Frase BG12 antiga (inglês). Retorna null se não for desse formato; lança se o checksum falhar. */
  async _legacyEntropy(phrase) {
    const parts = String(phrase).toLowerCase().normalize('NFKD').trim().split(/\s+/g);
    if (parts.length !== 12) return null;
    const positions = parts.map(w => BG12_LEGACY_WORDS.indexOf(w));
    if (positions.includes(-1)) return null;

    const bits = positions.map(n => n.toString(2).padStart(11, '0')).join('');
    const entropy = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      entropy[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    }
    const digestHex = await this._crypto.sha256(entropy);
    const check = parseInt(digestHex.slice(0, 2), 16).toString(2).padStart(8, '0').slice(0, 4);
    if (bits.slice(128) !== check) {
      throw new Error('As 12 palavras não passaram no teste de integridade. Confira a ordem.');
    }
    return entropy;
  }

  async buildRecoveryRecord(token, rawkey) {
    const unhex = s => Uint8Array.from(s.match(/.{2}/g), h => parseInt(h, 16));
    const key = await this._crypto.importAesKey(unhex(token));
    const id = (await this._crypto.sha256(token)).slice(0, 20);
    const wrapped = await this._crypto.seal({ key: hex(new Uint8Array(rawkey)) }, key, 'BG:v8:recovery:DEK');

    return {
      format: 'BG12-v1',
      criadoEm: new Date().toISOString(),
      identificador: id,
      wrapped
    };
  }

  async unlockRecoveryKey(input, auth) {
    if (!auth?.recovery?.wrapped) {
      throw new Error('Esta conta não possui frase de recuperação cadastrada.');
    }
    const normalized = input.trim();
    let token;
    if (/^[0-9a-f]{64}$/i.test(normalized)) {
      token = normalized.toLowerCase();
    } else {
      token = (await this.parsePhrase(normalized)).token;
    }

    const unhex = s => Uint8Array.from(s.match(/.{2}/g), h => parseInt(h, 16));
    const key = await this._crypto.importAesKey(unhex(token));
    const opened = await this._crypto.open(auth.recovery.wrapped, key, 'BG:v8:recovery:DEK');
    return unhex(opened.key);
  }
}
