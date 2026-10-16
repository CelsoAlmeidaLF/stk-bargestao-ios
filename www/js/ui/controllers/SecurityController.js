import { BackupService } from '../../application/services/BackupService.js';
import { typedValue, clearTyped } from '../adapters/TypedSecrets.js';

/**
 * Controller de UI: Segurança, PIN, senha, auditoria, backup e recuperação.
 * Extraído de App.js; acessa estado, serviços e o commit transacional via `this._app`.
 */
export class SecurityController {
  _app;
  _pendingrecovery = null;
  _importpending = null;

  constructor(app) {
    this._app = app;
  }

  bind() {
    // Tela de autenticação: recuperação e restauração de backup
    document.getElementById('auth-recover')?.addEventListener('click', () => this._click_show_recovery());
    document.getElementById('auth-import-backup')?.addEventListener('click', () => document.getElementById('auth-backup-file')?.click());
    document.getElementById('auth-backup-file')?.addEventListener('change', e => this._change_import_file(e));

    // Mais Opções
    document.getElementById('more-backup')?.addEventListener('click', () => this._exportEncryptedBackup());
    document.getElementById('more-security')?.addEventListener('click', () => this._showSettings());
    document.getElementById('more-biometric')?.addEventListener('click', () => this._showSettings());
    document.getElementById('more-audit')?.addEventListener('click', () => this._showAudit());
    document.getElementById('more-recovery')?.addEventListener('click', () => this._rotateRecovery());
    document.getElementById('more-signout')?.addEventListener('click', () => this._forgetDevice());
    document.getElementById('more-export-json')?.addEventListener('click', () => this._exportEncryptedBackup());
    document.getElementById('more-import-json')?.addEventListener('click', () => document.getElementById('file-import-json')?.click());
    document.getElementById('more-backup-import')?.addEventListener('click', () => document.getElementById('file-import-json')?.click());
    document.getElementById('file-import-json')?.addEventListener('change', e => this._change_import_file(e));
    document.getElementById('form-import-backup')?.addEventListener('submit', e => this._submit_import_backup(e));

    // Formulários do Modal de Configurações e Segurança
    document.getElementById('form-security')?.addEventListener('submit', e => this._savePreferences(e));
    document.getElementById('form-pin')?.addEventListener('submit', e => this._configurePin(e));
    document.getElementById('security-forget-pin')?.addEventListener('click', () => this._forgetOwnPin());
    document.getElementById('form-change-password')?.addEventListener('submit', e => this._changeOwnPassword(e));
    document.getElementById('security-persist')?.addEventListener('click', () => this._requestPersistence());

    // Biometria (WebAuthn) ainda não implementada: não simular sucesso
    const biometricUnavailable = () => {
      this._app._renderer.toast('Desbloqueio biométrico ainda não está disponível nesta versão.');
      const bioStatus = document.getElementById('biometric-status');
      if (bioStatus) bioStatus.textContent = 'Biometria não disponível nesta versão.';
    };
    document.getElementById('biometric-enable')?.addEventListener('click', biometricUnavailable);
    document.getElementById('biometric-disable')?.addEventListener('click', biometricUnavailable);
    document.getElementById('bio-diagnose')?.addEventListener('click', () => {
      const bioDiag = document.getElementById('bio-diagnostic');
      if (bioDiag) {
        bioDiag.classList.remove('hidden');
        bioDiag.textContent = window.isSecureContext ? 'Contexto seguro (HTTPS/localhost): OK.' : 'Aviso: requer contexto seguro HTTPS.';
      }
    });

    // Frase de Recuperação
    document.getElementById('recovery-download-pdf')?.addEventListener('click', () => this._downloadRecoveryPdf());
    document.getElementById('recovery-confirm-checkbox')?.addEventListener('change', e => {
      const finish = document.getElementById('recovery-finish');
      if (finish) finish.disabled = !e.target.checked;
    });
    document.getElementById('recovery-finish')?.addEventListener('click', () => this._closeRecoveryDisplay());
    document.getElementById('modal-recuperar-cancel')?.addEventListener('click', () => document.getElementById('modal-recuperar')?.close());
    document.getElementById('form-recover-account')?.addEventListener('submit', e => this._submit_recover_account(e));
  }

