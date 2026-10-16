/**
 * Adaptador para Geração Autônoma de Arquivos Binários (Excel e PDF)
 */
export class BinaryExportAdapter {
  _enc = new TextEncoder();

  _zipCrc(bytes) {
    let crc = 0xffffffff;
    for (const c of bytes) {
      crc ^= c;
      for (let i = 0; i < 8; i++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  _zipBlob(files) {
    const parts = [], central = [];
    let offset = 0;
    const u16 = v => Uint8Array.of(v & 255, (v >>> 8) & 255);
    const u32 = v => Uint8Array.of(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255);
    const concat = (...a) => {
      const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
      let pos = 0;
      for (const e of a) {
        out.set(e, pos);
        pos += e.length;
      }
      return out;
    };

    for (const [name, contents] of files) {
      const nb = this._enc.encode(name), cb = this._enc.encode(contents), crc = this._zipCrc(cb);
      const local = concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(cb.length), u32(cb.length), u16(nb.length), u16(0), nb);
      parts.push(local, cb);
      central.push(concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(cb.length), u32(cb.length), u16(nb.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nb));
      offset += local.length + cb.length;
    }

    const centralSize = central.reduce((n, b) => n + b.length, 0);
    parts.push(...central);
    parts.push(concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralSize), u32(offset), u16(0)));
    return new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  _xmlSafe(str) {
    let s = String(str ?? '');
    // OWASP Formula Injection Defense: previne execução em Excel/Calc
    if (/^[=+\-@\t\r]/.test(s)) {
      s = "'" + s;
    }
    return s
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  _sheetXml(rows, currencycolumns = []) {
    const colName = n => {
      let out = '';
      for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) {
        out = String.fromCharCode(65 + (x - 1) % 26) + out;
      }
      return out;
    };

    const all = rows.map((row, i) => '<row r="' + (i + 1) + '">' + row.map((value, j) => {
      const ref = colName(j + 1) + (i + 1), num = typeof value === 'number' && Number.isFinite(value);
      if (num) return `<c r="${ref}" s="${currencycolumns.includes(j) ? 1 : 0}"><v>${value}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${this._xmlSafe(value)}</t></is></c>`;
    }).join('') + '</row>').join('');

    const last = colName(Math.max(1, ...rows.map(x => x.length)));
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}${rows.length}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="17"/><cols><col min="1" max="1" width="23" customWidth="1"/><col min="2" max="2" width="27" customWidth="1"/><col min="3" max="3" width="34" customWidth="1"/><col min="4" max="4" width="22" customWidth="1"/><col min="5" max="8" width="23" customWidth="1"/></cols><sheetData>${all}</sheetData></worksheet>`;
  }

  buildXlsx(report, reportpayment, datelabel) {
    const labels = [
      ['BAR GESTÃO · RELATÓRIO DE CAIXA'],
      ['Período', report.periodLabel],
      ['Gerado em', datelabel(report.generatedAt)],
      ['Emitido por', report.user],
      [],
      ['INDICADOR', 'VALOR'],
      ['Vendas concluídas', report.salesCount],
      ['Valor vendido', report.sold],
      ['Retiradas', report.out],
      ['Entradas totais', report.incoming],
      ['Saldo do período', report.balance],
      ['Ticket médio', report.ticket],
      ['Mesas abertas (posição atual)', report.openTables],
      ['Valor em aberto (posição atual)', report.open],
      ['Custo estimado das vendas', report.cost === null ? 'Não disponível' : report.cost],
      [],
      ['FORMAS DE PAGAMENTO', 'TOTAL'],
      ...Object.entries(report.payments).map(([k, v]) => [reportpayment[k], v])
    ];

    const rows = [
      ['DATA/HORA', 'TIPO', 'DESCRIÇÃO', 'MESA', 'CLIENTE', 'FORMA DE PAGAMENTO', 'ENTRADA (R$)', 'SAÍDA (R$)', 'ID']
    ];

    for (const e of report.entries) {
      rows.push([
        datelabel(e.data),
        e.tipo === 'entrada' ? 'Entrada' : 'Saída',
        String(e.descricao || ''),
        String(e.mesa || ''),
        String(e.cliente || ''),
        reportpayment[e.formaPagamento] || String(e.formaPagamento || ''),
        e.tipo === 'entrada' ? Number(e.valor) || 0 : 0,
        e.tipo === 'saida' ? Number(e.valor) || 0 : 0,
        String(e.id || '')
      ]);
    }
    rows.push(['', '', '', '', '', 'TOTAL', report.incoming, report.out, '']);

    const types = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    const workbook = '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Resumo" sheetId="1" r:id="rId1"/><sheet name="Movimentações" sheetId="2" r:id="rId2"/></sheets></workbook>';
    const wbRels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    const styles = '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$ &quot;#,##0.00;[Red](&quot;R$ &quot;#,##0.00)"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>';

    return this._zipBlob([
      ['[Content_Types].xml', types],
      ['_rels/.rels', rels],
      ['xl/workbook.xml', workbook],
      ['xl/_rels/workbook.xml.rels', wbRels],
      ['xl/styles.xml', styles],
      ['xl/worksheets/sheet1.xml', this._sheetXml(labels, [1])],
      ['xl/worksheets/sheet2.xml', this._sheetXml(rows, [6, 7])]
    ]);
  }

  _pdfText(str) {
    return String(str ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7e]/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  buildPdf(report, reportpayment, datelabel, moneyformat) {
    const pages = [];
    let lines = [];
    const put = (txt, x, y, size = 10, bold = false) => {
      lines.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${this._pdfText(txt)}) Tj ET`);
    };
    const line = y => lines.push(`0.82 0.87 0.94 RG 44 ${y} m 551 ${y} l S`);

    const start = () => {
      lines = [];
      put('BAR GESTAO  |  RELATORIO DE CAIXA', 44, 795, 16, true);
      put('Periodo: ' + report.periodLabel + '   Gerado: ' + datelabel(report.generatedAt), 44, 773, 10);
      put('Responsavel: ' + report.user, 44, 756, 10);
      line(745);
    };

    const finish = () => pages.push(lines.join('\n'));

    start();
    const summ = [
      ['Vendas concluidas', report.salesCount],
      ['Valor vendido', moneyformat(report.sold)],
      ['Total de entradas', moneyformat(report.incoming)],
      ['Retiradas', moneyformat(report.out)],
      ['Saldo do periodo', moneyformat(report.balance)],
      ['Ticket medio', moneyformat(report.ticket)],
      ['Mesas abertas (agora)', report.openTables],
      ['Em aberto (agora)', moneyformat(report.open)],
      ['Custo estimado', report.cost === null ? 'Indisponivel' : moneyformat(report.cost)]
    ];

    put('RESUMO FINANCEIRO', 44, 721, 12, true);
    let y = 700;
    for (const [lbl, val] of summ) {
      put(String(lbl), 49, y, 10);
      put(String(val), 340, y, 10, true);
      y -= 19;
    }

    y -= 7;
    put('VENDAS POR FORMA DE PAGAMENTO', 44, y, 11, true);
    y -= 21;
    for (const [k, val] of Object.entries(report.payments)) {
      put(reportpayment[k], 49, y, 9);
      put(moneyformat(val), 340, y, 9, true);
      y -= 17;
    }

    y -= 15;
    put('EXTRATO DE MOVIMENTACOES', 44, y, 11, true);
    y -= 15;
    line(y);
    y -= 17;

    const columns = () => {
      put('DATA', 46, y, 8, true);
      put('TIPO', 146, y, 8, true);
      put('DESCRICAO', 202, y, 8, true);
      put('VALOR', 478, y, 8, true);
      y -= 17;
    };
    columns();

    for (const e of report.entries) {
      if (y < 90) {
        finish();
        start();
        y = 715;
        put('EXTRATO DE MOVIMENTACOES (CONTINUACAO)', 44, y, 11, true);
        y -= 24;
        columns();
      }
      let desc = String(e.descricao || '');
      if (e.mesa) desc += ' / ' + e.mesa;
      put(datelabel(e.data).slice(0, 17), 46, y, 8);
      put(e.tipo === 'entrada' ? 'Entrada' : 'Saida', 146, y, 8);
      put(desc.slice(0, 43), 202, y, 8);
      put((e.tipo === 'entrada' ? '+ ' : '- ') + moneyformat(e.valor), 478, y, 8);
      const detail = [
        e.cliente ? 'Cliente: ' + e.cliente : '',
        e.formaPagamento ? 'Pagamento: ' + (reportpayment[e.formaPagamento] || e.formaPagamento) : ''
      ].filter(Boolean).join('  |  ');
      if (detail) put(detail.slice(0, 65), 202, y - 11, 7);
      y -= detail ? 28 : 19;
    }

    if (!report.entries.length) {
      put('Nenhuma movimentacao registrada no periodo.', 46, y, 10);
    }
    finish();

    const objects = [], add = o => { objects.push(o); return objects.length; };
    const catalog = add(''), pagesId = add('');
    const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const boldFont = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    const kids = [];
    for (let i = 0; i < pages.length; i++) {
      const txt = pages[i] + `\nBT /F1 9 Tf 1 0 0 1 44 32 Tm (Pagina ${i + 1} de ${pages.length} - Relatorio confidencial) Tj ET`;
      const contents = add(`<< /Length ${this._enc.encode(txt).length} >>\nstream\n${txt}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R /F2 ${boldFont} 0 R >> >> /Contents ${contents} 0 R >>`));
    }

    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(x => x + ' 0 R').join(' ')}] /Count ${kids.length} >>`;

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i < offsets.length; i++) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;

    return new Blob([pdf], { type: 'application/pdf' });
  }

  // Edição Android: grava em Documentos/BarGestao ou abre o compartilhamento (local/arquivos.js)
  downloadBlob(blob, filename) {
    return window.stkSalvarArquivo(blob, filename);
  }
}
