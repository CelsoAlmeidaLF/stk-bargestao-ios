import { GOVERNANCE_STATES, GovernanceService } from '../../application/services/GovernanceService.js';

/**
 * Controller de UI: Governança Systekna.
 * Fluxo: cadastro no app → impressão digital (UID) → solicitação no Firebase → a governança aprova ou não.
 * - Sem aprovação vinda do Firebase o app não abre: mostra "Sem permissão" (ou "em análise") com o UID,
 *   "Verificar novamente" e a exportação do backup criptografado (doc 12, RN-FIREBASE.3)
 * - Funcionalidades (mesas, exportação XLSX, limite de produtos) liberadas/bloqueadas pelo tenant (doc 14),
 *   reconsultadas ao voltar ao app, ao reconectar e periodicamente — sem esperar novo login
 * - Feedback do gestor e telemetria de erros sanitizada, ligados ao UID (doc 13)
 */
export class GovernanceController {
  _app;
  _service;
  _onGranted = null;
  _lastSync = 0;
  _syncing = false;

  // Reconsulta da licença: intervalo e espaçamento mínimo entre consultas
  static WATCH_INTERVAL_MS = 15 * 60 * 1000;
  static MIN_GAP_MS = 60 * 1000;

  constructor(app, service) {
    this._app = app;
    this._service = service;
  }

  bind() {
    document.getElementById('gov-register-form')?.addEventListener('submit', e => this._submit_registration(e));
    document.getElementById('gov-check-status')?.addEventListener('click', () => this._checkStatus());
    document.getElementById('gov-export-backup')?.addEventListener('click', () => this._app._securityCtl.exportEncryptedBackup({ semSessao: true }));
    document.getElementById('more-feedback')?.addEventListener('click', () => this._openFeedback());
    document.getElementById('form-feedback')?.addEventListener('submit', e => this._submit_feedback(e));
  }

  /** Telemetria: erros não tratados vão sanitizados para a governança (falha silenciosa). */
  installErrorReporting() {
    window.addEventListener('error', e => { this._service.reportError(e.error || e.message); });
    window.addEventListener('unhandledrejection', e => { this._service.reportError(e.reason); });
  }

  report(error, modulo) {
    return this._service.reportError(error, modulo);
  }

  hasAccess() {
    return this._service.hasAccess();
  }

  allowsTables() {
    return this._service.allowsTables();
  }

  allowsXlsxExport() {
    return this._service.allowsXlsxExport();
  }

  /** Bloqueia a exportação XLSX desligada pela governança. @returns {boolean} true se pode exportar */
  ensureXlsxAllowed() {
    if (this.allowsXlsxExport()) return true;
    this._app._renderer.toast('A exportação em Excel não está liberada pela Governança Systekna. Use o PDF.');
    return false;
  }

  /** Lança erro (dentro do _commit) se um produto novo ultrapassar o limite do plano. */
  ensureProductCapacity(database) {
    const limite = this._service.productLimit();
    if (limite === null) return;
    const ativos = (database.produtos || []).filter(p => p.ativo !== false).length;
    if (ativos >= limite) {
      throw new Error(`limite de ${limite} produtos do plano atingido. Fale com a Governança Systekna para ampliar.`);
    }
  }

  isBlocked() {
    return this._service.isBlocked();
  }

  blockMessage() {
    const reason = this._service.getBlockReason();
    return `Sem permissão da Governança Systekna${reason ? `: ${reason}` : '.'}`;
  }

  // ---------------------------------------------------------------------------
  // Porta de entrada: o app só abre com aprovação confirmada no Firebase
  // ---------------------------------------------------------------------------

  /**
   * @param {Function} onGranted chamado quando a governança libera depois (via "Verificar novamente")
   * @returns {Promise<boolean>} true se o acesso já está liberado e o login/setup pode seguir
   */
  async gate(onGranted) {
    this._onGranted = onGranted;
    if (!this._service.getRecord()) {
      this._showPanel('register');
      return false;
    }
    this._lastSync = Date.now();
    const result = await this._service.refresh();
    if (this.hasAccess()) {
      this._showPanel(null);
      return true;
    }
    this._renderStatus(result);
    return false;
  }

