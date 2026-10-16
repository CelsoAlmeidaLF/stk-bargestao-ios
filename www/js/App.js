import { WebCryptoAdapter } from './infrastructure/adapters/WebCryptoAdapter.js';
import { StorageAdapter } from '../local/StorageSqlite.js'; // edição Android: SQLite no aparelho
import { ConcurrencyAdapter } from './infrastructure/adapters/ConcurrencyAdapter.js';
import { BinaryExportAdapter } from './infrastructure/adapters/BinaryExportAdapter.js';
import { FirebaseGovernanceAdapter } from './infrastructure/adapters/FirebaseGovernanceAdapter.js';
import { FirebaseAppCheckAdapter } from './infrastructure/adapters/FirebaseAppCheckAdapter.js';

import { AuthService } from './application/services/AuthService.js';
import { StockService } from './application/services/StockService.js';
import { OrderService } from './application/services/OrderService.js';
import { CashService } from './application/services/CashService.js';
import { ShiftService } from './application/services/ShiftService.js';
import { RecoveryService } from './application/services/RecoveryService.js';
import { GovernanceService } from './application/services/GovernanceService.js';

import { DomRenderer } from './ui/adapters/DomRenderer.js';
import { DomEventHandler } from './ui/adapters/DomEventHandler.js';
import { protectTypedSecrets, typedValue, clearTyped } from './ui/adapters/TypedSecrets.js';
import { SalesController } from './ui/controllers/SalesController.js';
import { StockController } from './ui/controllers/StockController.js';
import { CashController } from './ui/controllers/CashController.js';
import { SecurityController } from './ui/controllers/SecurityController.js';
import { GovernanceController } from './ui/controllers/GovernanceController.js';

/**
 * Orquestrador Central da Aplicação — BarGestão Standard
 * Arquitetura Hexagonal com Injeção de Dependências.
 * Mantém sessão, cofre e o commit transacional; as telas ficam nos controllers de ui/controllers.
 */
export class App {
  static VERSION = '2.8.0';
  static BUILD = '2026.10';
  static EDITION_LABEL = 'BarGestão Standard';
  static AERO_SPEC = 'Aero Glassmorphism 2.0';

  // Adaptadores de Infraestrutura
  _crypto;
  _storage;
  _concurrency;
  _export;

  // Serviços de Domínio e Aplicação
  _auth;
  _stock;
  _order;
  _cash;
  _shift;
  _recovery;
  _governance;

  // Adaptadores e Controllers de UI
  _renderer;
  _events;
  _salesCtl;
  _stockCtl;
  _cashCtl;
  _securityCtl;
  _governanceCtl;

  // Estado da Aplicação em Memória
  _data = null;
  _serial = 0;
  _currenttab = 'inicio';
  _mutating = false;
  _lastactivity = Date.now();
  _settings = { idleMinutes: 5, lockOnHide: true };
  _autolocktimer = null;

  // Configuração Comercial da Edição
  _edition = {
    name: 'Standard',
    price: 2500,
    export: true,
    shift: true,
    smart: false,
    alerts: true,
    users: true,
    bio: false
  };

  constructor() {
    this._crypto = new WebCryptoAdapter();
    this._storage = new StorageAdapter();
    this._concurrency = new ConcurrencyAdapter();
    this._export = new BinaryExportAdapter();

    this._auth = new AuthService(this._crypto, this._storage);
    this._stock = new StockService();
    this._order = new OrderService();
    this._cash = new CashService();
    this._shift = new ShiftService();
    this._recovery = new RecoveryService(this._crypto);
    this._governance = new GovernanceService(new FirebaseGovernanceAdapter({ appCheck: new FirebaseAppCheckAdapter() }), this._storage, { appVersion: App.VERSION });

    this._renderer = new DomRenderer();
    this._events = new DomEventHandler(this);
    this._salesCtl = new SalesController(this);
    this._stockCtl = new StockController(this);
    this._cashCtl = new CashController(this);
    this._securityCtl = new SecurityController(this);
    this._governanceCtl = new GovernanceController(this, this._governance);
  }

