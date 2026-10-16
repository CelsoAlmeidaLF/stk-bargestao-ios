/* Edição Android: gravação de arquivos (backup, relatórios PDF/Excel, frase de recuperação, cópias do kit).
   No Android o WebView não baixa arquivos como o navegador: grava em Documentos/BarGestao (plugin Filesystem)
   e, se não der, abre o compartilhamento do Android (Drive, e-mail, WhatsApp…). Script clássico: window.stkSalvarArquivo. */
(function () {
  'use strict';
  const Cap = window.Capacitor;
  const plugin = nome => Cap?.Plugins?.[nome] || Cap?.registerPlugin?.(nome);

  function aviso(texto) {
    let el = document.getElementById('stk-arquivo-aviso');
    if (!el) {
      el = document.createElement('div'); el.id = 'stk-arquivo-aviso'; el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:16px;right:16px;bottom:88px;z-index:2147483000;padding:12px 16px;border-radius:14px;'
        + 'background:rgba(23,29,26,.94);color:#E6EEEA;font:500 14px/1.4 "IBM Plex Mono",monospace;box-shadow:0 8px 30px rgba(0,0,0,.35);text-align:center';
      document.body.append(el);
    }
    el.textContent = texto; el.hidden = false;
    clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 5000);
  }

  const base64 = async blob => {
    const bytes = new Uint8Array(await blob.arrayBuffer()); let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };

  // conteudo: Blob ou texto. Devolve { local, uri }.
  window.stkSalvarArquivo = async function (conteudo, nome) {
    const blob = conteudo instanceof Blob ? conteudo : new Blob([String(conteudo)], { type: 'text/plain' });
    if (!Cap?.isNativePlatform?.()) { // navegador (desenvolvimento): download comum
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nome });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      return { local: 'Downloads/' + nome, uri: null };
    }
    const FS = plugin('Filesystem'), data = await base64(blob);
    try {
      const r = await FS.writeFile({ path: 'BarGestao/' + nome, data, directory: 'DOCUMENTS', recursive: true });
      aviso('Salvo em Documentos/BarGestao/' + nome);
      return { local: 'Documentos/BarGestao/' + nome, uri: r.uri };
    } catch (e) {
      const r = await FS.writeFile({ path: nome, data, directory: 'CACHE' });
      await plugin('Share').share({ title: nome, url: r.uri, dialogTitle: 'Guardar ' + nome + ' em…' }).catch(() => {});
      return { local: null, uri: r.uri };
    }
  };
})();
