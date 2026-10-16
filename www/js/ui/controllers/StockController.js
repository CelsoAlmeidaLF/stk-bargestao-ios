/**
 * Controller de UI: Estoque, produtos, categorias e movimentações.
 * Extraído de App.js; acessa estado, serviços e o commit transacional via `this._app`.
 */
export class StockController {
  _app;
  _editCategoryName = null;
  _editProductId = null;

  constructor(app) {
    this._app = app;
  }

  bind() {
    document.getElementById('abrir-categoria')?.addEventListener('click', () => this._openCategoryModal());
    document.getElementById('abrir-produto')?.addEventListener('click', () => this._openProductModal());
    document.getElementById('abrir-reposicao')?.addEventListener('click', () => this._openRestockModal());
    document.getElementById('form-categoria')?.addEventListener('submit', e => this._submit_category(e));
    document.getElementById('categoria-cancelar')?.addEventListener('click', () => this._cancelCategoryEdit());
    document.getElementById('form-produto')?.addEventListener('submit', e => this._submit_product(e));
    document.getElementById('produto-cancelar')?.addEventListener('click', () => this._cancelProductEdit());
    document.getElementById('form-reposicao')?.addEventListener('submit', e => this._submit_restock(e));
    document.getElementById('estoque-busca')?.addEventListener('input', () => this._renderStock());
    document.getElementById('estoque-filtro-cat')?.addEventListener('change', () => this._renderStock());
    document.getElementById('estoque-arquivados')?.addEventListener('change', () => this._renderStock());
  }

  _renderStock() {
    const root = document.getElementById('lista-produtos');
    if (!root || !this._app._data) return;
    root.replaceChildren();

    const search = document.getElementById('estoque-busca')?.value || '';
    const cat = document.getElementById('estoque-filtro-cat')?.value || '';
    const showArchived = document.getElementById('estoque-arquivados')?.checked && this._app._auth.isManager();

    const allProducts = this._app._data.produtos || [];
    const filtered = allProducts.filter(p => {
      const isVisible = p.ativo !== false || showArchived;
      if (!isVisible) return false;
      if (cat && p.categoria !== cat) return false;
      if (search) {
        const term = this._app._stock._normalizeSearch(search);
        const hay = this._app._stock._normalizeSearch([p.nome, p.codigo, p.id, p.categoria].join(' '));
        if (!hay.includes(term)) return false;
      }
      return true;
    }).sort((a, b) => (Number(b.qtd > 0) - Number(a.qtd > 0)) || a.nome.localeCompare(b.nome, 'pt-BR'));

    const active = allProducts.filter(p => p.ativo !== false);
    const countEl = document.getElementById('produtos-count');
    if (countEl) countEl.textContent = `${active.length} produto(s)`;

    for (const p of filtered) {
      const archived = p.ativo === false;
      const el = this._app._renderer.make('div', 'entry');
      const head = this._app._renderer.make('div', 'entry-head');
      const left = this._app._renderer.make('div', 'entry-left');
      left.append(
        this._app._renderer.make('strong', '', p.nome),
        this._app._renderer.make('div', 'item-id', `Código: ${p.codigo || p.id.slice(0, 8)} · Categoria: ${p.categoria}`),
        this._app._renderer.make('div', 'meta', this._app._auth.isManager() ? `Custo: ${this._app._renderer.money(p.compra)} · Venda: ${this._app._renderer.money(p.venda)}` : `Preço: ${this._app._renderer.money(p.venda)}`)
      );
      const right = this._app._renderer.make('div', 'entry-right');
      right.append(
        this._app._renderer.make('strong', '', `${p.qtd} un.`),
        this._app._renderer.make('div', `pill ${archived ? '' : p.qtd <= p.min ? 'warn' : 'good'}`, archived ? 'Removido' : p.qtd <= p.min ? 'Estoque baixo' : 'Disponível')
      );
      head.append(left, right);
      el.append(head);

      const meta = this._app._renderer.make('div', 'meta', `Estoque mínimo: ${p.min} un.`);
      el.append(meta);

      if (this._app._auth.isManager()) {
        const actions = this._app._renderer.make('div', 'actions');
        if (archived) {
          actions.append(this._app._renderer.btn('Restaurar', () => this._restoreProduct(String(p.id)), 'btn outline'));
        } else {
          actions.append(
            this._app._renderer.btn('Editar', () => this._startProductEdit(String(p.id)), 'btn outline'),
            this._app._renderer.btn('Repor', () => this._focusRestock(String(p.id)), 'btn outline'),
            this._app._renderer.btn('Remover', () => this._archiveProduct(String(p.id)), 'btn danger')
          );
        }
        el.append(actions);
      }

      root.append(el);
    }

    if (!filtered.length) {
      root.append(this._app._renderer.empty('Nenhum produto corresponde ao filtro.'));
    }

    this._populateCategorySelectors();
    this._renderMovements();
  }