  _displayRecovery(phrase, token) {
    this._pendingrecovery = { phrase, token };
    const panel = document.getElementById('recovery-words');
    if (panel) {
      panel.replaceChildren();
      phrase.split(' ').forEach((w, i) => {
        const item = this._app._renderer.make('div', 'recovery-word');
        item.append(
          this._app._renderer.make('small', '', String(i + 1).padStart(2, '0')),
          this._app._renderer.make('strong', '', w)
        );
        panel.append(item);
      });
    }
    document.getElementById('recovery-hash').value = token;
    document.getElementById('recovery-confirm-checkbox').checked = false;
    document.getElementById('recovery-finish').disabled = true;
    document.getElementById('modal-recovery-display')?.showModal();
  }

  _closeRecoveryDisplay() {
    this._pendingrecovery = null;
    document.getElementById('modal-recovery-display')?.close();
  }

  _showSettings() {
    const session = this._app._auth.getSession();
    if (!session) return;
    const meta = this._app._auth.getMeta();
    const user = meta?.usuarios?.find(u => u.usuario.toLowerCase() === session.usuario.toLowerCase());
    const whoEl = document.getElementById('security-who');
    if (whoEl) {
      whoEl.textContent = `${user?.usuario || session.usuario} (${session.perfil === 'gerente' ? 'Gerente' : 'Operador'}) · ${user?.pin && user?.deviceSeal ? 'PIN ativado' : 'PIN não configurado'}`;
    }
    const idleEl = document.getElementById('set-idle');
    if (idleEl) idleEl.value = String(this._app._settings?.idleMinutes || 5);
    const bgEl = document.getElementById('set-background');
    if (bgEl) bgEl.checked = this._app._settings?.lockOnHide !== false;
    const storageEl = document.getElementById('security-storage');
    if (storageEl) {
      storageEl.textContent = `Armazenamento: ${this._app._storage.getStorageType() || 'Local Seguro'}`;
    }
    const bioStatus = document.getElementById('biometric-status');
    if (bioStatus) {
      if (typeof window !== 'undefined' && window.PublicKeyCredential) {
        bioStatus.textContent = 'Autenticador de plataforma compatível neste navegador.';
      } else {
        bioStatus.textContent = 'Autenticador biométrico não suportado neste ambiente.';
      }
    }
    this._app._renderer._openModal('modal-seguranca');
  }

  async _savePreferences(event) {
    event.preventDefault();
    this._app._settings = {
      idleMinutes: Number(document.getElementById('set-idle')?.value) || 5,
      lockOnHide: document.getElementById('set-background')?.checked !== false
    };
    await this._app._storage.dbWrite('private', 'settings', this._app._settings);
    this._app._renderer._closeModal('modal-seguranca');
    this._app._renderer.toast('Preferências de segurança salvas.');
  }

  /** Senhas e PINs só digitados (padrão Systekna): valor posto por fora mostra o erro e cancela. */
  _readTyped(ids, errorEl) {
    try {
      return ids.map(id => typedValue(id));
    } catch (ex) {
      if (errorEl) errorEl.textContent = ex.message;
      return null;
    }
  }

  async _configurePin(event) {
    event.preventDefault();
    const errorEl = document.getElementById('pin-error');
    if (errorEl) errorEl.textContent = '';
    const typed = this._readTyped(['pin-current-password', 'pin-new', 'pin-confirm'], errorEl);
    if (!typed) return;
    const [currentPass, pinNew, pinConfirm] = typed;

    if (pinNew !== pinConfirm) {
      if (errorEl) errorEl.textContent = 'Confirmação do PIN não confere.';
      return;
    }

    try {
      await this._app._auth.enableOwnPin(currentPass, pinNew);
      event.target.reset();
      const whoEl = document.getElementById('security-who');
      if (whoEl) whoEl.textContent = `${this._app._auth.getSession().usuario} · PIN ativado`;
      this._app._renderer.toast('PIN deste aparelho configurado com sucesso.');
    } catch (ex) {
      if (errorEl) errorEl.textContent = ex.message;
    }
  }

