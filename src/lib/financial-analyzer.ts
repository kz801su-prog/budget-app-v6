import { PnLData, AggregatedRow } from './types';
import { isSummaryDept } from './aggregator';

// 1H = Apr-Sep, 2H = Oct-Mar, FY = Full Year
export type Period = number | '1H' | '2H' | 'FY';

// Metrics Metadata
export interface MetricDefinition {
    id: string;
    labelEng: string;
    labelJp: string;
    meaning: string;
    isStock?: boolean;
    calculator: (data: PnLData, period: Period, trace?: string[], globalLatestMonth?: number, consolidatedSubjects?: Set<string>) => number;
}

export interface FinancialReport {
    metrics: MetricDefinition[];
    values: Record<string, Record<string, number>>; // { metricId: { "0": 10, "1H": 500... } }
    comments: Record<number, string[]>; // { monthIndex: ["Alert..."] }
    debugTrace: Record<string, Record<string, string[]>>; // { metricId: { period: ["Row1 (Value)", "Row2 (Value)..."] } }
    departmentalResults?: { name: string; sales: number; profit: number; margin: number }[];
    sgaTop10?: { subject: string; total: number; avg: number; prevTotal: number; prevAvg: number }[];
}

// Helper to find value by CODE first, then Subject keywords
const findValue = (
    data: PnLData,
    period: Period,
    targetCode: string,
    keywords: string[] = [],
    isStock: boolean = false,
    trace?: string[],
    globalLatestMonth?: number,
    usePrevYear: boolean = false,
    targetDepts: string[] = [],
    useBudget: boolean = false,
    consolidatedSubjects?: Set<string>
): number => {
    const FISCAL_MONTH_ORDER = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];
    const FIRST_HALF = [3, 4, 5, 6, 7, 8];
    const SECOND_HALF = [9, 10, 11, 0, 1, 2];

    const getPeriodMonths = (p: Period): number[] => {
        if (typeof p === 'number') return [p];
        let months = p === '1H' ? FIRST_HALF : p === '2H' ? SECOND_HALF : FISCAL_MONTH_ORDER;
        if (globalLatestMonth !== undefined && !useBudget) {
            const cutOffIdx = FISCAL_MONTH_ORDER.indexOf(globalLatestMonth);
            const validYtd = FISCAL_MONTH_ORDER.slice(0, cutOffIdx + 1);
            months = months.filter(m => validYtd.includes(m));
        }
        return months;
    };

    const targetMonths = getPeriodMonths(period);
    const logMatch = (row: AggregatedRow, val: number) => {
        if (trace) trace.push(`${row.subject} (${row.code || 'NoCode'}): ${val.toLocaleString()}`);
    };

    // 専用P/Lシート（損益計算書）が存在する場合はそれを優先使用（P/Lタブと同じソース）
    const hasDedicatedPLSheet = data.rows.some(r =>
        r.department.includes('損益計算書') || r.department.includes('販売費及び一般管理費')
    );

    const filteredRows = data.rows.filter(r => {
        if (targetDepts.length > 0) {
            return targetDepts.some(d => r.department.includes(d));
        }

        if (isStock) return r.department.includes('貸借対照表') || r.department.includes('B/S');

        // 損益計算書シートがある場合はそれだけを使用（合併シートによる除外を防ぐ）
        if (hasDedicatedPLSheet) {
            return r.department.includes('損益計算書') || r.department.includes('販売費及び一般管理費') ||
                   r.department.includes('製造原価');
        }

        // 損益計算書シートがない場合は従来の合併優先ロジック
        const hasConsolidated = consolidatedSubjects ? consolidatedSubjects.has(r.subject) : false;
        if (hasConsolidated) {
            return r.department.includes('合併') || r.department.includes('連結');
        }

        if (isSummaryDept(r.department)) return false;

        const dept = r.department.toLowerCase();
        return dept.includes('損益') || dept.includes('p&l') || dept.includes('p/l') ||
               dept.includes('製造原価') || dept.includes('合併') || dept.includes('一覧表') ||
               dept.includes('事業部') || dept.includes('合計') || dept.includes('営業所');
    });

    const matchingRows = filteredRows.filter(r => {
        const c = r.code ? r.code.replace(/[^0-9]/g, '') : '';
        return c === targetCode;
    });

    const getValue = (r: AggregatedRow, m: number) => {
        if (useBudget) return r.monthlyData[m]?.budget || 0;
        if (usePrevYear) return r.monthlyData[m]?.prevYearActual || 0;
        // BS（貸借対照表）は actual がない月は budget にフォールバック
        if (isStock) return r.monthlyData[m]?.actual || r.monthlyData[m]?.budget || 0;
        return r.monthlyData[m]?.actual ?? 0;
    };

    if (matchingRows.length > 0) {
        return matchingRows.reduce((sum, r) => {
            if (isStock) {
                for (let i = targetMonths.length - 1; i >= 0; i--) {
                    const val = getValue(r, targetMonths[i]);
                    if (val !== 0) { logMatch(r, val); return sum + val; }
                }
                return sum;
            } else {
                const total = targetMonths.reduce((mSum, m) => mSum + getValue(r, m), 0);
                if (total !== 0) logMatch(r, total);
                return sum + total;
            }
        }, 0);
    }

    if (keywords.length > 0) {
        let total = 0;
        filteredRows.forEach(row => {
            if (keywords.some(k => row.subject.toLowerCase().includes(k))) {
                if (isStock) {
                    for (let i = targetMonths.length - 1; i >= 0; i--) {
                        const val = getValue(row, targetMonths[i]);
                        if (val !== 0) { logMatch(row, val); total += val; return; }
                    }
                } else {
                    const rowTotal = targetMonths.reduce((mSum, m) => mSum + getValue(row, m), 0);
                    if (rowTotal !== 0) { logMatch(row, rowTotal); total += rowTotal; }
                }
            }
        });
        return total;
    }
    return 0;
};