  _openCategoryModal() {
    this._cancelCategoryEdit();
    this._renderCategories();
    this._app._renderer._openModal('modal-categoria', 'nova-categoria');
  }

  _renderCategories() {
    const root = document.getElementById('lista-categorias');
    if (!root || !this._app._data) return;
    root.replaceChildren();

    const categorias = this._app._data.categorias || [];
    const countEl = document.getElementById('categorias-count');
    if (countEl) countEl.textContent = `${categorias.length} categoria(s)`;

    for (const name of categorias) {
      const count = (this._app._data.produtos || []).filter(p => p.categoria === name && p.ativo !== false).length;
      const el = this._app._renderer.make('div', 'entry');
      const head = this._app._renderer.make('div', 'entry-head');
      const info = this._app._renderer.make('div', 'entry-left');
      info.append(
        this._app._renderer.make('strong', '', name),
        this._app._renderer.make('div', 'meta', `${count} produto(s) ativo(s)`)
      );
      const right = this._app._renderer.make('div', 'entry-right');
      right.append(
        this._app._renderer.btn('Editar', () => this._startCategoryEdit(name), 'btn outline'),
        this._app._renderer.btn('Remover', () => this._deleteCategory(name), 'btn danger')
      );
      head.append(info, right);
      el.append(head);
      root.append(el);
    }

    if (!categorias.length) {
      root.append(this._app._renderer.empty('Nenhuma categoria cadastrada.'));
    }
  }

  _startCategoryEdit(name) {
    this._editCategoryName = name;
    const input = document.getElementById('nova-categoria');
    if (input) input.value = name;
    const title = document.getElementById('form-categoria-title');
    if (title) title.textContent = 'Editar categoria';
    const submitBtn = document.getElementById('categoria-submit');
    if (submitBtn) submitBtn.textContent = 'Atualizar';
    document.getElementById('categoria-cancelar')?.classList.remove('hidden');
    input?.focus();
  }

  _cancelCategoryEdit() {
    this._editCategoryName = null;
    const input = document.getElementById('nova-categoria');
    if (input) input.value = '';
    const title = document.getElementById('form-categoria-title');
    if (title) title.textContent = 'Nova categoria';
    const submitBtn = document.getElementById('categoria-submit');
    if (submitBtn) submitBtn.textContent = 'Salvar';
    document.getElementById('categoria-cancelar')?.classList.add('hidden');
  }

