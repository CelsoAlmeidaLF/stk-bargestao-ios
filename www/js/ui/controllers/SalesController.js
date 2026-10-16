/**
 * Controller de UI: Vendas, comandas e mesas.
 * Extraído de App.js; acessa estado, serviços e o commit transacional via `this._app`.
 */
export class SalesController {
  _app;
  _editingmesaclient = null;
  _closingmesa = null;
  _cancellingitem = null;

  constructor(app) {
    this._app = app;
  }

  bind() {
    document.getElementById('abrir-nova-mesa')?.addEventListener('click', () => this._click_new_order());
    document.getElementById('mesas-busca')?.addEventListener('input', () => this._renderTables());
    document.getElementById('mesa-numero')?.addEventListener('input', () => this._updateTableContext());
    document.getElementById('mesa-aberta-select')?.addEventListener('change', e => this._change_table_select(e));
    document.getElementById('mesa-nova')?.addEventListener('click', () => this._click_new_order());
    document.getElementById('qtd-menos')?.addEventListener('click', () => this._stepQuantity(-1));
    document.getElementById('qtd-mais')?.addEventListener('click', () => this._stepQuantity(1));
    document.getElementById('venda-qtd')?.addEventListener('input', () => this._updateOrderPrice());
    document.getElementById('venda-busca')?.addEventListener('input', () => this._renderProductSelects());
    document.getElementById('venda-categoria')?.addEventListener('change', () => this._renderProductSelects());
    document.getElementById('form-item')?.addEventListener('submit', e => this._submit_add_item(e));
    document.getElementById('form-editar-cliente')?.addEventListener('submit', e => this._submit_edit_client(e));
    document.getElementById('form-fechar-mesa')?.addEventListener('submit', e => this._submit_close_table(e));
    document.getElementById('form-cancelar-item')?.addEventListener('submit', e => this._submit_cancel_item(e));
  }

  // RN-FIREBASE.2: módulo de mesas só opera quando liberado pela governança
  _ensureTablesAllowed() {
    if (this._app._governanceCtl.allowsTables()) return true;
    this._app._renderer.toast('O módulo de mesas não foi liberado pela Governança Systekna para este estabelecimento.');
    return false;
  }

  // Seleção de mesa já aberta no modal de pedido (antes apontava para um método inexistente)
  _change_table_select(event) {
    const name = event.target.value;
    if (!name) {
      this._click_new_order();
      return;
    }
    this._chooseTable(name);
  }

  // Confirmação do cancelamento de item (antes apontava para um método inexistente)
  async _submit_cancel_item(event) {
    event.preventDefault();
    const pending = this._cancellingitem;
    const reason = document.getElementById('cancel-reason')?.value?.trim() || '';
    if (!pending) {
      this._app._renderer._closeModal('modal-cancelamento');
      return;
    }
    const session = this._app._auth.getSession();
    const ok = await this._app._commit(draft => {
      this._app._order.cancelOrderItemWithRole(draft, pending.table, pending.itemId, reason, session.usuario, session.perfil);
    }, 'Cancelamento de item de comanda');
    if (ok) {
      this._cancellingitem = null;
      this._app._renderer._closeModal('modal-cancelamento');
      this._app._renderer.toast('Item cancelado e devolvido ao estoque.');
    }
  }

