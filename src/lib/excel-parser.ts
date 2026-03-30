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

// Map sheet name to consistent department name
const normalizeDeptName = (sheetName: string): string => {
    let name = sheetName.normalize('NFKC').trim();
    
    // Pattern for "(3 イズライフ事業部)" -> "イズライフ"
    const deptMatch = name.match(/\(\d{1,2}\s*(.*?)(?:事業部|営業所|部|課)?\)/);
    if (deptMatch) return deptMatch[1].trim();

    // Pattern for "シンコー合併" -> "シンコー合併"
    if (name.includes('合併')) return name;
    
    return name;
};

export const parseExcelFile = async (file: File, isBudgetMode: boolean = false): Promise<MonthlyRecord[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer);
    let allRecords: MonthlyRecord[] = [];

    const monthNamesJP = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

    for (const sheetName of workbook.SheetNames) {
        try {
            // If in Budget Mode, we might want to prioritize specific sheets or just apply the logic to all
            // The user mentioned "シンコー合併" as the main one.
            const normalizedSheetName = sheetName.normalize('NFKC').trim();
            
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
            if (!jsonData || jsonData.length === 0) continue;

            const deptName = normalizeDeptName(sheetName);
            console.log(`[Parser] 📂 Sheet: ${sheetName} -> Dept: ${deptName} (BudgetMode: ${isBudgetMode})`);

            let headerRowIndex = -1;
            let fileType: 'STANDARD' | 'BUDGET_MATRIX' | 'TRANSPOSED' = 'STANDARD';
            let monthCols: Record<number, { actual: number; budget: number; prevYear: number }> = {};
            let prevYearCol = -1;
            let subjectIdx = -1;
            let codeIdx = -1;
            let colIndices: any = null;

            // Search for header row
            for (let i = 0; i < Math.min(jsonData.length, 60); i++) {
                const row = jsonData[i];
                if (!row || row.length < 2) continue;

                const rowStr = Array.from(row).map(c => String(c || "").normalize('NFKC').toLowerCase().trim());
                
                const findIdx = (vList: string[]) => 
                    rowStr.findIndex(c => c && vList.some(v => c === v || c.includes(v)));

                // Specialized detection for the budget matrix based on screenshot
                // Months are often spread across columns
                const monthsInRow = rowStr.map((c, idx) => ({ val: c, idx })).filter(item => {
                    const val = String(item.val);
                    
                    const isPureNumberMonth = /^\s*(4|5|6|7|8|9|10|11|12|1|2|3)\s*$/.test(val);
                    const containsJPMonth = monthNamesJP.some(m => val === m) || [4,5,6,7,8,9,10,11,12,1,2,3].some(n => val.includes(String(n) + "月"));
                    
                    const hasMonthInfo = containsJPMonth || isPureNumberMonth;
                    
                    // If it contains "合計", etc., but DOES NOT have a month number, skip it
                    if (!hasMonthInfo && (val.includes('小計') || val.includes('合計') || val.includes('累計') || val.includes('差異'))) {
                        return false;
                    }
                    
                    return hasMonthInfo;
                });

                if (monthsInRow.length >= 4) {
                    headerRowIndex = i;
                    fileType = 'BUDGET_MATRIX';
                    
                    // Identify subject and code columns by scanning rows below the header
                    const firstMonthIdx = monthsInRow[0].idx;
                    for (let col = 0; col < firstMonthIdx; col++) {
                        let codeMatches = 0;
                        let subjectMatches = 0;
                        for (let rProbe = i + 1; rProbe < Math.min(jsonData.length, i + 20); rProbe++) {
                            const val = String(jsonData[rProbe]?.[col] || "").trim();
                            if (/^\d{4,6}$/.test(val)) codeMatches++;
                            if (val && !/^\d+$/.test(val) && val.length > 2) subjectMatches++;
                        }
                        if (codeMatches >= 3) codeIdx = col;
                        if (subjectMatches >= 3 && col !== codeIdx) subjectIdx = col;
                    }

                    // Check the following row for '実績' vs '予算' labels to handle dual-matrix formats
                    const nextRow = jsonData[i + 1] || [];
                    
                    monthsInRow.forEach(m => {
                        const val = String(m.val);
                        let mNum = -1;
                        const slashMatch = val.match(/\/(\d{1,2})/);
                        const yearMatch = val.match(/年(\d{1,2})/);
                        const monthMatch = val.match(/(\d{1,2})月/);
                        
                        if (slashMatch) mNum = parseInt(slashMatch[1]);
                        else if (yearMatch) mNum = parseInt(yearMatch[1]);
                        else if (monthMatch) mNum = parseInt(monthMatch[1]);
                        else {
                            const simpleMatch = val.match(/(\d{1,2})/);
                            if (simpleMatch) {
                                const n = parseInt(simpleMatch[1]);
                                if (n >= 1 && n <= 12) mNum = n;
                            }
                        }

                        if (mNum >= 1 && mNum <= 12) {
                            const mIdx = mNum - 1;
                            if (!monthCols[mIdx]) monthCols[mIdx] = { actual: -1, budget: -1, prevYear: -1 };
                            
                            // Check label below this specific column
                            const labelBelow = String(nextRow[m.idx] || "").trim();
                            if (labelBelow.includes('実績') || labelBelow.includes('Actual')) {
                                monthCols[mIdx].actual = m.idx;
                            } else if (labelBelow.includes('予算') || labelBelow.includes('Budget')) {
                                monthCols[mIdx].budget = m.idx;
                            } else {
                                // Default: if it's the only one found yet, use it as budget
                                if (monthCols[mIdx].budget === -1) monthCols[mIdx].budget = m.idx;
                            }
                        }
                    });

                    // Search for a 'Previous Year' column
                    const prevYearIdx = rowStr.findIndex(c => 
                        (String(c).includes('前年') || String(c).includes('前期')) && 
                        (String(c).includes('実績') || String(c).includes('額'))
                    );
                    if (prevYearIdx !== -1) {
                        (monthCols as any)._allPrevYear = prevYearIdx;
                    }

                    console.log(`[Parser] 💡 Specialized Budget Matrix detected at row ${i}`);
                    break;
                }

                // Standard detection stays as fallback
                codeIdx = findIdx(['コード', 'code', 'cd', 'id', 'no']);
                subjectIdx = findIdx(['科目', '科目名', '項目', '勘定', 'subject', 'account']);
                
                if (subjectIdx !== -1) {
                    // ... (rest of standard detection)
                    const hasActBudLabels = rowStr.some(c => c.includes('実績')) && rowStr.some(c => c.includes('予算'));
                    if (hasActBudLabels) {
                        fileType = 'STANDARD';
                        headerRowIndex = i;
                        monthNamesJP.forEach((mStr, mIdx) => {
                            const act = rowStr.findIndex(c => c.includes(mStr) && (c.includes('実績') || c.includes('actual')));
                            const bud = rowStr.findIndex(c => c.includes(mStr) && (c.includes('予算') || c.includes('budget')));
                            const prv = rowStr.findIndex(c => c.includes(mStr) && (c.includes('前年') || c.includes('前期')));
                            if (act !== -1 || bud !== -1 || prv !== -1) {
                                monthCols[mIdx] = { actual: act, budget: bud, prevYear: prv };
                            }
                        });
                        break;
                    }
                }
            }

            if (headerRowIndex === -1) continue;

            // --- DATA EXTRACTION ---
            for (let r = headerRowIndex + 1; r < jsonData.length; r++) {
                const row = jsonData[r];
                if (!row) continue;

                const subject = String(row[subjectIdx] || "").trim();
                const code = codeIdx !== -1 ? String(row[codeIdx] || "").trim() : "";
                
                if (!subject || subject === "科目" || subject.includes("合計") || subject.includes("小計")) continue;

                Object.entries(monthCols).forEach(([mStr, cols]) => {
                    const mIdx = parseInt(mStr);
                    if (isNaN(mIdx)) return; // Skip _allPrevYear or other flags

                    const budget = cols.budget !== -1 ? parseNumber(row[cols.budget]) : 0;
                    const actual = cols.actual !== -1 ? parseNumber(row[cols.actual]) : 0;
                    const prev = cols.prevYear !== -1 ? parseNumber(row[cols.prevYear]) : 0;

                    if (budget !== 0 || actual !== 0 || prev !== 0) {
                        allRecords.push({
                            code,
                            subject: subject.replace(/^\d+[\s・./]/, '').trim(),
                            department: deptName,
                            actual,
                            budget,
                            prevYearActual: prev,
                            monthIndex: mIdx
                        });
                    }
                });
            }
        } catch (err) { console.error(`[Parser] Sheet error:`, err); }
    }

    if (allRecords.length === 0) throw new Error("No data found.");
    return allRecords;
};