  async _submit_category(event) {
    event.preventDefault();
    const input = document.getElementById('nova-categoria');
    const name = input?.value?.trim();
    if (!name || name.length > 70) {
      this._app._renderer.toast('Informe um nome de categoria válido (até 70 caracteres).');
      return;
    }

    const isDuplicate = (this._app._data.categorias || []).some(
      c => c.localeCompare(name, 'pt-BR', { sensitivity: 'accent' }) === 0 && c !== this._editCategoryName
    );
    if (isDuplicate) {
      this._app._renderer.toast('Categoria já cadastrada.');
      return;
    }

    const oldName = this._editCategoryName;
    const ok = await this._app._commit(draft => {
      draft.categorias ||= [];
      if (oldName) {
        const idx = draft.categorias.indexOf(oldName);
        if (idx >= 0) draft.categorias[idx] = name;
        for (const p of (draft.produtos || [])) {
          if (p.categoria === oldName) {
            p.categoria = name;
            p.atualizadoEm = new Date().toISOString();
          }
        }
      } else {
        draft.categorias.push(name);
      }
    }, oldName ? `Atualização de categoria: ${oldName} -> ${name}` : `Cadastro de categoria: ${name}`);

    if (ok) {
      this._cancelCategoryEdit();
      this._renderCategories();
      this._app._renderer.toast(oldName ? 'Categoria atualizada.' : 'Categoria criada com sucesso.');
    }
  }

  async _deleteCategory(name) {
    const linked = (this._app._data.produtos || []).filter(p => p.categoria === name).length;
    if (linked > 0) {
      this._app._renderer.toast(`Esta categoria possui ${linked} produto(s), inclusive arquivados. Reclassifique-os antes de removê-la.`);
      return;
    }

    if (!confirm(`Remover a categoria "${name}"?`)) return;

    const ok = await this._app._commit(draft => {
      draft.categorias = (draft.categorias || []).filter(c => c !== name);
    }, `Exclusão de categoria: ${name}`);

    if (ok) {
      if (this._editCategoryName === name) this._cancelCategoryEdit();
      this._renderCategories();
      this._app._renderer.toast('Categoria removida com sucesso.');
    }
  }

  _populateCategorySelectors() {
    if (!this._app._data) return;
    const categorias = this._app._data.categorias || [];

    // Filtro no estoque
    const filtroCat = document.getElementById('estoque-filtro-cat');
    if (filtroCat) {
      const current = filtroCat.value;
      filtroCat.replaceChildren(this._app._renderer.make('option', '', 'Todas', { value: '' }));
      for (const cat of categorias) {
        const opt = this._app._renderer.make('option', '', cat, { value: cat });
        if (cat === current) opt.selected = true;
        filtroCat.append(opt);
      }
    }

    // Select no formulário de produto
    const prodCat = document.getElementById('prod-cat');
    if (prodCat) {
      const current = prodCat.value;
      prodCat.replaceChildren(this._app._renderer.make('option', '', 'Selecione uma categoria', { value: '' }));
      for (const cat of categorias) {
        const opt = this._app._renderer.make('option', '', cat, { value: cat });
        if (cat === current) opt.selected = true;
        prodCat.append(opt);
      }
    }

    // Select e chips no PDV
    const vendaCat = document.getElementById('venda-categoria');
    if (vendaCat) {
      const current = vendaCat.value;
      vendaCat.replaceChildren(this._app._renderer.make('option', '', 'Todas as categorias', { value: '' }));
      for (const cat of categorias) {
        const opt = this._app._renderer.make('option', '', cat, { value: cat });
        if (cat === current) opt.selected = true;
        vendaCat.append(opt);
      }
    }

    const vendaChips = document.getElementById('venda-chips');
    if (vendaChips) {
      vendaChips.replaceChildren();
      const allBtn = this._app._renderer.btn('Todas', () => {
        if (vendaCat) { vendaCat.value = ''; this._app._salesCtl._renderProductSelects(); }
      }, `v9-pill ${!vendaCat?.value ? 'active' : ''}`);
      vendaChips.append(allBtn);
      for (const cat of categorias) {
        const chip = this._app._renderer.btn(cat, () => {
          if (vendaCat) { vendaCat.value = cat; this._app._salesCtl._renderProductSelects(); }
        }, `v9-pill ${vendaCat?.value === cat ? 'active' : ''}`);
        vendaChips.append(chip);
      }
    }
  }

