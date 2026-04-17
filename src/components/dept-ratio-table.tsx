"use client"

import { useMemo, useEffect, useState } from 'react';
import { PnLData, DeptHeadcount } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { analyzeDeptFinancials, DeptFinancialReport, DEPT_METRIC_DEFINITIONS, DeptMetricDefinition } from '@/lib/dept-financial-analyzer';
import { getAllEmployeeCounts } from '@/lib/storage-utils';
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';

interface DeptRatioTableProps {
    data: PnLData;
    selectedDepartment: string;
    companyName: string;
    fiscalYear: string;
}

const MONTH_NAMES  = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const MONTH_INDICES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];

const CATEGORY_CONFIG: Record<string, { jp: string; color: string; bg: string; headerBg: string }> = {
    profitability:  { jp: '収益性指標',       color: 'text-blue-800',   bg: 'bg-blue-50',   headerBg: 'bg-blue-50 border-blue-200' },
    cost_efficiency:{ jp: '費用効率指標',     color: 'text-orange-800', bg: 'bg-orange-50', headerBg: 'bg-orange-50 border-orange-200' },
    growth:         { jp: '成長性指標',       color: 'text-green-800',  bg: 'bg-green-50',  headerBg: 'bg-green-50 border-green-200' },
    productivity:   { jp: '生産性指標',       color: 'text-purple-800', bg: 'bg-purple-50', headerBg: 'bg-purple-50 border-purple-200' },
    quality:        { jp: '利益構造の健全性', color: 'text-rose-800',   bg: 'bg-rose-50',   headerBg: 'bg-rose-50 border-rose-200' },
    advanced:       { jp: '高度分析',         color: 'text-slate-800',  bg: 'bg-slate-100', headerBg: 'bg-slate-100 border-slate-200' },
};

// direction: higher_better → green if val >= good; lower_better → green if val <= good; centered → green if val >= center
interface Thresholds { direction: 'higher_better' | 'lower_better' | 'centered'; good: number; warn: number; center?: number; }

const THRESHOLDS: Record<string, Thresholds> = {
    gross_profit_margin:      { direction: 'higher_better', good: 30,    warn: 20 },
    operating_margin:         { direction: 'higher_better', good: 10,    warn: 5 },
    ordinary_margin:          { direction: 'higher_better', good: 10,    warn: 5 },
    sales_budget_achievement: { direction: 'centered',      good: 100,   warn: 90, center: 100 },
    op_budget_achievement:    { direction: 'centered',      good: 100,   warn: 90, center: 100 },
    cogs_ratio:               { direction: 'lower_better',  good: 60,    warn: 75 },
    sga_ratio:                { direction: 'lower_better',  good: 20,    warn: 30 },
    labor_cost_ratio:         { direction: 'lower_better',  good: 15,    warn: 25 },
    advertising_ratio:        { direction: 'lower_better',  good: 3,     warn: 8 },
    sales_growth:             { direction: 'higher_better', good: 5,     warn: 0 },
    operating_profit_growth:  { direction: 'higher_better', good: 5,     warn: 0 },
    op_margin_yoy_diff:       { direction: 'higher_better', good: 0.5,   warn: -1 },
    gross_margin_yoy_diff:    { direction: 'higher_better', good: 0.5,   warn: -1 },
    sales_per_sales_person:   { direction: 'higher_better', good: 15000, warn: 8000 },
    sales_per_employee:       { direction: 'higher_better', good: 10000, warn: 5000 },
    profit_per_sales_person:  { direction: 'higher_better', good: 1500,  warn: 500 },
    profit_per_employee:      { direction: 'higher_better', good: 1000,  warn: 300 },
    variable_cost_ratio:      { direction: 'lower_better',  good: 60,    warn: 75 },
    fixed_cost_ratio:         { direction: 'lower_better',  good: 20,    warn: 30 },
    breakeven_ratio:          { direction: 'lower_better',  good: 70,    warn: 85 },
    cost_coverage:            { direction: 'higher_better', good: 1.5,   warn: 1.0 },
    operating_leverage:       { direction: 'lower_better',  good: 2,     warn: 4 },
    profit_sensitivity:       { direction: 'higher_better', good: 5,     warn: 0 },
};

