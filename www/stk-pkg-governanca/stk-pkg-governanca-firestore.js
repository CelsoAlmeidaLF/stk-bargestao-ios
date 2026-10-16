/**
 * stk-pkg-governanca — canal do APP com a governança pelo REST do Firestore (fetch nativo, sem build).
 * O app não autentica no Firebase: as regras só permitem criar documentos com esquema validado e ler
 * um documento pelo id (o UID gerado no aparelho). Cada chamada leva o token do App Check, exigido
 * pelo projeto (sem ele o Firestore responde 403).
 */
import { COLECOES, isUidGovernanca } from './stk-pkg-governanca-contrato.js';
import { GOVERNANCA_FIREBASE } from './stk-pkg-governanca-config.js';

/** Porta de saída implementada por este adaptador (o cliente só depende destes métodos). */
export const METODOS_PORTA = Object.freeze(['enviarSolicitacao', 'buscarSolicitacao', 'buscarTenant', 'enviarErro', 'enviarFeedback']);

export class FirestoreRestGovernanca {
  constructor({
    projectId = GOVERNANCA_FIREBASE.projectId,
    apiKey = GOVERNANCA_FIREBASE.apiKey,
    host = GOVERNANCA_FIREBASE.firestoreHost,
    timeoutMs = 8000,
    fetchImpl = (...args) => globalThis.fetch(...args),
    appCheck = null
  } = {}) {
    this._base = `${host}/v1/projects/${projectId}/databases/(default)/documents`;
    this._apiKey = apiKey;
    this._timeoutMs = timeoutMs;
    this._fetch = fetchImpl;
    this._appCheck = appCheck;
  }

  enviarSolicitacao(id, dados) { return this._criar(COLECOES.SOLICITACOES, id, dados); }
  buscarSolicitacao(id) { return this._ler(COLECOES.SOLICITACOES, id); }
  buscarTenant(id) { return this._ler(COLECOES.TENANTS, id); }
  enviarErro(id, dados) { return this._criar(COLECOES.ERROS, id, dados); }
  enviarFeedback(id, dados) { return this._criar(COLECOES.FEEDBACKS, id, dados); }

  // ---------------------------------------------------------------------------

  async _request(url, init = {}) {
    const token = await this._appCheck?.getToken();
    if (token) init = { ...init, headers: { ...(init.headers || {}), 'X-Firebase-AppCheck': token } };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this._timeoutMs);
    try {
      return await this._fetch(url, { ...init, signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    } catch (e) {
      throw new Error(e?.name === 'AbortError' ? 'Tempo esgotado ao contatar a governança.' : 'Sem conexão com a governança.');
    } finally {
      clearTimeout(timer);
    }
  }

  _url(path, params = {}) {
    const qs = new URLSearchParams({ ...params, key: this._apiKey });
    return `${this._base}/${path}?${qs}`;
  }

  static _conferirId(id) {
    if (!isUidGovernanca(id)) throw new Error('Identificador inválido.');
  }

  async _criar(colecao, id, dados) {
    FirestoreRestGovernanca._conferirId(id);
    const res = await this._request(this._url(colecao, { documentId: id }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: codificarCampos(dados) })
    });
    if (!res.ok) throw new Error(`A governança recusou o envio (HTTP ${res.status}).`);
  }

  async _ler(colecao, id) {
    FirestoreRestGovernanca._conferirId(id);
    const res = await this._request(this._url(`${colecao}/${id}`), { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Falha ao consultar a governança (HTTP ${res.status}).`);
    const doc = await res.json();
    return decodificarCampos(doc.fields || {});
  }
}

// --- Formato de valores tipados da API REST do Firestore -----------------------

export function codificarValor(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(codificarValor) } };
  if (typeof v === 'object') return { mapValue: { fields: codificarCampos(v) } };
  throw new Error('Tipo de valor não suportado.');
}

export function codificarCampos(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = codificarValor(v);
  return out;
}

export function decodificarValor(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return decodificarCampos(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodificarValor);
  return null;
}

export function decodificarCampos(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    out[k] = decodificarValor(v);
  }
  return out;
}

/**
 * Token do App Check (reCAPTCHA Enterprise). Carrega só firebase-app e firebase-app-check do SDK
 * oficial (gstatic) para obter o token; as chamadas continuam pelo REST acima.
 */
export class AppCheckGovernanca {
  constructor({ config = GOVERNANCA_FIREBASE, importar = url => import(url) } = {}) {
    this._config = config;
    this._importar = importar;
    this._pronto = null;
  }

  _iniciar() {
    const c = this._config;
    this._pronto ||= (async () => {
      const { initializeApp, getApps } = await this._importar(c.sdkBase + 'firebase-app.js');
      const ac = await this._importar(c.sdkBase + 'firebase-app-check.js');
      const app = getApps().find(a => a.name === 'governanca')
        || initializeApp({ apiKey: c.apiKey, authDomain: c.authDomain, projectId: c.projectId, appId: c.appId }, 'governanca');
      const appCheck = ac.initializeAppCheck(app, {
        provider: new ac.ReCaptchaEnterpriseProvider(c.recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true
      });
      return () => ac.getToken(appCheck, false);
    })();
    // Falha de carga (offline) não pode ficar presa: a próxima chamada tenta de novo
    this._pronto.catch(() => { this._pronto = null; });
    return this._pronto;
  }

  /** Token atual, ou null se não foi possível obter (sem rede, bloqueio de script). */
  async getToken() {
    try {
      const buscar = await this._iniciar();
      const { token } = await buscar();
      return token || null;
    } catch {
      return null;
    }
  }
}
