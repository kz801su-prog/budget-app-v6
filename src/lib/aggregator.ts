import { MonthlyRecord, PnLData, AggregatedRow, AppMode } from './types';

// Fiscal Year definitions
const FIRST_HALF = [3, 4, 5, 6, 7, 8]; // Apr - Sep
const SECOND_HALF = [9, 10, 11, 0, 1, 2]; // Oct - Mar

// Helper to identify summary departments that should not be double-counted in "All" total
export const isSummaryDept = (dept: string): boolean => {
    const summaryKeywords = ['合併', '合計', '全社', '連結', '相殺', '一覧'];
    return summaryKeywords.some(k => dept.includes(k));
};

export const aggregateData = (
    dataByMonth: Record<number, MonthlyRecord[]>, 
    appMode: AppMode = 'standard',
    prevYearData?: Record<number, MonthlyRecord[]>,
    masterAccounts: Record<string, string> = {}
): PnLData => {
    const codeMap = new Map<string, AggregatedRow>();
    const departments = new Set<string>();

    if (!dataByMonth || typeof dataByMonth !== 'object') {
        return {
            rows: [],
            departments: [],
            totals: {
                monthly: {},
                totalFirstHalf: { actual: 0, budget: 0, prevYearActual: 0 },
                totalSecondHalf: { actual: 0, budget: 0, prevYearActual: 0 },
                totalAnnual: { actual: 0, budget: 0, prevYearActual: 0 }
            },
            appMode
        };
    }

    const normalizeKey = (r: MonthlyRecord | AggregatedRow) => {
        const dept = r.department.trim();
        // Standardize summary sheets to '合併' or '連結' if they contain those keywords
        let standardizedDept = dept;
        if (dept.includes('合併')) standardizedDept = '合併';
        else if (dept.includes('連結')) standardizedDept = '連結';
        else if (dept.includes('損益計算書')) standardizedDept = '損益計算書';
        else if (dept.includes('販売費')) standardizedDept = '販売費';

        const code = (r.code || '').trim();
        // Use Master account name if available
        const subjectRaw = (code && masterAccounts[code]) ? masterAccounts[code] : r.subject;
        const subject = subjectRaw.trim().replace(/^[\d+・\s.]+/, ''); // Clean leading numbers and symbols
        return `${standardizedDept}||${code}||${subject}`;
    };

    // Build initial codeMap for the current year
    Object.entries(dataByMonth).forEach(([monthStr, records]) => {
        const monthIndex = parseInt(monthStr);
        if (!Array.isArray(records)) return;

        records.forEach(record => {
            if (!record) return;
            const key = normalizeKey(record);
            departments.add(record.department);

            if (!codeMap.has(key)) {
                const standardizedSubject = (record.code && masterAccounts[record.code]) ? masterAccounts[record.code] : record.subject;
                codeMap.set(key, {
                    department: record.department,
                    code: record.code || '',
                    subject: standardizedSubject || '',
                    monthlyData: {},
                    totalFirstHalf: { actual: 0, budget: 0, prevYearActual: 0 },
                    totalSecondHalf: { actual: 0, budget: 0, prevYearActual: 0 },
                    totalAnnual: { actual: 0, budget: 0, prevYearActual: 0 },
                    variance: 0
                });
            }

            const row = codeMap.get(key)!;
            if (!row.subject && record.subject) row.subject = record.subject;

            if (!row.monthlyData[monthIndex]) {
                row.monthlyData[monthIndex] = { actual: 0, budget: 0, prevYearActual: 0 };
            }

            row.monthlyData[monthIndex].actual = record.actual || 0;
            row.monthlyData[monthIndex].budget = record.budget || 0;
            row.monthlyData[monthIndex].prevYearActual = (record.prevYearActual || 0);
        });
    });

    // Merge from separate data (e.g. FY25 Actuals when viewing FY26)
    if (prevYearData) {
        Object.entries(prevYearData).forEach(([monthStr, records]) => {
            const mIdx = parseInt(monthStr);
            records.forEach(r => {
                const key = normalizeKey(r);
                let row = codeMap.get(key);
                
                if (!row) {
                    // Create row if it only existed in previous year
                    row = {
                        department: r.department,
                        code: r.code || '',
                        subject: r.subject || '',
                        monthlyData: {},
                        totalFirstHalf: { actual: 0, budget: 0, prevYearActual: 0 },
                        totalSecondHalf: { actual: 0, budget: 0, prevYearActual: 0 },
                        totalAnnual: { actual: 0, budget: 0, prevYearActual: 0 },
                        variance: 0
                    };
                    codeMap.set(key, row);
                    departments.add(r.department);
                }

                if (!row.monthlyData[mIdx]) {
                    row.monthlyData[mIdx] = { actual: 0, budget: 0, prevYearActual: 0 };
                }
                // Assign previous year's ACTUAL to current year's PREV_YEAR_ACTUAL
                row.monthlyData[mIdx].prevYearActual = r.actual || 0;
            });
        });
    }

    const allMonths = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    for (const row of codeMap.values()) {
        allMonths.forEach(m => {
            if (!row.monthlyData[m]) row.monthlyData[m] = { actual: 0, budget: 0, prevYearActual: 0 };
        });
    }

    const rows = Array.from(codeMap.values()).map(row => {
        let t1Act = 0, t1Bud = 0, t1Prv = 0;
        let t2Act = 0, t2Bud = 0, t2Prv = 0;

        FIRST_HALF.forEach(m => {
            const d = row.monthlyData[m];
            if (d) {
                t1Act += d.actual;
                t1Bud += d.budget;
                t1Prv += d.prevYearActual || 0;
            }
        });
        SECOND_HALF.forEach(m => {
            const d = row.monthlyData[m];
            if (d) {
                t2Act += d.actual;
                t2Bud += d.budget;
                t2Prv += d.prevYearActual || 0;
            }
        });

        row.totalFirstHalf = { actual: t1Act, budget: t1Bud, prevYearActual: t1Prv };
        row.totalSecondHalf = { actual: t2Act, budget: t2Bud, prevYearActual: t2Prv };
        row.totalAnnual = { actual: t1Act + t2Act, budget: t1Bud + t2Bud, prevYearActual: t1Prv + t2Prv };
        row.variance = row.totalAnnual.actual - row.totalAnnual.budget;
        return row;
    });

    const globalTotals = {
        monthly: {} as Record<number, { actual: number; budget: number; prevYearActual: number }>,
        totalFirstHalf: { actual: 0, budget: 0, prevYearActual: 0 },
        totalSecondHalf: { actual: 0, budget: 0, prevYearActual: 0 },
        totalAnnual: { actual: 0, budget: 0, prevYearActual: 0 }
    };

    // Find consolidated rows for "All" totals
    const consolidatedSubjectCodes = new Set(
        rows
            .filter(r => r.department.includes('合併') || r.department.includes('連結'))
            .map(r => `${r.subject}||${r.code}`)
    );

    // Initialize all 12 months to avoid undefined errors
    allMonths.forEach(m => {
        globalTotals.monthly[m] = { actual: 0, budget: 0, prevYearActual: 0 };
    });

    // Sum everything for global totals
    rows.forEach(row => {
        const isSummary = isSummaryDept(row.department);
        const hasConsolidated = consolidatedSubjectCodes.has(`${row.subject}||${row.code}`);
        const isConsolidated = row.department.includes('合併') || row.department.includes('連結');
        
        allMonths.forEach(m => {
            const d = row.monthlyData[m];
            if (!d) return;

            // ACTUAL calculation: Only sum non-summary departments
            if (!isSummary) {
                globalTotals.monthly[m].actual += d.actual || 0;
                globalTotals.monthly[m].prevYearActual += d.prevYearActual || 0;
            }

            // BUDGET calculation: If a consolidated row exists, use it for "All" budget. Else sum individual depts.
            if (hasConsolidated) {
                // If this IS the consolidated row, add its budget to totals
                if (isConsolidated) {
                    globalTotals.monthly[m].budget += d.budget || 0;
                }
            } else if (!isSummary) {
                // No consolidated row for this metric? Sum individual depts
                globalTotals.monthly[m].budget += d.budget || 0;
            }
        });
    });

    // Calculate Half-Year and Annual sums from monthly global totals
    allMonths.forEach(m => {
        const mData = globalTotals.monthly[m];
        if (!mData) return; // Add null check for mData
        if (FIRST_HALF.includes(m)) {
            globalTotals.totalFirstHalf.actual += mData.actual;
            globalTotals.totalFirstHalf.budget += mData.budget;
            globalTotals.totalFirstHalf.prevYearActual += mData.prevYearActual;
        } else {
            globalTotals.totalSecondHalf.actual += mData.actual;
            globalTotals.totalSecondHalf.budget += mData.budget;
            globalTotals.totalSecondHalf.prevYearActual += mData.prevYearActual;
        }
    });

    globalTotals.totalAnnual = {
        actual: globalTotals.totalFirstHalf.actual + globalTotals.totalSecondHalf.actual,
        budget: globalTotals.totalFirstHalf.budget + globalTotals.totalSecondHalf.budget,
        prevYearActual: globalTotals.totalFirstHalf.prevYearActual + globalTotals.totalSecondHalf.prevYearActual
    };

    const EXCLUDED_DEPTS = ['Sheet1'];

    const filteredDepartments = Array.from(departments).filter(d =>
        !EXCLUDED_DEPTS.some(excluded => d.includes(excluded) || d === excluded)
    );

    return {
        rows,
        departments: filteredDepartments,
        totals: globalTotals,
        appMode
    };
};