  updateLastActivity() {
    this._lastactivity = Date.now();
  }

  handleBackgroundHide() {
    if (this._auth.getSession() && this._settings.lockOnHide !== false) {
      this._discardSession();
    }
  }

  async init() {
    if (!globalThis.crypto?.subtle || !crypto.randomUUID || !window.stkLocal) {
      const err = document.getElementById('auth-error');
      if (err) err.textContent = 'Não consegui abrir o banco de dados do aparelho.';
      return;
    }

    this._governanceCtl.installErrorReporting();

    // Padrão Systekna: o cofre do kit (PIN FINANC, biometria ou 12 palavras) abre o aparelho antes de tudo;
    // a equipe (gerente e funcionários) entra depois, com o próprio login. O kit também registra o sw.js.
    await window.vaultReady;
    this._governanceCtl.startWatching();

    try {
      await this._storage.init();
      this._settings = (await this._storage.dbRead('private', 'settings')) || this._settings;
      const meta = await this._auth.loadMeta();
      await this._governance.load();

      const candidates = await this._storage.readCandidates();
      const setupnotice = document.getElementById('setup-notice');
      const welcometitle = document.getElementById('auth-welcome-title');
      const authrecover = document.getElementById('auth-recover');
      const loginsubmit = document.getElementById('login-submit');

      this._bindUiEvents();

      const showLoginOrSetup = () => {
        if (!meta) {
          if (candidates.length) {
            if (welcometitle) welcometitle.textContent = 'Recuperar dados existentes';
            if (setupnotice) setupnotice.textContent = 'Foram encontrados arquivos JSON sem cadastro local. Utilize Restaurar backup criptografado.';
            if (loginsubmit) loginsubmit.disabled = true;
          } else {
            this._showFirstAdminSetup();
          }
        } else {
          setupnotice?.classList.add('hidden');
          authrecover?.classList.toggle('hidden', !meta.recovery);
          const loginuser = document.getElementById('login-user');
          if (loginuser) loginuser.value = meta.lastUser || '';
          // Um PIN só: o do aparelho (kit). O login da equipe é por senha; depois fica salvo no cofre do kit.
          this._setAuthMode('senha');
        }
      };

      // RN-FIREBASE.3: sem aprovação da governança (Firebase) o app não abre — vale também para
      // instalações antigas, que precisam se cadastrar para receber o UID
      if (await this._governanceCtl.gate(showLoginOrSetup)) {
        showLoginOrSetup();
        if (meta) await this._resumeSavedLogin();
      }

      this._events.bindGlobalListeners();
      this._initAutoLock();
      this._initBroadcastChannel();

    } catch (e) {
      const err = document.getElementById('auth-error');
      if (err) err.textContent = 'Falha ao iniciar o sistema: ' + e.message;
      this._governanceCtl.report(e, 'init');
    }
  }

  _showFirstAdminSetup() {
    const welcometitle = document.getElementById('auth-welcome-title');
    if (welcometitle) welcometitle.textContent = 'Criar primeiro administrador';
    document.getElementById('setup-confirm-wrap')?.classList.remove('hidden');
    document.getElementById('auth-methods')?.classList.add('hidden');
    document.getElementById('auth-recover')?.classList.add('hidden');
    const loginsubmit = document.getElementById('login-submit');
    if (loginsubmit) loginsubmit.textContent = 'Criar administrador';
    const setupnotice = document.getElementById('setup-notice');
    if (setupnotice) {
      setupnotice.classList.remove('hidden');
      setupnotice.textContent = 'Primeiro acesso: crie o administrador com senha forte (8+ caracteres).';
    }
  }

  _initAutoLock() {
    clearInterval(this._autolocktimer);
    this._autolocktimer = setInterval(() => {
      if (this._auth.getSession() && Date.now() - this._lastactivity > (this._settings.idleMinutes || 5) * 60 * 1000) {
        this._discardSession();
      }
    }, 15000);
  }

