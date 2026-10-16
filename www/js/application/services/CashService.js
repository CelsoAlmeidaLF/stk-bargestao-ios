import { CashTransaction } from '../../domain/entities/CashTransaction.js';

/**
 * Serviço de Aplicação: Gestão de Caixa e Balanço Financeiro
 */
export class CashService {
  _isSale(t) {
    return t.origem === 'venda' || (!t.origem && t.tipo === 'entrada' && /^Venda\b/i.test(t.descricao || ''));
  }

  _inPeriod(iso, period) {
    if (period === 'tudo') return true;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (period === 'hoje') return d >= today;
    if (period === 'mes') return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
    const days = Number(period);
    if (days === 7 || days === 30) {
      const from = new Date(today);
      from.setDate(from.getDate() - (days - 1));
      return d >= from;
    }
    return true;
  }

  _localDay(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  getFilteredEntries(database, period) {
    return (database.caixa || []).filter(t => this._inPeriod(t.data, period));
  }

  calculateMetrics(database, period) {
    const entries = this.getFilteredEntries(database, period);
    const sales = entries.filter(t => this._isSale(t));

    const sold = Math.round((sales.reduce((s, t) => s + Number(t.valor || 0), 0) + Number.EPSILON) * 100) / 100;
    const incoming = Math.round((entries.filter(t => t.tipo === 'entrada').reduce((s, t) => s + Number(t.valor || 0), 0) + Number.EPSILON) * 100) / 100;
    const outgoing = Math.round((entries.filter(t => t.tipo === 'saida').reduce((s, t) => s + Number(t.valor || 0), 0) + Number.EPSILON) * 100) / 100;
    
    const openValue = Math.round((Object.values(database.mesas || {}).flat().reduce((s, t) => s + Number(t.total || 0), 0) + Number.EPSILON) * 100) / 100;
    const completeCost = sales.length > 0 && sales.every(t => Number.isFinite(t.custoEstimado));
    const cost = Math.round((sales.reduce((s, t) => s + (Number(t.custoEstimado) || 0), 0) + Number.EPSILON) * 100) / 100;

    return {
      salesCount: sales.length,
      sold,
      incoming,
      outgoing,
      balance: Math.round((incoming - outgoing + Number.EPSILON) * 100) / 100,
      ticket: sales.length ? Math.round((sold / sales.length + Number.EPSILON) * 100) / 100 : 0,
      openValue,
      cost: completeCost ? cost : null,
      grossMargin: completeCost ? Math.round((sold - cost + Number.EPSILON) * 100) / 100 : null
    };
  }

  getChartData(database) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pad = n => String(n).padStart(2, '0');

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - 6 + i);
      return {
        key: this._localDay(d),
        label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
        total: 0
      };
    });

    const sales = (database.caixa || []).filter(t => this._isSale(t));
    for (const t of sales) {
      const d = new Date(t.data);
      if (Number.isNaN(d.getTime())) continue;
      const bucket = days.find(v => v.key === this._localDay(d));
      if (bucket) bucket.total += Number(t.valor || 0);
    }
    return days;
  }

  registerWithdrawal(database, motivo, valor, username, shiftid = null) {
    if (!motivo || !Number.isFinite(valor) || valor <= 0) {
      throw new Error('Informe motivo e valor positivo para a retirada.');
    }
    const val = Math.round((valor + Number.EPSILON) * 100) / 100;
    const trans = new CashTransaction({
      descricao: `${motivo} (${username})`,
      tipo: 'saida',
      origem: 'retirada',
      valor: val,
      turnoId: shiftid
    });
    (database.caixa ||= []).unshift(trans.toJSON());
    return trans.toJSON();
  }
}
