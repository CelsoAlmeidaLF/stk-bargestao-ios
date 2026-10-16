/**
 * Serviço de Aplicação: Autenticação, Sessão e Credenciais
 */
export class AuthService {
  _crypto;
  _storage;
  _session = null;
  _vaultraw = null;
  _vaultkey = null;
  _meta = null;

  constructor(crypto, storage) {
    this._crypto = crypto;
    this._storage = storage;
  }

  getSession() {
    return this._session ? structuredClone(this._session) : null;
  }

  getVaultKey() {
    return this._vaultkey;
  }

  getVaultRaw() {
    return this._vaultraw;
  }

  getMeta() {
    return this._meta ? structuredClone(this._meta) : null;
  }

  isManager() {
    return this._session?.perfil === 'gerente';
  }

  setMeta(meta) {
    this._meta = meta;
  }

  async loadMeta() {
    this._meta = (await this._storage.dbRead('private', 'auth')) || null;
    return this._meta;
  }

  async saveMeta(nextmeta) {
    await this._storage.dbWrite('private', 'auth', nextmeta);
    this._meta = nextmeta;
  }

  async _getDeviceKey() {
    let key = await this._storage.dbRead('device', 'device-wrap');
    if (!key) {
      key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      await this._storage.dbWrite('device', 'device-wrap', key);
      key = await this._storage.dbRead('device', 'device-wrap');
    }
    return key;
  }

  validatePassword(password) {
    return typeof password === 'string' && password.length >= 8 && new TextEncoder().encode(password).length <= 256;
  }

  validatePin(pin) {
    return /^\d{6,8}$/.test(pin) &&
      !/(\d)\1{4}/.test(pin) &&
      !'01234567890123456789'.includes(pin) &&
      !'98765432109876543210'.includes(pin);
  }

  async passwordAuth(username, password) {
    const user = this._meta?.usuarios?.find(u => u.usuario.toLowerCase() === username.toLowerCase() && u.ativo !== false);
    if (!user) throw new Error('Conta não encontrada.');

    const raw = await this._crypto.unwrapKey(password, user.senha);
    const key = await this._crypto.importAesKey(raw);

    this._vaultraw = raw;
    this._vaultkey = key;
    this._session = { usuario: user.usuario, perfil: user.perfil };

    const updated = structuredClone(this._meta);
    updated.lastUser = user.usuario;
    await this.saveMeta(updated);

    return { raw, key, session: this._session };
  }

  /**
   * PIN v2: o PIN é fator criptográfico. A chave do cofre é embrulhada por uma KEK derivada do PIN
   * (PBKDF2) e esse embrulho é selado com a chave não extraível do dispositivo. Sem o PIN correto o
   * AES-GCM não abre — não existe hash de PIN para comparar nem atalho pelo selo do dispositivo.
   * Após MAX_PIN_FAILURES erros o selo é apagado e só a senha mestra desbloqueia.
   */
  static MAX_PIN_FAILURES = 5;
  static PIN_ITERATIONS = 650000;

  _pinAad(usuario, layer) {
    return `BG:pin:v2:${layer}:${usuario}`;
  }

  async _derivePinKek(pin, saltHex, iterations) {
    const salt = Uint8Array.from(saltHex.match(/.{2}/g), h => parseInt(h, 16));
    const raw = await this._crypto.deriveKey('BG_PIN:' + pin, salt, iterations);
    try {
      return await this._crypto.importAesKey(raw);
    } finally {
      raw.fill(0);
    }
  }

  async _clearPin(usuario) {
    const draft = structuredClone(this._meta);
    const target = draft.usuarios.find(u => u.usuario === usuario);
    target.pin = null;
    target.deviceSeal = null;
    await this.saveMeta(draft);
  }

  async pinAuth(username, pin) {
    const user = this._meta?.usuarios?.find(u => u.usuario.toLowerCase() === username.toLowerCase() && u.ativo !== false);
    if (!user?.pin || !user.deviceSeal) {
      throw new Error('Este usuário precisa entrar com senha e configurar PIN neste aparelho.');
    }

    // PIN do formato antigo (selo sem fator PIN): desativa em vez de aceitar
    if (user.pin.v !== 2) {
      await this._clearPin(user.usuario);
      throw new Error('Por segurança, o PIN antigo foi desativado. Entre com a senha e configure o PIN novamente.');
    }

    const keydevice = await this._storage.dbRead('device', 'device-wrap');
    if (!keydevice) throw new Error('Chave local perdida. Entre com sua senha mestra.');

    let inner;
    try {
      inner = await this._crypto.open(user.deviceSeal, keydevice, this._pinAad(user.usuario, 'device'));
    } catch {
      await this._clearPin(user.usuario);
      throw new Error('PIN inválido neste aparelho. Entre com sua senha mestra.');
    }

    let raw;
    try {
      const kek = await this._derivePinKek(pin, user.pin.salt, user.pin.iterations);
      const opened = await this._crypto.open(inner, kek, this._pinAad(user.usuario, 'pin'));
      raw = Uint8Array.from(opened.key.match(/.{2}/g), h => parseInt(h, 16));
    } catch {
      const failures = (user.pin.failures || 0) + 1;
      if (failures >= AuthService.MAX_PIN_FAILURES) {
        await this._clearPin(user.usuario);
        throw new Error('PIN incorreto. Limite de tentativas atingido: entre com sua senha mestra.');
      }
      const draft = structuredClone(this._meta);
      draft.usuarios.find(u => u.usuario === user.usuario).pin.failures = failures;
      await this.saveMeta(draft);
      throw new Error(`PIN incorreto. Restam ${AuthService.MAX_PIN_FAILURES - failures} tentativa(s).`);
    }

    const key = await this._crypto.importAesKey(raw);
    this._vaultraw = raw;
    this._vaultkey = key;
    this._session = { usuario: user.usuario, perfil: user.perfil };

    const draft = structuredClone(this._meta);
    const target = draft.usuarios.find(u => u.usuario === user.usuario);
    target.pin.failures = 0;
    draft.lastUser = user.usuario;
    await this.saveMeta(draft);

    return { raw, key, session: this._session };
  }