  _initBroadcastChannel() {
    this._concurrency._onMessage(event => {
      if (!this._auth.getSession()) return;
      const m = event.data;
      if (m?.type === 'changed' && m.seq > this._serial) {
        this._discardSession();
        this._renderer.toast('Os dados foram atualizados em outra aba. Desbloqueie para carregar a versão atual.');
      }
    });
  }

  _setAuthMode(mode) {
    for (const m of ['senha', 'pin']) {
      document.getElementById('auth-' + m)?.classList.toggle('active', m === mode);
    }
    const label = document.getElementById('login-label');
    const input = document.getElementById('login-secret');
    if (label) label.firstChild.textContent = mode === 'pin' ? 'PIN' : 'SENHA';
    if (input) {
      input.placeholder = mode === 'pin' ? 'Digite seu PIN' : 'Informe a senha';
      input.inputMode = mode === 'pin' ? 'numeric' : 'text';
      // PIN: texto mascarado (campo de senha chama o "salvar senha" do navegador), como no kit
      input.type = mode === 'pin' ? 'text' : 'password';
      input.classList.toggle('vault-masked', mode === 'pin');
      clearTyped(input);
    }
  }

  _bindUiEvents() {
    protectTypedSecrets();
    // Autenticação
    document.getElementById('login-autofill-form')?.addEventListener('submit', e => this._submit_login(e));
    document.getElementById('auth-senha')?.addEventListener('click', () => this._setAuthMode('senha'));
    document.getElementById('auth-pin')?.addEventListener('click', () => this._setAuthMode('pin'));

    // Navegação e Topbar
    document.getElementById('desktop-logout')?.addEventListener('click', () => this._discardSession());
    document.getElementById('top-logout')?.addEventListener('click', () => this._discardSession());

    // Seção Início
    document.getElementById('home-new-order')?.addEventListener('click', () => this._salesCtl._click_new_order());
    document.getElementById('home-all-tables')?.addEventListener('click', () => this._changeTab('vendas'));
    document.getElementById('home-all-stock')?.addEventListener('click', () => this._changeTab('estoque'));

    // Mais Opções (navegação)
    document.getElementById('more-caixa')?.addEventListener('click', () => this._changeTab('caixa'));
    document.getElementById('more-caixa-acesso')?.addEventListener('click', () => this._changeTab('caixa'));
    document.getElementById('more-usuarios')?.addEventListener('click', () => this._changeTab('usuarios'));
    document.getElementById('more-lock')?.addEventListener('click', () => this._discardSession());
    document.getElementById('more-switch-user')?.addEventListener('click', () => this._switchUser());
    document.getElementById('top-switch-user')?.addEventListener('click', () => this._switchUser());

    // Modais e Diálogos de Fechamento
    document.querySelectorAll('[data-close-modal]').forEach(b => {
      b.addEventListener('click', () => this._renderer._closeModal(b.dataset.closeModal));
    });
    document.querySelectorAll('[data-close="1"]').forEach(b => {
      const dialog = b.closest('dialog');
      if (dialog) b.addEventListener('click', () => dialog.close());
    });

    // Seções delegadas aos controllers
    this._salesCtl.bind();
    this._stockCtl.bind();
    this._cashCtl.bind();
    this._securityCtl.bind();
    this._governanceCtl.bind();
  }

  async _submit_login(event) {
    event.preventDefault();
    const username = document.getElementById('login-user')?.value.trim();
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.textContent = '';
    let secret;
    try {
      secret = typedValue('login-secret');
    } catch (e) {
      if (errorEl) errorEl.textContent = e.message;
      return;
    }

    if (!username || !secret) {
      if (errorEl) errorEl.textContent = 'Informe usuário e credencial.';
      return;
    }

    try {
      if (!this._governanceCtl.hasAccess()) {
        throw new Error('sem permissão da Governança Systekna.');
      }
      const meta = this._auth.getMeta();
      if (!meta) {
        // Primeiro Administrador
        const confirm = typedValue('setup-confirm');
        if (username.length < 3 || !this._auth.validatePassword(secret) || secret !== confirm) {
          throw new Error('Preencha o usuário e a senha forte confirmada (8+ caracteres).');
        }
        await this._createAdmin(username, secret);
      } else {
        const mode = document.getElementById('auth-pin')?.classList.contains('active') ? 'pin' : 'senha';
        if (mode === 'pin') {
          await this._auth.pinAuth(username, secret);
        } else {
          await this._auth.passwordAuth(username, secret);
        }
        await this._unlockData(this._auth.getVaultKey());
      }

      const lembrar = document.getElementById('login-remember');
      if (!lembrar || lembrar.checked) await this._auth.rememberLogin(window.secureStorage);
      else this._auth.forgetLogin(window.secureStorage);

      document.getElementById('auth-overlay')?.classList.add('hidden');
      clearTyped(document.getElementById('login-secret'));
      this._changeTab('inicio');
      this._syncUi();
      this._governanceCtl.syncAfterLogin().catch(() => {});
    } catch (e) {
      if (errorEl) errorEl.textContent = 'Não foi possível entrar: ' + e.message;
    }
  }

