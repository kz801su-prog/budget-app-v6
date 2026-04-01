import * as XLSX from 'xlsx';
import { MonthlyRecord } from './types';

// Robust number parser to handle commas, currency, and spaces
const parseNumber = (val: any): number => {
    if (typeof val === 'number') return val;
    if (val === undefined || val === null || val === '') return 0;
    let str = String(val).trim();
    const isNegative = str.startsWith('(') && str.endsWith(')') || str.startsWith('△') || str.startsWith('▲') || str.startsWith('-');
    const cleaned = str.replace(/[^0-9.]/g, '');
    let num = parseFloat(cleaned);
    if (isNaN(num)) return 0;
    return isNegative ? -num : num;
};

/**
 * Normalize department name from sheet name.
 * Handles: "(3 イズライフ事業部)", "（4 プローン事業部）", "シンコー合併"
 */
const normalizeDeptName = (sheetName: string): string => {
    let name = sheetName.normalize('NFKC').trim();
    
    // Remove brackets like ( ) or （ ） and then numbers at the beginning
    // (17 本部営業部) -> 17 本部営業部 -> 本部営業部
    name = name.replace(/[()（）]/g, '').trim();
    
    const match = name.match(/^(\d+)?\s*(.*)$/);
    if (match && match[2]) {
        return match[2].trim();
    }
    
    return name;
};