  _renderTables() {
    const root = document.getElementById('lista-mesas');
    if (!root || !this._app._data) return;
    root.replaceChildren();

    const search = document.getElementById('mesas-busca')?.value.toLowerCase().trim() || '';
    const entries = Object.entries(this._app._data.mesas || {});
    document.getElementById('stat-mesas').textContent = String(entries.length);
    document.getElementById('mesas-count').textContent = `${entries.length} mesa(s)`;

    let total = 0;
    for (const [name, items] of entries) {
      const sum = this._app._order.calculateOrderTotal(items);
      total += sum;
      const cliente = this._app._data.mesaClientes?.[name] || 'Cliente não informado';

      if (search && !`${name} ${cliente}`.toLowerCase().includes(search)) continue;

      const card = this._app._renderer.make('div', 'entry mesa-entry');
      const head = this._app._renderer.make('div', 'entry-head');
      const left = this._app._renderer.make('div', 'entry-left');
      left.append(
        this._app._renderer.make('strong', '', name),
        this._app._renderer.make('div', 'meta', cliente)
      );
      head.append(left, this._app._renderer.make('strong', 'entry-strong', this._app._renderer.money(sum)));
      card.append(head);

      for (const item of items) {
        const line = this._app._renderer.make('div', 'itemline');
        line.append(
          this._app._renderer.make('span', '', `${item.qtd} × ${item.nome}`),
          this._app._renderer.make('span', '', this._app._renderer.money(item.total))
        );
        card.append(line);
      }

      const actions = this._app._renderer.make('div', 'actions');
      actions.append(
        this._app._renderer.btn('Adicionar pedido', () => this._chooseTable(name), 'btn'),
        this._app._renderer.btn('Cliente', () => this._editTableClient(name), 'btn outline'),
        this._app._renderer.btn('Receber', () => this._closeTable(name), 'btn ghost')
      );
      card.append(actions);
      root.append(card);
    }
    document.getElementById('stat-valor').textContent = this._app._renderer.money(total);
    if (!entries.length) root.append(this._app._renderer.empty('Nenhuma mesa aberta.'));
  }

  _renderProductSelects() {
    if (!this._app._data) return;
    const list = document.getElementById('venda-produtos-grid');
    if (!list) return;
    list.replaceChildren();

    const query = document.getElementById('venda-busca')?.value || '';
    const cat = document.getElementById('venda-categoria')?.value || '';
    const products = this._app._stock.findProducts(this._app._data.produtos || [], query, cat);

    // O <select required> oculto é o valor submetido pelo formulário: precisa conter os produtos
    // ativos (não só os filtrados), senão a escolha some ao trocar o filtro.
    const select = document.getElementById('venda-produto');
    if (select) {
      const current = select.value;
      select.replaceChildren(this._app._renderer.make('option', '', 'Selecione um produto', { value: '' }));
      for (const p of this._app._stock.getActiveProducts(this._app._data)) {
        select.append(this._app._renderer.make('option', '', p.nome, { value: String(p.id) }));
      }
      select.value = current;
    }

    for (const p of products) {
      const row = this._app._renderer.btn('', () => {
        if (select) select.value = String(p.id);
        list.querySelectorAll('.product-choice.selected').forEach(el => el.classList.remove('selected'));
        row.classList.add('selected');
        this._updateOrderPrice();
      }, 'product-choice');
      if (select && select.value === String(p.id)) row.classList.add('selected');

      const details = this._app._renderer.make('span', 'product-list-details');
      details.append(
        this._app._renderer.make('strong', '', p.nome),
        this._app._renderer.make('small', 'product-code', `Cód: ${p.codigo || p.id.slice(0, 8)} · ${p.categoria}`),
        this._app._renderer.make('small', 'product-stock', p.qtd > 0 ? `Estoque: ${p.qtd} un.` : 'Sem estoque')
      );
      const right = this._app._renderer.make('span', 'product-list-right');
      right.append(this._app._renderer.make('strong', 'product-list-price', this._app._renderer.money(p.venda)));
      row.append(details, right);
      if (p.qtd <= 0) row.disabled = true;
      list.append(row);
    }
  }

  _updateOrderPrice() {
    const prodId = document.getElementById('venda-produto')?.value;
    const prod = this._app._data?.produtos?.find(p => String(p.id) === String(prodId));
    const qty = Number(document.getElementById('venda-qtd')?.value) || 1;
    const sum = prod ? Math.round((prod.venda * qty + Number.EPSILON) * 100) / 100 : 0;
    const btnTotal = document.getElementById('venda-botao-total');
    if (btnTotal) btnTotal.textContent = this._app._renderer.money(sum);
  }

  _stepQuantity(delta) {
    const input = document.getElementById('venda-qtd');
    if (!input) return;
    const curr = Number(input.value) || 1;
    input.value = String(Math.max(1, curr + delta));
    this._updateOrderPrice();
  }

