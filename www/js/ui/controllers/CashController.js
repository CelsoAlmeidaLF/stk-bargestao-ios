/**
 * Controller de UI: Caixa, retiradas e relatórios exportados.
 * Extraído de App.js; acessa estado, serviços e o commit transacional via `this._app`.
 */
export class CashController {
  _app;

  constructor(app) {
    this._app = app;
  }

  bind() {
    document.getElementById('caixa-periodo')?.addEventListener('change', () => this._renderCash());
    document.getElementById('abrir-retirada')?.addEventListener('click', () => this._openWithdrawalModal());
    document.getElementById('form-despesa')?.addEventListener('submit', e => this._submit_withdrawal(e));

    // Exportação em Botão Único com Dropdown
    const exportTrigger = document.getElementById('cash-export-trigger');
    const exportMenu = document.getElementById('cash-export-menu');

    exportTrigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isClosed = exportMenu?.classList.contains('hidden');
      exportMenu?.classList.toggle('hidden', !isClosed);
      exportTrigger?.setAttribute('aria-expanded', String(isClosed));
    });

    document.addEventListener('click', (e) => {
      if (exportMenu && !exportMenu.classList.contains('hidden') && !exportMenu.contains(e.target) && e.target !== exportTrigger) {
        exportMenu.classList.add('hidden');
        exportTrigger?.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && exportMenu && !exportMenu.classList.contains('hidden')) {
        exportMenu.classList.add('hidden');
        exportTrigger?.setAttribute('aria-expanded', 'false');
        exportTrigger?.focus();
      }
    });

    document.getElementById('cash-export-xlsx')?.addEventListener('click', () => {
      exportMenu?.classList.add('hidden');
      exportTrigger?.setAttribute('aria-expanded', 'false');
      this._exportCashReport('xlsx');
    });

    document.getElementById('cash-export-pdf')?.addEventListener('click', () => {
      exportMenu?.classList.add('hidden');
      exportTrigger?.setAttribute('aria-expanded', 'false');
      this._exportCashReport('pdf');
    });

    // Exportação Rápida no Tab Mais
    document.getElementById('more-export-pdf')?.addEventListener('click', () => {
      const p = document.getElementById('quick-cash-period')?.value || 'hoje';
      this._exportCashReport('pdf', p);
    });
    document.getElementById('more-export-excel')?.addEventListener('click', () => {
      const p = document.getElementById('quick-cash-period')?.value || 'hoje';
      this._exportCashReport('xlsx', p);
    });
  }

  _renderCash() {
    if (!this._app._data) return;
    const period = document.getElementById('caixa-periodo')?.value || 'hoje';
    const metrics = this._app._cash.calculateMetrics(this._app._data, period);

    document.getElementById('cash-vendas').textContent = String(metrics.salesCount);
    document.getElementById('cash-faturamento').textContent = this._app._renderer.money(metrics.sold);
    document.getElementById('cash-aberto').textContent = this._app._renderer.money(metrics.openValue);
    document.getElementById('cash-ticket').textContent = this._app._renderer.money(metrics.ticket);
    document.getElementById('cash-saidas').textContent = this._app._renderer.money(metrics.outgoing);
    document.getElementById('cash-saldo').textContent = this._app._renderer.money(metrics.balance);

    const root = document.getElementById('livro-caixa');
    if (!root) return;
    root.replaceChildren();

    const entries = this._app._cash.getFilteredEntries(this._app._data, period);
    document.getElementById('caixa-count').textContent = `${entries.length} registros`;

    for (const e of entries) {
      const el = this._app._renderer.make('div', 'entry');
      const head = this._app._renderer.make('div', 'entry-head');
      const left = this._app._renderer.make('div', 'entry-left');
      left.append(
        this._app._renderer.make('strong', '', e.descricao),
        this._app._renderer.make('div', 'meta', this._app._renderer.dateLabel(e.data))
      );
      const right = this._app._renderer.make('strong', e.tipo === 'entrada' ? 'text-good' : 'text-bad',
        `${e.tipo === 'entrada' ? '+' : '−'} ${this._app._renderer.money(e.valor)}`);
      head.append(left, right);
      el.append(head);
      root.append(el);
    }
  }

  _openWithdrawalModal() {
    document.getElementById('form-despesa')?.reset();
    this._app._renderer._openModal('modal-retirada', 'sangria-motivo');
  }

  async _submit_withdrawal(event) {
    event.preventDefault();
    const motivo = document.getElementById('sangria-motivo').value.trim();
    const valor = Number(document.getElementById('sangria-valor').value);
    const shift = this._app._shift.getActiveShift(this._app._data);

    const ok = await this._app._commit(draft => {
      this._app._cash.registerWithdrawal(draft, motivo, valor, this._app._auth.getSession().usuario, shift?.id || null);
    }, 'Retirada do caixa (Sangria)');

    if (ok) {
      this._app._renderer._closeModal('modal-retirada');
      this._app._renderer.toast('Retirada registrada no caixa.');
    }
  }

  async _exportCashReport(format, periodOverride = null) {
    if (format === 'xlsx' && !this._app._governanceCtl.ensureXlsxAllowed()) return;
    const reportpayment = { pix: 'PIX', dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito' };
    const period = periodOverride || document.getElementById('caixa-periodo')?.value || document.getElementById('quick-cash-period')?.value || 'hoje';
    const entries = this._app._cash.getFilteredEntries(this._app._data, period);
    const metrics = this._app._cash.calculateMetrics(this._app._data, period);

    const report = {
      period,
      periodLabel: period.toUpperCase(),
      generatedAt: new Date().toISOString(),
      user: this._app._auth.getSession().usuario,
      entries,
      ...metrics,
      payments: {}
    };

    const name = `BarGestao-Caixa-${period}-${new Date().toISOString().slice(0, 10)}`;
    if (format === 'xlsx') {
      const blob = this._app._export.buildXlsx(report, reportpayment, iso => this._app._renderer.dateLabel(iso));
      this._app._export.downloadBlob(blob, name + '.xlsx');
    } else {
      const blob = this._app._export.buildPdf(report, reportpayment, iso => this._app._renderer.dateLabel(iso), val => this._app._renderer.money(val));
      this._app._export.downloadBlob(blob, name + '.pdf');
    }
    this._app._renderer.toast('Relatório financeiro exportado.');
  }
}