export const parseExcelFile = async (file: File, isBudgetMode: boolean = false, hintMonthIndex: number = -1): Promise<MonthlyRecord[]> => {
    const arrayBuffer = await file.arrayBuffer();
    // cellDates: false → 日付セルをJSのDateオブジェクトに変換せずシリアル値のまま保持
    // これにより "45383" (2024年4月) などを数値として extractMonthNum で月番号に変換できる
    const workbook = XLSX.read(arrayBuffer, { cellDates: false });
    let allRecords: MonthlyRecord[] = [];

    // The fiscal year starts from April (index 3 in a 0-indexed month array)
    const fiscalMonths = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];

    // 月ヘッダーから月番号（1〜12）を抽出する関数
    const extractMonthNum = (val: string): number | null => {
        const normalized = val.trim().normalize('NFKC');

        // Excelの日付シリアル値（5桁の数値、例: 45383 = 2024年4月1日）
        if (/^\d{5}$/.test(normalized)) {
            const serial = parseInt(normalized);
            const date = new Date(Math.round((serial - 25569) * 86400000));
            const m = date.getUTCMonth() + 1;
            if (m >= 1 && m <= 12) return m;
        }

        // ISO日付文字列 "2024-04-01" or "2024/04/01"
        const isoMatch = normalized.match(/\d{4}[-/](\d{1,2})[-/]\d{1,2}/);
        if (isoMatch) {
            const m = parseInt(isoMatch[1]);
            if (m >= 1 && m <= 12) return m;
        }

        // "4月", "令和7年4月", "2024年4月" など — 文字列中の X月 を抽出（行頭不要）
        const jpMatch = normalized.match(/(\d{1,2})月/);
        if (jpMatch) {
            const m = parseInt(jpMatch[1]);
            if (m >= 1 && m <= 12) return m;
        }

        // 1〜12 の数字のみ（単体セル、全角対応）
        const numMatch = normalized.match(/^[0０]?([1-9１-９]|1[0-2１-２])\s*$/);
        if (numMatch) {
            const m = parseInt(numMatch[1].replace(/[０-９]/g, c => String(c.charCodeAt(0) - 0xFF10)));
            if (m >= 1 && m <= 12) return m;
        }

        // 英語月名 "Apr", "April", "Mon Apr 01 2024 ..."
        const engMonthMatch = normalized.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*/i);
        if (engMonthMatch) {
            const engMap: Record<string, number> = {
                jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
                jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
            };
            const m = engMap[engMonthMatch[1].toLowerCase().substring(0, 3)];
            if (m) return m;
        }

        return null;
    };

    // 月番号(1〜12) → 0始まりの月インデックス（Jsの Date.getMonth() 準拠）
    const MONTH_NUM_TO_IDX: Record<number, number> = {
        1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5,
        7: 6, 8: 7, 9: 8, 10: 9, 11: 10, 12: 11
    };

    for (const sheetName of workbook.SheetNames) {
        try {
            const deptName = normalizeDeptName(sheetName);
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

            if (!jsonData || jsonData.length < 3) continue;

            // シート名に「昨年」「前年」が含まれる場合は prevYearActual として保存
            const normalizedSheetName = sheetName.normalize('NFKC');
            const isPrevYear = normalizedSheetName.includes('昨年') || normalizedSheetName.includes('前年');

            console.log(`[Parser] Processing Sheet: "${sheetName}" -> Dept: "${deptName}" isPrevYear=${isPrevYear}`);

            // ヘッダー行を探す（最初の10行を走査）
            // 月番号をヘッダー値から厳格に読み取る（数値なら1〜12のみ）
            let headerRowIndex = -1;
            let monthColMapping: { colIdx: number, monthIdx: number }[] = [];

            // 最初の5行を全て出力してヘッダーを特定（デバッグ）
            for (let r = 0; r < Math.min(jsonData.length, 5); r++) {
                const row = jsonData[r];
                if (!row) continue;
                const cells = row.slice(0, 20).map((v: any, i: number) =>
                    `[${i}]${typeof v}:${JSON.stringify(v)}`
                ).join('  ');
                console.log(`[Parser] "${sheetName}" row${r + 1}: ${cells}`);
            }

            for (let r = 0; r < Math.min(jsonData.length, 10); r++) {
                const row = jsonData[r];
                if (!row) continue;

                const potentialMapping: { colIdx: number, monthIdx: number }[] = [];

                // col=0 はコード列、col=1 は科目名列のため月ヘッダーは col=2 から
                for (let col = 2; col < row.length; col++) {
                    const raw = row[col];
                    const val = String(raw ?? "").trim().normalize('NFKC');
                    if (!val || val === "undefined" || val === "null") continue;

                    const monthNum = extractMonthNum(val);
                    if (monthNum !== null) {
                        const monthIdx = MONTH_NUM_TO_IDX[monthNum];
                        if (!potentialMapping.some(m => m.monthIdx === monthIdx)) {
                            potentialMapping.push({ colIdx: col, monthIdx: monthIdx });
                        }
                    }
                }

                if (potentialMapping.length >= 10) {
                    headerRowIndex = r;
                    monthColMapping = potentialMapping.sort((a, b) =>
                        fiscalMonths.indexOf(a.monthIdx) - fiscalMonths.indexOf(b.monthIdx)
                    );
                    console.log(`[Parser] ✓ Header at row${r + 1}. Month cols: ${monthColMapping.map(m => `col${m.colIdx}→${m.monthIdx + 1}月`).join(', ')}`);
                    break;
                }
            }
            // ★ フォールバックは廃止 — 曖昧な数値列（達成率・合計など）を月と誤認するため

            // ── Strategy 1 (12ヶ月形式) が成功した場合 ──────────────────────────
            if (headerRowIndex !== -1) {
                // コード列・科目列をヘッダー値から検索（固定オフセットでなく実際のラベルを優先）
                const headerRow = jsonData[headerRowIndex] || [];
                let codeColIdx    = -1;
                let subjectColIdx = -1;
                for (let col = 0; col < headerRow.length; col++) {
                    const v = String(headerRow[col] ?? '').normalize('NFKC').trim();
                    if (codeColIdx    === -1 && (v === 'コード' || v === '科目コード' || v === '勘定コード' || v === 'CD' || v === 'Code')) codeColIdx    = col;
                    if (subjectColIdx === -1 && (v === '科目名' || v === '科目' || v === '勘定科目' || v === '項目'))                        subjectColIdx = col;
                }
                // ラベルで見つからない場合は月列の直前2列をフォールバック
                const firstMonthCol = Math.min(...monthColMapping.map(m => m.colIdx));
                if (codeColIdx    === -1) codeColIdx    = Math.max(0, firstMonthCol - 2);
                if (subjectColIdx === -1) subjectColIdx = Math.max(0, firstMonthCol - 1);
                console.log(`[Parser] ✓ Annual format. Code col=${codeColIdx}, Subject col=${subjectColIdx}`);

                for (let r = headerRowIndex + 1; r < jsonData.length; r++) {
                    const row = jsonData[r];
                    if (!row || row.length < 2) continue;
                    const code    = String(row[codeColIdx]    || "").trim();
                    const subject = String(row[subjectColIdx] || "").trim();
                    if (!subject || subject === "科目" || subject === "科目名") continue;
                    if (subject.includes("合計") || subject.includes("小計") || subject.includes("損益勘定") || subject.includes("計算")) continue;

                    monthColMapping.forEach(mapping => {
                        const val = parseNumber(row[mapping.colIdx]);
                        if (code !== "" || val !== 0 || (subject !== "" && !subject.startsWith(" "))) {
                            allRecords.push({
                                code, subject, department: deptName,
                                actual:        isBudgetMode ? 0 : (isPrevYear ? 0 : val),
                                budget:        isBudgetMode ? val : 0,
                                prevYearActual: isPrevYear ? val : 0,
                                monthIndex: mapping.monthIdx
                            });
                        }
                    });
                }
                continue; // 次のシートへ
            }

            // ── 単月処理: まず月番号を確定 ────────────────────────────
            let sheetMonthIdx = hintMonthIndex;
            if (sheetMonthIdx === -1) {
                for (let r = 0; r < Math.min(jsonData.length, 8) && sheetMonthIdx === -1; r++) {
                    const row = jsonData[r];
                    if (!row) continue;
                    for (const cell of row) {
                        const txt = String(cell ?? "").normalize('NFKC');
                        const m = txt.match(/(\d{1,2})月(?:現在|度|分|末)?/);
                        if (m) {
                            const mn = parseInt(m[1]);
                            if (mn >= 1 && mn <= 12) { sheetMonthIdx = MONTH_NUM_TO_IDX[mn]; break; }
                        }
                    }
                }
            }

            if (sheetMonthIdx === -1) {
                console.log(`[Parser] Skipping "${sheetName}": 月番号不明（ファイル名に「4月」などを含めてください）`);
                continue;
            }

            // ── Strategy 2: A列=コード, B列=科目, H列=当月値（固定フォーマット）────
            // 「貸借対照表」「損益計算書」「販売費及び一般管理費」など
            // A/B列にコード・科目が存在する場合はH列（index=7）を最優先で使用する
            {
                let abStartRow = -1;
                for (let r = 0; r < Math.min(jsonData.length, 30); r++) {
                    const row = jsonData[r];
                    if (!row) continue;
                    const a = String(row[0] ?? '').normalize('NFKC').trim();
                    const b = String(row[1] ?? '').normalize('NFKC').trim();
                    // ラベル行はスキップ
                    if (['コード','科目コード','勘定コード','CD','Code','科目','科目名','勘定科目'].includes(a)) continue;
                    // A列が空でなく、B列が科目名らしい文字列なら開始行とみなす
                    if (a && b && b.length >= 2 && !/^\d+$/.test(b)) {
                        abStartRow = r;
                        break;
                    }
                }

                if (abStartRow !== -1) {
                    const VAL_COL = 7; // H列
                    let hColHeader = '';
                    for (let r = 0; r < abStartRow; r++) {
                        const v = String((jsonData[r] ?? [])[VAL_COL] ?? '').normalize('NFKC').trim();
                        if (v) { hColHeader = v; break; }
                    }
                    console.log(`[Parser] ✓ A/B/H形式 "${sheetName}": ${sheetMonthIdx + 1}月, startRow=${abStartRow + 1}, H列="${hColHeader}"`);

                    for (let r = abStartRow; r < jsonData.length; r++) {
                        const row = jsonData[r];
                        if (!row || row.length < 2) continue;
                        const code    = String(row[0] ?? '').trim();
                        const subject = String(row[1] ?? '').trim();
                        if (!subject || subject === '科目名' || subject === '科目') continue;
                        if (subject.includes('合計') || subject.includes('小計') || subject.includes('損益勘定')) continue;

                        const val = parseNumber(row[VAL_COL]);
                        allRecords.push({
                            code, subject, department: deptName,
                            actual:         isBudgetMode ? 0 : (isPrevYear ? 0 : val),
                            budget:         isBudgetMode ? val : 0,
                            prevYearActual: isPrevYear ? val : 0,
                            monthIndex:     sheetMonthIdx,
                        });
                    }
                    continue;
                }
            }

            // ── Strategy 3: 列ヘッダーから実績列を検索（A/B構成がないシート用）────
            let singleHeaderRow = -1;
            let actualColIdx    = -1;
            let budgetColIdx    = -1;
            let codeColIdx      = 0;
            let subjectColIdx   = 1;

            for (let r = 0; r < Math.min(jsonData.length, 10); r++) {
                const row = jsonData[r];
                if (!row) continue;
                for (let col = 0; col < row.length; col++) {
                    const v = String(row[col] ?? "").normalize('NFKC').trim();
                    if (v === "コード" || v === "科目コード" || v === "勘定コード") codeColIdx    = col;
                    if (v === "科目名"  || v === "科目"     || v === "勘定科目")   subjectColIdx = col;
                    if (actualColIdx === -1 && (v === "当月実績" || v === "実績" || v === "当月" || v === "当月末" || v === "残高" || v === "金額")) actualColIdx = col;
                    if (budgetColIdx === -1 && (v === "当月予算" || v === "予算")) budgetColIdx = col;
                    if (isPrevYear && actualColIdx === -1 && (v === "前年実績" || v === "昨年実績" || v === "前年同月実績")) actualColIdx = col;
                    if (actualColIdx === -1 && v.includes("実績") && !v.includes("累計") && (!v.includes("前") || isPrevYear)) actualColIdx = col;
                }
                if (actualColIdx !== -1) { singleHeaderRow = r; break; }
            }

            if (actualColIdx === -1) {
                console.log(`[Parser] Skipping "${sheetName}": 実績列が見つかりません`);
                continue;
            }

            console.log(`[Parser] ✓ 列ヘッダー形式 "${sheetName}": ${sheetMonthIdx + 1}月, 実績col=${actualColIdx}`);

            for (let r = singleHeaderRow + 1; r < jsonData.length; r++) {
                const row = jsonData[r];
                if (!row || row.length < 2) continue;
                const code    = String(row[codeColIdx]    ?? "").trim();
                const subject = String(row[subjectColIdx] ?? "").trim();
                if (!subject || subject === "科目名" || subject === "科目") continue;
                if (subject.includes("合計") || subject.includes("小計") || subject.includes("損益勘定") || subject.includes("計算")) continue;

                const actualVal = parseNumber(row[actualColIdx]);
                const budgetVal = budgetColIdx !== -1 ? parseNumber(row[budgetColIdx]) : 0;

                if (code !== "" || actualVal !== 0 || subject !== "") {
                    allRecords.push({
                        code, subject, department: deptName,
                        actual:         isBudgetMode ? 0 : (isPrevYear ? 0 : actualVal),
                        budget:         isBudgetMode ? actualVal : budgetVal,
                        prevYearActual: isPrevYear ? actualVal : 0,
                        monthIndex:     sheetMonthIdx,
                    });
                }
            }
        } catch (err) {
            console.error(`[Parser] Error on sheet "${sheetName}":`, err);
        }
    }

    if (allRecords.length === 0) {
        throw new Error(
            "データが読み取れませんでした。\n" +
            "【12ヶ月形式】ヘッダー行に「4月」「5月」…「3月」が必要です。\n" +
            "【単月形式】シート内に「X月現在」などの月テキストと「当月実績」列が必要です。\n" +
            "F12→Console の [Parser] ログを確認してください。"
        );
    }

    console.log(`[Parser] Successfully extracted ${allRecords.length} records.`);
    return allRecords;
};
