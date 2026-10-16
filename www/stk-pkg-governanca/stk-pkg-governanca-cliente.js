/**
 * stk-pkg-governanca — CLIENTE do processo de permissão, usado por qualquer app Systekna.
 *
 * Fluxo: cadastro no app → impressão digital (UID) → solicitação no Firebase → a governança aprova ou não
 * e libera/bloqueia módulos no tenant de mesmo UID. Sem aprovação confirmada, o app não abre.
 *
 * Num app local-first o bloqueio é feito no cliente: impede o uso normal, mas não resiste a quem altera
 * o próprio navegador. A autoridade final são as regras do Firestore e o contrato comercial.
 *
 * Dependências injetadas:
 * - porta: FirestoreRestGovernanca (ou fake nos testes) — ver METODOS_PORTA
 * - armazenamento: { ler(): Promise<registro|null>, gravar(registro): Promise<void> } — local, no aparelho
 */
import {
  ESTADOS, MODULOS, UID_DIGITAL, TIPOS_COMERCIO,
  avaliar, criarUid, formatarUid, higienizar, isUidGovernanca, normalizarCadastro
} from './stk-pkg-governanca-contrato.js';

/** Prazo máximo sem confirmar a licença no servidor; depois disso o acesso fica suspenso. */
export const MAX_DIAS_OFFLINE = 14;
const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_RELATOS_POR_SESSAO = 10;
const TIPOS_FEEDBACK = ['sugestao', 'elogio', 'problema', 'duvida'];

const identificador = (valor, padrao) => String(valor || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 40) || padrao;

/** Guarda só os módulos do catálogo, com o tipo certo (registro vindo de backup não é confiável). */
function limparModulos(estado = {}) {
  const out = {};
  for (const [nome, def] of Object.entries(MODULOS)) {
    const v = estado[nome];
    if (def.tipo === 'booleano') { if (typeof v === 'boolean') out[nome] = v; }
    else if (Number.isInteger(v) && v > 0) out[nome] = v;
  }
  return out;
}

export class GovernancaCliente {
  constructor({
    porta,
    armazenamento,
    appId,
    versaoApp = '0.0.0',
    tiposComercio = TIPOS_COMERCIO,
    sugerirModulos = () => ({})
  }) {
    if (!porta || !armazenamento || !appId) throw new Error('GovernancaCliente: porta, armazenamento e appId são obrigatórios.');
    this._porta = porta;
    this._armazenamento = armazenamento;
    this._appId = appId;
    this._versaoApp = versaoApp;
    this._tipos = tiposComercio;
    this._sugerirModulos = sugerirModulos;
    this._registro = null;
    this._relatados = new Set();
  }

  // --- Estado local ------------------------------------------------------------

  async carregar() {
    this._registro = (await this._armazenamento.ler()) || null;
    return this.registro();
  }

  registro() {
    return this._registro ? structuredClone(this._registro) : null;
  }

  estado() {
    return this._registro?.lastState?.state || ESTADOS.NAO_REGISTRADO;
  }

  /** Impressão digital do cadastro (UID no Firebase), ou null sem cadastro. */
  uid() {
    return this._registro?.id || null;
  }

  uidFormatado() {
    return formatarUid(this.uid());
  }

  /** Permissão de usar o app: só com aprovação confirmada no servidor dentro do prazo. */
  temAcesso(agora = Date.now()) {
    return this.estado() === ESTADOS.APROVADO && !this.verificacaoVencida(agora);
  }

  /** Módulo booleano liberado? Sem acesso, nada é liberado. */
  libera(modulo) {
    const def = MODULOS[modulo];
    if (!def || def.tipo !== 'booleano') throw new Error(`Módulo desconhecido: ${modulo}`);
    if (!this.temAcesso()) return false;
    const v = this._registro?.lastState?.[modulo];
    return typeof v === 'boolean' ? v : def.padrao;
  }