// Define Metrics with Custom Formulas
export const DEFINITIONS: MetricDefinition[] = [
    {
        id: 'sales',
        labelEng: 'Sales',
        labelJp: '売上高',
        meaning: '企業の主たる営業活動から得られる収益',
        calculator: (d, p, tr, glm, cs) => findValue(d, p, '9601', ['売上高', 'net sales', 'revenue'], false, tr, glm, false, [], false, cs)
    },
    {
        id: 'sales_budget',
        labelEng: 'Sales (Budget)',
        labelJp: '売上高 (予算)',
        meaning: '売上高の予算合計',
        calculator: (d, p, tr, glm, cs) => findValue(d, p, '9601', ['売上高'], false, tr, glm, false, [], true, cs)
    },
    {
        id: 'cogs',
        labelEng: 'COGS',
        labelJp: '売上原価',
        meaning: '売上に対応する直接的な費用',
        calculator: (d, p, tr, glm, cs) => findValue(d, p, 'COGS', ['売上原価', 'cost of goods sold', 'cost of sales'], false, tr, glm, false, [], false, cs)
    },
    {
        id: 'gross_profit',
        labelEng: 'Gross Profit',
        labelJp: '売上総利益',
        meaning: '粗利益',
        calculator: (d, p, tr, glm, cs) => {
            const sales = findValue(d, p, '9601', ['売上高'], false, tr, glm, false, [], false, cs);
            const cogs = findValue(d, p, 'COGS', ['売上原価'], false, tr, glm, false, [], false, cs);
            return sales - cogs;
        }
    },
    {
        id: 'sga',
        labelEng: 'SG&A',
        labelJp: '販売管理費',
        meaning: '営業活動に必要な経費',
        calculator: (d, p, tr, glm, cs) => findValue(d, p, 'SGA', ['販売費', '一般管理費', 'selling, general and administrative'], false, tr, glm, false, [], false, cs)
    },
    {
        id: 'operating_profit',
        labelEng: 'Operating Profit',
        labelJp: '営業利益',
        meaning: '本業の利益',
        calculator: (d, p, tr, glm, cs) => findValue(d, p, '9622', ['営業利益'], false, tr, glm, false, [], false, cs)
    },
    {
        id: 'operating_profit_budget',
        labelEng: 'Operating Profit (Budget)',
        labelJp: '営業利益 (予算)',
        meaning: '営業利益の予算合計',
        calculator: (d, p, tr, glm, cs) => findValue(d, p, '9622', ['営業利益'], false, tr, glm, false, [], true, cs)
    },
    {
        id: 'ordinary_profit',
        labelEng: 'Ordinary Profit',
        labelJp: '経常利益',
        meaning: '本業に営業外損益を加味した利益',
        calculator: (d, p, tr, glm, cs) => findValue(d, p, '9625', ['経常利益', 'ordinary income', 'ordinary profit'], false, tr, glm, false, [], false, cs)
    },
    {
        id: 'ordinary_profit_budget',
        labelEng: 'Ordinary Profit (Budget)',
        labelJp: '経常利益 (予算)',
        meaning: '経常利益の予算合計',
        calculator: (d, p, tr, glm, cs) => findValue(d, p, '9625', ['経常利益'], false, tr, glm, false, [], true, cs)
    },
    {
        id: 'current_ratio',
        labelEng: 'Current Ratio (%)',
        labelJp: '流動比率',
        meaning: '短期的な支払い能力',
        isStock: true,
        calculator: (d, p, tr, glm, cs) => {
            const cAssets = findValue(d, p, '9518', ['流動資産'], true, tr, glm, false, [], false, cs);
            const cLiab = findValue(d, p, '9532', ['流動負債'], true, tr, glm, false, [], false, cs);
            return cLiab ? (cAssets / cLiab) * 100 : 0;
        }
    },
    {
        id: 'quick_ratio',
        labelEng: 'Quick Ratio Y (%)',
        labelJp: '当座比率 Y方式',
        meaning: 'より即効性のある支払い能力（在庫70%控除）',
        isStock: true,
        calculator: (d, p, tr, glm, cs) => {
            const cash = findValue(d, p, '9508', ['現金及び預金'], true, tr, glm, false, [], false, cs);
            const notesRec = findValue(d, p, '11121', ['受取手形'], true, tr, glm, false, [], false, cs);
            const ar = findValue(d, p, '11124', ['売掛金'], true, tr, glm, false, [], false, cs);
            const product = findValue(d, p, '11201', ['商品'], true, tr, glm, false, [], false, cs);
            const cLiab = findValue(d, p, '9532', ['流動負債'], true, tr, glm, false, [], false, cs);
            return cLiab ? ((cash + notesRec + ar + product * 0.3) / cLiab) * 100 : 0;
        }
    },
    {
        id: 'cash_balance',
        labelEng: 'Cash Balance',
        labelJp: '現預金残高',
        meaning: '期末の現金及び預金残高',
        isStock: true,
        calculator: (d, p, tr, glm, cs) => findValue(d, p, '9508', ['現金及び預金'], true, tr, glm, false, [], false, cs)
    },
    {
        id: 'operating_cf',
        labelEng: 'Operating CF',
        labelJp: '営業CF',
        meaning: '本業による現金の増減',
        calculator: (d, p, tr, glm, cs) => findValue(d, p, 'OpCF', ['営業活動によるキャッシュ・フロー'], false, tr, glm, false, [], false, cs)
    },
    {
        id: 'investing_cf',
        labelEng: 'Investing CF',
        labelJp: '投資CF',
        meaning: '投資活動による現金の増減',
        calculator: (d, p, tr, glm, cs) => findValue(d, p, 'InvCF', ['投資活動によるキャッシュ・フロー'], false, tr, glm, false, [], false, cs)
    },
    {
        id: 'free_cf',
        labelEng: 'Free CF',
        labelJp: 'フリーCF',
        meaning: '自由に使用できる現金 (営業CF + 投資CF)',
        calculator: (d, p, tr, glm, cs) => {
            const op = findValue(d, p, 'OpCF', ['営業活動によるキャッシュ・フロー'], false, tr, glm, false, [], false, cs);
            const inv = findValue(d, p, 'InvCF', ['投資活動によるキャッシュ・フロー'], false, tr, glm, false, [], false, cs);
            return op + inv;
        }
    },
    {
        id: 'equity_ratio',
        labelEng: 'Equity Ratio (%)',
        labelJp: '自己資本比率',
        meaning: '企業の安全性',
        isStock: true,
        calculator: (d, p, tr, glm, cs) => {
            const tAssets = findValue(d, p, '9546', ['総資産'], true, tr, glm, false, [], false, cs);
            const nAssets = findValue(d, p, '9545', ['純資産'], true, tr, glm, false, [], false, cs);
            return tAssets ? (nAssets / tAssets) * 100 : 0;
        }
    },
    {
        id: 'debt_dependency',
        labelEng: 'Debt Dependency (%)',
        labelJp: '有利子負債依存度',
        meaning: '総資産に対する有利子負債の割合',
        isStock: true,
        calculator: (d, p, tr, glm, cs) => {
            const b1 = findValue(d, p, '21114', ['1年以内'], true, tr, glm, false, [], false, cs);
            const b2 = findValue(d, p, '22101', ['長期借入金'], true, tr, glm, false, [], false, cs);
            const b3 = findValue(d, p, '21104', ['短期借入金'], true, tr, glm, false, [], false, cs);
            const tAssets = findValue(d, p, '9546', ['総資産'], true, tr, glm, false, [], false, cs);
            return tAssets ? ((b1 + b2 + b3) / tAssets) * 100 : 0;
        }
    },
    {
        id: 'interest_coverage',
        labelEng: 'Interest Coverage (x)',
        labelJp: '利払い能力 (ICR)',
        meaning: '金利負担能力',
        calculator: (d, p, tr, glm, cs) => {
            const op = findValue(d, p, '9622', ['営業利益'], false, tr, glm, false, [], false, cs);
            const inc = findValue(d, p, '9632', ['受取利息'], false, tr, glm, false, [], false, cs) + findValue(d, p, '9633', ['受取配当'], false, tr, glm, false, [], false, cs);
            const exp = Math.abs(findValue(d, p, '9662', ['支払利息'], false, tr, glm, false, [], false, cs));
            return exp ? (op + inc) / exp : 0;
        }
    },
    {
        id: 'breakeven_ratio',
        labelEng: 'Breakeven Ratio (%)',
        labelJp: '損益分岐点比率',
        meaning: '売上高に対する損益分岐点の割合',
        calculator: (d, p, tr, glm, cs) => {
            const sales = findValue(d, p, '9601', ['売上高'], false, tr, glm, false, [], false, cs);
            const vCosts = findValue(d, p, 'COGS', ['売上原価'], false, tr, glm, false, [], false, cs);
            const opProfit = findValue(d, p, '9622', ['営業利益'], false, tr, glm, false, [], false, cs);
            const grossProfit = sales - vCosts;
            // SGA = Gross Profit - Operating Profit (derived, avoids keyword mismatch)
            const fCosts = grossProfit - opProfit;
            const mpRatio = sales ? grossProfit / sales : 0;
            const bep = mpRatio ? fCosts / mpRatio : 0;
            return sales ? (bep / sales) * 100 : 0;
        }
    },
    {
        id: 'altman_z_score',
        labelEng: 'Altman Z-Score',
        labelJp: 'アルトマンZスコア',
        meaning: '倒産予測モデル（Z>2.99:安全、1.81-2.99:注意、<1.81:危険）',
        isStock: true,
        calculator: (d, p, tr, glm, cs) => {
            const totalAssets = findValue(d, p, '9546', ['総資産'], true, tr, glm, false, [], false, cs);
            if (!totalAssets || totalAssets === 0) return 0;

            const currentAssets = findValue(d, p, '9518', ['流動資産'], true, tr, glm, false, [], false, cs);
            const currentLiab = findValue(d, p, '9532', ['流動負債'], true, tr, glm, false, [], false, cs);
            const workingCapital = currentAssets - currentLiab;

            const retainedEarnings = findValue(d, p, '23101', ['利益剰余金'], true, tr, glm, false, [], false, cs);
            const ebit = findValue(d, p, '9622', ['営業利益'], false, tr, glm, false, [], false, cs);
            const sales = findValue(d, p, '9601', ['売上高'], false, tr, glm, false, [], false, cs);

            const equity = findValue(d, p, '9545', ['純資産'], true, tr, glm, false, [], false, cs);
            const totalLiab = findValue(d, p, '9540', ['負債'], true, tr, glm, false, [], false, cs);

            const x1 = 1.2 * (workingCapital / totalAssets);
            const x2 = 1.4 * (retainedEarnings / totalAssets);
            const x3 = 3.3 * (ebit / totalAssets);
            const x4 = totalLiab ? 0.6 * (equity / totalLiab) : 0;
            const x5 = 1.0 * (sales / totalAssets);

            return x1 + x2 + x3 + x4 + x5;
        }
    },
    {
        id: 'piotroski_f_score',
        labelEng: 'Piotroski F-Score',
        labelJp: 'ピオトロスキーFスコア',
        meaning: '財務健全性スコア（0-9点、8-9:非常に健全、0-2:脆弱）',
        calculator: (d, p, tr, glm, cs) => {
            let score = 0;

            // 1. Profitability (4 points)
            const netIncome = findValue(d, p, '9690', ['当期純利益'], false, tr, glm, false, [], false, cs);
            const totalAssets = findValue(d, p, '9546', ['総資産'], true, tr, glm, false, [], false, cs);
            const roa = totalAssets ? netIncome / totalAssets : 0;
            if (roa > 0) score++; // ROA positive

            const ocf = findValue(d, p, 'OpCF', ['営業活動によるキャッシュ・フロー'], false, tr, glm, false, [], false, cs);
            if (ocf > 0) score++; // OCF positive

            const prevNetIncome = findValue(d, p, '9690', ['当期純利益'], false, tr, glm, true, [], false, cs);
            const prevTotalAssets = findValue(d, p, '9546', ['総資産'], true, tr, glm, true, [], false, cs);
            const prevRoa = prevTotalAssets ? prevNetIncome / prevTotalAssets : 0;
            if (roa > prevRoa) score++; // ROA increase

            if (ocf > netIncome) score++; // Quality of earnings

            // 2. Leverage (3 points)
            const totalLiab = findValue(d, p, '9540', ['負債'], true, tr, glm, false, [], false, cs);
            const prevTotalLiab = findValue(d, p, '9540', ['負債'], true, tr, glm, true, [], false, cs);
            if (totalLiab < prevTotalLiab && prevTotalLiab !== 0) score++; // Leverage decrease

            const currentAssets = findValue(d, p, '9518', ['流動資産'], true, tr, glm, false, [], false, cs);
            const currentLiab = findValue(d, p, '9532', ['流動負債'], true, tr, glm, false, [], false, cs);
            const currentRatio = currentLiab ? currentAssets / currentLiab : 0;
            const prevCurrentAssets = findValue(d, p, '9518', ['流動資産'], true, tr, glm, true, [], false, cs);
            const prevCurrentLiab = findValue(d, p, '9532', ['流動負債'], true, tr, glm, true, [], false, cs);
            const prevCurrentRatio = prevCurrentLiab ? prevCurrentAssets / prevCurrentLiab : 0;
            if (currentRatio > prevCurrentRatio) score++; // Current ratio increase

            // No new shares issued (assume 1 point)
            score++;

            // 3. Operating Efficiency (2 points)
            const sales = findValue(d, p, '9601', ['売上高'], false, tr, glm, false, [], false, cs);
            const cogs = findValue(d, p, 'COGS', ['売上原価'], false, tr, glm, false, [], false, cs);
            const grossProfit = sales - cogs;
            const grossMargin = sales ? grossProfit / sales : 0;

            const prevSales = findValue(d, p, '9601', ['売上高'], false, tr, glm, true, [], false, cs);
            const prevCogs = findValue(d, p, 'COGS', ['売上原価'], false, tr, glm, true, [], false, cs);
            const prevGrossProfit = prevSales - prevCogs;
            const prevGrossMargin = prevSales ? prevGrossProfit / prevSales : 0;
            if (grossMargin > prevGrossMargin) score++; // Gross margin increase

            const assetTurnover = totalAssets ? sales / totalAssets : 0;
            const prevAssetTurnover = prevTotalAssets ? prevSales / prevTotalAssets : 0;
            if (assetTurnover > prevAssetTurnover) score++; // Asset turnover increase

            return score;
        }
    },
    {
        id: 'operating_margin',
        labelEng: 'Operating Margin (%)',
        labelJp: '売上高営業利益率',
        meaning: '本業での儲けの割合',
        calculator: (d, p, tr, glm, cs) => {
            const op = findValue(d, p, '9622', ['営業利益'], false, tr, glm, false, [], false, cs);
            const sales = findValue(d, p, '9601', ['売上高'], false, tr, glm, false, [], false, cs);
            return sales ? (op / sales) * 100 : 0;
        }
    },
    {
        id: 'net_income',
        labelEng: 'Net Income',
        labelJp: '当期純利益',
        meaning: '税引後の最終利益',
        calculator: (d, p, tr, glm, cs) => findValue(d, p, '9690', ['当期純利益'], false, tr, glm, false, [], false, cs)
    },
    {
        id: 'roe',
        labelEng: 'ROE (%)',
        labelJp: '自己資本利益率',
        meaning: '株主資本に対する利益率',
        calculator: (d, p, tr, glm, cs) => {
            const ni = findValue(d, p, '9690', ['当期純利益'], false, tr, glm, false, [], false, cs);
            const eq = findValue(d, p, '9547', ['自己資本'], true, tr, glm, false, [], false, cs);
            return eq ? (ni / eq) * 100 : 0;
        }
    },
    {
        id: 'roa',
        labelEng: 'ROA (%)',
        labelJp: '総資産利益率',
        meaning: '総資産に対する利益率',
        calculator: (d, p, tr, glm, cs) => {
            const ni = findValue(d, p, '9690', ['当期純利益'], false, tr, glm, false, [], false, cs);
            const ta = findValue(d, p, '9546', ['総資産'], true, tr, glm, false, [], false, cs);
            return ta ? (ni / ta) * 100 : 0;
        }
    },
    {
        id: 'roic',
        labelEng: 'ROIC (%)',
        labelJp: '投下資本利益率',
        meaning: '投下資本に対する利益率 = NOPAT / 投下資本 × 100',
        calculator: (d, p, tr, glm, cs) => {
            const opProfit = findValue(d, p, '9622', ['営業利益'], false, tr, glm, false, [], false, cs);
            const taxRate = 0.3; // 実効税率30%と仮定
            const nopat = opProfit * (1 - taxRate);

            const equity = findValue(d, p, '9547', ['自己資本', '純資産'], true, tr, glm);
            const b1 = findValue(d, p, '21114', ['1年以内返済予定長期借入金'], true, tr, glm);
            const b2 = findValue(d, p, '22101', ['長期借入金'], true, tr, glm);
            const b3 = findValue(d, p, '21104', ['短期借入金'], true, tr, glm);
            const investedCapital = equity + b1 + b2 + b3;

            return investedCapital ? (nopat / investedCapital) * 100 : 0;
        }
    },
    {
        id: 'ebitda',
        labelEng: 'EBITDA',
        labelJp: '利払い・税引前・償却前利益',
        meaning: '営業利益 + 減価償却費（キャッシュ創出力の指標）',
        calculator: (d, p, tr, glm) => {
            const opProfit = findValue(d, p, '9622', ['営業利益'], false, tr, glm);
            const depreciation = findValue(d, p, '9515', ['減価償却費'], false, tr, glm);
            return opProfit + Math.abs(depreciation);
        }
    },
    {
        id: 'sales_growth_yoy',
        labelEng: 'Sales Growth YoY (%)',
        labelJp: '売上高成長率（前年比）',
        meaning: '(当期売上 - 前期売上) / 前期売上 × 100',
        calculator: (d, p, tr, glm) => {
            const currentSales = findValue(d, p, '9601', ['売上高'], false, tr, glm, false);
            const prevSales = findValue(d, p, '9601', ['売上高'], false, tr, glm, true);
            return prevSales ? ((currentSales - prevSales) / prevSales) * 100 : 0;
        }
    },
    {
        id: 'op_profit_growth_yoy',
        labelEng: 'Operating Profit Growth YoY (%)',
        labelJp: '営業利益成長率（前年比）',
        meaning: '(当期営業利益 - 前期営業利益) / 前期営業利益 × 100',
        calculator: (d, p, tr, glm) => {
            const currentOp = findValue(d, p, '9622', ['営業利益'], false, tr, glm, false);
            const prevOp = findValue(d, p, '9622', ['営業利益'], false, tr, glm, true);
            return prevOp ? ((currentOp - prevOp) / prevOp) * 100 : 0;
        }
    },
    {
        id: 'dupont_profit_margin',
        labelEng: 'DuPont: Profit Margin (%)',
        labelJp: 'デュポン分析: 売上高純利益率',
        meaning: 'ROE分解1: 当期純利益 / 売上高 × 100',
        calculator: (d, p, tr, glm) => {
            const netIncome = findValue(d, p, '9690', ['当期純利益'], false, tr, glm);
            const sales = findValue(d, p, '9601', ['売上高'], false, tr, glm);
            return sales ? (netIncome / sales) * 100 : 0;
        }
    },

    // ===== 4. 効率性 (Efficiency) =====
    {
        id: 'cash_conversion_cycle',
        labelEng: 'Cash Conversion Cycle (days)',
        labelJp: 'キャッシュコンバージョンサイクル',
        meaning: '売上債権回転期間 + 棚卸資産回転期間 - 買入債務回転期間',
        calculator: (d, p, tr, glm) => {
            const sales = findValue(d, p, '9601', ['売上高'], false, tr, glm);
            // AR: 受取手形 + 売掛金
            const ar = findValue(d, p, '11121', ['受取手形'], true, tr, glm)
                     + findValue(d, p, '11124', ['売掛金'], true, tr, glm);
            // Inventory: 商品・棚卸資産
            const inventory = findValue(d, p, '11201', ['商品', '棚卸資産', '製品'], true, tr, glm);
            // AP: 支払手形 + 買掛金
            const ap = findValue(d, p, '21101', ['支払手形'], true, tr, glm)
                     + findValue(d, p, '21104', ['買掛金', '買入債務'], true, tr, glm);

            if (!sales) return 0;

            const dso = (ar / sales) * 365;
            const dio = (inventory / sales) * 365;
            const dpo = (ap / sales) * 365;

            return dso + dio - dpo;
        }
    },
    {
        id: 'working_capital_turnover',
        labelEng: 'Working Capital Turnover (x)',
        labelJp: '運転資本回転率',
        meaning: '売上高 / 運転資本（運転資本の効率性）',
        isStock: true,
        calculator: (d, p, tr, glm) => {
            const sales = findValue(d, p, '9601', ['売上高'], false, tr, glm);
            const currentAssets = findValue(d, p, '9518', ['流動資産'], true, tr, glm);
            const currentLiab = findValue(d, p, '9532', ['流動負債'], true, tr, glm);
            const workingCapital = currentAssets - currentLiab;
            return workingCapital && workingCapital !== 0 ? sales / workingCapital : 0;
        }
    },
    {
        id: 'dupont_asset_turnover',
        labelEng: 'DuPont: Asset Turnover (x)',
        labelJp: 'デュポン分析: 総資産回転率',
        meaning: 'ROE分解2: 売上高 / 総資産',
        isStock: true,
        calculator: (d, p, tr, glm) => {
            const sales = findValue(d, p, '9601', ['売上高'], false, tr, glm);
            const totalAssets = findValue(d, p, '9546', ['総資産'], true, tr, glm);
            return totalAssets && totalAssets !== 0 ? sales / totalAssets : 0;
        }
    },

    // ===== 5. 市場価値 (Market Value) =====
    {
        id: 'ev_ebitda',
        labelEng: 'EV/EBITDA (x)',
        labelJp: 'EV/EBITDA倍率',
        meaning: '企業価値 / EBITDA（M&A評価指標）',
        calculator: (d, p, tr, glm) => {
            const opProfit = findValue(d, p, '9622', ['営業利益'], false, tr, glm);
            const depreciation = findValue(d, p, '9515', ['減価償却費'], false, tr, glm);
            const ebitda = opProfit + Math.abs(depreciation);

            const equity = findValue(d, p, '9547', ['自己資本'], true, tr, glm);
            const b1 = findValue(d, p, '21114', ['1年以内返済予定長期借入金'], true, tr, glm);
            const b2 = findValue(d, p, '22101', ['長期借入金'], true, tr, glm);
            const b3 = findValue(d, p, '21104', ['短期借入金'], true, tr, glm);
            const cash = findValue(d, p, '9508', ['現金及び預金'], true, tr, glm);

            const marketCap = equity * 1.5; // 推定時価総額
            const netDebt = b1 + b2 + b3 - cash;
            const ev = marketCap + netDebt; // Enterprise Value

            return ebitda ? ev / ebitda : 0;
        }
    },
    {
        id: 'total_market_cap',
        labelEng: 'Total Market Cap (円)',
        labelJp: '推定時価総額',
        meaning: '推定株価 × 発行済株式数',
        isStock: true,
        calculator: (d, p, tr, glm) => {
            const equity = findValue(d, p, '9547', ['自己資本', '純資産'], true, tr, glm);
            const TOTAL_SHARES = 200000;
            const INDUSTRY_AVG_PBR = 1.5;
            const bps = equity / TOTAL_SHARES;
            const estimatedPrice = bps * INDUSTRY_AVG_PBR;
            return estimatedPrice * TOTAL_SHARES;
        }
    },

    // ===== 6. 株主目線 (Shareholder Perspective) =====
    {
        id: 'eps',
        labelEng: 'EPS (円)',
        labelJp: '1株当たり純利益',
        meaning: '1株当たりの純利益 = 当期純利益 / 発行済株式数（20万株）',
        calculator: (d, p, tr, glm) => {
            const netIncome = findValue(d, p, '9690', ['当期純利益'], false, tr, glm);
            const TOTAL_SHARES = 200000; // 20万株
            return netIncome / TOTAL_SHARES;
        }
    },
    {
        id: 'bps',
        labelEng: 'BPS (円)',
        labelJp: '1株当たり純資産',
        meaning: '1株当たりの純資産 = 自己資本 / 発行済株式数（20万株）',
        isStock: true,
        calculator: (d, p, tr, glm, consolidatedSubjects) => {
            const equity = findValue(d, p, '9547', ['自己資本', '純資産'], true, tr, glm);
            const TOTAL_SHARES = 200000; // 20万株
            return equity / TOTAL_SHARES;
        }
    },
    {
        id: 'estimated_stock_price_pbr',
        labelEng: 'Estimated Stock Price (PBR法)',
        labelJp: '推定株価（PBR法）',
        meaning: '純資産倍率法: BPS × 業界平均PBR（1.5倍を想定）',
        isStock: true,
        calculator: (d, p, tr, glm, consolidatedSubjects) => {
            const equity = findValue(d, p, '9547', ['自己資本', '純資産'], true, tr, glm);
            const TOTAL_SHARES = 200000;
            const INDUSTRY_AVG_PBR = 1.5; // 業界平均PBR
            const bps = equity / TOTAL_SHARES;
            return bps * INDUSTRY_AVG_PBR;
        }
    },
    {
        id: 'dupont_equity_multiplier',
        labelEng: 'DuPont: 財務レバレッジ',
        labelJp: 'デュポン分析: 財務レバレッジ',
        meaning: 'ROE分解3: 総資産 / 自己資本',
        isStock: true,
        calculator: (d, p, tr, glm, consolidatedSubjects) => {
            const totalAssets = findValue(d, p, '9546', ['総資産'], true, tr, glm);
            const equity = findValue(d, p, '9545', ['純資産'], true, tr, glm);
            return equity && equity !== 0 ? totalAssets / equity : 0;
        }
    },
    // ===== 7. 製造原価 (Manufacturing Costs) =====
    {
        id: 'mfg_material_cost',
        labelEng: 'Material Cost',
        labelJp: '材料費',
        meaning: '製造に使用した原材料の費用',
        calculator: (d, p, tr, glm) => findValue(d, p, 'MFG_MAT', ['材料費'], false, tr, glm, false, ['製造原価報告書'])
    },
    {
        id: 'mfg_labor_cost',
        labelEng: 'Labor Cost',
        labelJp: '労務費',
        meaning: '製造現場の労務費用',
        calculator: (d, p, tr, glm) => findValue(d, p, 'MFG_LAB', ['労務費'], false, tr, glm, false, ['製造原価報告書'])
    },
    {
        id: 'mfg_expenses',
        labelEng: 'Mfg Expenses',
        labelJp: '製造経費',
        meaning: '材料費・労務費以外の製造経費',
        calculator: (d, p, tr, glm) => findValue(d, p, 'MFG_EXP', ['経費'], false, tr, glm, false, ['製造原価報告書'])
    },
    {
        id: 'mfg_total_cost',
        labelEng: 'Total Mfg Cost',
        labelJp: '当期製造費用',
        meaning: '当期に発生した総製造費用 = 材料費 + 労務費 + 経費',
        calculator: (d, p, tr, glm) => {
            const mat = findValue(d, p, 'MFG_MAT', ['材料費'], false, tr, glm, false, ['製造原価報告書']);
            const lab = findValue(d, p, 'MFG_LAB', ['労務費'], false, tr, glm, false, ['製造原価報告書']);
            const exp = findValue(d, p, 'MFG_EXP', ['経費'], false, tr, glm, false, ['製造原価報告書']);
            return mat + lab + exp;
        }
    }
];