  async _createAdmin(username, password) {
    const raw = this._crypto.randomBytes(32);
    const key = await this._crypto.importAesKey(raw);
    this._serial = 0;

    const initialdata = {
      categorias: ['Cervejas', 'Destilados', 'Porções'],
      produtos: [],
      mesas: {},
      mesaClientes: {},
      caixa: [],
      movimentacoesEstoque: [],
      turnosCaixa: [],
      cancelamentos: [],
      auditoria: []
    };

    await this._writeBusiness(initialdata, key);
    const rec = await this._recovery.generatePhrase();
    const recRecord = await this._recovery.buildRecoveryRecord(rec.token, raw);

    const first = {
      usuario: username,
      perfil: 'gerente',
      email: null,
      senha: await this._crypto.wrapKey(password, raw),
      pin: null,
      deviceSeal: null,
      ativo: true
    };

    const newmeta = {
      version: 7,
      usuarios: [first],
      lastUser: username,
      criadoEm: new Date().toISOString(),
      recovery: recRecord
    };

    await this._auth.saveMeta(newmeta);
    await this._auth.passwordAuth(username, password);
    this._data = initialdata;

    this._securityCtl._displayRecovery(rec.phrase, rec.token);
  }

  async _unlockData(key) {
    let candidates = await this._storage.readCandidates();
    if (!candidates.length) {
      // Autoproteção e Auto-recuperação: Se as credenciais do usuário foram válidas,
      // mas os slots operacionais locais (OPFS/localStorage) foram limpos pelo navegador,
      // inicializa uma base operacional cifrada com a chave mestra já desbloqueada.
      const initialdata = {
        categorias: ['Cervejas', 'Destilados', 'Porções'],
        produtos: [],
        mesas: {},
        mesaClientes: {},
        caixa: [],
        movimentacoesEstoque: [],
        turnosCaixa: [],
        cancelamentos: [],
        auditoria: []
      };
      this._serial = 0;
      await this._writeBusiness(initialdata, key);
      candidates = await this._storage.readCandidates();
    }
    if (!candidates.length) throw new Error('Arquivo JSON cifrado não localizado.');

    for (const p of candidates) {
      try {
        const content = await this._crypto.open(p.payload, key, `BG:v7:operacional:${p.seq}`);
        await this._verifyAuditTrail(content.auditoria || []);
        this._data = content;
        this._serial = p.seq;
        return;
      } catch {}
    }
    throw new Error('Falha de decifragem ou verificação de integridade do cofre.');
  }

