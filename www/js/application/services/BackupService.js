/**
 * Serviço de Aplicação: validação e verificação de backup criptografado (formato 7).
 * Um backup só é aceito se tiver estrutura válida E se a credencial informada abrir o cofre
 * contido nele — nada é gravado no aparelho antes disso.
 */
const HEX = /^[0-9a-f]*$/i;
const PERFIS = ['gerente', 'operador'];

function isHex(value, len = null) {
  return typeof value === 'string' && HEX.test(value) && value.length % 2 === 0 && (len === null || value.length === len);
}

function isSealed(packet) {
  return Boolean(packet) && isHex(packet.iv, 24) && isHex(packet.data) && packet.data.length > 0 && packet.data.length <= 64 * 1024 * 1024;
}

function isWrappedKey(record) {
  return Boolean(record)
    && isHex(record.salt, 32)
    && Number.isSafeInteger(record.iterations)
    && record.iterations >= 450000 && record.iterations <= 1400000
    && isSealed(record.wrapped);
}

export class BackupService {
  _crypto;

  constructor(crypto) {
    this._crypto = crypto;
  }

  /**
   * Valida a estrutura e devolve uma cópia saneada (PIN e selos de dispositivo removidos:
   * pertencem ao aparelho de origem e não valem em outro).
   */
  static parse(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Arquivo não é um JSON válido.');
    }
    if (!parsed || parsed.app !== 'BarGestao' || parsed.format !== 7) {
      throw new Error('Arquivo não é um backup do BarGestão (formato 7).');
    }

    const { auth, vault } = parsed;
    if (!auth || !Array.isArray(auth.usuarios) || auth.usuarios.length < 1 || auth.usuarios.length > 100) {
      throw new Error('Backup sem usuários válidos.');
    }
    const usuarios = auth.usuarios.map((u) => {
      if (!u || typeof u.usuario !== 'string' || u.usuario.length < 1 || u.usuario.length > 60) {
        throw new Error('Backup com usuário inválido.');
      }
      if (!PERFIS.includes(u.perfil)) throw new Error(`Perfil inválido no backup: ${String(u.perfil).slice(0, 20)}.`);
      if (!isWrappedKey(u.senha)) throw new Error(`Credencial inválida no backup para ${u.usuario}.`);
      return {
        usuario: u.usuario,
        perfil: u.perfil,
        email: typeof u.email === 'string' ? u.email.slice(0, 180) : null,
        senha: u.senha,
        pin: null,
        deviceSeal: null,
        ativo: u.ativo !== false
      };
    });
    if (!usuarios.some(u => u.perfil === 'gerente' && u.ativo)) {
      throw new Error('Backup sem gerente ativo.');
    }

    let recovery = null;
    if (auth.recovery) {
      if (typeof auth.recovery.identificador !== 'string' || !isSealed(auth.recovery.wrapped)) {
        throw new Error('Registro de recuperação inválido no backup.');
      }
      recovery = {
        format: String(auth.recovery.format || 'BG12-v1'),
        criadoEm: String(auth.recovery.criadoEm || ''),
        identificador: auth.recovery.identificador.slice(0, 64),
        wrapped: auth.recovery.wrapped
      };
    }

    if (!vault || vault.v !== 7 || !Number.isSafeInteger(vault.seq) || vault.seq < 1 || !isSealed(vault.payload)) {
      throw new Error('Cofre do backup inválido.');
    }

    return {
      exportadoEm: typeof parsed.exportadoEm === 'string' ? parsed.exportadoEm : null,
      auth: {
        version: 7,
        usuarios,
        lastUser: usuarios.find(u => u.perfil === 'gerente' && u.ativo).usuario,
        criadoEm: typeof auth.criadoEm === 'string' ? auth.criadoEm : null,
        recovery
      },
      vault: { app: 'BarGestao', v: 7, seq: vault.seq, alteradoEm: String(vault.alteradoEm || ''), payload: vault.payload },
      governanca: parsed.governanca && typeof parsed.governanca === 'object' ? parsed.governanca : null
    };
  }

  /** Prova de posse: a senha de um usuário do backup precisa abrir o cofre contido nele. */
  async verify(backup, usuario, senha) {
    const user = backup.auth.usuarios.find(u => u.usuario.toLowerCase() === String(usuario || '').toLowerCase());
    if (!user) throw new Error('Usuário não encontrado no backup.');
    let raw;
    try {
      raw = await this._crypto.unwrapKey(senha, user.senha);
    } catch {
      throw new Error('Senha do backup incorreta.');
    }
    try {
      const key = await this._crypto.importAesKey(raw);
      const content = await this._crypto.open(backup.vault.payload, key, `BG:v7:operacional:${backup.vault.seq}`);
      if (!content || typeof content !== 'object') throw new Error();
    } catch {
      throw new Error('O cofre do backup não abre com essa credencial (arquivo corrompido ou adulterado).');
    } finally {
      raw.fill(0);
    }
    return true;
  }

  /** Confirma a senha de um gerente do cadastro atual antes de substituí-lo. */
  async verifyCurrentManager(meta, usuario, senha) {
    const user = meta?.usuarios?.find(u => u.usuario.toLowerCase() === String(usuario || '').toLowerCase() && u.ativo !== false);
    if (!user || user.perfil !== 'gerente') throw new Error('Informe um gerente do cadastro atual deste aparelho.');
    try {
      const raw = await this._crypto.unwrapKey(senha, user.senha);
      raw.fill(0);
    } catch {
      throw new Error('Senha do gerente atual incorreta.');
    }
    return true;
  }
}
