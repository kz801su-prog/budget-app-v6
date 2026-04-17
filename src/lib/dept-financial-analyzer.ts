import { PnLData, AggregatedRow, DeptHeadcount } from './types';

export type Period = number | '1H' | '2H' | 'FY';

// Department-specific metrics
export interface DeptMetricDefinition {
    id: string;
    labelEng: string;
    labelJp: string;
    meaning: string;
    unit: string; // '%', '円', '倍', etc.
    category: 'profitability' | 'cost_efficiency' | 'growth' | 'productivity' | 'quality' | 'advanced';
    calculator: (deptData: DeptFinancialData, period: Period) => number;
}

export interface DeptFinancialData {
    department: string;
    rows: AggregatedRow[];
    headcount?: DeptHeadcount; // Detailed headcount
}

export interface DeptFinancialReport {
    department: string;
    metrics: DeptMetricDefinition[];
    values: Record<string, Record<string, number>>; // { metricId: { "0": 10, "FY": 500... } }
    headcount: DeptHeadcount;
    alerts: string[]; // AI-generated alerts
}

const FISCAL_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];
const FIRST_HALF = [3, 4, 5, 6, 7, 8];
const SECOND_HALF = [9, 10, 11, 0, 1, 2];

// Helper to find value by code or keywords
const findDeptValue = (
    rows: AggregatedRow[],
    period: Period,
    targetCode: string,
    keywords: string[] = []
): number => {
    const getPeriodMonths = (p: Period): number[] => {
        if (typeof p === 'number') return [p];
        return p === '1H' ? FIRST_HALF : p === '2H' ? SECOND_HALF : FISCAL_MONTHS;
    };

    const targetMonths = getPeriodMonths(period);

    // Try to find by code first
    let matchingRows = rows.filter(r => {
        const c = r.code ? r.code.replace(/[^0-9]/g, '') : '';
        return c === targetCode;
    });

    // If not found, try keywords
    if (matchingRows.length === 0 && keywords.length > 0) {
        matchingRows = rows.filter(r =>
            keywords.some(k => r.subject.toLowerCase().includes(k.toLowerCase()))
        );
    }

    return matchingRows.reduce((sum, r) => {
        const total = targetMonths.reduce((mSum, m) => mSum + (r.monthlyData[m]?.actual || 0), 0);
        return sum + total;
    }, 0);
};

// Get previous year value
const findDeptValuePrevYear = (
    rows: AggregatedRow[],
    period: Period,
    targetCode: string,
    keywords: string[] = []
): number => {
    const getPeriodMonths = (p: Period): number[] => {
        if (typeof p === 'number') return [p];
        return p === '1H' ? FIRST_HALF : p === '2H' ? SECOND_HALF : FISCAL_MONTHS;
    };

    const targetMonths = getPeriodMonths(period);

    let matchingRows = rows.filter(r => {
        const c = r.code ? r.code.replace(/[^0-9]/g, '') : '';
        return c === targetCode;
    });

    if (matchingRows.length === 0 && keywords.length > 0) {
        matchingRows = rows.filter(r =>
            keywords.some(k => r.subject.toLowerCase().includes(k.toLowerCase()))
        );
    }

    return matchingRows.reduce((sum, r) => {
        const total = targetMonths.reduce((mSum, m) => mSum + (r.monthlyData[m]?.prevYearActual || 0), 0);
        return sum + total;
    }, 0);
};

