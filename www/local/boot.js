/* Edição local do APK: primeiro script da página. Abre o banco SQLite nativo (plugin @capacitor-community/sqlite),
   carrega tudo para a memória e só então carrega os scripts do app (lista em data-scripts, na ordem original).

   Onde fica cada coisa (nada no armazenamento do navegador):
   - window.stkArmazem → tabela kv: cofre do aparelho (kit de segurança: PIN, login salvo) e preferências do kit;
   - window.stkLocal   → tabela docs: slots cifrados do bar, cadastro da equipe, governança (local/StorageSqlite.js);
   - window.stkSessao  → só memória: some ao fechar o app (reabrir pede o PIN).
   O arquivo do banco fica na pasta privada do app no celular (databases/bargestaoSQLite.db).
   Fora do Android (navegador, para desenvolvimento) não há SQLite: usa só memória e avisa no console. */
(function () {
  'use strict';
  const BANCO = 'bargestao';
  const scripts = JSON.parse(document.currentScript.dataset.scripts || '[]');

  const Cap = window.Capacitor;
  const nativo = Boolean(Cap?.isNativePlatform?.());
  const SQL = nativo ? (Cap.Plugins?.CapacitorSQLite || Cap.registerPlugin('CapacitorSQLite')) : null;
  const docs = new Map(), kv = new Map();
  let fila = Promise.resolve();             // escritas em ordem, uma de cada vez
  const enfileirar = fn => (fila = fila.then(fn, fn));

  async function abrirSqlite() {
    try { await SQL.checkConnectionsConsistency({ dbNames: [], openModes: [] }); } catch (_) {} // fecha conexões de uma carga anterior
    await SQL.createConnection({ database: BANCO, version: 1, encrypted: false, mode: 'no-encryption', readonly: false });
    await SQL.open({ database: BANCO, readonly: false });
    await SQL.execute({ database: BANCO, readonly: false, transaction: true, statements: `
      CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY NOT NULL, colecao TEXT NOT NULL, dados TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS docs_colecao ON docs (colecao);
      CREATE TABLE IF NOT EXISTS kv (chave TEXT PRIMARY KEY NOT NULL, valor TEXT NOT NULL);` });
    const q = async sql => (await SQL.query({ database: BANCO, statement: sql, values: [], readonly: false })).values || [];
    for (const r of await q('SELECT path, dados FROM docs')) docs.set(r.path, JSON.parse(r.dados));
    for (const r of await q('SELECT chave, valor FROM kv')) kv.set(r.chave, r.valor);
  }
  const executarSet = set => SQL.executeSet({ database: BANCO, set, transaction: true, readonly: false });
  const colecaoDe = path => path.slice(0, path.lastIndexOf('/'));

  // mudancas: [[path, dados | null]]. Grava numa transação; a memória só muda se gravou.
  function gravarDocs(mudancas) {
    return enfileirar(async () => {
      if (nativo) await executarSet(mudancas.map(([p, d]) => d === null
        ? { statement: 'DELETE FROM docs WHERE path = ?', values: [p] }
        : { statement: 'INSERT OR REPLACE INTO docs (path, colecao, dados) VALUES (?, ?, ?)', values: [p, colecaoDe(p), JSON.stringify(d)] }));
      for (const [p, d] of mudancas) d === null ? docs.delete(p) : docs.set(p, d);
    });
  }
  // Troca todos os dados da casa (restaurar backup). O kv (cofre do PIN deste aparelho) fica.
  function substituirDocs(lista) {
    return enfileirar(async () => {
      if (nativo) await executarSet([{ statement: 'DELETE FROM docs', values: [] },
        ...lista.map(({ path, dados }) => ({ statement: 'INSERT INTO docs (path, colecao, dados) VALUES (?, ?, ?)', values: [path, colecaoDe(path), JSON.stringify(dados)] }))]);
      docs.clear(); lista.forEach(({ path, dados }) => docs.set(path, dados));
    });
  }
  function gravarKv(chave, valor) { // valor null = apagar
    if (!nativo) return;
    enfileirar(() => executarSet([valor === null
      ? { statement: 'DELETE FROM kv WHERE chave = ?', values: [chave] }
      : { statement: 'INSERT OR REPLACE INTO kv (chave, valor) VALUES (?, ?)', values: [chave, valor] }])
    ).catch(e => console.error('[local] kv', e));
  }

  // Mesma interface de chave/valor (getItem/setItem/removeItem) que o cofre do PIN já usa.
  function armazem(mapa, persistir) {
    const api = {
      get length() { return mapa.size; },
      key: i => [...mapa.keys()][i] ?? null,
      getItem: k => mapa.has(String(k)) ? mapa.get(String(k)) : null,
      setItem: (k, v) => { k = String(k); v = String(v); mapa.set(k, v); persistir?.(k, v); },
      removeItem: k => { k = String(k); if (mapa.delete(k)) persistir?.(k, null); },
      clear: () => { for (const k of [...mapa.keys()]) api.removeItem(k); }
    };
    return api;
  }
  window.stkArmazem = armazem(kv, gravarKv);
  window.stkSessao = armazem(new Map(), null);
  // aberto = banco carregado (local/StorageSqlite.js espera por ele). fila() = espera as escritas pendentes.
  const aberto = nativo ? abrirSqlite() : Promise.resolve(console.warn('[local] fora do Android: dados só na memória, nada é salvo.'));
  window.stkLocal = { nativo, banco: BANCO, docs, aberto, gravarDocs, substituirDocs, fila: () => fila.catch(() => {}) };
  // Recarregar a página só depois de gravar no SQLite o que estiver na fila (a gravação é assíncrona).
  window.stkRecarregar = () => { window.stkLocal.fila().then(() => location.reload()); };

  /* ---------- carrega o app depois do banco ---------- */
  function carregar({ src, module }) {
    return new Promise((ok, falha) => {
      const s = document.createElement('script');
      if (module) s.type = 'module';
      s.src = src; s.async = false;
      s.onload = ok; s.onerror = () => falha(new Error('Não carregou ' + src));
      document.head.append(s);
    });
  }
  function falhaFatal(e) {
    console.error('[local]', e);
    const p = document.createElement('pre');
    p.style.cssText = 'white-space:pre-wrap;padding:24px;font:14px/1.5 monospace;color:#E08585';
    p.textContent = 'Não consegui abrir o banco de dados do aparelho.\n\n' + (e?.message || e);
    document.body.replaceChildren(p);
  }
  // Os scripts do app eram defer/module: esperam a página montada.
  const domPronto = document.readyState === 'loading' ? new Promise(ok => document.addEventListener('DOMContentLoaded', ok, { once: true })) : Promise.resolve();
  Promise.all([aberto, domPronto]).then(async () => { for (const s of scripts) await carregar(s); })
    .catch(e => domPronto.then(() => falhaFatal(e)));
})();