  async _forgetOwnPin() {
    const session = this._app._auth.getSession();
    if (!session) return;
    if (!confirm('Deseja realmente remover o PIN configurado neste dispositivo?')) return;
    try {
      await this._app._auth.disableOwnPin();
      const whoEl = document.getElementById('security-who');
      if (whoEl) whoEl.textContent = `${session.usuario} · PIN não configurado`;
      this._app._renderer.toast('PIN removido. Use sua senha no próximo acesso.');
    } catch (ex) {
      this._app._renderer.toast(`Erro ao remover PIN: ${ex.message}`);
    }
  }

  async _changeOwnPassword(event) {
    event.preventDefault();
    const errorEl = document.getElementById('change-error');
    if (errorEl) errorEl.textContent = '';
    const typed = this._readTyped(['change-old', 'change-new', 'change-confirm'], errorEl);
    if (!typed) return;
    const [oldPass, newPass, confirmPass] = typed;

    if (!this._app._auth.validatePassword(newPass) || newPass !== confirmPass) {
      if (errorEl) errorEl.textContent = 'Nova senha deve ter 8+ caracteres e confirmação idêntica.';
      return;
    }

    try {
      await this._app._auth.changeOwnPassword(oldPass, newPass);
      event.target.reset();
      this._app._renderer.toast('Senha principal alterada com sucesso. PIN reinicializado por segurança.');
    } catch (ex) {
      if (errorEl) errorEl.textContent = ex.message;
    }
  }

  _showAudit() {
    if (!this._app._auth.isManager()) return;
    const root = document.getElementById('security-audit');
    if (root) {
      root.replaceChildren();
      const trails = (this._app._data?.auditoria || []).slice(0, 30);
      for (const item of trails) {
        const card = this._app._renderer.make('div', 'audit-record');
        card.append(
          this._app._renderer.make('strong', '', item.acao || 'Operação'),
          this._app._renderer.make('small', '', `${item.usuario || '—'} · ${this._app._renderer.dateLabel(item.data)} · ${item.id ? item.id.slice(0, 8) : ''}`)
        );
        root.append(card);
      }
      if (!trails.length) {
        root.append(this._app._renderer.empty('Nenhuma operação auditada até o momento.'));
      }
    }
    this._app._renderer._openModal('modal-auditoria');
  }

  async _requestPersistence() {
    // Edição Android: o banco SQLite fica na pasta privada do app; o sistema não o apaga por falta de espaço
    this._app._renderer.toast('Dados no banco SQLite do aparelho. Desinstalar o app apaga tudo: mantenha backups.');
  }

  /**
   * Na tela de sem permissão não há sessão: o arquivo continua cifrado (cofre + chaves embrulhadas),
   * então quem não tem a senha não lê nada; o estabelecimento só não fica refém dos próprios dados.
   */
  exportEncryptedBackup({ semSessao = false } = {}) {
    if (semSessao && this._app._governanceCtl.hasAccess()) return;
    return this._exportEncryptedBackup({ semSessao });
  }

  async _exportEncryptedBackup({ semSessao = false } = {}) {
    if (!semSessao && !this._app._auth.isManager()) return;
    const auth = this._app._auth.getMeta();
    const candidates = await this._app._storage.readCandidates();
    const packet = candidates[0];
    if (!packet) {
      return this._app._renderer.toast('Nenhum cofre cifrado encontrado para exportação.');
    }
    const backupPayload = {
      app: 'BarGestao',
      format: 7,
      exportadoEm: new Date().toISOString(),
      auth,
      vault: packet,
      // Sem o registro de governança, restaurar o backup em outro aparelho contornaria a homologação
      governanca: this._app._governance.exportForBackup()
    };
    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
    this._app._export.downloadBlob(blob, `bargestao-backup-${new Date().toISOString().slice(0, 10)}.json`);
    this._app._renderer.toast('Backup criptografado exportado com sucesso.');
  }

