/**
 * Excel download helpers.
 * Uses xlsx-js-style (SheetJS fork) for full per-cell styling:
 * bold headers with highlight, thin borders on every cell, optional red-font columns.
 *
 * Data-validation dropdowns are backed by a manually-injected very-hidden "__Lists"
 * worksheet, which avoids Excel's 255-character inline formula1 limit.
 * The sheet XML, workbook.xml entry, relationship, and content-type declaration are all
 * written by _injectDataValidations without touching xlsx-js-style internals.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx-js-style');
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

type BorderSide = { style: string; color: { rgb: string } };
type CellBorder = { top: BorderSide; bottom: BorderSide; left: BorderSide; right: BorderSide };

const _side = (): BorderSide => ({ style: 'thin', color: { rgb: '000000' } });
const THIN_BORDER: CellBorder = { top: _side(), bottom: _side(), left: _side(), right: _side() };

const DATA_STYLE     = { border: THIN_BORDER };
const RED_DATA_STYLE = { font: { color: { rgb: 'FF0000' } }, border: THIN_BORDER };

/**
 * Build a styled .xlsx Blob.
 * Row 1 = bold blue header; subsequent rows = data with borders.
 * @param redColumns      0-based column indices whose data cells should use red font.
 * @param validationLists Optional dropdown data validations. Each entry defines an sqref
 *                        range and the list of allowed values (rendered as an in-cell
 *                        dropdown). Values are stored in a hidden "__Lists" sheet so the
 *                        255-character inline formula1 limit is never hit.
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

  // Auto-size column widths
  ws['!cols'] = headers.map((h, ci) => {
    const maxLen = Math.max(
      h.length,
      ...filteredRows.map(r => (r[ci] ?? '').length),
    );
    return { wch: Math.min(Math.max(maxLen + 4, 14), 80) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  // Write the workbook — only Sheet1.  __Lists is injected below via raw OOXML.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let buf = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as any) as Uint8Array<ArrayBuffer>;

  if (validationLists && validationLists.length > 0) {
    buf = new Uint8Array(_injectDataValidations(buf, validationLists)) as Uint8Array<ArrayBuffer>;
  }

  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** Convert a 0-based column index to an Excel column letter (A … Z, AA, …). */
function _colLetter(idx: number): string {
  let letter = '';
  let n = idx;
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
}

/** Escape a string for use in an XML text node (NOT for attribute values). */
function _xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Unzip the xlsx buffer, then:
 *  1. Create a "__Lists" worksheet with one column per validation list, using
 *     inlineStr cells so no shared-strings table is required.
 *  2. Register the new sheet in workbook.xml (state="veryHidden"), workbook.xml.rels,
 *     and [Content_Types].xml.
 *  3. Inject <dataValidations> into sheet1.xml referencing the "__Lists" ranges.
 *  4. Rezip and return the patched buffer.
 */