  /** Limite definido no tenant; null = sem limite. */
  limite(modulo) {
    const def = MODULOS[modulo];
    if (!def || def.tipo !== 'limite') throw new Error(`Limite desconhecido: ${modulo}`);
    const v = this._registro?.lastState?.[modulo];
    return Number.isInteger(v) && v > 0 ? v : null;
  }

  /** Aprovado, mas sem confirmação no servidor dentro do prazo (ou restaurado de backup sem verificar). */
  verificacaoVencida(agora = Date.now()) {
    if (!this._registro || this.estado() !== ESTADOS.APROVADO) return false;
    const verificado = Date.parse(this._registro.verifiedAt || '');
    return !Number.isFinite(verificado) || agora - verificado > MAX_DIAS_OFFLINE * DIA_MS;
  }

  motivoBloqueio() {
    if (!this._registro) return 'este aparelho ainda não foi cadastrado na governança';
    if (this.verificacaoVencida()) {
      return `licença sem verificação há mais de ${MAX_DIAS_OFFLINE} dias. Conecte-se à internet para revalidar`;
    }
    if (this.estado() === ESTADOS.PENDENTE) return 'cadastro aguardando aprovação da governança';
    return this._registro?.lastState?.motivo || '';
  }

  async _gravar(registro) {
    await this._armazenamento.gravar(registro);
    this._registro = registro;
  }

  // --- Backup ------------------------------------------------------------------

  /** Dados mínimos para levar no backup: sem eles, um restore viraria instalação sem cadastro. */
  exportarParaBackup() {
    if (!this._registro) return null;
    const { id, usuario, nomeEstabelecimento, cnpj, tipoComercio, solicitadoEm, lastState } = this._registro;
    return { id, usuario, nomeEstabelecimento, cnpj, tipoComercio, solicitadoEm, lastState };
  }

  /** Restaura do backup exigindo nova verificação no servidor antes de liberar o uso. */
  async restaurarDoBackup(dados) {
    if (!dados || !isUidGovernanca(dados.id)) return false;
    const state = Object.values(ESTADOS).includes(dados.lastState?.state) ? dados.lastState.state : ESTADOS.PENDENTE;
    await this._gravar({
      id: dados.id,
      usuario: String(dados.usuario || '').slice(0, 30),
      nomeEstabelecimento: String(dados.nomeEstabelecimento || '').slice(0, 120),
      cnpj: typeof dados.cnpj === 'string' ? dados.cnpj : null,
      tipoComercio: String(dados.tipoComercio || 'outro'),
      solicitadoEm: dados.solicitadoEm || null,
      lastState: { state, motivo: String(dados.lastState?.motivo || ''), ...limparModulos(dados.lastState) },
      verifiedAt: null
    });
    return true;
  }

  // --- Cadastro e decisão ------------------------------------------------------

  async enviarCadastro(entrada) {
    const cadastro = normalizarCadastro(entrada, { tipos: this._tipos });
    const id = await criarUid(cadastro);
    const solicitadoEm = new Date();

    // Sugestão do app (ex.: mesas para bar); a decisão final é da governança. As regras do Firestore só
    // aceitam os módulos marcados daSolicitacao, e exigem cada um deles como booleano.
    const sugestao = this._sugerirModulos(cadastro) || {};
    const modulosSugeridos = {};
    for (const [nome, def] of Object.entries(MODULOS)) {
      if (def.daSolicitacao) modulosSugeridos[nome] = sugestao[nome] === true;
    }

    await this._porta.enviarSolicitacao(id, {
      ...cadastro,
      status: 'pendente',
      ...modulosSugeridos,
      solicitadoEm,
      aprovadoEm: null,
      aprovadoPor: null,
      motivoDecisao: ''
    });

    await this._gravar({
      id,
      ...cadastro,
      solicitadoEm: solicitadoEm.toISOString(),
      lastState: avaliar({ status: 'pendente' }, null),
      checkedAt: new Date().toISOString()
    });
    return this.registro();
  }