  _openProductModal() {
    this._cancelProductEdit();
    this._populateCategorySelectors();
    this._app._renderer._openModal('modal-produto', 'prod-nome');
  }

  _cancelProductEdit() {
    this._editProductId = null;
    const form = document.getElementById('form-produto');
    if (form) form.reset();
    const title = document.getElementById('form-produto-title');
    if (title) title.textContent = 'Cadastrar produto';
    const submitBtn = document.getElementById('produto-submit');
    if (submitBtn) submitBtn.textContent = 'Cadastrar produto';
    document.getElementById('label-prod-qtd')?.classList.remove('hidden');
    const qtdInput = document.getElementById('prod-qtd');
    if (qtdInput) { qtdInput.disabled = false; qtdInput.required = true; }
    document.getElementById('produto-cancelar')?.classList.add('hidden');
  }

  _startProductEdit(id) {
    const p = this._app._data.produtos?.find(x => String(x.id) === String(id) && x.ativo !== false);
    if (!p) return;
    this._editProductId = id;
    this._populateCategorySelectors();

    const nomeInput = document.getElementById('prod-nome');
    if (nomeInput) nomeInput.value = p.nome;
    const codigoInput = document.getElementById('prod-codigo');
    if (codigoInput) codigoInput.value = p.codigo || p.id.slice(0, 8);
    const catSelect = document.getElementById('prod-cat');
    if (catSelect) catSelect.value = p.categoria;
    const compraInput = document.getElementById('prod-compra');
    if (compraInput) compraInput.value = p.compra;
    const vendaInput = document.getElementById('prod-venda');
    if (vendaInput) vendaInput.value = p.venda;
    const minInput = document.getElementById('prod-min');
    if (minInput) minInput.value = p.min;

    document.getElementById('label-prod-qtd')?.classList.add('hidden');
    const qtdInput = document.getElementById('prod-qtd');
    if (qtdInput) { qtdInput.disabled = true; qtdInput.required = false; }

    const title = document.getElementById('form-produto-title');
    if (title) title.textContent = `Editar produto · ${p.codigo || p.id.slice(0, 8)}`;
    const submitBtn = document.getElementById('produto-submit');
    if (submitBtn) submitBtn.textContent = 'Salvar alterações';
    document.getElementById('produto-cancelar')?.classList.remove('hidden');

    this._app._renderer._openModal('modal-produto', 'prod-nome');
  }

  async _submit_product(event) {
    event.preventDefault();
    const nome = document.getElementById('prod-nome')?.value?.trim();
    const codigo = document.getElementById('prod-codigo')?.value?.trim().toUpperCase();
    const categoria = document.getElementById('prod-cat')?.value;
    const compra = Number(document.getElementById('prod-compra')?.value) || 0;
    const venda = Number(document.getElementById('prod-venda')?.value) || 0;
    const min = Number(document.getElementById('prod-min')?.value) || 0;
    const qtd = Number(document.getElementById('prod-qtd')?.value) || 0;

    const editing = this._editProductId;
    const ok = await this._app._commit(draft => {
      if (!editing) this._app._governanceCtl.ensureProductCapacity(draft);
      this._app._stock.saveProduct(draft, {
        nome,
        codigo,
        categoria,
        compra,
        venda,
        min,
        qtd,
        usuario: this._app._auth.getSession().usuario
      }, Boolean(editing), editing);
    }, editing ? `Edição de produto: ${nome}` : `Cadastro de produto: ${nome}`);

    if (ok) {
      this._cancelProductEdit();
      this._app._renderer._closeModal('modal-produto');
      this._app._renderer.toast(editing ? 'Produto atualizado com sucesso.' : 'Produto cadastrado com sucesso.');
    }
  }