const BENCHMARKS: Record<string, string> = {
    gross_profit_margin:      '目標 ≥30%',
    operating_margin:         '優良 ≥10%',
    ordinary_margin:          '優良 ≥10%',
    sales_budget_achievement: '目標 100%',
    op_budget_achievement:    '目標 100%',
    cogs_ratio:               '目標 ≤60%',
    sga_ratio:                '目標 ≤20%',
    labor_cost_ratio:         '目標 ≤15%',
    advertising_ratio:        '目標 ≤5%',
    sales_growth:             '目標 ≥5%',
    operating_profit_growth:  '目標 ≥5%',
    op_margin_yoy_diff:       '目標 ≥0pp',
    gross_margin_yoy_diff:    '目標 ≥0pp',
    sales_per_sales_person:   '目標 ≥1.5億',
    sales_per_employee:       '目標 ≥1億',
    profit_per_sales_person:  '目標 ≥1500万',
    profit_per_employee:      '目標 ≥1000万',
    variable_cost_ratio:      '目標 ≤60%',
    fixed_cost_ratio:         '目標 ≤20%',
    breakeven_ratio:          '安全 ≤70%',
    cost_coverage:            '目標 ≥1.5倍',
    operating_leverage:       '安全 ≤3倍',
    profit_sensitivity:       '',
};

function cellColor(val: number, id: string): string {
    const t = THRESHOLDS[id];
    if (!t || val === 0) return 'text-slate-400';
    if (t.direction === 'higher_better') {
        if (val >= t.good) return 'text-emerald-700 font-semibold';
        if (val >= t.warn) return 'text-amber-600';
        return 'text-red-600';
    }
    if (t.direction === 'lower_better') {
        if (val <= t.good) return 'text-emerald-700 font-semibold';
        if (val <= t.warn) return 'text-amber-600';
        return 'text-red-600';
    }
    // centered
    if (val >= (t.center ?? 100)) return 'text-emerald-700 font-semibold';
    if (val >= t.warn) return 'text-amber-600';
    return 'text-red-600';
}

function fmtVal(val: number, unit: string): string {
    if (val === 0) return '-';
    if (unit === '%' || unit === 'pp') return val.toFixed(1);
    if (unit === '倍') return val.toFixed(2);
    if (unit === '千円') return Math.floor(val).toLocaleString();
    return val.toFixed(1);
}

function TrendArrow({ curr, prev, id }: { curr: number; prev: number; id: string }) {
    if (curr === 0 || prev === 0) return null;
    const diff = curr - prev;
    const t = THRESHOLDS[id];
    const tinyChange = Math.abs(diff) < Math.abs(curr) * 0.02 && Math.abs(diff) < 0.5;
    if (tinyChange) return <Minus className="inline h-2.5 w-2.5 text-slate-300 ml-0.5" />;
    const isGood = t
        ? (t.direction === 'higher_better' ? diff > 0 : t.direction === 'lower_better' ? diff < 0 : diff >= 0)
        : diff > 0;
    if (diff > 0) return <TrendingUp className={cn("inline h-2.5 w-2.5 ml-0.5", isGood ? "text-emerald-500" : "text-red-400")} />;
    return <TrendingDown className={cn("inline h-2.5 w-2.5 ml-0.5", isGood ? "text-emerald-500" : "text-red-400")} />;
}

function gradeCategory(report: DeptFinancialReport, metrics: DeptMetricDefinition[]): { grade: string; color: string; bgColor: string } {
    let score = 0; let count = 0;
    metrics.forEach(m => {
        const val = report.values[m.id]?.['FY'] || 0;
        const t = THRESHOLDS[m.id];
        if (!t || val === 0) return;
        count++;
        if (t.direction === 'higher_better') {
            score += val >= t.good ? 2 : val >= t.warn ? 1 : 0;
        } else if (t.direction === 'lower_better') {
            score += val <= t.good ? 2 : val <= t.warn ? 1 : 0;
        } else {
            score += val >= (t.center ?? 100) ? 2 : val >= t.warn ? 1 : 0;
        }
    });
    if (count === 0) return { grade: '-', color: 'text-slate-400', bgColor: 'bg-slate-100' };
    const avg = score / count;
    if (avg >= 1.7) return { grade: 'A', color: 'text-emerald-700', bgColor: 'bg-emerald-50' };
    if (avg >= 1.3) return { grade: 'B', color: 'text-blue-700',    bgColor: 'bg-blue-50' };
    if (avg >= 0.7) return { grade: 'C', color: 'text-amber-600',   bgColor: 'bg-amber-50' };
    return            { grade: 'D', color: 'text-red-600',   bgColor: 'bg-red-50' };
}