  /**
   * Consulta a governança. Falha de rede ou resposta indeterminada mantêm o último estado conhecido;
   * o prazo MAX_DIAS_OFFLINE limita quanto tempo ele vale.
   * @returns {{ state, motivo, offline: boolean, indeterminate?: boolean }}
   */
  async atualizar() {
    if (!this._registro) return { state: ESTADOS.NAO_REGISTRADO, motivo: '', offline: false };
    let solicitacao;
    let tenant;
    try {
      [solicitacao, tenant] = await Promise.all([
        this._porta.buscarSolicitacao(this._registro.id),
        this._porta.buscarTenant(this._registro.id)
      ]);
    } catch {
      return { ...(this._registro.lastState || {}), offline: true };
    }

    const lastState = avaliar(solicitacao, tenant);
    const agora = new Date().toISOString();
    if (!lastState) {
      await this._gravar({ ...this._registro, checkedAt: agora });
      return { ...(this._registro.lastState || {}), offline: false, indeterminate: true };
    }
    await this._gravar({ ...this._registro, lastState, checkedAt: agora, verifiedAt: agora });
    return { ...lastState, offline: false };
  }

  // --- Telemetria e feedback (privacidade: tudo higienizado) --------------------

  _campoUid() {
    const id = this._registro?.id;
    return typeof id === 'string' && UID_DIGITAL.test(id) ? { uid: id } : {};
  }

  static _moduloDaPilha(pilha) {
    const m = /\/([A-Za-z]+)\.js/.exec(String(pilha || ''));
    return identificador(m?.[1], 'geral');
  }

  _ambiente() {
    const nav = globalThis.navigator || {};
    const win = globalThis.window;
    return {
      userAgent: String(nav.userAgent || 'desconhecido').slice(0, 300),
      online: nav.onLine !== false,
      opfsSuportado: Boolean(nav.storage?.getDirectory),
      viewport: win ? `${win.innerWidth}x${win.innerHeight}`.slice(0, 20) : 'n/a'
    };
  }

  /** Envia relatório de erro higienizado. Nunca lança: falha de telemetria não afeta a operação. */
  async relatarErro(erro, modulo = null) {
    try {
      if (globalThis.navigator?.onLine === false) return false;
      if (this._relatados.size >= MAX_RELATOS_POR_SESSAO) return false;

      const mensagem = higienizar(String(erro?.message || erro || 'Erro desconhecido'));
      const pilha = String(erro?.stack || '');
      const mod = identificador(modulo, GovernancaCliente._moduloDaPilha(pilha));
      const assinatura = `${mod}|${mensagem}`;
      if (this._relatados.has(assinatura)) return false;
      this._relatados.add(assinatura);

      await this._porta.enviarErro(crypto.randomUUID(), {
        app: this._appId,
        ...this._campoUid(),
        usuario: identificador(this._registro?.usuario, 'anonimo'),
        versaoApp: identificador(this._versaoApp, '0.0.0'),
        mensagem,
        modulo: mod,
        stackTrace: higienizar(pilha),
        ambiente: this._ambiente(),
        dataOcorrencia: new Date(),
        resolvido: false
      });
      return true;
    } catch {
      return false;
    }
  }

  async enviarFeedback({ tipo, avaliacao, mensagem }) {
    const texto = String(mensagem || '').trim();
    if (!texto) throw new Error('Escreva sua mensagem para a governança.');
    if (texto.length > 1000) throw new Error('A mensagem deve ter no máximo 1.000 caracteres.');
    const nota = Number(avaliacao);
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) throw new Error('Escolha uma avaliação de 1 a 5.');

    await this._porta.enviarFeedback(crypto.randomUUID(), {
      app: this._appId,
      ...this._campoUid(),
      usuario: identificador(this._registro?.usuario, 'anonimo'),
      estabelecimento: String(this._registro?.nomeEstabelecimento || '').slice(0, 120),
      tipo: TIPOS_FEEDBACK.includes(tipo) ? tipo : 'sugestao',
      avaliacao: nota,
      mensagem: higienizar(texto, 1000),
      status: 'novo',
      enviadoEm: new Date()
    });
    return true;
  }
}