  async _forgetDevice() {
    if (!confirm('Sair deste aparelho? O login salvo será apagado e a próxima entrada pedirá usuário e senha.')) return;
    await this._app._auth.disableOwnPin();
    this._app._signOut();
  }

  async _rotateRecovery() {
    if (!this._app._auth.isManager()) return;
    const raw = this._app._auth.getVaultRaw();
    if (!raw) {
      this._app._renderer.toast('Desbloqueie o painel com sua senha para gerar uma nova frase.');
      return;
    }
    try {
      const { phrase, token } = await this._app._recovery.generatePhrase();
      // Persiste o novo registro antes de exibir: a frase anterior deixa de valer
      const record = await this._app._recovery.buildRecoveryRecord(token, raw);
      const nextMeta = structuredClone(this._app._auth.getMeta());
      nextMeta.recovery = record;
      await this._app._auth.saveMeta(nextMeta);
      this._displayRecovery(phrase, token);
    } catch (e) {
      this._app._renderer.toast('Não foi possível gerar a nova frase: ' + e.message);
    }
  }

  _click_show_recovery() {
    this._app._renderer._openModal('modal-recuperar');
  }

  async _submit_recover_account(event) {
    event.preventDefault();
    const token = document.getElementById('recover-token')?.value.trim();
    const user = document.getElementById('recover-user')?.value.trim();
    const errorEl = document.getElementById('recover-error');
    if (errorEl) errorEl.textContent = '';
    const typed = this._readTyped(['recover-password', 'recover-confirm'], errorEl);
    if (!typed) return;
    const [pass, confirm] = typed;

    if (!token || !user || !pass) {
      if (errorEl) errorEl.textContent = 'Preencha todos os campos obrigatórios.';
      return;
    }
    if (pass !== confirm) {
      if (errorEl) errorEl.textContent = 'Confirmação da nova senha não confere.';
      return;
    }
    if (!this._app._auth.validatePassword(pass)) {
      if (errorEl) errorEl.textContent = 'Nova senha deve ter no mínimo 8 caracteres.';
      return;
    }

    try {
      const meta = this._app._auth.getMeta();
      const rawkey = await this._app._recovery.unlockRecoveryKey(token, meta);
      const wrapped = await this._app._crypto.wrapKey(pass, rawkey);
      const nextMeta = structuredClone(meta);
      nextMeta.usuarios = [{
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'usr-mgr',
        usuario: user,
        perfil: 'gerente',
        ativo: true,
        senha: wrapped,
        pin: null,
        deviceSeal: null,
        criadoEm: new Date().toISOString()
      }];
      nextMeta.lastUser = user;
      await this._app._auth.saveMeta(nextMeta);
      this._app._renderer._closeModal('modal-recuperar');
      this._app._renderer.toast('Conta de administrador redefinida com sucesso.');
      const loginUser = document.getElementById('login-user');
      if (loginUser) loginUser.value = user;
      const loginSecret = document.getElementById('login-secret');
      clearTyped(loginSecret);
    } catch (ex) {
      if (errorEl) errorEl.textContent = ex.message;
    }
  }