  _click_new_order() {
    if (!this._ensureTablesAllowed()) return;
    document.getElementById('mesa-numero').value = '';
    document.getElementById('mesa-cliente').value = '';
    document.getElementById('mesa-cliente').readOnly = false;
    this._app._renderer._openModal('modal-pedido', 'mesa-numero');
  }

  _chooseTable(name) {
    if (!this._ensureTablesAllowed()) return;
    const num = this._app._order.tableNumberFromKey(name);
    document.getElementById('mesa-numero').value = String(num);
    this._updateTableContext();
    this._app._renderer._openModal('modal-pedido', 'venda-busca');
  }

  _updateTableContext() {
    const num = Number(document.getElementById('mesa-numero')?.value);
    const table = this._app._order.resolveTableName(this._app._data, num);
    const isOpen = Object.hasOwn(this._app._data.mesas || {}, table);
    const clientInput = document.getElementById('mesa-cliente');
    if (isOpen && clientInput) {
      clientInput.value = this._app._data.mesaClientes?.[table] || '';
      clientInput.readOnly = true;
    } else if (clientInput) {
      clientInput.readOnly = false;
    }
  }

  async _submit_add_item(event) {
    event.preventDefault();
    if (!this._ensureTablesAllowed()) return;
    const num = Number(document.getElementById('mesa-numero').value);
    const client = document.getElementById('mesa-cliente').value.trim();
    const prodId = document.getElementById('venda-produto').value;
    const qty = Number(document.getElementById('venda-qtd').value) || 1;

    const table = this._app._order.resolveTableName(this._app._data, num);
    const isNew = !Object.hasOwn(this._app._data.mesas || {}, table);
    if (isNew && !client) {
      this._app._renderer.toast('Informe o nome do cliente para abrir a comanda.');
      return;
    }

    const ok = await this._app._commit(draft => {
      this._app._order.addOrderItem(draft, table, client, prodId, qty, this._app._auth.getSession().usuario);
    }, 'Inclusão de pedido em comanda');

    if (ok) {
      this._app._renderer._closeModal('modal-pedido');
      this._app._renderer.toast(`Pedido lançado para ${table}.`);
    }
  }

  _editTableClient(name) {
    this._editingmesaclient = name;
    document.getElementById('editar-cliente-input').value = this._app._data.mesaClientes?.[name] || '';
    this._app._renderer._openModal('modal-cliente', 'editar-cliente-input');
  }

  async _submit_edit_client(event) {
    event.preventDefault();
    const novonome = document.getElementById('editar-cliente-input').value.trim();
    const ok = await this._app._commit(draft => {
      this._app._order.updateClientName(draft, this._editingmesaclient, novonome);
    }, 'Edição do nome de cliente de comanda');
    if (ok) {
      this._app._renderer._closeModal('modal-cliente');
      this._app._renderer.toast('Nome do cliente atualizado.');
    }
  }

  _closeTable(name) {
    this._closingmesa = name;
    const items = this._app._data.mesas?.[name] || [];
    const total = this._app._order.calculateOrderTotal(items);
    document.getElementById('fechamento-mesa').textContent = name;
    document.getElementById('fechamento-cliente').textContent = `Cliente: ${this._app._data.mesaClientes?.[name] || ''}`;
    document.getElementById('fechamento-total').textContent = this._app._renderer.money(total);
    this._app._renderer._openModal('modal-fechamento');
  }

  async _submit_close_table(event) {
    event.preventDefault();
    const formapagamento = document.getElementById('fechamento-pagamento').value;
    const shift = this._app._shift.getActiveShift(this._app._data);

    const ok = await this._app._commit(draft => {
      this._app._order.receiveTable(draft, this._closingmesa, formapagamento, this._app._auth.getSession().usuario, shift?.id || null);
    }, 'Fechamento e quitação de mesa');

    if (ok) {
      this._app._renderer._closeModal('modal-fechamento');
      this._app._renderer.toast('Comanda recebida com sucesso.');
    }
  }
}
