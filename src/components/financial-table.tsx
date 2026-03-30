"use client"

import { FinancialReport } from '@/lib/financial-analyzer';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

interface FinancialTableProps {
    report: FinancialReport;
    isThousands?: boolean;
    metricType?: 'pl' | 'bs' | 'all';
}

const MONTH_NAMES = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const MONTH_INDICES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];

export function FinancialTable({ report, isThousands = true, metricType = 'all' }: FinancialTableProps) {
    // Define advanced metrics that should appear in BS Ratios
    const bsSpecificMetrics = [
        'equity_ratio', 'current_ratio', 'quick_ratio', 'debt_dependency', 'interest_coverage',
        'roe', 'roa', 'net_income', 'eps', 'bps', 'estimated_stock_price_pbr', 'total_market_cap',
        'ebitda', 'roic', 'cash_conversion_cycle', 'sales_growth_yoy', 'op_profit_growth_yoy',
        'altman_z_score', 'piotroski_f_score', 'dupont_profit_margin', 'dupont_asset_turnover',
        'dupont_equity_multiplier', 'ev_ebitda', 'working_capital_turnover'
    ];

    // Filter metrics based on type
    const filteredMetrics = metricType === 'all'
        ? report.metrics
        : metricType === 'pl'
            ? report.metrics.filter(m => !m.isStock && !bsSpecificMetrics.includes(m.id))
            : report.metrics.filter(m => m.isStock || bsSpecificMetrics.includes(m.id));

    return (
        <div className="space-y-8">
            {/* Ratios Matrix */}
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <CardTitle>Financial Ratios & Analysis (Apr - Mar)</CardTitle>
                        <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border">
                            単位: {isThousands ? "千円" : "円"}
                        </span>
                    </div>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[600px] w-full">
                        <div className="min-w-[1600px]">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50">
                                        {/* 3 Description Columns - First one is sticky */}
                                        <TableHead className="w-[180px] sticky left-0 bg-slate-50 border-r z-20">Metric (Eng)</TableHead>
                                        <TableHead className="w-[180px] sticky left-[180px] bg-slate-50 border-r z-20">Metric (JP)</TableHead>
                                        <TableHead className="w-[250px] sticky left-[360px] bg-slate-50 border-r z-20">Meaning</TableHead>

                                        {/* Months */}
                                        {MONTH_NAMES.map(m => (
                                            <TableHead key={m} className="text-right w-[100px]">{m}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredMetrics.map((def) => (
                                        <TableRow key={def.id} className="hover:bg-indigo-50/30 transition-colors">
                                            {/* Metadata Columns - Sticky */}
                                            <TableCell className="font-medium sticky left-0 bg-white border-r text-xs z-10">{def.labelEng}</TableCell>
                                            <TableCell className="text-xs sticky left-[180px] bg-white border-r text-gray-700 z-10">{def.labelJp}</TableCell>
                                            <TableCell
                                                className="text-xs sticky left-[360px] bg-white border-r text-gray-500 italic cursor-help z-10"
                                                title={`Formula: ${def.meaning}`}
                                            >
                                                {def.meaning}
                                            </TableCell>

                                            {/* Values */}
                                            {MONTH_INDICES.map(m => {
                                                const val = report.values[def.id]?.[m];
                                                const trace = report.debugTrace[def.id]?.[m] || [];

                                                const isPercentage = def.labelEng.includes('%') || def.labelEng.includes('Ratio');
                                                const isRatio = def.labelEng.includes('(x)') || def.id === 'interest_coverage';

                                                let displayVal = val;
                                                if (val !== undefined && !isPercentage && !isRatio && isThousands) {
                                                    displayVal = Math.floor(val / 1000);
                                                }

                                                const formatted = displayVal !== undefined ? displayVal.toLocaleString(undefined, {
                                                    minimumFractionDigits: (isPercentage || isRatio) ? 1 : 0,
                                                    maximumFractionDigits: (isPercentage || isRatio) ? 1 : 0
                                                }) : "-";

                                                const traceText = trace.length > 0
                                                    ? "Matched Rows:\n" + trace.join("\n")
                                                    : "No matching rows found.";

                                                return (
                                                    <TableCell
                                                        key={m}
                                                        className="text-right text-xs cursor-help"
                                                        title={traceText}
                                                    >
                                                        <span className={val !== 0 ? "font-semibold text-slate-900" : "text-slate-400"}>
                                                            {formatted}
                                                        </span>
                                                    </TableCell>
                                                );
                                            })}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>

            {/* Metric Explanations Table */}
            <Card>
                <CardHeader>
                    <CardTitle>財務指標の計算式と目的</CardTitle>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[500px] w-full">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50">
                                    <TableHead className="w-[200px]">指標名</TableHead>
                                    <TableHead className="w-[350px]">計算式</TableHead>
                                    <TableHead>目的・意味</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredMetrics.map((def) => {
                                    // Define formulas for each metric
                                    const formulas: Record<string, string> = {
                                        // P/L Metrics
                                        'sales': '売上高（P/L）',
                                        'cogs': '売上原価（P/L）',
                                        'gross_profit': '売上高 - 売上原価',
                                        'sga': '販売費及び一般管理費（P/L）',
                                        'operating_profit': '営業利益（P/L）',
                                        'ordinary_profit': '経常利益（P/L）',

                                        // Liquidity
                                        'current_ratio': '流動資産 ÷ 流動負債 × 100',
                                        'quick_ratio': '(現金及び預金 + 受取手形 + 売掛金 + 商品×0.7) ÷ 流動負債 × 100',
                                        'cash_balance': '現金及び預金残高',
                                        'operating_cf': '営業活動によるキャッシュ・フロー',
                                        'investing_cf': '投資活動によるキャッシュ・フロー',
                                        'free_cf': '営業CF + 投資CF',

                                        // Safety
                                        'equity_ratio': '純資産 ÷ 総資産 × 100',
                                        'debt_dependency': '有利子負債合計 ÷ 総資産 × 100',
                                        'interest_coverage': '(経常利益 + 受取利息 + 受取配当金) ÷ 支払利息',
                                        'altman_z_score': '1.2×(運転資本÷総資産) + 1.4×(利益剰余金÷総資産) + 3.3×(営業利益÷総資産) + 0.6×(純資産÷負債) + 1.0×(売上高÷総資産)',
                                        'piotroski_f_score': '9項目の財務健全性チェック（各1点、合計0-9点）',

                                        // Profitability
                                        'operating_margin': '営業利益 ÷ 売上高 × 100',
                                        'net_income': '当期純利益',
                                        'roe': '当期純利益 ÷ 自己資本 × 100',
                                        'roa': '当期純利益 ÷ 総資産 × 100',
                                        'roic': 'NOPAT（税引後営業利益） ÷ 投下資本 × 100',
                                        'ebitda': '営業利益 + 減価償却費',
                                        'sales_growth_yoy': '(当期売上 - 前期売上) ÷ 前期売上 × 100',
                                        'op_profit_growth_yoy': '(当期営業利益 - 前期営業利益) ÷ 前期営業利益 × 100',
                                        'dupont_profit_margin': '当期純利益 ÷ 売上高 × 100',

                                        // Efficiency
                                        'cash_conversion_cycle': '売上債権回転期間 + 棚卸資産回転期間 - 買入債務回転期間',
                                        'working_capital_turnover': '売上高 ÷ 運転資本',
                                        'dupont_asset_turnover': '売上高 ÷ 総資産',

                                        // Market Value
                                        'ev_ebitda': '企業価値(EV) ÷ EBITDA',
                                        'total_market_cap': '推定株価 × 発行済株式数',

                                        // Shareholder Perspective
                                        'eps': '当期純利益 ÷ 発行済株式数（20万株）',
                                        'bps': '自己資本 ÷ 発行済株式数（20万株）',
                                        'estimated_stock_price_pbr': 'BPS × 業界平均PBR（1.5倍）',
                                        'dupont_equity_multiplier': '総資産 ÷ 自己資本',
                                    };

                                    const purposes: Record<string, string> = {
                                        // P/L Metrics
                                        'sales': '企業の主たる営業活動から得られる収益。事業規模を示す。',
                                        'cogs': '売上に対応する直接的な費用。原価管理の基礎。',
                                        'gross_profit': '粗利益。売上から原価を引いた基本的な利益。',
                                        'sga': '営業活動に必要な経費。販売費と一般管理費の合計。',
                                        'operating_profit': '本業の利益。企業の本業での稼ぐ力を示す。',
                                        'ordinary_profit': '本業に営業外損益を加味した利益。全体的な収益力。',

                                        // Liquidity
                                        'current_ratio': '短期的な支払い能力を測定。100%以上が望ましい。',
                                        'quick_ratio': 'より厳格な短期支払い能力。在庫を除外した流動性を評価。',
                                        'cash_balance': '手元資金の状況を把握。資金繰りの安全性を確認。',
                                        'operating_cf': '本業での現金創出力。プラスであれば健全。',
                                        'investing_cf': '設備投資などの状況。通常マイナス（投資）。',
                                        'free_cf': '自由に使える現金。プラスが理想的。',

                                        // Safety
                                        'equity_ratio': '財務安全性の基本指標。高いほど倒産リスクが低い。',
                                        'debt_dependency': '借入依存度。低いほど財務的に安全。',
                                        'interest_coverage': '金利支払能力。高いほど安全。1倍未満は危険。',
                                        'altman_z_score': '倒産リスク予測。2.99超:安全、1.81-2.99:注意、1.81未満:危険',
                                        'piotroski_f_score': '財務健全性の総合評価。8-9点:優良、0-2点:要注意',

                                        // Profitability
                                        'operating_margin': '本業での収益力。業界平均との比較が重要。',
                                        'net_income': '最終的な利益額。企業の収益の源泉。',
                                        'roe': '株主資本の効率性。10%以上が一般的な目標。',
                                        'roa': '資産の効率的活用度。業種により基準が異なる。',
                                        'roic': '投下資本の効率性。WACC超が価値創造の目安。',
                                        'ebitda': 'キャッシュ創出力の指標。M&A評価に活用。',
                                        'sales_growth_yoy': '売上の成長性。業界平均との比較が重要。',
                                        'op_profit_growth_yoy': '営業利益の成長性。収益力の向上を示す。',
                                        'dupont_profit_margin': 'ROE分解分析の第1要素。売上利益率を示す。',

                                        // Efficiency
                                        'cash_conversion_cycle': '現金化サイクルの効率性。短いほど効率的。',
                                        'working_capital_turnover': '運転資本の効率性。高いほど資金効率が良い。',
                                        'dupont_asset_turnover': 'ROE分解分析の第2要素。資産回転率を示す。',

                                        // Market Value
                                        'ev_ebitda': '企業価値の割安性。低いほど割安とされる。',
                                        'total_market_cap': '企業の市場価値の推定。投資判断の参考値。',

                                        // Shareholder Perspective
                                        'eps': '株主の利益配当の基礎。高いほど株主還元力がある。',
                                        'bps': '株式の理論価値。株価との比較で割安性を判断。',
                                        'estimated_stock_price_pbr': '純資産ベースの理論株価。PBR1.5倍を想定。',
                                        'dupont_equity_multiplier': 'ROE分解分析の第3要素。財務レバレッジを示す。',
                                    };

                                    return (
                                        <TableRow key={def.id} className="hover:bg-slate-50">
                                            <TableCell className="font-medium text-sm">
                                                {def.labelJp}<br />
                                                <span className="text-xs text-slate-500">{def.labelEng}</span>
                                            </TableCell>
                                            <TableCell className="text-xs font-mono bg-slate-50">
                                                {formulas[def.id] || def.meaning}
                                            </TableCell>
                                            <TableCell className="text-sm text-slate-700">
                                                {purposes[def.id] || def.meaning}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>

            {/* Actionable Comments */}
            <Card>
                <CardHeader>
                    <CardTitle>Analysis & Action Plan</CardTitle>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[300px]">
                        <div className="space-y-4">
                            {MONTH_INDICES.map((m, i) => {
                                const msgs = report.comments[m];
                                if (!msgs || msgs.length === 0) return null;
                                return (
                                    <div key={m} className="border-b pb-2">
                                        <h4 className="font-bold text-sm text-slate-700 mb-1">{MONTH_NAMES[i]} Analysis</h4>
                                        <ul className="list-disc list-inside space-y-1">
                                            {msgs.map((msg, idx) => (
                                                <li key={idx} className="text-sm text-slate-600">
                                                    {msg}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })}
                            {Object.values(report.comments).every(arr => arr.length === 0) && (
                                <p className="text-sm text-gray-500 italic">No critical issues detected based on current thresholds.</p>
                            )}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}
