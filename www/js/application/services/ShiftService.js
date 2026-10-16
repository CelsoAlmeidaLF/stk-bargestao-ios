import { Shift } from '../../domain/entities/Shift.js';

/**
 * Serviço de Aplicação: Gestão e Conferência de Turnos de Caixa
 */
export class ShiftService {
  getActiveShift(database) {
    return (database.turnosCaixa || []).find(t => t.status === 'aberto') || null;
  }

  calculateShiftTotals(database, shift) {
    if (!shift) return null;
    const movements = (database.caixa || []).filter(c => c.turnoId === shift.id);
    const entradas = Math.round((movements.filter(c => c.tipo === 'entrada').reduce((s, c) => s + Number(c.valor || 0), 0) + Number.EPSILON) * 100) / 100;
    const saidas = Math.round((movements.filter(c => c.tipo === 'saida').reduce((s, c) => s + Number(c.valor || 0), 0) + Number.EPSILON) * 100) / 100;
    const cashIn = Math.round((movements.filter(c => c.tipo === 'entrada' && c.formaPagamento === 'dinheiro').reduce((s, c) => s + Number(c.valor || 0), 0) + Number.EPSILON) * 100) / 100;
    const cashOut = Math.round((movements.filter(c => c.tipo === 'saida').reduce((s, c) => s + Number(c.valor || 0), 0) + Number.EPSILON) * 100) / 100;
    const esperado = Math.round((shift.fundoInicial + cashIn - cashOut + Number.EPSILON) * 100) / 100;

    return {
      entradas,
      saidas,
      cashIn,
      cashOut,
      esperado
    };
  }

  openShift(database, fundoinicial, operador) {
    const existing = this.getActiveShift(database);
    if (existing) throw new Error('Já existe um turno aberto no momento.');

    const fundo = Math.round((Number(fundoinicial) + Number.EPSILON) * 100) / 100;
    if (!Number.isFinite(fundo) || fundo < 0) throw new Error('Fundo inicial inválido.');

    const shift = new Shift({
      status: 'aberto',
      operador: operador || 'Sistema',
      fundoInicial: fundo
    });
    shift.validate();
    (database.turnosCaixa ||= []).push(shift.toJSON());
    return shift.toJSON();
  }

  closeShift(database, contado, operador, observacoes = '') {
    const shift = this.getActiveShift(database);
    if (!shift) throw new Error('Nenhum turno aberto para fechar.');

    const count = Math.round((Number(contado) + Number.EPSILON) * 100) / 100;
    if (!Number.isFinite(count) || count < 0) throw new Error('Valor contado inválido.');

    const totals = this.calculateShiftTotals(database, shift);
    shift.esperado = totals.esperado;
    shift.contado = count;
    shift.diferenca = Math.round((count - totals.esperado + Number.EPSILON) * 100) / 100;
    shift.status = 'fechado';
    shift.fechadoEm = new Date().toISOString();
    shift.fechadoPor = operador;
    shift.observacoes = String(observacoes || '');
    return shift;
  }
}