  _openRestockModal() {
    const form = document.getElementById('form-reposicao');
    if (form) form.reset();
    const select = document.getElementById('rep-produto');
    if (select) {
      select.replaceChildren();
      for (const p of this._app._stock.getActiveProducts(this._app._data)) {
        select.append(this._app._renderer.make('option', '', `${p.nome} (Atual: ${p.qtd} un.)`, { value: p.id }));
      }
    }
    this._app._renderer._openModal('modal-reposicao', 'rep-produto');
  }

  _focusRestock(id) {
    this._openRestockModal();
    const select = document.getElementById('rep-produto');
    if (select) select.value = id;
  }

  async _submit_restock(event) {
    event.preventDefault();
    const id = document.getElementById('rep-produto')?.value;
    const tipo = document.getElementById('rep-tipo')?.value;
    const qtd = Number(document.getElementById('rep-qtd')?.value);
    const motivo = document.getElementById('rep-motivo')?.value?.trim() || '';

    const ok = await this._app._commit(draft => {
      this._app._stock.moveStock(draft, id, tipo, qtd, motivo, this._app._auth.getSession().usuario);
    }, `Movimentação de estoque: ${tipo} (${qtd} un.)`);

    if (ok) {
      this._app._renderer._closeModal('modal-reposicao');
      this._app._renderer.toast('Movimentação registrada com sucesso.');
    }
  }

  async _archiveProduct(id) {
    const p = this._app._data.produtos?.find(x => String(x.id) === String(id));
    if (!p) return;
    if (!confirm(`Deseja realmente remover o produto "${p.nome}"?`)) return;

    const ok = await this._app._commit(draft => {
      this._app._stock.archiveProduct(draft, id);
    }, `Remoção lógica de produto: ${p.nome}`);

    if (ok) {
      this._app._renderer.toast('Produto removido.');
    }
  }

  async _restoreProduct(id) {
    const p = this._app._data.produtos?.find(x => String(x.id) === String(id));
    if (!p) return;

    const ok = await this._app._commit(draft => {
      this._app._stock.restoreProduct(draft, id);
    }, `Restauração de produto: ${p.nome}`);

    if (ok) {
      this._app._renderer.toast('Produto restaurado com sucesso.');
    }
  }

  _renderMovements() {
    const root = document.getElementById('lista-movimentos');
    if (!root || !this._app._data) return;
    root.replaceChildren();

    const items = [...(this._app._data.movimentacoesEstoque || [])].sort((a, b) => String(b.data).localeCompare(String(a.data)));
    const countEl = document.getElementById('movimentos-count');
    if (countEl) countEl.textContent = `${items.length} registro(s)`;

    for (const m of items.slice(0, 80)) {
      const el = this._app._renderer.make('div', 'entry');
      const head = this._app._renderer.make('div', 'entry-head');
      const info = this._app._renderer.make('div', 'entry-left');
      info.append(
        this._app._renderer.make('strong', '', `${m.produtoNome || 'Produto'} · ${m.tipo}`),
        this._app._renderer.make('div', 'meta', this._app._renderer.dateLabel(m.data)),
        this._app._renderer.make('div', 'item-id', `ID: ${m.produtoId?.slice?.(0, 8) || m.produtoId}`)
      );
      if (m.motivo) info.append(this._app._renderer.make('div', 'meta', m.motivo));
      const total = this._app._renderer.make('strong', m.delta > 0 ? 'text-good' : m.delta < 0 ? 'text-bad' : '', `${m.delta > 0 ? '+' : ''}${m.delta} un.`);
      head.append(info, total);
      el.append(head);
      el.append(this._app._renderer.make('div', 'meta', `${m.antes} → ${m.depois} un. · ${m.usuario || 'Sistema'}`));
      root.append(el);
    }

    if (!items.length) {
      root.append(this._app._renderer.empty('O histórico será exibido após os lançamentos de estoque.'));
    }
  }
}
