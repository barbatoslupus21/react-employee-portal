/**
 * Excel download helpers.
 * Uses xlsx-js-style (SheetJS fork) for full per-cell styling:
 * bold headers with highlight, thin borders on every cell, optional red-font columns.
 *
 * Data validation dropdowns are injected by patching the raw OOXML zip after xlsx-js-style
 * writes it, because xlsx-js-style 1.2.0 has no native data-validation support.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx-js-style');
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

type BorderSide = { style: string; color: { rgb: string } };
type CellBorder = { top: BorderSide; bottom: BorderSide; left: BorderSide; right: BorderSide };

const _side = (): BorderSide => ({ style: 'thin', color: { rgb: '000000' } });
const THIN_BORDER: CellBorder = { top: _side(), bottom: _side(), left: _side(), right: _side() };

const DATA_STYLE      = { border: THIN_BORDER };
const RED_DATA_STYLE  = { font: { color: { rgb: 'FF0000' } }, border: THIN_BORDER };

/**
 * Build a styled .xlsx Blob.
 * Row 1 = bold blue header; subsequent rows = data with borders.
 * @param redColumns       0-based column indices whose data cells should use red font.
 * @param validationLists  Optional dropdown data validations. Each entry defines an sqref range
 *                         and the list of allowed values (rendered as an in-cell dropdown).
 */
export function styledXlsx(
  headers: string[],
  rows: string[][],
  redColumns?: number[],
  validationLists?: { sqref: string; list: string[] }[],
  headerColor = '2845D6',
): Blob {
  const filteredRows = rows.filter((r) => r.some((c) => c !== ''));
  const totalRows    = 1 + filteredRows.length;
  const totalCols    = headers.length;

  const ws: Record<string, unknown> = {};

  const hdrStyle = {
    font:      { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
    fill:      { fgColor: { rgb: headerColor }, patternType: 'solid' },
    border:    THIN_BORDER,
    alignment: { horizontal: 'center', vertical: 'center' },
  };
  // Header row (row 0)
  headers.forEach((h, c) => {
    ws[XLSX.utils.encode_cell({ r: 0, c })] = { v: h, t: 's', s: hdrStyle };
  });

  // Data rows
  filteredRows.forEach((row, ri) => {
    row.forEach((val, ci) => {
      const isRed = redColumns?.includes(ci) ?? false;
      ws[XLSX.utils.encode_cell({ r: ri + 1, c: ci })] = {
        v: val,
        t: 's',
        s: isRed ? RED_DATA_STYLE : DATA_STYLE,
      };
    });
  });

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRows - 1, c: totalCols - 1 } });

  // Auto-size column widths based on the longest value in each column
  ws['!cols'] = headers.map((h, ci) => {
    const maxLen = Math.max(
      h.length,
      ...filteredRows.map(r => (r[ci] ?? '').length),
    );
    return { wch: Math.min(Math.max(maxLen + 4, 14), 80) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  // XLSX.write type:'array' may return a plain Array<number> (older builds) or a Uint8Array
  // (newer builds). Normalise to Uint8Array<ArrayBuffer> immediately so that:
  //  – fflate's unzipSync accepts it without complaint, and
  //  – new Blob([buf]) produces a valid file instead of corrupted data.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let buf = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as any) as Uint8Array<ArrayBuffer>;

  // xlsx-js-style 1.2.0 has no data-validation writer — patch the OOXML zip manually.
  if (validationLists && validationLists.length > 0) {
    // Wrap in new Uint8Array() to ensure ArrayBuffer (not ArrayBufferLike) backing for Blob.
    buf = new Uint8Array(_injectDataValidations(buf, validationLists)) as Uint8Array<ArrayBuffer>;
  }

  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Unzip the xlsx buffer, inject <dataValidations> into sheet1.xml, and rezip.
 * Uses fflate which is already a transitive dependency in the project.
 */
function _injectDataValidations(
  xlsxBuf: Uint8Array,
  validationLists: { sqref: string; list: string[] }[],
): Uint8Array {
  try {
    const files = unzipSync(xlsxBuf);

    const sheetKey = Object.keys(files).find(k =>
      /^xl\/worksheets\/sheet1\.xml$/i.test(k),
    );
    if (!sheetKey) return xlsxBuf;

    let xml = strFromU8(files[sheetKey]);

    const dvItems = validationLists.map(({ sqref, list }) => {
      // XML-escape each value for embedding inside the formula1 XML text node.
      // Excel in-cell list formula1 has a 255-character hard limit; truncate gracefully.
      const escapedItems: string[] = [];
      let totalLen = 2; // account for the surrounding quotes in formula1
      for (const n of list) {
        const escaped = n
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
        // +1 for the comma separator (except the first item)
        const addLen = escaped.length + (escapedItems.length > 0 ? 1 : 0);
        if (totalLen + addLen > 255) break;
        escapedItems.push(escaped);
        totalLen += addLen;
      }
      const safeList = escapedItems.join(',');
      return (
        `<dataValidation type="list" sqref="${sqref}" showDropDown="0" allowBlank="1">` +
        `<formula1>"${safeList}"</formula1>` +
        `</dataValidation>`
      );
    });

    const dvXml =
      `<dataValidations count="${dvItems.length}">${dvItems.join('')}</dataValidations>`;

    // OOXML schema requires <dataValidations> to appear immediately after <sheetData>
    // and BEFORE <pageMargins>/<pageSetup> which xlsx-js-style already writes.
    // Inserting before </worksheet> places it after those elements, breaking schema order.
    if (xml.includes('</sheetData>')) {
      xml = xml.replace('</sheetData>', `</sheetData>${dvXml}`);
    } else {
      // Fallback: no sheetData closing tag found (unlikely), insert before </worksheet>
      xml = xml.replace(/<\/worksheet>/, `${dvXml}</worksheet>`);
    }

    const patched: Record<string, Uint8Array | [Uint8Array, { level: number }]> = {};
    for (const [name, data] of Object.entries(files)) {
      patched[name] = name === sheetKey ? [strToU8(xml), { level: 6 }] : data;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return zipSync(patched as any);
  } catch {
    // If patching fails for any reason, return the original buffer unchanged
    return xlsxBuf;
  }
}