// Budget value helper
const findDeptValueBudget = (
    rows: AggregatedRow[],
    period: Period,
    targetCode: string,
    keywords: string[] = []
): number => {
    const getPeriodMonths = (p: Period): number[] => {
        if (typeof p === 'number') return [p];
        return p === '1H' ? FIRST_HALF : p === '2H' ? SECOND_HALF : FISCAL_MONTHS;
    };

    const targetMonths = getPeriodMonths(period);

    let matchingRows = rows.filter(r => {
        const c = r.code ? r.code.replace(/[^0-9]/g, '') : '';
        return c === targetCode;
    });

    if (matchingRows.length === 0 && keywords.length > 0) {
        matchingRows = rows.filter(r =>
            keywords.some(k => r.subject.toLowerCase().includes(k.toLowerCase()))
        );
    }

    return matchingRows.reduce((sum, r) => {
        const total = targetMonths.reduce((mSum, m) => mSum + (r.monthlyData[m]?.budget || 0), 0);
        return sum + total;
    }, 0);
};

// Define department-specific metrics
export const DEPT_METRIC_DEFINITIONS: DeptMetricDefinition[] = [
    // 1. Profitability (収益性)
    {
        id: 'gross_profit_margin',
        labelEng: 'Gross Profit Margin',
        labelJp: '売上総利益率（粗利率）',
        meaning: '売上に対する粗利益の割合。商品力・価格設定力を示す',
        unit: '%',
        category: 'profitability',
        calculator: (d, p) => {
            const sales = findDeptValue(d.rows, p, '9821', ['売上高']);
            const cogs = findDeptValue(d.rows, p, 'COGS', ['売上原価']);
            const grossProfit = sales - cogs;
            return sales ? (grossProfit / sales) * 100 : 0;
        }
    },
    {
        id: 'operating_margin',
        labelEng: 'Operating Margin',
        labelJp: '営業利益率',
        meaning: '売上に対する営業利益の割合。本業の収益力を示す',
        unit: '%',
        category: 'profitability',
        calculator: (d, p) => {
            const sales = findDeptValue(d.rows, p, '9821', ['売上高']);
            const opProfit = findDeptValue(d.rows, p, '9861', ['営業利益']);
            return sales ? (opProfit / sales) * 100 : 0;
        }
    },
    {
        id: 'ordinary_margin',
        labelEng: 'Ordinary Margin',
        labelJp: '経常利益率',
        meaning: '売上に対する経常利益の割合。総合的な収益力を示す',
        unit: '%',
        category: 'profitability',
        calculator: (d, p) => {
            const sales = findDeptValue(d.rows, p, '9821', ['売上高']);
            const ordinaryProfit = findDeptValue(d.rows, p, '9865', ['経常利益']);
            return sales ? (ordinaryProfit / sales) * 100 : 0;
        }
    },

    {
        id: 'sales_budget_achievement',
        labelEng: 'Sales Budget Achievement',
        labelJp: '売上予算達成率',
        meaning: '予算対比実績売上の達成率。100%以上で予算超過',
        unit: '%',
        category: 'profitability',
        calculator: (d, p) => {
            const actual = findDeptValue(d.rows, p, '9821', ['売上高']);
            const budget = findDeptValueBudget(d.rows, p, '9821', ['売上高']);
            return budget ? (actual / budget) * 100 : 0;
        }
    },
    {
        id: 'op_budget_achievement',
        labelEng: 'Op. Profit Budget Achievement',
        labelJp: '営業利益予算達成率',
        meaning: '予算対比実績営業利益の達成率',
        unit: '%',
        category: 'profitability',
        calculator: (d, p) => {
            const actual = findDeptValue(d.rows, p, '9861', ['営業利益']);
            const budget = findDeptValueBudget(d.rows, p, '9861', ['営業利益']);
            return budget ? (actual / budget) * 100 : 0;
        }
    },

    // 2. Cost Efficiency (費用効率)
    {
        id: 'cogs_ratio',
        labelEng: 'COGS Ratio',
        labelJp: '売上原価率',
        meaning: '売上に対する売上原価の割合。低いほど付加価値が高い',
        unit: '%',
        category: 'cost_efficiency',
        calculator: (d, p) => {
            const sales = findDeptValue(d.rows, p, '9821', ['売上高']);
            const cogs = findDeptValue(d.rows, p, 'COGS', ['売上原価']);
            return sales ? (cogs / sales) * 100 : 0;
        }
    },
    {
        id: 'sga_ratio',
        labelEng: 'SG&A Ratio',
        labelJp: '販売費及び一般管理費率',
        meaning: '売上に対する販管費の割合。費用効率を示す',
        unit: '%',
        category: 'cost_efficiency',
        calculator: (d, p) => {
            const sales = findDeptValue(d.rows, p, '9821', ['売上高']);
            const cogs = findDeptValue(d.rows, p, 'COGS', ['売上原価']);
            const opProfit = findDeptValue(d.rows, p, '9861', ['営業利益']);
            const grossProfit = sales - cogs;
            const sga = grossProfit - opProfit;
            return sales ? (sga / sales) * 100 : 0;
        }
    },
    {
        id: 'labor_cost_ratio',
        labelEng: 'Labor Cost Ratio',
        labelJp: '人件費率',
        meaning: '売上に対する人件費の割合。人的コスト効率を示す',
        unit: '%',
        category: 'cost_efficiency',
        calculator: (d, p) => {
            const sales = findDeptValue(d.rows, p, '9821', ['売上高']);
            const laborCost = findDeptValue(d.rows, p, '9701', ['人件費', '給料', '賞与']);
            return sales ? (laborCost / sales) * 100 : 0;
        }
    },
    {
        id: 'advertising_ratio',
        labelEng: 'Advertising Ratio',
        labelJp: '広告宣伝費率',
        meaning: '売上に対する広告宣伝費の割合。マーケティング投資効率を示す',
        unit: '%',
        category: 'cost_efficiency',
        calculator: (d, p) => {
            const sales = findDeptValue(d.rows, p, '9821', ['売上高']);
            const adCost = findDeptValue(d.rows, p, '9711', ['広告宣伝費']);
            return sales ? (adCost / sales) * 100 : 0;
        }
    },

    // 3. Growth (成長性)
    {
        id: 'sales_growth',
        labelEng: 'Sales Growth YoY',
        labelJp: '売上成長率',
        meaning: '前年比の売上成長率。事業の拡大ペースを示す',
        unit: '%',
        category: 'growth',
        calculator: (d, p) => {
            const currentSales = findDeptValue(d.rows, p, '9821', ['売上高']);
            const prevSales = findDeptValuePrevYear(d.rows, p, '9821', ['売上高']);
            return prevSales ? ((currentSales - prevSales) / prevSales) * 100 : 0;
        }
    },
    {
        id: 'operating_profit_growth',
        labelEng: 'Operating Profit Growth YoY',
        labelJp: '営業利益成長率',
        meaning: '前年比の営業利益成長率。収益力の向上度を示す',
        unit: '%',
        category: 'growth',
        calculator: (d, p) => {
            const currentOp = findDeptValue(d.rows, p, '9861', ['営業利益']);
            const prevOp = findDeptValuePrevYear(d.rows, p, '9861', ['営業利益']);
            return prevOp ? ((currentOp - prevOp) / prevOp) * 100 : 0;
        }
    },

    {
        id: 'op_margin_yoy_diff',
        labelEng: 'Op. Margin YoY Chg (pp)',
        labelJp: '営業利益率前年差（pp）',
        meaning: '営業利益率の前年同期比増減ポイント。プラスで収益性改善',
        unit: 'pp',
        category: 'growth',
        calculator: (d, p) => {
            const sales    = findDeptValue(d.rows, p, '9821', ['売上高']);
            const opProfit = findDeptValue(d.rows, p, '9861', ['営業利益']);
            const prevSales = findDeptValuePrevYear(d.rows, p, '9821', ['売上高']);
            const prevOp    = findDeptValuePrevYear(d.rows, p, '9861', ['営業利益']);
            const cur  = sales     ? (opProfit / sales)     * 100 : 0;
            const prev = prevSales ? (prevOp   / prevSales) * 100 : 0;
            return cur - prev;
        }
    },
    {
        id: 'gross_margin_yoy_diff',
        labelEng: 'Gross Margin YoY Chg (pp)',
        labelJp: '粗利率前年差（pp）',
        meaning: '粗利率の前年同期比増減ポイント',
        unit: 'pp',
        category: 'growth',
        calculator: (d, p) => {
            const sales     = findDeptValue(d.rows, p, '9821', ['売上高']);
            const cogs      = findDeptValue(d.rows, p, 'COGS', ['売上原価']);
            const prevSales = findDeptValuePrevYear(d.rows, p, '9821', ['売上高']);
            const prevCogs  = findDeptValuePrevYear(d.rows, p, 'COGS', ['売上原価']);
            const cur  = sales     ? ((sales     - cogs)     / sales)     * 100 : 0;
            const prev = prevSales ? ((prevSales - prevCogs) / prevSales) * 100 : 0;
            return cur - prev;
        }
    },

    // 4. Productivity (営業効率)
    {
        id: 'sales_per_sales_person',
        labelEng: 'Sales per Sales Person',
        labelJp: '営業1人当たり売上高',
        meaning: '専任営業担当者一人当たりの売上高。営業個人の生産性を示す',
        unit: '千円',
        category: 'productivity',
        calculator: (d, p) => {
            const sales = findDeptValue(d.rows, p, '9821', ['売上高']);
            const salesCount = d.headcount?.sales || 0;
            return salesCount ? sales / salesCount / 1000 : 0;
        }
    },
    {
        id: 'sales_per_employee',
        labelEng: 'Sales per Total Employee',
        labelJp: '全構成員一人当たり売上高',
        meaning: '部門の全構成員（営業＋非営業）一人当たりの売上高。部門全体の生産性を示す',
        unit: '千円',
        category: 'productivity',
        calculator: (d, p) => {
            const sales = findDeptValue(d.rows, p, '9821', ['売上高']);
            const total = (d.headcount?.sales || 0) + (d.headcount?.warehouse || 0) + (d.headcount?.operations || 0) + (d.headcount?.accounting || 0);
            return total ? sales / total / 1000 : 0;
        }
    },
    {
        id: 'profit_per_sales_person',
        labelEng: 'Op. Profit per Sales Person',
        labelJp: '営業1人当たり営業利益',
        meaning: '専任営業担当者一人当たりの営業利益',
        unit: '千円',
        category: 'productivity',
        calculator: (d, p) => {
            const opProfit = findDeptValue(d.rows, p, '9861', ['営業利益']);
            const salesCount = d.headcount?.sales || 0;
            return salesCount ? opProfit / salesCount / 1000 : 0;
        }
    },
    {
        id: 'profit_per_employee',
        labelEng: 'Op. Profit per Total Employee',
        labelJp: '全構成員一人当たり営業利益',
        meaning: '全構成員一人当たりの営業利益',
        unit: '千円',
        category: 'productivity',
        calculator: (d, p) => {
            const opProfit = findDeptValue(d.rows, p, '9861', ['営業利益']);
            const total = (d.headcount?.sales || 0) + (d.headcount?.warehouse || 0) + (d.headcount?.operations || 0) + (d.headcount?.accounting || 0);
            return total ? opProfit / total / 1000 : 0;
        }
    },

    // 5. Quality of Earnings (利益構造の健全性)
    {
        id: 'variable_cost_ratio',
        labelEng: 'Variable Cost Ratio',
        labelJp: '変動費率',
        meaning: '売上に対する変動費の割合。売上変動への柔軟性を示す',
        unit: '%',
        category: 'quality',
        calculator: (d, p) => {
            const sales = findDeptValue(d.rows, p, '9821', ['売上高']);
            const cogs = findDeptValue(d.rows, p, 'COGS', ['売上原価']);
            // Assume COGS is mostly variable cost
            return sales ? (cogs / sales) * 100 : 0;
        }
    },
    {
        id: 'fixed_cost_ratio',
        labelEng: 'Fixed Cost Ratio',
        labelJp: '固定費率（販管費率）',
        meaning: '売上に対する固定費（販管費）の割合。不況への耐性を示す',
        unit: '%',
        category: 'quality',
        calculator: (d, p) => {
            const sales = findDeptValue(d.rows, p, '9821', ['売上高']);
            const cogs = findDeptValue(d.rows, p, 'COGS', ['売上原価']);
            const opProfit = findDeptValue(d.rows, p, '9861', ['営業利益']);
            const sga = (sales - cogs) - opProfit;
            return sales ? (sga / sales) * 100 : 0;
        }
    },
    {
        id: 'breakeven_ratio',
        labelEng: 'Break-Even Ratio',
        labelJp: '損益分岐点比率',
        meaning: '損益分岐点売上高÷実際売上高。低いほど安全',
        unit: '%',
        category: 'quality',
        calculator: (d, p) => {
            const sales = findDeptValue(d.rows, p, '9821', ['売上高']);
            const cogs = findDeptValue(d.rows, p, 'COGS', ['売上原価']);
            const opProfit = findDeptValue(d.rows, p, '9861', ['営業利益']);
            const grossProfit = sales - cogs;
            const sga = grossProfit - opProfit;
            const grossMarginRate = sales ? grossProfit / sales : 0;
            const breakEvenSales = grossMarginRate ? sga / grossMarginRate : 0;
            return sales ? (breakEvenSales / sales) * 100 : 0;
        }
    },

    {
        id: 'cost_coverage',
        labelEng: 'Gross Profit Coverage Ratio',
        labelJp: '固定費カバレッジ（粗利÷販管費）',
        meaning: '粗利益が販管費の何倍かを示す。1倍以下は赤字リスク大',
        unit: '倍',
        category: 'quality',
        calculator: (d, p) => {
            const sales     = findDeptValue(d.rows, p, '9821', ['売上高']);
            const cogs      = findDeptValue(d.rows, p, 'COGS', ['売上原価']);
            const opProfit  = findDeptValue(d.rows, p, '9861', ['営業利益']);
            const grossProfit = sales - cogs;
            const sga = grossProfit - opProfit;
            return sga > 0 ? grossProfit / sga : 0;
        }
    },

    // 6. Advanced (高度分析)
    {
        id: 'operating_leverage',
        labelEng: 'Operating Leverage',
        labelJp: '営業レバレッジ',
        meaning: '売上総利益÷営業利益。売上変動が利益に与える影響の大きさ（高いほどリスク大）',
        unit: '倍',
        category: 'advanced',
        calculator: (d, p) => {
            const sales = findDeptValue(d.rows, p, '9821', ['売上高']);
            const cogs = findDeptValue(d.rows, p, 'COGS', ['売上原価']);
            const grossProfit = sales - cogs;
            const opProfit = findDeptValue(d.rows, p, '9861', ['営業利益']);
            if (!opProfit || opProfit <= 0) return 0;
            return grossProfit / opProfit;
        }
    },
    {
        id: 'profit_sensitivity',
        labelEng: 'Profit Sensitivity',
        labelJp: '利益感応度',
        meaning: '営業レバレッジ×売上変動率。売上1%変動時の利益変動率',
        unit: '%',
        category: 'advanced',
        calculator: (d, p) => {
            // Get operating leverage
            const sales = findDeptValue(d.rows, p, '9821', ['売上高']);
            const cogs = findDeptValue(d.rows, p, 'COGS', ['売上原価']);
            const grossProfit = sales - cogs;
            const opProfit = findDeptValue(d.rows, p, '9861', ['営業利益']);
            const leverage = opProfit ? grossProfit / opProfit : 0;

            // Get sales growth
            const prevSales = findDeptValuePrevYear(d.rows, p, '9821', ['売上高']);
            const salesGrowth = prevSales ? ((sales - prevSales) / prevSales) * 100 : 0;

            return leverage * salesGrowth;
        }
    }
];