  async enableOwnPin(currentpassword, newpin) {
    if (!this._session) throw new Error('Sessão inativa.');
    const user = this._meta?.usuarios?.find(u => u.usuario === this._session.usuario);
    if (!user || !this.validatePin(newpin)) {
      throw new Error('Use PIN de 6 a 8 dígitos não sequenciais.');
    }

    const test = await this._crypto.unwrapKey(currentpassword, user.senha);
    const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
    if (!this._crypto.equalHex(hex(test), hex(this._vaultraw))) {
      throw new Error('Senha atual incorreta.');
    }

    const salt = hex(this._crypto.randomBytes(16));
    const iterations = AuthService.PIN_ITERATIONS;
    const kek = await this._derivePinKek(newpin, salt, iterations);
    const inner = await this._crypto.seal({ key: hex(this._vaultraw) }, kek, this._pinAad(this._session.usuario, 'pin'));
    const device = await this._getDeviceKey();

    const draft = structuredClone(this._meta);
    const target = draft.usuarios.find(u => u.usuario === this._session.usuario);
    target.pin = { v: 2, salt, iterations, failures: 0 };
    target.deviceSeal = await this._crypto.seal(inner, device, this._pinAad(this._session.usuario, 'device'));
    draft.lastUser = this._session.usuario;
    await this.saveMeta(draft);
  }

  async disableOwnPin() {
    if (!this._session) return;
    const draft = structuredClone(this._meta);
    const target = draft.usuarios.find(u => u.usuario === this._session.usuario);
    target.pin = null;
    target.deviceSeal = null;
    await this.saveMeta(draft);
  }

  async changeOwnPassword(oldpassword, newpassword) {
    if (!this._session) throw new Error('Sessão inativa.');
    if (!this.validatePassword(newpassword)) {
      throw new Error('Nova senha deve ter 8 ou mais caracteres.');
    }

    const current = this._meta.usuarios.find(u => u.usuario === this._session.usuario);
    const check = await this._crypto.unwrapKey(oldpassword, current.senha);
    const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
    if (!this._crypto.equalHex(hex(check), hex(this._vaultraw))) {
      throw new Error('Senha atual incorreta.');
    }

    const draft = structuredClone(this._meta);
    const target = draft.usuarios.find(u => u.usuario === this._session.usuario);
    target.senha = await this._crypto.wrapKey(newpassword, this._vaultraw);
    target.pin = null;
    target.deviceSeal = null;
    await this.saveMeta(draft);
  }

  /**
   * Login salvo (v2.7.0): depois do 1º login com usuário e senha, a chave do cofre fica guardada no cofre do kit
   * (window.secureStorage), que só abre com o PIN do aparelho, biometria ou as 12 palavras. Na próxima abertura o
   * PIN do aparelho já entra como esse usuário. Guarda a chave que a senha libera, nunca a senha.
   * Usuário desativado ou removido, ou chave que não abre os dados: o login salvo é apagado e volta a pedir a senha.
   */
  static LOGIN_SALVO = 'bg-login-salvo-v1';

  async rememberLogin(store) {
    if (!store || !this._session || !(this._vaultraw instanceof Uint8Array)) return false;
    const hex = Array.from(this._vaultraw, x => x.toString(16).padStart(2, '0')).join('');
    store.setItem(AuthService.LOGIN_SALVO, JSON.stringify({ v: 1, usuario: this._session.usuario, chave: hex, em: Date.now() }));
    return true;
  }

  forgetLogin(store) {
    try { store?.removeItem(AuthService.LOGIN_SALVO); } catch { /* cofre do kit bloqueado: nada a esquecer agora */ }
  }

  hasSavedLogin(store) {
    try { return !!store?.getItem(AuthService.LOGIN_SALVO); } catch { return false; }
  }

  async resumeLogin(store) {
    let texto, salvo;
    try { texto = store?.getItem(AuthService.LOGIN_SALVO); } catch { return null; }
    if (!texto) return null;
    try { salvo = JSON.parse(texto); } catch { salvo = null; }
    const user = salvo && this._meta?.usuarios?.find(u => u.usuario === salvo.usuario && u.ativo !== false);
    if (!salvo || salvo.v !== 1 || !user || !/^[0-9a-f]{64}$/.test(salvo.chave || '')) {
      this.forgetLogin(store);
      return null;
    }
    const raw = Uint8Array.from(salvo.chave.match(/.{2}/g), h => parseInt(h, 16));
    const key = await this._crypto.importAesKey(raw);
    this._vaultraw = raw;
    this._vaultkey = key;
    this._session = { usuario: user.usuario, perfil: user.perfil };
    if (this._meta.lastUser !== user.usuario) {
      const draft = structuredClone(this._meta);
      draft.lastUser = user.usuario;
      await this.saveMeta(draft);
    }
    return { raw, key, session: this._session };
  }

  discardSession() {
    this._session = null;
    if (this._vaultraw instanceof Uint8Array) {
      this._vaultraw.fill(0); // Sanitização de memória
    }
    this._vaultraw = null;
    this._vaultkey = null;
  }
}
