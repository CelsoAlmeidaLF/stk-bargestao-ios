import { Product } from '../../domain/entities/Product.js';
import { StockMovement } from '../../domain/entities/StockMovement.js';

/**
 * Serviço de Aplicação: Gestão de Produtos, Estoque e Categorias
 */
export class StockService {
  _normalizeSearch(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
      .trim();
  }

  generateProductCode(products) {
    const used = new Set(products.map(p => String(p.codigo || p.id.slice(0, 8)).toUpperCase()));
    for (let n = 1; n <= 999999; n++) {
      const code = 'P' + String(n).padStart(5, '0');
      if (!used.has(code)) return code;
    }
    throw new Error('Limite de códigos automáticos atingido. Informe um código manual.');
  }

  getActiveProducts(database) {
    return (database.produtos || []).filter(p => p.ativo !== false);
  }

  findProducts(products, query, category) {
    const term = this._normalizeSearch(query);
    const cat = this._normalizeSearch(category);
    return products
      .filter(p => p.ativo !== false &&
        (!cat || this._normalizeSearch(p.categoria) === cat) &&
        (!term || this._normalizeSearch([p.nome, p.codigo, p.id, p.categoria].join(' ')).includes(term))
      )
      .sort((a, b) => (Number(b.qtd > 0) - Number(a.qtd > 0)) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  getLowStockProducts(database) {
    return this.getActiveProducts(database)
      .filter(p => p.qtd <= Number(p.min || 0))
      .sort((a, b) => a.qtd - b.qtd);
  }

  saveProduct(database, data, isediting = false, productid = null) {
    const nome = String(data.nome || '').trim();
    const codigo = String(data.codigo || '').trim().toUpperCase();
    const categoria = String(data.categoria || '').trim();
    const compra = Number(data.compra) || 0;
    const venda = Number(data.venda) || 0;
    const min = Number(data.min) || 0;
    const qtd = Number(data.qtd) || 0;

    if (!nome || !database.categorias.includes(categoria)) {
      throw new Error('Nome e categoria válida são obrigatórios.');
    }
    if (venda <= 0 || compra < 0) {
      throw new Error('Preço de venda deve ser maior que zero e custo não negativo.');
    }

    if (isediting && productid) {
      const p = database.produtos.find(x => String(x.id) === String(productid));
      if (!p || p.ativo === false) throw new Error('Produto indisponível para edição.');
      const nextCode = codigo || p.codigo || p.id.slice(0, 8).toUpperCase();
      if (database.produtos.some(x => String(x.id) !== String(p.id) && String(x.codigo).toUpperCase() === nextCode)) {
        throw new Error('Código já utilizado por outro produto.');
      }
      p.codigo = nextCode;
      p.nome = nome;
      p.categoria = categoria;
      p.compra = compra;
      p.venda = venda;
      p.min = min;
      p.atualizadoEm = new Date().toISOString();
      return p;
    } else {
      const nextCode = codigo || this.generateProductCode(database.produtos);
      if (database.produtos.some(x => String(x.codigo).toUpperCase() === nextCode)) {
        throw new Error('Código já utilizado por outro produto.');
      }
      const prod = new Product({
        codigo: nextCode,
        nome,
        categoria,
        compra,
        venda,
        qtd,
        min,
        ativo: true
      });
      prod.validate();
      database.produtos.push(prod.toJSON());

      const mov = new StockMovement({
        produtoId: prod.getId(),
        produtoNome: prod.getName(),
        tipo: 'Entrada inicial',
        delta: qtd,
        antes: 0,
        depois: qtd,
        motivo: 'Cadastro inicial do produto',
        usuario: data.usuario || 'Sistema'
      });
      (database.movimentacoesEstoque ||= []).unshift(mov.toJSON());
      return prod.toJSON();
    }
  }

  moveStock(database, productid, tipo, qtd, motivo, username) {
    const p = database.produtos.find(x => String(x.id) === String(productid) && x.ativo !== false);
    if (!p) throw new Error('Produto não localizado ou inativo.');
    if (!Number.isSafeInteger(qtd) || qtd <= 0) throw new Error('Quantidade inválida.');

    const antes = p.qtd;
    if (tipo === 'baixa' && qtd > p.qtd) {
      throw new Error('Não é possível retirar quantidade superior ao saldo em estoque.');
    }

    const delta = tipo === 'entrada' ? qtd : -qtd;
    p.qtd += delta;
    p.ultimoMovimentoEm = new Date().toISOString();
    p.atualizadoEm = new Date().toISOString();

    const mov = new StockMovement({
      produtoId: p.id,
      produtoNome: p.nome,
      tipo: tipo === 'entrada' ? 'Reposição' : 'Baixa',
      delta,
      antes,
      depois: p.qtd,
      motivo: motivo || '',
      usuario: username || 'Sistema'
    });
    (database.movimentacoesEstoque ||= []).unshift(mov.toJSON());
  }

  archiveProduct(database, productid) {
    const p = database.produtos.find(x => String(x.id) === String(productid));
    if (!p) throw new Error('Produto não localizado.');
    p.ativo = false;
    p.atualizadoEm = new Date().toISOString();
  }

  restoreProduct(database, productid) {
    const p = database.produtos.find(x => String(x.id) === String(productid));
    if (!p) throw new Error('Produto não localizado.');
    if (!database.categorias.includes(p.categoria)) {
      throw new Error('Restaure a categoria do produto antes de reativá-lo.');
    }
    p.ativo = true;
    p.atualizadoEm = new Date().toISOString();
  }
}