const CORE_KEYWORDS = ['貸借対照表', '損益計算書', '販売費及び一般管理費', '販売費', '合併', '連結'];
const isCoreSheet = (d: string) => CORE_KEYWORDS.some(k => d.includes(k));

export function DeptRatioTable({ data, selectedDepartment, companyName, fiscalYear }: DeptRatioTableProps) {
    const [employeeCounts, setEmployeeCounts] = useState<Record<string, DeptHeadcount>>({});

    useEffect(() => {
        getAllEmployeeCounts(companyName, fiscalYear).then(setEmployeeCounts);
    }, [companyName, fiscalYear]);

    const currentReport = useMemo(() => {
        if (!selectedDepartment || selectedDepartment === 'All') return null;
        const deptRows = data.rows.filter(r => r.department === selectedDepartment && !isCoreSheet(r.department));
        const hc = employeeCounts[selectedDepartment] || { sales: 0, warehouse: 0, operations: 0, accounting: 0 };
        return analyzeDeptFinancials({ department: selectedDepartment, rows: deptRows, headcount: hc });
    }, [data, selectedDepartment, employeeCounts]);

    const metricsByCategory = useMemo(() => {
        const grouped: Record<string, DeptMetricDefinition[]> = {};
        DEPT_METRIC_DEFINITIONS.forEach(m => {
            if (!grouped[m.category]) grouped[m.category] = [];
            grouped[m.category].push(m);
        });
        return grouped;
    }, []);

    if (!currentReport) {
        return (
            <Card className="p-8">
                <div className="text-center text-slate-500">
                    <p className="text-lg font-medium mb-2">部門を選択してください</p>
                    <p className="text-sm">左側のフィルターから部門を選択すると、詳細な財務比率が表示されます。</p>
                </div>
            </Card>
        );
    }

    const categories = Object.entries(metricsByCategory);

    return (
        <div className="space-y-4">
            {/* Category Scorecard */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {categories.map(([cat, metrics]) => {
                    const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.advanced;
                    const g = gradeCategory(currentReport, metrics);
                    return (
                        <Card key={cat} className={cn("text-center py-3 border", g.bgColor)}>
                            <div className={cn("text-3xl font-black leading-none", g.color)}>{g.grade}</div>
                            <div className={cn("text-[9px] font-semibold mt-1 px-1 leading-tight", cfg.color)}>{cfg.jp}</div>
                        </Card>
                    );
                })}
            </div>

            {/* Color Legend */}
            <div className="flex items-center gap-4 text-[10px] text-slate-500 px-1">
                <span className="font-medium text-slate-600">カラーガイド:</span>
                <span className="text-emerald-700 font-semibold">■ 優良（目標達成）</span>
                <span className="text-amber-600">■ 注意（改善余地あり）</span>
                <span className="text-red-600">■ 要対応（目標未達）</span>
                <span className="text-slate-400">■ データなし</span>
                <span className="ml-2"><TrendingUp className="inline h-3 w-3 text-emerald-500" /> 改善トレンド</span>
                <span><TrendingDown className="inline h-3 w-3 text-red-400" /> 悪化トレンド</span>
            </div>

            {/* Metric Tables by Category */}
            {categories.map(([cat, metrics]) => {
                const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.advanced;
                const g   = gradeCategory(currentReport, metrics);
                return (
                    <Card key={cat} className="w-full overflow-hidden shadow border-0">
                        <CardHeader className={cn("py-2.5 px-4 border-b", cfg.headerBg)}>
                            <div className="flex items-center justify-between">
                                <CardTitle className={cn("text-sm font-bold", cfg.color)}>
                                    {cfg.jp}
                                    <span className="text-[10px] font-normal text-slate-500 ml-2">
                                        ({metrics.length}指標)
                                    </span>
                                </CardTitle>
                                <span className={cn("text-base font-black px-2 py-0.5 rounded", g.bgColor, g.color)}>
                                    評価 {g.grade}
                                </span>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="max-h-[380px] overflow-y-auto w-full">
                                <Table className="min-w-[1720px]">
                                    <TableHeader>
                                        <TableRow className="bg-slate-50 hover:bg-slate-50 text-xs">
                                            <TableHead className="w-[190px] sticky left-0 bg-slate-50 z-20 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] py-2">
                                                指標名
                                            </TableHead>
                                            <TableHead className="w-[88px] sticky left-[190px] bg-slate-50 z-20 border-r text-slate-500 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] py-2">
                                                単位 / 目標
                                            </TableHead>
                                            {MONTH_NAMES.map(m => (
                                                <TableHead key={m} className="text-right min-w-[78px] text-slate-500">{m}</TableHead>
                                            ))}
                                            <TableHead className="text-right min-w-[88px] bg-blue-50 border-l text-blue-800 font-bold">上期(1H)</TableHead>
                                            <TableHead className="text-right min-w-[88px] bg-blue-50 text-blue-800 font-bold">下期(2H)</TableHead>
                                            <TableHead className="text-right min-w-[96px] bg-slate-100 border-l text-slate-800 font-bold">年間(FY)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {metrics.map((metric, idx) => {
                                            const vals = currentReport.values[metric.id] || {};
                                            return (
                                                <TableRow
                                                    key={metric.id}
                                                    className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}
                                                >
                                                    <TableCell className={cn(
                                                        "sticky left-0 z-10 border-r py-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]",
                                                        idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                                                    )}>
                                                        <div className="text-xs font-semibold text-slate-800 leading-tight">{metric.labelJp}</div>
                                                        <div className="text-[9px] text-slate-400 leading-tight mt-0.5">{metric.labelEng}</div>
                                                    </TableCell>
                                                    <TableCell className={cn(
                                                        "sticky left-[190px] z-10 border-r py-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]",
                                                        idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                                                    )}>
                                                        <div className="text-[10px] font-bold text-slate-700">{metric.unit}</div>
                                                        <div className="text-[9px] text-indigo-500 mt-0.5 leading-tight">{BENCHMARKS[metric.id]}</div>
                                                    </TableCell>

                                                    {MONTH_INDICES.map((m, mi) => {
                                                        const val  = vals[m]  || 0;
                                                        const prev = mi > 0 ? (vals[MONTH_INDICES[mi - 1]] || 0) : 0;
                                                        return (
                                                            <TableCell key={m} className="text-right text-xs px-1.5 py-2">
                                                                <span className={cellColor(val, metric.id)}>
                                                                    {fmtVal(val, metric.unit)}
                                                                </span>
                                                                {mi > 0 && val !== 0 && (
                                                                    <TrendArrow curr={val} prev={prev} id={metric.id} />
                                                                )}
                                                            </TableCell>
                                                        );
                                                    })}

                                                    {(['1H', '2H', 'FY'] as const).map((p, pi) => {
                                                        const val = vals[p] || 0;
                                                        return (
                                                            <TableCell key={p} className={cn(
                                                                "text-right text-xs font-bold px-2 py-2",
                                                                pi < 2 ? "bg-blue-50/40" : "bg-slate-100/40",
                                                                pi === 0 || pi === 2 ? "border-l" : ""
                                                            )}>
                                                                <span className={cellColor(val, metric.id)}>
                                                                    {fmtVal(val, metric.unit)}
                                                                </span>
                                                            </TableCell>
                                                        );
                                                    })}
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}

            {/* Collapsible Reference Guide */}
            <details className="group">
                <summary className="cursor-pointer select-none flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 px-3 py-2 rounded border bg-slate-50 hover:bg-slate-100 transition-colors list-none">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    <span>全指標の詳細解説・算出方法（クリックで展開）</span>
                </summary>
                <Card className="mt-2 border-slate-200">
                    <CardContent className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {DEPT_METRIC_DEFINITIONS.map(metric => {
                                const cfg = CATEGORY_CONFIG[metric.category] || CATEGORY_CONFIG.advanced;
                                return (
                                    <div key={metric.id} className={cn("p-2.5 rounded-lg border", cfg.bg)}>
                                        <div className="flex justify-between items-start gap-2 mb-1">
                                            <span className={cn("text-xs font-semibold leading-tight", cfg.color)}>
                                                {metric.labelJp}
                                            </span>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <span className="text-[9px] bg-white/70 px-1.5 py-0.5 rounded border text-slate-600">{metric.unit}</span>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-slate-600 leading-snug">{metric.meaning}</p>
                                        {BENCHMARKS[metric.id] && (
                                            <p className="text-[9px] text-indigo-600 mt-1 font-medium">{BENCHMARKS[metric.id]}</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            </details>
        </div>
    );
}
