import { GovernancaCliente, MAX_DIAS_OFFLINE } from '../../../stk-pkg-governanca/stk-pkg-governanca-cliente.js';
import { ESTADOS, avaliar, formatarUid, higienizar, normalizarCadastro, cnpjValido, criarUid } from '../../../stk-pkg-governanca/stk-pkg-governanca-contrato.js';

/**
 * Serviço de Aplicação: Governança Systekna no BarGestão.
 * O processo de permissão (cadastro → UID → solicitação → aprovação → módulos) é o do pacote
 * PACOTES/stk-pkg-governanca (cópia em src/stk-pkg-governanca); aqui ficam só as regras do bar:
 * mesas sugeridas para tipo "bar", exportação Excel e limite de produtos.
 */
export const GOVERNANCE_STATES = Object.freeze({
  NOT_REGISTERED: ESTADOS.NAO_REGISTRADO,
  PENDING: ESTADOS.PENDENTE,
  APPROVED: ESTADOS.APROVADO,
  REJECTED: ESTADOS.REPROVADO,
  BLOCKED: ESTADOS.BLOQUEADO
});

export const MAX_OFFLINE_DAYS = MAX_DIAS_OFFLINE;

/** Porta do app (IGovernancePort, nomes em inglês) → porta do pacote. */
function packagePort(port) {
  return {
    enviarSolicitacao: (id, data) => port.submitRegistration(id, data),
    buscarSolicitacao: id => port.fetchRegistration(id),
    buscarTenant: id => port.fetchTenant(id),
    enviarErro: (id, data) => port.reportError(id, data),
    enviarFeedback: (id, data) => port.sendFeedback(id, data)
  };
}

export class GovernanceService {
  _client;

  constructor(port, storage, { appVersion = '0.0.0', appId = 'BARGESTAO' } = {}) {
    this._client = new GovernancaCliente({
      porta: packagePort(port),
      armazenamento: {
        ler: () => storage.dbRead('private', 'governance'),
        gravar: record => storage.dbWrite('private', 'governance', record)
      },
      appId,
      versaoApp: appVersion,
      // Mesas são sugeridas pelo tipo declarado; a decisão final é da governança
      sugerirModulos: reg => ({ permiteMesas: reg.tipoComercio === 'bar' })
    });
  }

  // Registro em memória (os testes simulam prazos alterando-o diretamente)
  get _record() { return this._client._registro; }
  set _record(record) { this._client._registro = record; }

  load() { return this._client.carregar(); }
  getRecord() { return this._client.registro(); }
  getState() { return this._client.estado(); }
  getUid() { return this._client.uid(); }
  hasAccess() { return this._client.temAcesso(); }
  isBlocked() { return !this._client.temAcesso(); }
  getBlockReason() { return this._client.motivoBloqueio(); }
  refresh() { return this._client.atualizar(); }
  submitRegistration(input) { return this._client.enviarCadastro(input); }
  exportForBackup() { return this._client.exportarParaBackup(); }
  restoreFromBackup(data) { return this._client.restaurarDoBackup(data); }
  reportError(error, modulo = null) { return this._client.relatarErro(error, modulo); }
  sendFeedback(feedback) { return this._client.enviarFeedback(feedback); }

  /** Funcionalidade de mesas: liberada só quando a governança define permiteMesas = true. */
  allowsTables() { return this._client.libera('permiteMesas'); }

  /** Exportação XLSX: liberada por padrão; só a governança desliga (painel → Módulos Homologados). */
  allowsXlsxExport() { return this._client.registro()?.lastState?.permiteExportacaoXlsx !== false; }

  /** Teto de produtos ativos definido no tenant; null = sem limite. */
  productLimit() { return this._client.limite('limiteProdutos'); }

  static formatUid(id) { return formatarUid(id); }
  static evaluate(registration, tenant, now = Date.now()) { return avaliar(registration, tenant, now); }
  static normalizeRegistration(input) { return normalizarCadastro(input); }
  static isValidCnpj(digits) { return cnpjValido(digits); }
  static createUid(reg) { return criarUid(reg); }
  static scrub(text, max = 2000) { return higienizar(text, max); }
}
