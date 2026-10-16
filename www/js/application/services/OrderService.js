import { OrderItem } from '../../domain/entities/OrderItem.js';
import { StockMovement } from '../../domain/entities/StockMovement.js';

/**
 * Serviço de Aplicação: Gestão de Comandas, Pedidos e Mesas
 */
export class OrderService {
  _pad(n) {
    return String(n).padStart(2, '0');
  }

  nameForTable(num) {
    return `Mesa ${this._pad(num)}`;
  }

  resolveTableName(database, num) {
    const regex = /^Mesa\s*0*(\d+)$/i;
    const match = Object.keys(database.mesas || {}).find(s => {
      const m = s.match(regex);
      return m && Number(m[1]) === num;
    });
    return match || this.nameForTable(num);
  }

  tableNumberFromKey(name) {
    const match = String(name).match(/^Mesa\s*0*(\d+)$/i);
    return match ? Number(match[1]) : NaN;
  }

  calculateOrderTotal(items) {
    const sum = (items || []).reduce((acc, i) => acc + Number(i.total || 0), 0);
    return Math.round((sum + Number.EPSILON) * 100) / 100;
  }

  addOrderItem(database, tablename, clientname, productid, qtd, username) {
    const prod = (database.produtos || []).find(p => String(p.id) === String(productid) && p.ativo !== false);
    if (!prod) throw new Error('Produto indisponível.');
    if (!Number.isSafeInteger(qtd) || qtd <= 0) throw new Error('Quantidade inválida.');
    if (prod.qtd < qtd) throw new Error(`Estoque insuficiente. Saldo disponível: ${prod.qtd} un.`);

    const antes = prod.qtd;
    prod.qtd -= qtd;

    if (!Object.hasOwn(database.mesas, tablename)) {
      database.mesas[tablename] = [];
    }
    database.mesaClientes[tablename] = database.mesaClientes[tablename] || clientname || 'Cliente não informado';

    const item = new OrderItem({
      produtoId: prod.id,
      nome: prod.nome,
      precoUnit: prod.venda,
      custoUnit: prod.compra,
      qtd,
      total: Math.round((prod.venda * qtd + Number.EPSILON) * 100) / 100,
      data: new Date().toISOString()
    });
    database.mesas[tablename].push(item.toJSON());

    const mov = new StockMovement({
      produtoId: prod.id,
      produtoNome: prod.nome,
      tipo: 'Venda',
      delta: -qtd,
      antes,
      depois: prod.qtd,
      motivo: `Comanda ${tablename}`,
      usuario: username || 'Sistema'
    });
    (database.movimentacoesEstoque ||= []).unshift(mov.toJSON());
    return item.toJSON();
  }

  cancelOrderItemWithRole(database, tablename, itemid, reason, username, role = 'gerente') {
    if (role !== 'gerente') {
      throw new Error('Acesso negado: cancelamento de item exige perfil de gerente.');
    }
    return this.cancelOrderItem(database, tablename, itemid, reason, username);
  }

  cancelOrderItem(database, tablename, itemid, reason, username) {
    const items = database.mesas[tablename];
    if (!items?.length) throw new Error('Comanda não possui itens.');

    const idx = items.findIndex(i => String(i.id) === String(itemid));
    if (idx < 0) throw new Error('Item não encontrado na comanda.');

    const [item] = items.splice(idx, 1);
    const prod = database.produtos.find(p => String(p.id) === String(item.produtoId));
    if (prod) {
      const antes = prod.qtd;
      prod.qtd += Number(item.qtd);
      prod.ultimoMovimentoEm = new Date().toISOString();
      const mov = new StockMovement({
        produtoId: prod.id,
        produtoNome: prod.nome,
        tipo: 'Cancelamento',
        delta: Number(item.qtd),
        antes,
        depois: prod.qtd,
        motivo: `Comanda ${tablename} · ${reason}`,
        usuario: username || 'Sistema'
      });
      (database.movimentacoesEstoque ||= []).unshift(mov.toJSON());
    }

    (database.cancelamentos ||= []).unshift({
      id: crypto.randomUUID(),
      mesa: tablename,
      cliente: database.mesaClientes[tablename],
      item: structuredClone(item),
      motivo: reason,
      data: new Date().toISOString(),
      usuario: username
    });

    if (!items.length) {
      delete database.mesas[tablename];
      delete database.mesaClientes[tablename];
    }
  }

  updateClientName(database, tablename, novocliente) {
    if (!Object.hasOwn(database.mesas, tablename)) throw new Error('Mesa não encontrada.');
    if (!novocliente || novocliente.trim().length > 90) throw new Error('Nome do cliente deve ter até 90 caracteres.');
    database.mesaClientes[tablename] = novocliente.trim();
  }

  receiveTable(database, tablename, formapagamento, username, shiftid = null) {
    const items = database.mesas[tablename];
    if (!items?.length) throw new Error('Mesa indisponível ou vazia.');

    const total = this.calculateOrderTotal(items);
    const cliente = database.mesaClientes[tablename] || 'Cliente não informado';
    const costKnown = items.every(i => Number.isFinite(i.custoUnit));
    const custoEstimado = costKnown ? Math.round((items.reduce((s, i) => s + (i.custoUnit || 0) * (i.qtd || 0), 0) + Number.EPSILON) * 100) / 100 : null;

    (database.caixa ||= []).unshift({
      id: crypto.randomUUID(),
      data: new Date().toISOString(),
      descricao: `Venda ${tablename} (${username})`,
      tipo: 'entrada',
      origem: 'venda',
      formaPagamento: formapagamento,
      valor: total,
      mesa: tablename,
      cliente,
      itens: structuredClone(items),
      custoEstimado,
      turnoId: shiftid
    });

    delete database.mesas[tablename];
    delete database.mesaClientes[tablename];
    delete (database.pagamentosParciais || {})[tablename];
    return { total, cliente };
  }
}