function _injectDataValidations(
  xlsxBuf: Uint8Array,
  validationLists: { sqref: string; list: string[] }[],
): Uint8Array {
  try {
    const files = unzipSync(xlsxBuf);

    // ── 1. Build __Lists worksheet XML ───────────────────────────────────────
    // Use inlineStr (t="inlineStr") so we need no shared-strings table.
    const maxRows = Math.max(...validationLists.map(vl => vl.list.length));
    let rowsXml = '';
    for (let ri = 0; ri < maxRows; ri++) {
      let cells = '';
      for (let ci = 0; ci < validationLists.length; ci++) {
        const val = validationLists[ci].list[ri];
        if (val !== undefined && val !== '') {
          const ref = `${_colLetter(ci)}${ri + 1}`;
          cells += `<c r="${ref}" t="inlineStr"><is><t>${_xmlEscape(val)}</t></is></c>`;
        }
      }
      if (cells) rowsXml += `<row r="${ri + 1}">${cells}</row>`;
    }
    const listsSheetXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<sheetData>${rowsXml}</sheetData></worksheet>`;

    // ── 2. Determine the next sheet file number ───────────────────────────────
    const nextNum = Object.keys(files)
      .filter(k => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
      .reduce((max, k) => {
        const m = k.match(/sheet(\d+)\.xml$/i);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
      }, 0) + 1;
    const listsSheetPath = `xl/worksheets/sheet${nextNum}.xml`;

    // ── 3. Patch workbook.xml.rels — add relationship for the new sheet ───────
    const relsKey = Object.keys(files).find(k =>
      /^xl\/_rels\/workbook\.xml\.rels$/i.test(k),
    );
    let relsXml = relsKey ? strFromU8(files[relsKey]) : '';
    const maxRId = [...relsXml.matchAll(/\bId="rId(\d+)"/g)]
      .reduce((mx, m) => Math.max(mx, parseInt(m[1], 10)), 0);
    const newRId = `rId${maxRId + 1}`;

    if (relsKey) {
      const rel =
        `<Relationship Id="${newRId}" ` +
        `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ` +
        `Target="worksheets/sheet${nextNum}.xml"/>`;
      relsXml = relsXml.replace('</Relationships>', `${rel}</Relationships>`);
    }

    // ── 4. Patch workbook.xml — register sheet as veryHidden ─────────────────
    const wbKey = Object.keys(files).find(k => /^xl\/workbook\.xml$/i.test(k));
    let wbXml   = wbKey ? strFromU8(files[wbKey]) : '';
    if (wbKey) {
      // Find the max sheetId already in use
      const maxSheetId = [...wbXml.matchAll(/\bsheetId="(\d+)"/g)]
        .reduce((mx, m) => Math.max(mx, parseInt(m[1], 10)), 0);
      const sheetEntry =
        `<sheet name="__Lists" sheetId="${maxSheetId + 1}" ` +
        `state="veryHidden" r:id="${newRId}"/>`;
      wbXml = wbXml.replace('</sheets>', `${sheetEntry}</sheets>`);
    }

    // ── 5. Patch [Content_Types].xml ─────────────────────────────────────────
    const ctKey = Object.keys(files).find(k => /^\[Content_Types\]\.xml$/i.test(k));
    let ctXml   = ctKey ? strFromU8(files[ctKey]) : '';
    if (ctKey) {
      const ct =
        `<Override PartName="/xl/worksheets/sheet${nextNum}.xml" ` +
        `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
      ctXml = ctXml.replace('</Types>', `${ct}</Types>`);
    }

    // ── 6. Patch sheet1.xml — inject <dataValidations> ───────────────────────
    const s1Key = Object.keys(files).find(k =>
      /^xl\/worksheets\/sheet1\.xml$/i.test(k),
    );
    if (!s1Key) return xlsxBuf;
    let s1Xml = strFromU8(files[s1Key]);

    const dvItems = validationLists.map(({ sqref, list }, idx) => {
      const col     = _colLetter(idx);
      // Single-quote the sheet name as Excel requires; __ and letters need no escaping.
      const formula = `'__Lists'!$${col}$1:$${col}$${list.length}`;
      return (
        `<dataValidation type="list" sqref="${sqref}" showDropDown="0" allowBlank="1">` +
        `<formula1>${formula}</formula1></dataValidation>`
      );
    });
    const dvXml = `<dataValidations count="${dvItems.length}">${dvItems.join('')}</dataValidations>`;

    // OOXML schema: <dataValidations> must appear immediately after </sheetData>
    if (s1Xml.includes('</sheetData>')) {
      s1Xml = s1Xml.replace('</sheetData>', `</sheetData>${dvXml}`);
    } else {
      s1Xml = s1Xml.replace(/<\/worksheet>/, `${dvXml}</worksheet>`);
    }

    // ── 7. Repack ─────────────────────────────────────────────────────────────
    const patched: Record<string, Uint8Array | [Uint8Array, { level: number }]> = {};
    for (const [name, data] of Object.entries(files)) {
      if (name === s1Key) {
        patched[name] = [strToU8(s1Xml), { level: 6 }];
      } else if (wbKey && name === wbKey) {
        patched[name] = [strToU8(wbXml), { level: 6 }];
      } else if (relsKey && name === relsKey) {
        patched[name] = [strToU8(relsXml), { level: 6 }];
      } else if (ctKey && name === ctKey) {
        patched[name] = [strToU8(ctXml), { level: 6 }];
      } else {
        patched[name] = data;
      }
    }
    // Add the new worksheet file
    patched[listsSheetPath] = [strToU8(listsSheetXml), { level: 6 }];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return zipSync(patched as any);
  } catch {
    // If patching fails for any reason, fall back to the original buffer.
    return xlsxBuf;
  }
}