  _showPanel(which) {
    document.getElementById('gov-register')?.classList.toggle('hidden', which !== 'register');
    document.getElementById('gov-pending')?.classList.toggle('hidden', which !== 'status');
    document.getElementById('auth-login-stack')?.classList.toggle('hidden', which !== null);
    document.getElementById('setup-notice')?.classList.toggle('hidden', which !== null);
    document.getElementById('autofill-note')?.classList.toggle('hidden', which !== null);
    document.getElementById('auth-intro-text')?.classList.toggle('hidden', which !== null);
    const title = document.getElementById('auth-welcome-title');
    if (title && which === 'register') title.textContent = 'Solicitar liberação de acesso';
  }

  _isGateOpen() {
    return !document.getElementById('gov-register')?.classList.contains('hidden')
      || !document.getElementById('gov-pending')?.classList.contains('hidden');
  }

  async _renderStatus(result) {
    this._showPanel('status');
    const pending = this._service.getState() === GOVERNANCE_STATES.PENDING;
    const title = document.getElementById('auth-welcome-title');
    if (title) title.textContent = pending ? 'Cadastro em análise' : 'Sem permissão';

    const text = document.getElementById('gov-pending-text');
    if (text) {
      if (pending && result.offline) {
        text.textContent = 'Sem conexão com a Governança da Systekna. Conecte-se à internet e verifique novamente.';
      } else if (pending) {
        text.textContent = 'Sua solicitação foi enviada para a Governança da Systekna e está em análise. Informe a impressão digital abaixo se precisar falar com o suporte.';
      } else {
        text.textContent = `Você não tem permissão para usar o BarGestão. ${this._capitalize(this._service.getBlockReason())}.`;
      }
    }
    const uid = document.getElementById('gov-uid');
    if (uid) uid.textContent = GovernanceService.formatUid(this._service.getUid()) || '—';

    // Sem permissão: o estabelecimento ainda pode levar os próprios dados (cifrados) embora
    const exportBtn = document.getElementById('gov-export-backup');
    if (exportBtn) {
      const hasData = !pending && (await this._app._storage.readCandidates()).length > 0 && Boolean(this._app._auth.getMeta());
      exportBtn.classList.toggle('hidden', !hasData);
    }
  }

  _capitalize(text) {
    const t = String(text || '').trim().replace(/\.$/, '');
    return t ? t[0].toUpperCase() + t.slice(1) : 'Acesso não liberado';
  }

  async _submit_registration(event) {
    event.preventDefault();
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.textContent = '';
    const button = document.getElementById('gov-register-submit');
    if (button) button.disabled = true;
    try {
      const record = await this._service.submitRegistration({
        usuario: document.getElementById('gov-usuario')?.value,
        nomeEstabelecimento: document.getElementById('gov-nome')?.value,
        cnpj: document.getElementById('gov-cnpj')?.value,
        tipoComercio: document.getElementById('gov-tipo')?.value
      });
      const loginUser = document.getElementById('login-user');
      if (loginUser && !loginUser.value) loginUser.value = record.usuario;
      await this._renderStatus({ state: GOVERNANCE_STATES.PENDING, offline: false });
    } catch (e) {
      if (errorEl) errorEl.textContent = 'Não foi possível enviar a solicitação: ' + e.message;
    } finally {
      if (button) button.disabled = false;
    }
  }

  async _checkStatus() {
    const button = document.getElementById('gov-check-status');
    if (button) button.disabled = true;
    try {
      this._lastSync = Date.now();
      const result = await this._service.refresh();
      if (this.hasAccess()) {
        this._grant();
      } else {
        await this._renderStatus(result);
        this._app._renderer.toast(result.offline ? 'Sem conexão com a governança.' : 'Acesso ainda não liberado.');
      }
    } finally {
      if (button) button.disabled = false;
    }
  }