// Analyze department financials
export const analyzeDeptFinancials = (
    deptData: DeptFinancialData
): DeptFinancialReport => {
    const report: DeptFinancialReport = {
        department: deptData.department,
        metrics: DEPT_METRIC_DEFINITIONS,
        values: {},
        headcount: deptData.headcount || { sales: 0, warehouse: 0, operations: 0, accounting: 0 },
        alerts: []
    };

    // Initialize values
    DEPT_METRIC_DEFINITIONS.forEach(def => {
        report.values[def.id] = {};
    });

    // Calculate for each month
    for (let m = 0; m < 12; m++) {
        DEPT_METRIC_DEFINITIONS.forEach(def => {
            report.values[def.id][m] = def.calculator(deptData, m);
        });
    }

    // Calculate for periods
    const periods: Period[] = ['1H', '2H', 'FY'];
    periods.forEach(p => {
        DEPT_METRIC_DEFINITIONS.forEach(def => {
            report.values[def.id][p] = def.calculator(deptData, p);
        });
    });

    // Generate AI alerts
    report.alerts = generateDeptAlerts(report);

    return report;
};

// Generate AI-powered alerts for department
const generateDeptAlerts = (report: DeptFinancialReport): string[] => {
    const alerts: string[] = [];
    const fyValues = (id: string) => report.values[id]?.['FY'] || 0;

    // Check profitability
    const opMargin = fyValues('operating_margin');
    if (opMargin < 5) {
        alerts.push(`⚠️ 営業利益率が${opMargin.toFixed(1)}%と低水準です。収益性改善が必要です。`);
    } else if (opMargin > 15) {
        alerts.push(`✅ 営業利益率が${opMargin.toFixed(1)}%と優良水準です。`);
    }

    // Check cost efficiency
    const sgaRatio = fyValues('sga_ratio');
    if (sgaRatio > 30) {
        alerts.push(`⚠️ 販管費率が${sgaRatio.toFixed(1)}%と高めです。コスト削減の余地があります。`);
    }

    // Check growth
    const salesGrowth = fyValues('sales_growth');
    if (salesGrowth < -5) {
        alerts.push(`🔴 売上が前年比${salesGrowth.toFixed(1)}%減少しています。早急な対策が必要です。`);
    } else if (salesGrowth > 10) {
        alerts.push(`🚀 売上が前年比${salesGrowth.toFixed(1)}%成長しています。好調です。`);
    }

    // Check productivity
    const totalStaff = (report.headcount.sales || 0) + (report.headcount.warehouse || 0) + (report.headcount.operations || 0) + (report.headcount.accounting || 0);
    if (totalStaff > 0) {
        const salesPerEmp = fyValues('sales_per_employee');
        if (salesPerEmp < 10000) {
            alerts.push(`⚠️ 一人当たり売上高が${salesPerEmp.toFixed(0)}千円と低めです。生産性向上が課題です。`);
        }
    }

    // Check break-even safety
    const bepRatio = fyValues('breakeven_ratio');
    if (bepRatio > 90) {
        alerts.push(`🔴 損益分岐点比率が${bepRatio.toFixed(1)}%と危険水準です。売上減少リスクが高いです。`);
    } else if (bepRatio < 70) {
        alerts.push(`✅ 損益分岐点比率が${bepRatio.toFixed(1)}%と安全です。十分な利益余裕があります。`);
    }

    // Check operating leverage
    const leverage = fyValues('operating_leverage');
    if (leverage > 5) {
        alerts.push(`⚠️ 営業レバレッジが${leverage.toFixed(1)}倍と高く、売上変動の影響を受けやすい構造です。`);
    }

    return alerts;
};