export const analyzeFinancials = (data: PnLData): FinancialReport => {
    const FISCAL_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];
    let globalLatestMonth = 3;
    let monthsProcessed = 0;
    for (let m of FISCAL_MONTHS) {
        if (data.rows.some(r => (r.monthlyData[m]?.actual || r.monthlyData[m]?.budget || 0) !== 0)) {
            globalLatestMonth = m;
            monthsProcessed++;
        }
    }
    if (monthsProcessed === 0) monthsProcessed = 1;

    // Optimization: Pre-calculate consolidated subjects once
    const consolidatedSubjects = new Set(
        data.rows
            .filter(r => r.department.includes('合併') || r.department.includes('連結'))
            .map(r => r.subject)
    );

    const report: FinancialReport = {
        metrics: DEFINITIONS,
        values: {},
        comments: {},
        debugTrace: {}
    };

    DEFINITIONS.forEach(def => {
        report.values[def.id] = {};
        report.debugTrace[def.id] = {};
    });

    for (let m = 0; m < 12; m++) {
        DEFINITIONS.forEach(def => {
            const trace: string[] = [];
            report.values[def.id][m] = def.calculator(data, m, trace, m, consolidatedSubjects);
            report.debugTrace[def.id][m] = trace;
        });
    }

    const periods: Period[] = ['1H', '2H', 'FY'];
    periods.forEach(p => {
        DEFINITIONS.forEach(def => {
            const trace: string[] = [];
            report.values[def.id][p] = def.calculator(data, p, trace, globalLatestMonth, consolidatedSubjects);
            report.debugTrace[def.id][p] = trace;
        });
    });

    // --- New: Departmental Analysis ---
    const TARGET_DEPTS = ['イズライフ', 'プローン', 'ブランチ', '営業部', '国際', '岐阜', '三重', '静岡', '松本', '本部'];
    report.departmentalResults = TARGET_DEPTS.map(deptName => {
        const rows = data.rows.filter(r => r.department.includes(deptName) || r.subject.includes(deptName));
        const sales = rows.filter(r => (r.code && r.code.includes('9821')) || r.subject.includes('売上高')).reduce((sum, r) => sum + (r.totalAnnual.actual || r.totalAnnual.budget || 0), 0);
        const profit = rows.filter(r => (r.code && r.code.includes('9861')) || r.subject.includes('営業利益')).reduce((sum, r) => sum + (r.totalAnnual.actual || r.totalAnnual.budget || 0), 0);
        return { name: deptName, sales, profit, margin: sales ? (profit / sales) * 100 : 0 };
    }).filter(d => d.sales !== 0 || d.profit !== 0);

    // --- New: TOP 10 SGA Analysis ---
    const sgaRows = data.rows.filter(r =>
        (r.department.includes('販売費及び一般管理費') || r.department.includes('合併') || r.department.includes('一覧')) &&
        !/合計|計$/.test(r.subject) &&
        !['販売費及び一般管理費', '（販管人件費）', '（一般管理費）', '（関係会社費用）'].includes(r.subject.trim())
    );
    report.sgaTop10 = sgaRows
        .map(r => {
            const val = r.totalAnnual.actual || r.totalAnnual.budget || 0;
            return {
                subject: r.subject,
                total: val,
                avg: val / monthsProcessed,
                prevTotal: r.totalAnnual.prevYearActual || 0,
                prevAvg: (r.totalAnnual.prevYearActual || 0) / monthsProcessed
            };
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

    for (let m = 0; m < 12; m++) {
        const msgs: string[] = [];
        const v = (id: string) => report.values[id] ? report.values[id][m] : 0;
        if (v('current_ratio') > 0 && v('current_ratio') < 100) msgs.push(`[Safety] Short-term liquidity risk (Current Ratio < 100%).`);
        if (v('equity_ratio') > 0 && v('equity_ratio') < 10) msgs.push(`[Safety] Equity Ratio critical (< 10%).`);
        if (v('operating_margin') < 0) msgs.push(`[Profitability] Operating Loss detected.`);
        report.comments[m] = msgs;
    }

    return report;
};