  _grant() {
    this._showPanel(null);
    const loginUser = document.getElementById('login-user');
    if (loginUser && !loginUser.value) loginUser.value = this._service.getRecord()?.usuario || '';
    this._onGranted?.();
    this._app._renderer.toast('Acesso liberado pela Governança Systekna.');
  }

  /** Perdeu a permissão com o app aberto: encerra a sessão e mostra a tela de sem permissão. */
  async _lockOut(result) {
    if (this._app._auth.getSession()) this._app._discardSession();
    await this._renderStatus(result);
  }

  // ---------------------------------------------------------------------------
  // Após o login e com o app aberto: permissões sempre vindas do Firebase
  // ---------------------------------------------------------------------------

  async syncAfterLogin() {
    this._lastSync = Date.now();
    const result = await this._service.refresh();
    if (!this.hasAccess()) return this._lockOut(result);
    this.applyState();
  }

  /** Bloqueio/liberação feitos no painel chegam com o app aberto, sem depender de novo login. */
  startWatching() {
    const tick = () => { this.resync().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
    window.addEventListener('online', tick);
    setInterval(tick, GovernanceController.WATCH_INTERVAL_MS);
  }

  async resync() {
    const inSession = Boolean(this._app._auth.getSession());
    const waiting = !inSession && this._isGateOpen() && this._service.getRecord();
    if (this._syncing || (!inSession && !waiting)) return;
    if (Date.now() - this._lastSync < GovernanceController.MIN_GAP_MS) return;
    this._syncing = true;
    this._lastSync = Date.now();
    try {
      const before = JSON.stringify(this._service.getRecord()?.lastState || null);
      const result = await this._service.refresh();
      if (!inSession) {
        if (this.hasAccess()) this._grant();
        else await this._renderStatus(result);
        return;
      }
      if (!this.hasAccess()) return this._lockOut(result);
      // Só redesenha quando algo mudou, para não atrapalhar quem está lançando
      if (before !== JSON.stringify(this._service.getRecord()?.lastState || null)) {
        this.applyState();
        this._app._renderer.toast('A Governança Systekna atualizou as permissões deste aparelho.');
      }
    } finally {
      this._syncing = false;
    }
  }

  applyState() {
    const tables = this.allowsTables();
    for (const id of ['home-new-order', 'home-all-tables']) {
      document.getElementById(id)?.classList.toggle('hidden', !tables);
    }
    const xlsx = this.allowsXlsxExport();
    for (const id of ['cash-export-xlsx', 'more-export-excel']) {
      document.getElementById(id)?.classList.toggle('hidden', !xlsx);
    }
    if (!tables && this._app._currenttab === 'vendas') {
      this._app._currenttab = 'inicio';
    }
    if (this._app._auth.getSession()) {
      this._app._changeTab(this._app._currenttab);
    }
  }

  // ---------------------------------------------------------------------------
  // Feedback do gestor
  // ---------------------------------------------------------------------------

  _openFeedback() {
    document.getElementById('form-feedback')?.reset();
    const errorEl = document.getElementById('feedback-error');
    if (errorEl) errorEl.textContent = '';
    this._app._renderer._openModal('modal-feedback', 'feedback-tipo');
  }

  async _submit_feedback(event) {
    event.preventDefault();
    const errorEl = document.getElementById('feedback-error');
    if (errorEl) errorEl.textContent = '';
    const button = document.getElementById('feedback-submit');
    if (button) button.disabled = true;
    try {
      await this._service.sendFeedback({
        tipo: document.getElementById('feedback-tipo')?.value,
        avaliacao: Number(document.getElementById('feedback-nota')?.value),
        mensagem: document.getElementById('feedback-mensagem')?.value
      });
      this._app._renderer._closeModal('modal-feedback');
      this._app._renderer.toast('Feedback recebido pela Governança da Systekna. Obrigado!');
    } catch (e) {
      if (errorEl) errorEl.textContent = e.message;
    } finally {
      if (button) button.disabled = false;
    }
  }
}
