/**
 * stk-pkg-governanca — CONTRATO do processo de permissão da Governança Systekna.
 * Fonte única para os apps (que pedem e obedecem) e para o painel (que decide):
 *
 *   app: cadastro → impressão digital (UID) → solicitação no Firebase (pendente)
 *   painel: aprova/reprova → grava o tenant (licença + módulos) com o mesmo UID
 *   app: lê solicitação + tenant → avaliar() → acesso e módulos liberados (fail-closed)
 *
 * Sem dependências: roda no navegador (ES module) e no Node (testes).
 */

export const CONTRATO_VERSAO = '1.0.0';

/** Coleções do Firestore (projeto systekna-feedback). As regras ficam em PACOTES/stk-pkg-doacao/firestore.rules. */
export const COLECOES = Object.freeze({
  SOLICITACOES: 'solicitacoes_governanca',
  TENANTS: 'tenants_governanca',
  ERROS: 'telemetria_erros',
  FEEDBACKS: 'feedbacks_usuarios'
});

/** Estado efetivo do aparelho, calculado por avaliar(). */
export const ESTADOS = Object.freeze({
  NAO_REGISTRADO: 'nao_registrado',
  PENDENTE: 'pendente',
  APROVADO: 'aprovado',
  REPROVADO: 'reprovado',
  BLOQUEADO: 'bloqueado'
});

/** Campos que o APP pode gravar ao criar a solicitação (espelha o hasOnly das regras do Firestore). */
export const CAMPOS_SOLICITACAO_APP = Object.freeze(['usuario', 'cnpj', 'nomeEstabelecimento', 'tipoComercio', 'status', 'permiteMesas', 'solicitadoEm', 'aprovadoEm', 'aprovadoPor', 'motivoDecisao']);

/** Status gravados na solicitação pelo painel. */
export const STATUS_SOLICITACAO = Object.freeze(['pendente', 'aprovado', 'reprovado', 'bloqueado']);

/** Status de licença que liberam o uso. */
export const LICENCAS_ATIVAS = Object.freeze(['ativo', 'trial']);

// ---------------------------------------------------------------------------
// Impressão digital (UID)
// ---------------------------------------------------------------------------

/** UID atual: SHA-256 truncado em 128 bits, 32 hex minúsculos. */
export const UID_DIGITAL = /^[0-9a-f]{32}$/;
/** Cadastros antigos usavam UUID v4 e continuam válidos. */
export const UID_LEGADO = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUidGovernanca(id) {
  return typeof id === 'string' && (UID_DIGITAL.test(id) || UID_LEGADO.test(id));
}

/** Forma de leitura, igual no app e no painel: grupos de 4 em maiúsculas (3F2A-9C01-...). */
export function formatarUid(id) {
  if (!isUidGovernanca(id)) return String(id || '');
  return id.replace(/-/g, '').toUpperCase().match(/.{4}/g).join('-');
}

/**
 * Impressão digital do cadastro: SHA-256(segredo aleatório de 256 bits + dados do cadastro), 128 bits.
 * O segredo não é guardado: o UID não pode ser recalculado nem adivinhado a partir do cadastro.
 */