  async _verifyAuditTrail(entries) {
    if (!Array.isArray(entries)) throw new Error('Auditoria corrompida.');
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      const payload = JSON.stringify({ id: e.id, data: e.data, usuario: e.usuario, acao: e.acao, anterior: e.anterior });
      const expected = await this._crypto.sha256(payload);
      if (!this._crypto.equalHex(e.hash, expected)) {
        throw new Error('Falha de integridade da trilha de auditoria.');
      }
      if (i < entries.length - 1 && e.anterior !== entries[i + 1].hash) {
        throw new Error('Encadeamento de auditoria inválido.');
      }
    }
  }

  async _writeBusiness(payload, key) {
    const seq = this._serial + 1;
    const packet = {
      app: 'BarGestao',
      v: 7,
      seq,
      alteradoEm: new Date().toISOString(),
      payload: await this._crypto.seal(payload, key, `BG:v7:operacional:${seq}`)
    };
    const slot = seq % 2;
    await this._storage.writeSlot(slot, packet);

    const readback = await this._storage.readSlot(slot);
    if (!readback || readback.seq !== seq) {
      throw new Error('Falha na verificação de gravação (readback).');
    }
    this._serial = seq;
    return packet;
  }

  async _commit(mutationfn, actionlabel = 'Alteração operacional') {
    if (this._mutating || !this._data || !this._auth.getVaultKey()) {
      this._renderer.toast('Aguarde a operação em andamento ou desbloqueie o painel.');
      return false;
    }
    if (this._governanceCtl.isBlocked()) {
      this._renderer.toast(this._governanceCtl.blockMessage());
      return false;
    }
    this._mutating = true;
    try {
      const draft = structuredClone(this._data);
      mutationfn(draft);

      // Auditoria encadeada
      const prev = draft.auditoria?.[0]?.hash || 'GENESIS';
      const entry = {
        id: crypto.randomUUID(),
        data: new Date().toISOString(),
        usuario: this._auth.getSession()?.usuario || 'Sistema',
        acao: actionlabel,
        anterior: prev
      };
      entry.hash = await this._crypto.sha256(JSON.stringify(entry));
      (draft.auditoria ||= []).unshift(entry);
      if (draft.auditoria.length > 5000) draft.auditoria.length = 5000;

      try {
        await this._concurrency.runExclusive('bargestao-v7-json-write', async () => {
          await this._writeBusiness(draft, this._auth.getVaultKey());
        });
      } catch (writeError) {
        // Só falhas de persistência vão para a telemetria; erros de regra de negócio são do usuário
        this._governanceCtl.report(writeError, 'storage');
        throw writeError;
      }

      this._data = draft;
      this._concurrency.postMessage({ type: 'changed', seq: this._serial });
      this._renderAll();
      return true;
    } catch (e) {
      this._renderer.toast('Não foi possível salvar: ' + e.message);
      return false;
    } finally {
      this._mutating = false;
    }
  }

  _changeTab(tab) {
    if (!this._auth.getSession()) return;
    const tablesAllowed = this._governanceCtl.allowsTables();
    if (tab === 'vendas' && !tablesAllowed) tab = 'inicio';
    this._currenttab = tab;
    document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === 'tab-' + tab));
    const breadcrumb = document.getElementById('breadcrumb');
    if (breadcrumb) breadcrumb.textContent = '/ ' + this._renderer._titles[tab];

    this._renderer.renderNavigation(this._currenttab, this._auth.isManager(), t => this._changeTab(t), tablesAllowed ? [] : ['vendas']);
    if (tab === 'inicio') this._renderHome();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  _syncUi() {
    const session = this._auth.getSession();
    if (!session) return;
    document.getElementById('header-user').textContent = session.usuario;
    document.getElementById('header-role').textContent = session.perfil;
    document.getElementById('user-avatar').textContent = session.usuario.charAt(0).toUpperCase();
    // Barra de título: [menu do kit] [nome do estabelecimento cadastrado na governança] [avatar]
    const estabelecimento = document.getElementById('header-estabelecimento');
    if (estabelecimento) {
      const nome = this._governance.getRecord()?.nomeEstabelecimento?.trim() || 'BarGestão';
      estabelecimento.textContent = nome;
      estabelecimento.title = nome;
    }

    const moreUser = document.getElementById('more-username');
    if (moreUser) moreUser.textContent = session.usuario;
    const moreRole = document.getElementById('more-role');
    if (moreRole) moreRole.textContent = session.perfil === 'gerente' ? 'Gerente Geral' : 'Operador';
    const moreAvatar = document.getElementById('more-avatar');
    if (moreAvatar) moreAvatar.textContent = session.usuario.charAt(0).toUpperCase();

    // Sincronização Dinâmica da Versão do APP (Aba de Configurações)
    const appVersionPill = document.getElementById('app-version-pill');
    if (appVersionPill) appVersionPill.textContent = `v${App.VERSION}`;

    const versionStatusPill = document.getElementById('version-status-pill');
    if (versionStatusPill) versionStatusPill.textContent = `v${App.VERSION}`;

    const versionSpecCode = document.getElementById('version-spec-code');
    if (versionSpecCode) versionSpecCode.textContent = `v${App.VERSION} (Aero 2.0)`;

    const appBuildInfo = document.getElementById('app-build-info');
    if (appBuildInfo) {
      appBuildInfo.textContent = `Versão ${App.VERSION} · Build ${App.BUILD} · ${App.AERO_SPEC}`;
    }

    const appFooterVersion = document.getElementById('app-footer-version');
    if (appFooterVersion) {
      appFooterVersion.textContent = `${App.EDITION_LABEL} v${App.VERSION} · Design System ${App.AERO_SPEC} · Dados locais criptografados`;
    }

    document.querySelectorAll('.manager-only').forEach(el => el.classList.toggle('hidden', !this._auth.isManager()));
    this._changeTab(this._currenttab);
    this._renderAll();
  }

  _renderAll() {
    if (!this._data || !this._auth.getSession()) return;
    this._salesCtl._renderTables();
    this._stockCtl._renderStock();
    this._stockCtl._renderCategories();
    this._cashCtl._renderCash();
    this._renderHome();
    this._renderUsers();
    this._salesCtl._renderProductSelects();
  }

  _renderHome() {
    if (!this._data) return;
    const session = this._auth.getSession();
    const sauda = document.getElementById('home-sauda');
    if (sauda) sauda.textContent = `Olá, ${session.usuario}. Acompanhe o atendimento.`;

    const entries = Object.entries(this._data.mesas || {});
    const openCount = entries.length;
    const openValue = Object.values(this._data.mesas || {}).flat().reduce((s, i) => s + Number(i.total || 0), 0);

    const openEl = document.getElementById('home-mesas');
    if (openEl) openEl.textContent = String(openCount);
    const abertoEl = document.getElementById('home-aberto');
    if (abertoEl) abertoEl.textContent = this._renderer.money(openValue);

    // 1. Renderizar lista de mesas na Home
    const mesasListEl = document.getElementById('home-mesas-lista');
    if (mesasListEl) {
      mesasListEl.replaceChildren();
      if (!entries.length) {
        const empty = this._renderer.make('div', 'home-empty');
        empty.innerHTML = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><use href="#i-grid"></use></svg><span>Nenhuma comanda aberta no momento.</span>';
        mesasListEl.append(empty);
      } else {
        for (const [name, items] of entries.slice(0, 4)) {
          const sum = this._order.calculateOrderTotal(items);
          const cliente = this._data.mesaClientes?.[name] || 'Cliente não informado';
          const row = this._renderer.make('div', 'home-mini-row');
          row.style.cursor = 'pointer';
          row.onclick = () => {
            this._changeTab('vendas');
            this._salesCtl._chooseTable(name);
          };

          const left = this._renderer.make('div', 'home-mini-left');
          left.append(
            this._renderer.make('strong', '', name),
            this._renderer.make('small', '', cliente)
          );
          const right = this._renderer.make('strong', 'home-mini-price', this._renderer.money(sum));
          row.append(left, right);
          mesasListEl.append(row);
        }
      }
    }

    // 2. Renderizar lista de estoque baixo na Home (Gerente)
    const stockListEl = document.getElementById('home-baixo-lista');
    if (stockListEl && this._auth.isManager()) {
      stockListEl.replaceChildren();
      const allProducts = this._data.produtos || [];
      const lowStock = allProducts.filter(p => p.ativo !== false && Number(p.qtd || 0) <= Number(p.min || 0));

      if (!lowStock.length) {
        const empty = this._renderer.make('div', 'home-empty good');
        empty.innerHTML = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><use href="#i-check"></use></svg><span>Estoque regular. Nenhum produto em alerta.</span>';
        stockListEl.append(empty);
      } else {
        for (const p of lowStock.slice(0, 4)) {
          const row = this._renderer.make('div', 'home-mini-row');
          row.style.cursor = 'pointer';
          row.onclick = () => {
            this._changeTab('estoque');
            const search = document.getElementById('estoque-busca');
            if (search) {
              search.value = p.nome;
              this._stockCtl._renderStock();
            }
          };

          const left = this._renderer.make('div', 'home-mini-left');
          left.append(
            this._renderer.make('strong', '', p.nome),
            this._renderer.make('small', '', `Mínimo: ${p.min} un.`)
          );
          const right = this._renderer.make('span', 'pill warn', `${p.qtd} un.`);
          row.append(left, right);
          stockListEl.append(row);
        }
      }
    }
  }

  _renderUsers() {
    const root = document.getElementById('lista-usuarios');
    if (!root) return;
    root.replaceChildren();
    const users = this._auth.getMeta()?.usuarios || [];
    document.getElementById('usuarios-count').textContent = `${users.length} usuário(s)`;

    for (const u of users) {
      const el = this._renderer.make('div', 'entry');
      const head = this._renderer.make('div', 'entry-head');
      const left = this._renderer.make('div', 'entry-left');
      left.append(
        this._renderer.make('strong', '', u.usuario),
        this._renderer.make('div', 'meta', `Perfil: ${u.perfil}`)
      );
      head.append(left);
      el.append(head);
      root.append(el);
    }
  }

  _discardSession() {
    // Com login salvo, bloquear volta ao PIN do aparelho (o kit recarrega a página e, com o PIN, entra de novo)
    if (this._auth.hasSavedLogin(window.secureStorage) && typeof window.lockVault === 'function') {
      this._auth.discardSession();
      this._data = null;
      window.lockVault();
      return;
    }
    this._auth.discardSession();
    this._data = null;
    document.getElementById('auth-overlay')?.classList.remove('hidden');
    this._setAuthMode('senha');
    this._renderer.toast('Sessão encerrada.');
  }

  /** Entra sozinho com o login salvo no cofre do kit. Qualquer falha apaga o login salvo e mostra a tela de senha. */
  async _resumeSavedLogin() {
    const store = window.secureStorage;
    if (!this._governanceCtl.hasAccess() || !this._auth.hasSavedLogin(store)) return false;
    try {
      const r = await this._auth.resumeLogin(store);
      if (!r) return false;
      await this._unlockData(r.key);
    } catch (e) {
      this._auth.discardSession();
      this._auth.forgetLogin(store);
      this._data = null;
      const err = document.getElementById('auth-error');
      if (err) err.textContent = 'O login salvo não abriu os dados. Entre com usuário e senha.';
      return false;
    }
    document.getElementById('auth-overlay')?.classList.add('hidden');
    this._changeTab('inicio');
    this._syncUi();
    this._governanceCtl.syncAfterLogin().catch(() => {});
    this._renderer.toast('Bem-vindo de volta, ' + this._auth.getSession().usuario + '.');
    return true;
  }

  /** Trocar usuário: esquece o login salvo e mostra a tela de login vazia (o aparelho segue desbloqueado). */
  _switchUser() {
    this._auth.forgetLogin(window.secureStorage);
    this._auth.discardSession();
    this._data = null;
    const user = document.getElementById('login-user');
    if (user) user.value = '';
    document.getElementById('auth-overlay')?.classList.remove('hidden');
    this._setAuthMode('senha');
    user?.focus();
  }

  /** Sair: esquece o login salvo e bloqueia pelo kit; na próxima vez, PIN do aparelho e depois usuário e senha. */
  _signOut() {
    this._auth.forgetLogin(window.secureStorage);
    this._auth.discardSession();
    this._data = null;
    if (typeof window.lockVault === 'function') window.lockVault();
    else {
      document.getElementById('auth-overlay')?.classList.remove('hidden');
      this._setAuthMode('senha');
    }
  }

}

// Inicialização e Bootstrap
const iniciar = () => { const app = new App(); app.init(); };
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', iniciar); else iniciar(); // edição Android