  async _change_import_file(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 80 * 1024 * 1024) throw new Error('Arquivo grande demais para um backup do BarGestão.');
      const backup = BackupService.parse(await file.text());
      this._importpending = backup;
      this._openImportModal(backup);
    } catch (ex) {
      this._importpending = null;
      this._app._renderer.toast(`Backup recusado: ${ex.message}`);
    } finally {
      event.target.value = '';
    }
  }

  _openImportModal(backup) {
    document.getElementById('form-import-backup')?.reset();
    const errorEl = document.getElementById('import-error');
    if (errorEl) errorEl.textContent = '';
    const hasLocal = Boolean(this._app._auth.getMeta());
    document.getElementById('import-current-wrap')?.classList.toggle('hidden', !hasLocal);
    for (const id of ['import-current-user', 'import-current-password']) {
      const el = document.getElementById(id);
      if (el) el.required = hasLocal;
    }
    const summary = document.getElementById('import-summary');
    if (summary) {
      const quando = backup.exportadoEm ? this._app._renderer.dateLabel(backup.exportadoEm) : 'data desconhecida';
      const gerentes = backup.auth.usuarios.filter(u => u.perfil === 'gerente').map(u => u.usuario).join(', ');
      summary.textContent = `Backup de ${quando} · ${backup.auth.usuarios.length} usuário(s) · gerente(s): ${gerentes}.`
        + (hasLocal ? ' O cadastro e os dados atuais deste aparelho serão substituídos.' : '');
    }
    const userInput = document.getElementById('import-user');
    if (userInput) userInput.value = backup.auth.lastUser || '';
    this._app._renderer._openModal('modal-import-backup', 'import-password');
  }

  async _submit_import_backup(event) {
    event.preventDefault();
    const backup = this._importpending;
    const errorEl = document.getElementById('import-error');
    if (errorEl) errorEl.textContent = '';
    if (!backup) {
      this._app._renderer._closeModal('modal-import-backup');
      return;
    }
    const button = document.getElementById('import-submit');
    if (button) button.disabled = true;
    try {
      if (!document.getElementById('import-confirm')?.checked) {
        throw new Error('Confirme que os dados atuais serão substituídos.');
      }
      const service = new BackupService(this._app._crypto);
      await service.verify(backup, document.getElementById('import-user')?.value, document.getElementById('import-password')?.value);

      const currentMeta = this._app._auth.getMeta();
      if (currentMeta) {
        await service.verifyCurrentManager(currentMeta,
          document.getElementById('import-current-user')?.value,
          document.getElementById('import-current-password')?.value);
        // Guarda o cadastro anterior para reversão manual
        await this._app._storage.dbWrite('private', 'auth-previous', { auth: currentMeta, guardadoEm: new Date().toISOString() });
      }

      await this._app._storage.dbWrite('private', 'backup-candidates', [backup.vault]);
      await this._app._storage.dbWrite('private', 'auth', backup.auth);
      if (backup.governanca) await this._app._governance.restoreFromBackup(backup.governanca);
      this._importpending = null;

      this._app._renderer._closeModal('modal-import-backup');
      this._app._renderer.toast('Backup restaurado. Entre com as credenciais do backup.');
      // Recarrega para a tela de login refletir o cadastro restaurado (e encerrar sessão aberta)
      this._app._auth.discardSession();
      setTimeout(() => window.stkRecarregar(), 1200); // edição Android: espera o SQLite gravar
    } catch (ex) {
      if (errorEl) errorEl.textContent = ex.message;
    } finally {
      if (button) button.disabled = false;
    }
  }

  // Frase de recuperação em arquivo: texto puro gerado no aparelho (sem servidor, sem dependência de PDF)
  _downloadRecoveryPdf() {
    if (!this._pendingrecovery) return;
    const { phrase, token } = this._pendingrecovery;
    const words = phrase.split(' ').map((w, i) => `${String(i + 1).padStart(2, '0')}. ${w}`).join('\n');
    const content = [
      'BarGestão — Frase de recuperação do cofre',
      `Gerada em: ${new Date().toLocaleString('pt-BR')}`,
      '',
      'Guarde este arquivo offline (impresso ou em mídia própria) e apague-o deste aparelho.',
      'Quem tiver estas palavras consegue redefinir a senha do gerente.',
      '',
      words,
      '',
      `Chave de recuperação (alternativa às palavras): ${token}`,
      ''
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    this._app._export.downloadBlob(blob, `bargestao-recuperacao-${new Date().toISOString().slice(0, 10)}.txt`);
    this._app._renderer.toast('Arquivo com a frase de recuperação baixado. Guarde offline e apague do aparelho.');
  }
}