export async function criarUid(cadastro, cryptoImpl = globalThis.crypto) {
  const segredo = cryptoImpl.getRandomValues(new Uint8Array(32));
  const dados = new TextEncoder().encode(JSON.stringify([cadastro.usuario, cadastro.cnpj, cadastro.tipoComercio, Date.now()]));
  const material = new Uint8Array(segredo.length + dados.length);
  material.set(segredo);
  material.set(dados, segredo.length);
  const hash = new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', material));
  return Array.from(hash.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

export const TIPOS_COMERCIO = Object.freeze(['bar', 'loja_salgados', 'lanchonete', 'adega', 'outro']);

export function cnpjValido(d) {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len) => {
    const pesos = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** Valida e limpa o cadastro. CNPJ é opcional; tipo fora da lista vira 'outro'. */
export function normalizarCadastro({ usuario, nomeEstabelecimento = '', cnpj = '', tipoComercio = 'outro' } = {}, { tipos = TIPOS_COMERCIO } = {}) {
  const user = String(usuario || '').trim();
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(user)) {
    throw new Error('Usuário deve ter de 3 a 30 caracteres (letras, números, ponto, hífen ou sublinhado).');
  }
  const nome = String(nomeEstabelecimento || '').trim().slice(0, 120);
  const digitos = String(cnpj || '').replace(/\D/g, '');
  if (digitos && !cnpjValido(digitos)) {
    throw new Error('CNPJ inválido. Confira os dígitos ou deixe o campo em branco (é opcional).');
  }
  const tipo = tipos.includes(tipoComercio) ? tipoComercio : 'outro';
  return { usuario: user, nomeEstabelecimento: nome, cnpj: digitos || null, tipoComercio: tipo };
}

// ---------------------------------------------------------------------------
// Módulos (funcionalidades liberadas pela governança) e planos
// ---------------------------------------------------------------------------

/**
 * Catálogo de módulos do tenant (tenants_governanca/{uid}.permissoesModulos).
 * - padrao: valor efetivo quando o tenant não informa (o app nunca libera o que não foi decidido,
 *   exceto onde o padrão histórico já era liberado)
 * - daSolicitacao: na falta do tenant, vale o valor sugerido na solicitação
 * Limite: inteiro > 0; null = sem limite.
 */
export const MODULOS = Object.freeze({
  permiteMesas: Object.freeze({ tipo: 'booleano', padrao: false, daSolicitacao: true, rotulo: 'Mesas' }),
  permiteExportacaoXlsx: Object.freeze({ tipo: 'booleano', padrao: true, rotulo: 'Exportação Excel' }),
  permiteBiometria: Object.freeze({ tipo: 'booleano', padrao: true, rotulo: 'Biometria' }),
  permiteEscPosTermica: Object.freeze({ tipo: 'booleano', padrao: false, rotulo: 'Impressora térmica' }),
  limiteProdutos: Object.freeze({ tipo: 'limite', padrao: null, rotulo: 'Limite de produtos' }),
  limiteUsuarios: Object.freeze({ tipo: 'limite', padrao: null, rotulo: 'Limite de usuários' })
});

/** Módulos de cada plano, aplicados pelo painel ao aprovar ou trocar de plano. */
export const PLANOS = Object.freeze({
  starter: Object.freeze({ permiteExportacaoXlsx: false, permiteEscPosTermica: false, limiteProdutos: 50, limiteUsuarios: 2 }),
  pro: Object.freeze({ permiteExportacaoXlsx: true, permiteEscPosTermica: false, limiteProdutos: 1000, limiteUsuarios: 10 }),
  enterprise: Object.freeze({ permiteExportacaoXlsx: true, permiteEscPosTermica: true, limiteProdutos: 100000, limiteUsuarios: 100 })
});

const limiteValido = v => (Number.isInteger(v) && v > 0 ? v : null);

/** Módulos do tenant para um plano (com mesas e biometria decididas à parte). */
export function modulosDoPlano(plano, { permiteMesas = false, permiteBiometria = true } = {}) {
  const base = PLANOS[plano] || PLANOS.pro;
  return { permiteMesas: Boolean(permiteMesas), permiteBiometria: Boolean(permiteBiometria), ...base };
}

/** Módulos efetivos: tenant > solicitação (quando o módulo aceita) > padrão do catálogo. */
export function modulosEfetivos(tenantModulos = {}, solicitacao = {}) {
  const out = {};
  for (const [nome, def] of Object.entries(MODULOS)) {
    const valor = tenantModulos?.[nome];
    if (def.tipo === 'booleano') {
      if (typeof valor === 'boolean') out[nome] = valor;
      else if (def.daSolicitacao && typeof solicitacao?.[nome] === 'boolean') out[nome] = solicitacao[nome];
      else out[nome] = def.padrao;
    } else {
      out[nome] = limiteValido(Number(valor));
    }
  }
  return out;
}

/** Nenhum módulo liberado (estados sem acesso). */
export function modulosFechados() {
  const out = {};
  for (const [nome, def] of Object.entries(MODULOS)) out[nome] = def.tipo === 'booleano' ? false : null;
  return out;
}

// ---------------------------------------------------------------------------
// Decisão
// ---------------------------------------------------------------------------

/**
 * Avalia solicitação + tenant e devolve o estado efetivo { state, motivo, ...módulos }.
 * Retorna null quando a resposta é indeterminada (sem solicitação, ou aprovada sem tenant):
 * quem chama mantém o último estado conhecido — nunca libera por falta de dado (fail-closed).
 */
export function avaliar(solicitacao, tenant, agora = Date.now()) {
  if (!solicitacao) return null;
  const fechado = (state, motivo) => ({ state, motivo, ...modulosFechados() });

  if (solicitacao.status === 'reprovado') {
    return fechado(ESTADOS.REPROVADO, solicitacao.motivoDecisao || 'Cadastro não aprovado pela governança.');
  }
  if (solicitacao.status === 'bloqueado') {
    return fechado(ESTADOS.BLOQUEADO, solicitacao.motivoDecisao || 'Acesso bloqueado pela governança.');
  }
  if (solicitacao.status !== 'aprovado') return fechado(ESTADOS.PENDENTE, '');

  // Aprovado sem tenant: a licença é a autoridade, então o resultado é indeterminado
  const lic = tenant?.licenca;
  if (!lic) return null;

  if (lic.bloqueioRemoto || !LICENCAS_ATIVAS.includes(lic.status)) {
    return fechado(ESTADOS.BLOQUEADO, lic.motivoBloqueio || `Licença ${lic.status || 'suspensa'}. Contate o suporte Systekna.`);
  }
  const expira = Date.parse(lic.expiraEm || '');
  if (Number.isFinite(expira) && expira < agora) {
    return fechado(ESTADOS.BLOQUEADO, `Licença expirada em ${new Date(expira).toLocaleDateString('pt-BR')}. Contate o suporte Systekna.`);
  }
  return { state: ESTADOS.APROVADO, motivo: '', ...modulosEfetivos(tenant?.permissoesModulos, solicitacao) };
}

// ---------------------------------------------------------------------------
// Privacidade: nada de segredo, documento, contato ou valor sai do aparelho
// ---------------------------------------------------------------------------

export function higienizar(texto, max = 2000) {
  if (typeof texto !== 'string') return '';
  // Trunca antes das regex (evita ReDoS com entradas grandes) e corta de novo no fim
  return texto
    .slice(0, max * 2)
    .replace(/\b(senha|password|passwd|pin|token|secret|segredo|chave)\b\s*[:=]\s*\S{1,200}/gi, '$1=[SEGREDO_REDUZIDO]')
    .replace(/\bpin\s+\d{4,8}\b/gi, 'pin [SEGREDO_REDUZIDO]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[ID_REDUZIDO]')
    .replace(/[0-9a-f]{32,}/gi, '[CHAVE_REDUZIDA]')
    .replace(/[A-Za-z0-9+_-]{40,}={0,2}/g, '[SEGREDO_REDUZIDO]')
    .replace(/[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,4}/g, '[EMAIL_REDUZIDO]')
    .replace(/\b\d{2}[ .]?\d{3}[ .]?\d{3}[ /]?\d{4}[ -]?\d{2}\b/g, '[DOC_REDUZIDO]')
    .replace(/\b\d{3}[ .]?\d{3}[ .]?\d{3}[ -]?\d{2}\b/g, '[DOC_REDUZIDO]')
    .replace(/\b(?:\d[ -]?){12,18}\d\b/g, '[CARTAO_REDUZIDO]')
    .replace(/\(?\b\d{2}\)?[ -]?9?\d{4}[ -]?\d{4}\b/g, '[FONE_REDUZIDO]')
    .replace(/R\$\s?-?[\d.,]{1,20}/g, '[VALOR_REDUZIDO]')
    .replace(/\b\d{1,9}[.,]\d{2}\s*reais\b/gi, '[VALOR_REDUZIDO]')
    .slice(0, max);
}
