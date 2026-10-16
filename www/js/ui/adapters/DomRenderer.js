/**
 * Adaptador de Renderização e Manipulação do DOM (Aero Glassmorphism 2.0)
 */
export class DomRenderer {
  _titles = {
    inicio: 'Visão geral',
    vendas: 'Mesas e comandas',
    estoque: 'Estoque',
    caixa: 'Dashboard financeiro',
    usuarios: 'Usuários',
    mais: 'Mais opções'
  };

  _icons = {
    inicio: 'i-home',
    vendas: 'i-grid',
    estoque: 'i-box',
    caixa: 'i-wallet',
    usuarios: 'i-users',
    mais: 'i-more'
  };

  money(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val) || 0);
  }

  dateLabel(iso) {
    if (!iso) return 'Não registrada (cadastro anterior)';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? 'Data não disponível' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  make(tag, cls = '', text = undefined, attrs = {}) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = String(text);
    for (const [name, value] of Object.entries(attrs || {})) {
      el.setAttribute(name, String(value));
    }
    return el;
  }

  icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + name);
    svg.append(use);
    return svg;
  }

  btn(label, callback, cls = 'btn ghost') {
    const b = this.make('button', cls, label);
    b.type = 'button';
    b.onclick = callback;
    return b;
  }

  empty(message) {
    const el = this.make('div', 'empty', message);
    return el;
  }

  toast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
  }

  _openModal(id, focusid = null) {
    const dialog = document.getElementById(id);
    if (dialog && !dialog.open) {
      dialog.showModal();
      if (focusid) document.getElementById(focusid)?.focus({ preventScroll: true });
    }
  }

  _closeModal(id) {
    const dialog = document.getElementById(id);
    if (dialog?.open) dialog.close();
  }

  renderNavigation(currenttab, ismanager, ontabchange, hiddentabs = []) {
    for (const target of ['desktop-nav', 'mobile-nav']) {
      const root = document.getElementById(target);
      if (!root) continue;
      root.replaceChildren();
      const tabs = target === 'mobile-nav'
        ? ['inicio', 'vendas', 'estoque', 'caixa', 'mais']
        : ['inicio', 'vendas', 'estoque', 'caixa', 'usuarios', 'mais'];

      for (const tab of tabs) {
        if (tab === 'usuarios' && !ismanager) continue;
        if (hiddentabs.includes(tab)) continue;
        const b = this.make('button', target === 'desktop-nav' ? 'nav-item' : '');
        b.type = 'button';
        b.classList.toggle('active', tab === currenttab || (tab === 'mais' && target === 'mobile-nav' && currenttab === 'usuarios'));
        b.setAttribute('aria-label', this._titles[tab]);
        if (b.classList.contains('active')) b.setAttribute('aria-current', 'page');
        b.append(
          this.icon(this._icons[tab]),
          this.make('span', '', target === 'mobile-nav'
            ? ({ inicio: 'Início', vendas: 'Mesas', estoque: 'Estoque', caixa: 'Caixa', mais: 'Mais' }[tab])
            : this._titles[tab])
        );
        b.onclick = () => ontabchange(tab);
        root.append(b);
      }
    }
  }
}
