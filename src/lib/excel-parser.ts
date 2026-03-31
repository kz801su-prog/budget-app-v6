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

export const parseExcelFile = async (file: File, isBudgetMode: boolean = false): Promise<MonthlyRecord[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer);
    let allRecords: MonthlyRecord[] = [];

    // The fiscal year starts from April (index 3 in a 0-indexed month array)
    const fiscalMonths = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];

    for (const sheetName of workbook.SheetNames) {
        try {
            const deptName = normalizeDeptName(sheetName);
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
            
            if (!jsonData || jsonData.length < 3) continue;

            console.log(`[Parser] Processing Sheet: "${sheetName}" -> Normalized Dept: "${deptName}"`);

            // Find Header Row (Search first 10 rows for something containing April)
            let headerRowIndex = -1;
            let monthColMapping: { colIdx: number, monthIdx: number }[] = [];

            for (let r = 0; r < Math.min(jsonData.length, 10); r++) {
                const row = jsonData[r];
                if (!row) continue;
                
                let currentFiscalMonthIdx = 0;
                let potentialMapping: { colIdx: number, monthIdx: number }[] = [];
                
                for (let col = 2; col < row.length; col++) {
                    const val = String(row[col] || "").trim().normalize('NFKC');
                    
                    // 完全スキップ: 小計、合計、累計、比、上期、下期、年間、半期 などのサマリー列
                    if (val.includes("小計") || val.includes("合計") || val.includes("累計") || val.includes("比") || val.includes("上期") || val.includes("下期") || val.includes("年間") || val.includes("期") || val.includes("見込")) {
                        continue;
                    }
                    
                    // "4", "4月", "04月" などの「月」、あるいはエクセルの日付シリアル値(例えば45017など)を許容する
                    // 数字で始まるもの全般を許可しつつ、上で小計系は弾いているので純粋な月列だけが残る
                    if (/^(\d{1,5}).*$/.test(val) || val.includes("月")) {
                        if (currentFiscalMonthIdx < 12) {
                            potentialMapping.push({
                                colIdx: col,
                                monthIdx: fiscalMonths[currentFiscalMonthIdx]
                            });
                            currentFiscalMonthIdx++;
                        }
                    }
                }
                
                if (potentialMapping.length >= 10) { // Found most of the months
                    headerRowIndex = r;
                    monthColMapping = potentialMapping;
                    break;
                }
            }

            if (headerRowIndex === -1) {
                console.log(`[Parser] Skipping sheet "${sheetName}": Could not detect 12-month header.`);
                continue;
            }

            console.log(`[Parser] Header found at row ${headerRowIndex + 1}. Mapping ${monthColMapping.length} months.`);

            // Data extraction starts from index below header
            for (let r = headerRowIndex + 1; r < jsonData.length; r++) {
                const row = jsonData[r];
                if (!row || row.length < 2) continue;

                const code = String(row[0] || "").trim(); // Column A
                const subject = String(row[1] || "").trim(); // Column B

                // Skip if both are empty or it's a total row
                if (!subject || subject === "科目" || subject === "科目名") continue;
                if (subject.includes("合計") || subject.includes("小計") || subject.includes("損益勘定") || subject.includes("計算")) continue;

                monthColMapping.forEach(mapping => {
                    const rawVal = row[mapping.colIdx];
                    const val = parseNumber(rawVal);
                    
                    // Add record if it has a code OR is a legitimate calculation row with value
                    // Even 0s are important for budget initialization
                    if (code !== "" || val !== 0 || (subject !== "" && !subject.startsWith(" "))) {
                        allRecords.push({
                            code,
                            subject,
                            department: deptName,
                            actual: isBudgetMode ? 0 : val,
                            budget: isBudgetMode ? val : 0,
                            prevYearActual: 0,
                            monthIndex: mapping.monthIdx
                        });
                    }
                });
            }
        } catch (err) {
            console.error(`[Parser] Error on sheet "${sheetName}":`, err);
        }
    }

    if (allRecords.length === 0) {
        throw new Error("データが見つかりませんでした。以下の点を確認してください：\n1. 「予算入力モード」がオンになっていますか？\n2. シート内に12ヶ月分（4月〜3月）のデータ列がありますか？\n3. 3行目前後に月次見出しがありますか？");
    }

    console.log(`[Parser] Successfully extracted ${allRecords.length} records.`);
    return allRecords;
};
