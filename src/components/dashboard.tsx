"use client"

import { useMemo, useState, useEffect } from 'react';
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, ComposedChart, Cell, ReferenceLine
} from 'recharts';
import { Card } from '@/components/ui/card';
import { FinancialReport } from '@/lib/financial-analyzer';
import { PnLData } from '@/lib/types';

interface DashboardProps {
    report: FinancialReport;
    data: PnLData;
}

export function Dashboard({ report, data }: DashboardProps) {
    // Delayed mounting to ensure ResponsiveContainer can measure correctly
    const [isChartReady, setIsChartReady] = useState(false);

    useEffect(() => {
        // Use setTimeout with longer delay to ensure DOM is fully rendered
        const timer = setTimeout(() => {
            setIsChartReady(true);
        }, 200);
        return () => clearTimeout(timer);
    }, []);

    const monthNames = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    const monthIndices = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];

    // --- Helper: Format Numbers (Millions of Yen) ---
    const formatMillion = (val: number) => {
        return (val / 1000000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    };

    // --- Data Preparation: Monthly Trends ---
    const chartData = useMemo(() => {
        return monthIndices.map((mIdx, i) => {
            const sales = report.values['sales']?.[mIdx] || 0;
            const opProfit = report.values['operating_profit']?.[mIdx] || 0;
            // Compute margin directly from fetched values to avoid inconsistency
            const margin = sales ? parseFloat(((opProfit / sales) * 100).toFixed(1)) : 0;
            const opCF = report.values['operating_cf']?.[mIdx] || 0;
            const invCF = report.values['investing_cf']?.[mIdx] || 0;
            const fcf = report.values['free_cf']?.[mIdx] || 0;
            const cash = report.values['cash_balance']?.[mIdx] || 0;

            return {
                name: monthNames[i],
                sales: sales / 1000,
                opProfit: opProfit / 1000,
                margin,
                opCF: opCF / 1000,
                invCF: invCF / 1000,
                fcf: fcf / 1000,
                cash: cash / 1000
            };
        });
    }, [report, monthIndices]);

    // --- Data Preparation: YTD Cumulative ---
    // Accumulate monthly values to create proper cumulative trend
    // Use report.values to match KPI calculations
    const ytdData = useMemo(() => {
        let cumActual = 0;
        let cumBudget = 0;
        let cumProfit = 0;

        return monthIndices.map((mIdx, i) => {
            // Use sales from report.values to match KPI
            const monthActual = report.values['sales']?.[mIdx] || 0;
            // For budget, we need to get it from data rows with code 9601
            const salesRow = data.rows.find(r => r.code?.includes('9601') && r.department.includes('損益計算書'));
            const monthBudget = salesRow?.monthlyData[mIdx]?.budget || 0;
            const monthProfit = report.values['operating_profit']?.[mIdx] || 0;

            cumActual += monthActual;
            cumBudget += monthBudget;
            cumProfit += monthProfit;

            return {
                name: monthNames[i],
                cumActual: cumActual / 1000,
                cumBudget: cumBudget / 1000,
                cumProfit: cumProfit / 1000
            };
        });
    }, [data, report, monthIndices]);

    // --- Data Preparation: Waterfall (Profit structure) ---
    // Using Current Month (or latest month with data) for waterfall
    const waterfallData = useMemo(() => {
        const latestMonth = [...monthIndices].reverse().find(m => data.totals.monthly[m]?.actual !== 0) ?? 3;
        
        const appMode = data.appMode || 'standard';

        const sales = report.values['sales']?.[latestMonth] || 0;
        const cogs = report.values['cogs']?.[latestMonth] || 0;
        const gross = report.values['gross_profit']?.[latestMonth] || 0;
        const sga = report.values['sga']?.[latestMonth] || 0;
        const op = report.values['operating_profit']?.[latestMonth] || 0;

        if (appMode === 'manufacturing') {
            const mat = report.values['mfg_material_cost']?.[latestMonth] || 0;
            const lab = report.values['mfg_labor_cost']?.[latestMonth] || 0;
            const exp = report.values['mfg_expenses']?.[latestMonth] || 0;

            return [
                { name: '売上高', value: sales / 1000, start: 0, fill: '#6366f1' },
                { name: '材料費', value: -mat / 1000, start: sales / 1000, fill: '#f59e0b' },
                { name: '労務費', value: -lab / 1000, start: (sales - mat) / 1000, fill: '#fbbf24' },
                { name: '製造経費', value: -exp / 1000, start: (sales - mat - lab) / 1000, fill: '#fcd34d' },
                { name: '売上総利益', value: gross / 1000, start: 0, fill: '#4f46e5' },
                { name: '営業利益', value: op / 1000, start: 0, fill: '#4338ca' },
            ]
        }

        return [
            { name: '売上高', value: sales / 1000, start: 0, fill: '#6366f1' },
            { name: '売上原価', value: -cogs / 1000, start: sales / 1000, fill: '#ef4444' },
            { name: '売上総利益', value: gross / 1000, start: 0, fill: '#4f46e5' },
            { name: '販売管理費', value: -sga / 1000, start: gross / 1000, fill: '#f87171' },
            { name: '営業利益', value: op / 1000, start: 0, fill: '#4338ca' },
        ]
    }, [report, data, monthIndices]);

    // --- Data Preparation: Manufacturing Trend ---
    const manufacturingTrendData = useMemo(() => {
        if (data.appMode !== 'manufacturing') return [];
        return monthIndices.map((mIdx, i) => ({
            name: monthNames[i],
            material: (report.values['mfg_material_cost']?.[mIdx] || 0) / 1000,
            labor: (report.values['mfg_labor_cost']?.[mIdx] || 0) / 1000,
            expenses: (report.values['mfg_expenses']?.[mIdx] || 0) / 1000,
            total: (report.values['mfg_total_cost']?.[mIdx] || 0) / 1000,
        }));
    }, [report, data, monthIndices]);

    // --- Data Preparation: Advanced Metrics Charts ---
    // Chart 1: Z-Score & F-Score trend
    const healthScoreData = useMemo(() => {
        return monthIndices.map((mIdx, i) => ({
            name: monthNames[i],
            zScore: report.values['altman_z_score']?.[mIdx] || 0,
            fScore: report.values['piotroski_f_score']?.[mIdx] || 0
        }));
    }, [report, monthIndices]);

    // Chart 2: ROIC vs ROE vs ROA
    const profitabilityData = useMemo(() => {
        return monthIndices.map((mIdx, i) => ({
            name: monthNames[i],
            roic: report.values['roic']?.[mIdx] || 0,
            roe: report.values['roe']?.[mIdx] || 0,
            roa: report.values['roa']?.[mIdx] || 0
        }));
    }, [report, monthIndices]);

    // Chart 3: CCC Analysis
    const cccData = useMemo(() => {
        return monthIndices.map((mIdx, i) => ({
            name: monthNames[i],
            ccc: report.values['cash_conversion_cycle']?.[mIdx] || 0
        }));
    }, [report, monthIndices]);

    // Chart 4: Growth Rates (YoY)
    const growthData = useMemo(() => {
        return [{
            metric: '売上',
            growth: report.values['sales_growth_yoy']?.['FY'] || 0
        }, {
            metric: '営業利益',
            growth: report.values['op_profit_growth_yoy']?.['FY'] || 0
        }, {
            metric: 'EPS',
            growth: (() => {
                const currentEPS = report.values['eps']?.['FY'] || 0;
                const prevEPS = 100; // 仮定: 前年EPS（実際のデータがない場合）
                return prevEPS ? ((currentEPS - prevEPS) / prevEPS) * 100 : 0;
            })()
        }];
    }, [report]);

    // Chart 5: EBITDA & EV/EBITDA
    const ebitdaData = useMemo(() => {
        return monthIndices.map((mIdx, i) => ({
            name: monthNames[i],
            ebitda: (report.values['ebitda']?.[mIdx] || 0) / 1000,
            evEbitda: report.values['ev_ebitda']?.[mIdx] || 0
        }));
    }, [report, monthIndices]);

    // Chart 6: DuPont Analysis (ROE Decomposition)
    const dupontData = useMemo(() => {
        const profitMargin = report.values['dupont_profit_margin']?.['FY'] || 0;
        const assetTurnover = report.values['dupont_asset_turnover']?.['FY'] || 0;
        const equityMultiplier = report.values['dupont_equity_multiplier']?.['FY'] || 0;
        const roe = report.values['roe']?.['FY'] || 0;

        return [
            { component: '純利益率', value: profitMargin, color: '#6366f1' },
            { component: '資産回転率', value: assetTurnover * 10, color: '#8b5cf6' }, // x10 for visibility
            { component: 'レバレッジ', value: equityMultiplier * 10, color: '#a855f7' }, // x10 for visibility
            { component: 'ROE', value: roe, color: '#4f46e5' }
        ];
    }, [report]);

    // --- Data Preparation: Departmental Comparison ---
    const departmentalPerformanceData = useMemo(() => {
        const TARGET_DEPTS = ['イズライフ事業部', 'プローン事業部', 'ブランチ事業部'];
        return TARGET_DEPTS.map(deptName => {
            const rows = data.rows.filter(r => r.department.includes(deptName) || (r.subject && r.subject.includes(deptName)));
            const sales = rows.filter(r => r.code?.includes('9821')).reduce((sum, r) => sum + r.totalAnnual.actual, 0);
            const profit = rows.filter(r => r.code?.includes('9861')).reduce((sum, r) => sum + r.totalAnnual.actual, 0);
            return { name: deptName, sales, profit, margin: sales ? (profit / sales) * 100 : 0 };
        }).filter(d => d.sales !== 0 || d.profit !== 0);
    }, [data]);

    // Custom tooltips and renderers
    const formatValue = (val: number, name: string) => {
        if (name.includes('%') || name.includes('率') || name.includes('Margin') || name.includes('Ratio')) {
            return `${val.toFixed(1)}%`;
        }
        // Dashboard uses thousands (千円) by default.
        return `${Math.floor(val).toLocaleString()}`;
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white p-3 border border-slate-200 shadow-lg rounded-md text-sm">
                    <p className="font-bold text-slate-900 border-b pb-1 mb-1">{label}</p>
                    {payload.map((item: any) => (
                        <div key={item.name} className="flex justify-between gap-4 py-0.5">
                            <span style={{ color: item.color }}>{item.name}:</span>
                            <span className="font-mono font-bold">
                                {formatValue(item.value, item.name)}
                            </span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    const totalAnnualSales = report.values['sales']?.['FY'] || 0;

    // Check if we have valid data
    if (totalAnnualSales === 0) {
        return (
            <div className="p-8 text-center bg-yellow-50 border border-yellow-200 rounded-lg">
                <h3 className="text-lg font-bold text-yellow-800 mb-2">データが見つかりません (No Data Found)</h3>
                <p className="text-yellow-700">
                    売上データが集計されていません。Excelファイルに「損益計算書」シートが含まれているか確認してください。<br />
                    また、シート名が正確か（スペースなどが含まれていないか）も確認してください。
                </p>
                <div className="mt-4 text-sm text-yellow-600">
                    現在のデータ内のシート: {data.departments?.join(', ') || '(シート情報なし)'}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {!isChartReady && (
                <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-lg">
                    <p className="text-slate-600">ダッシュボードを読み込んでいます...</p>
                </div>
            )}

            <div className={isChartReady ? 'block' : 'hidden'}>
                {/* --- Financial Safety Grid (Moved to TOP) --- */}
                <Card className="p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                            <div className="w-1 h-6 bg-indigo-600 rounded-full" />
                            財務健全性・信用力チェック <span className="text-sm font-normal text-slate-500 ml-2">(Financial Health & Credit Check)</span>
                        </h3>
                        <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border">単位: 千円</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                        <SafetyMetric label="自己資本比率" value={report.values['equity_ratio']?.['FY'] || 0} unit="%" threshold={40} />
                        <SafetyMetric label="流動比率" value={report.values['current_ratio']?.['FY'] || 0} unit="%" threshold={150} />
                        <SafetyMetric label="当座比率" value={report.values['quick_ratio']?.['FY'] || 0} unit="%" threshold={100} />
                        <SafetyMetric label="有利子負債依存度" value={report.values['debt_dependency']?.['FY'] || 0} unit="%" threshold={50} isInverse />
                        <SafetyMetric label="利払い能力" value={Math.max(0, report.values['interest_coverage']?.['FY'] || 0)} unit="倍" threshold={1.5} />
                        <SafetyMetric label="損益分岐点比率" value={report.values['breakeven_ratio']?.['FY'] || 0} unit="%" threshold={80} isInverse />
                    </div>
                </Card>

                {/* --- KPI Overview --- */}
                <div className="flex justify-end mb-2">
                    <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border">単位: 千円</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    <KPIItem
                        title="売上高"
                        value={Math.floor((report.values['sales']?.['FY'] || 0) / 1000)}
                        budgetValue={Math.floor((report.values['sales_budget']?.['FY'] || 0) / 1000)}
                        unit=""
                        isAmount
                    />
                    <KPIItem
                        title="粗利益率"
                        value={(() => {
                            const sales = report.values['sales']?.['FY'] || 0;
                            const grossProfit = report.values['gross_profit']?.['FY'] || 0;
                            return sales ? parseFloat(((grossProfit / sales) * 100).toFixed(1)) : 0;
                        })()}
                        unit="%"
                    />
                    <KPIItem
                        title="営業利益"
                        value={Math.floor((report.values['operating_profit']?.['FY'] || 0) / 1000)}
                        budgetValue={Math.floor((report.values['operating_profit_budget']?.['FY'] || 0) / 1000)}
                        unit=""
                        isAmount
                    />
                    <KPIItem
                        title="営業利益率"
                        value={(() => {
                            const sales = report.values['sales']?.['FY'] || 0;
                            const opProfit = report.values['operating_profit']?.['FY'] || 0;
                            return sales ? parseFloat(((opProfit / sales) * 100).toFixed(1)) : 0;
                        })()}
                        unit="%"
                    />
                    <KPIItem
                        title="経常利益"
                        value={Math.floor((report.values['ordinary_profit']?.['FY'] || 0) / 1000)}
                        budgetValue={Math.floor((report.values['ordinary_profit_budget']?.['FY'] || 0) / 1000)}
                        unit=""
                        isAmount
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* --- Waterfall: Profit Structure --- */}
                    <Card className="p-6 overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <div className="w-1 h-6 bg-indigo-600 rounded-full" />
                                利益構造分析 <span className="text-sm font-normal text-slate-500 ml-2">(Profit Structure Analysis)</span>
                            </h3>
                            <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border">単位: 千円</span>
                        </div>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={waterfallData} layout="horizontal">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                    <XAxis type="category" dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                                    <YAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                        {waterfallData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    <Card className="p-6 overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <div className="w-1 h-6 bg-indigo-600 rounded-full" />
                                累計実績推移 <span className="text-sm font-normal text-slate-500 ml-2">(Cumulative YTD Trend)</span>
                            </h3>
                            <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border">単位: 千円</span>
                        </div>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={ytdData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${Math.floor(val).toLocaleString()}`} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend iconType="circle" />
                                    <Area type="monotone" dataKey="cumActual" name="累計売上高" fill="#eff6ff" stroke="#3b82f6" />
                                    <Line type="monotone" dataKey="cumBudget" name="予算ライン" stroke="#94a3b8" strokeDasharray="5 5" dot={false} />
                                    <Line type="monotone" dataKey="cumProfit" name="累計営業利益" stroke="#1e293b" strokeWidth={2} dot={false} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* --- 1. Departmental Comparison (IsLife, Plone, Branch) --- */}
                    <Card className="p-6 overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <div className="w-1 h-6 bg-indigo-600 rounded-full" />
                                事業部別売上・利益（通期）<span className="text-sm font-normal text-slate-500 ml-2">(Full Year - 3 Business Units)</span>
                            </h3>
                            <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border">単位: 千円</span>
                        </div>
                        <div className="h-52">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={departmentalPerformanceData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                                    <YAxis
                                        yAxisId="left"
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(val) => `${Math.floor(val / 1000).toLocaleString()}`}
                                    />
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(val) => `${Math.floor(val / 1000).toLocaleString()}`}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend iconType="circle" />
                                    <Bar yAxisId="left" dataKey="sales" name="売上高" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                    <Line yAxisId="right" type="monotone" dataKey="profit" name="利益" stroke="#4338ca" strokeWidth={3} dot={{ r: 4, fill: "#4338ca" }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                        {/* Comparison table */}
                        <table className="w-full text-xs mt-3 border-t border-slate-100">
                            <thead className="text-slate-400 bg-slate-50">
                                <tr>
                                    <th className="px-2 py-1.5 text-left font-semibold">事業部</th>
                                    <th className="px-2 py-1.5 text-right font-semibold">売上高（通期）</th>
                                    <th className="px-2 py-1.5 text-right font-semibold">営業利益</th>
                                    <th className="px-2 py-1.5 text-right font-semibold">利益率</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {departmentalPerformanceData.map((d, i) => (
                                    <tr key={i} className="hover:bg-slate-50">
                                        <td className="px-2 py-1.5 font-medium text-slate-700">{d.name}</td>
                                        <td className="px-2 py-1.5 text-right">{Math.floor(d.sales / 1000).toLocaleString()}</td>
                                        <td className={`px-2 py-1.5 text-right font-bold ${d.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{Math.floor(d.profit / 1000).toLocaleString()}</td>
                                        <td className={`px-2 py-1.5 text-right ${d.margin >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>{d.margin.toFixed(1)}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Card>

                    {/* --- 2. SGA Top 10 Analysis --- */}
                    <Card className="p-6 overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <div className="w-1 h-6 bg-indigo-600 rounded-full" />
                                販管費 TOP 10 分析 <span className="text-sm font-normal text-slate-500 ml-2">(SG&A Top 10 Analysis)</span>
                            </h3>
                            <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border">単位: 千円</span>
                        </div>
                        <div className="overflow-x-auto h-80 scrollbar-hide">
                            <table className="w-full text-xs text-left">
                                <thead className="text-slate-400 bg-slate-50 uppercase tracking-wider sticky top-0">
                                    <tr>
                                        <th className="px-2 py-2">科目</th>
                                        <th className="px-2 py-2 text-right">累計</th>
                                        <th className="px-2 py-2 text-right">月平均</th>
                                        <th className="px-2 py-2 text-right">前年比</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {report.sgaTop10?.map((item, idx) => {
                                        const yoy = item.prevTotal ? ((item.total / item.prevTotal) - 1) * 100 : 0;
                                        const yoyColor = yoy > 5 ? "text-rose-500 font-bold" : yoy < -5 ? "text-emerald-500 font-bold" : "text-slate-500";
                                        return (
                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-2 py-3 font-medium text-slate-700">{item.subject}</td>
                                                <td className="px-2 py-3 text-right">{Math.floor(item.total / 1000).toLocaleString()}</td>
                                                <td className="px-2 py-3 text-right">{Math.floor(item.avg / 1000).toLocaleString()}</td>
                                                <td className={`px-2 py-3 text-right ${yoyColor}`}>
                                                    {yoy > 0 ? "+" : ""}{yoy.toFixed(1)}%
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {/* --- 3. Sales & Profit Performance --- */}
                    <Card className="p-6">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <div className="w-1 h-6 bg-indigo-600 rounded-full" />
                                売上高・営業利益推移 <span className="text-sm font-normal text-slate-500 ml-2">(Monthly Sales & Operating Profit)</span>
                            </h3>
                            <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border">単位: 千円</span>
                        </div>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                                    <YAxis
                                        yAxisId="left"
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(val) => `${Math.floor(val).toLocaleString()}`}
                                        label={{ value: '金額 (千円)', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }}
                                    />
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(val) => `${val.toFixed(1)}%`}
                                        label={{ value: '利益率 (%)', angle: 90, position: 'insideRight', style: { fontSize: 10 } }}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend iconType="circle" />
                                    <Bar yAxisId="left" dataKey="sales" name="売上高" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                    <Line yAxisId="left" type="monotone" dataKey="opProfit" name="営業利益" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: "#10b981" }} />
                                    <Line yAxisId="right" type="monotone" dataKey="margin" name="利益率" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: "#f59e0b" }} strokeDasharray="5 5" />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                </div>

                {data.appMode === 'manufacturing' && (
                    <div className="mt-8">
                        <Card className="p-6 overflow-hidden">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-lg font-bold flex items-center gap-2">
                                    <div className="w-1 h-6 bg-amber-500 rounded-full" />
                                    製造原価構成推移 <span className="text-sm font-normal text-slate-500 ml-2">(Manufacturing Cost Trend)</span>
                                </h3>
                                <div className="flex gap-2">
                                    <MetricExplainer
                                        name="製造原価の3要素"
                                        explanation="製造原価は大きく分けて3つの要素で構成されます。\n\n• 材料費: 製品の製造に直接または間接的に消費される材料の価値。\n• 労務費: 製品の製造に従事する労働力の労働に対して支払われる価値。\n• 製造経費: 材料費・労務費以外のすべての製造費用（減価償却費、水道光熱費など）。"
                                    />
                                    <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border self-center">単位: 千円</span>
                                </div>
                            </div>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={manufacturingTrendData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                                        <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `${Math.floor(val).toLocaleString()}`} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend iconType="circle" />
                                        <Bar dataKey="material" name="材料費" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                                        <Bar dataKey="labor" name="労務費" stackId="a" fill="#fbbf24" radius={[0, 0, 0, 0]} />
                                        <Bar dataKey="expenses" name="製造経費" stackId="a" fill="#fcd34d" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                    </div>
                )}

                {/* === Advanced Financial Metrics Charts === */}
                <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4 border-b-2 border-indigo-600 pb-2">
                    先進的財務指標 <span className="text-lg font-normal text-slate-500">(Advanced Financial Metrics)</span>
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Chart 1: Health Scores (Z-Score & F-Score) */}
                    <Card className="p-6 overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <div className="w-1 h-6 bg-indigo-600 rounded-full" />
                                企業健全性スコア <span className="text-sm font-normal text-slate-500 ml-2">(Health Scores)</span>
                            </h3>
                        </div>
                        <div className="flex gap-2 mb-3">
                            <MetricExplainer
                                name="Altman Z-Score"
                                explanation="倒産予測モデル。5つの財務比率を組み合わせて企業の財務健全性を評価します。\n\n判定基準:\n• Z > 2.99: 安全ゾーン（倒産リスク低）\n• 1.81 < Z < 2.99: グレーゾーン（要注意）\n• Z < 1.81: 危険ゾーン（倒産リスク高）\n\n計算式: Z = 1.2×運転資本/総資産 + 1.4×利益剰余金/総資産 + 3.3×EBIT/総資産 + 0.6×自己資本/負債 + 1.0×売上高/総資産"
                            />
                            <MetricExplainer
                                name="Piotroski F-Score"
                                explanation="財務健全性を9つの基準で評価するスコア（0-9点）。\n\n判定基準:\n• 8-9点: 非常に健全\n• 5-7点: 健全\n• 3-4点: 普通\n• 0-2点: 脆弱\n\n評価項目:\n【収益性】ROA、営業CF、ROA改善、CF品質\n【レバレッジ】負債減少、流動比率改善、株式希薄化なし\n【効率性】粗利率改善、資産回転率改善"
                            />
                        </div>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={healthScoreData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                                    <YAxis yAxisId="left" fontSize={11} tickLine={false} axisLine={false} label={{ value: 'Z-Score', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }} />
                                    <YAxis yAxisId="right" orientation="right" fontSize={11} tickLine={false} axisLine={false} domain={[0, 9]} label={{ value: 'F-Score', angle: 90, position: 'insideRight', style: { fontSize: 10 } }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend iconType="circle" />
                                    <Line yAxisId="left" type="monotone" dataKey="zScore" name="Altman Z-Score" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                                    <Line yAxisId="right" type="monotone" dataKey="fScore" name="Piotroski F-Score" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} />
                                    <ReferenceLine yAxisId="left" y={2.99} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Safe', position: 'right', fontSize: 9 }} />
                                    <ReferenceLine yAxisId="left" y={1.81} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Risk', position: 'right', fontSize: 9 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    {/* Chart 2: Profitability Comparison */}
                    <Card className="p-6 overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <div className="w-1 h-6 bg-indigo-600 rounded-full" />
                                収益力比較 <span className="text-sm font-normal text-slate-500 ml-2">(Profitability)</span>
                            </h3>
                            <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border">単位: %</span>
                        </div>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={profitabilityData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                                    <YAxis fontSize={11} tickLine={false} axisLine={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend iconType="circle" />
                                    <Line type="monotone" dataKey="roic" name="ROIC" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} />
                                    <Line type="monotone" dataKey="roe" name="ROE" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} />
                                    <Line type="monotone" dataKey="roa" name="ROA" stroke="#a855f7" strokeWidth={3} dot={{ r: 4 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Chart 3: CCC */}
                    <Card className="p-6 overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <div className="w-1 h-6 bg-indigo-600 rounded-full" />
                                CCC推移 <span className="text-sm font-normal text-slate-500 ml-2">(Cash Conversion Cycle)</span>
                            </h3>
                            <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border">単位: 日</span>
                        </div>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={cccData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                                    <YAxis fontSize={11} tickLine={false} axisLine={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend iconType="circle" />
                                    <Area type="monotone" dataKey="ccc" name

                                        ="CCC (日数)" fill="#ddd6fe" stroke="#8b5cf6" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    {/* Chart 4: Growth Rates */}
                    <Card className="p-6 overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <div className="w-1 h-6 bg-indigo-600 rounded-full" />
                                成長率（YoY） <span className="text-sm font-normal text-slate-500 ml-2">(Growth Rates)</span>
                            </h3>
                            <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border">単位: %</span>
                        </div>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={growthData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="metric" fontSize={11} tickLine={false} axisLine={false} />
                                    <YAxis fontSize={11} tickLine={false} axisLine={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="growth" name="成長率" radius={[4, 4, 0, 0]}>
                                        {growthData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.growth >= 0 ? '#10b981' : '#ef4444'} />
                                        ))}
                                    </Bar>
                                    <ReferenceLine y={0} stroke="#94a3b8" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </div>

                {/* === 仮想株価分析 (20万株) === */}
                {(() => {
                    const TOTAL_SHARES = 200000;
                    const equity = (() => {
                        // Derive equity from ROE and net income (FY), or use BPS*shares
                        const bps = report.values['bps']?.['FY'] || 0;
                        return bps * TOTAL_SHARES;
                    })();
                    const eps = report.values['eps']?.['FY'] || 0;
                    const bps = report.values['bps']?.['FY'] || 0;
                    const estPrice = report.values['estimated_stock_price_pbr']?.['FY'] || 0;
                    const marketCap = estPrice * TOTAL_SHARES;
                    const roe = report.values['roe']?.['FY'] || 0;
                    const roa = report.values['roa']?.['FY'] || 0;
                    const ebitda = (report.values['ebitda']?.['FY'] || 0);
                    const sales = report.values['sales']?.['FY'] || 0;
                    const ebitdaMargin = sales ? (ebitda / sales) * 100 : 0;
                    const evEbitda = report.values['ev_ebitda']?.['FY'] || 0;

                    return (
                        <Card className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold flex items-center gap-2">
                                    <div className="w-1 h-6 bg-violet-600 rounded-full" />
                                    仮想株価分析（発行済株式 20万株）<span className="text-sm font-normal text-slate-500 ml-2">(Virtual Stock Price Analysis)</span>
                                </h3>
                                <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border">PBR法 × 1.5倍</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                                <StockMetric label="EPS" sub="1株当たり純利益" value={eps.toLocaleString(undefined, { maximumFractionDigits: 0 })} unit="円" />
                                <StockMetric label="BPS" sub="1株当たり純資産" value={bps.toLocaleString(undefined, { maximumFractionDigits: 0 })} unit="円" />
                                <StockMetric label="推定株価" sub="PBR法 (×1.5)" value={estPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })} unit="円" highlight />
                                <StockMetric label="推定時価総額" sub="株価×20万株" value={`${(marketCap / 1000000).toFixed(1)}百万`} unit="円" />
                                <StockMetric label="ROE" sub="自己資本利益率" value={roe.toFixed(1)} unit="%" color={roe > 8 ? 'emerald' : 'amber'} />
                                <StockMetric label="ROA" sub="総資産利益率" value={roa.toFixed(1)} unit="%" color={roa > 5 ? 'emerald' : 'amber'} />
                                <StockMetric label="EBITDA率" sub="EBITDA / 売上高" value={ebitdaMargin.toFixed(1)} unit="%" color={ebitdaMargin > 10 ? 'emerald' : 'amber'} />
                            </div>
                            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-6 text-xs text-slate-500">
                                <span>EV/EBITDA: <span className="font-bold text-slate-700">{evEbitda.toFixed(1)}倍</span></span>
                                <span>EBITDA: <span className="font-bold text-slate-700">{(ebitda / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}千円</span></span>
                                <span className="text-[10px] text-slate-400">※ 推定株価 = BPS × 業界平均PBR（1.5倍）。ROE・ROAは当期純利益ベース。</span>
                            </div>
                        </Card>
                    );
                })()}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Chart 5: EBITDA */}
                    <Card className="p-6 overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <div className="w-1 h-6 bg-indigo-600 rounded-full" />
                                EBITDA分析 <span className="text-sm font-normal text-slate-500 ml-2">(EBITDA Analysis)</span>
                            </h3>
                        </div>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={ebitdaData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                                    <YAxis yAxisId="left" fontSize={11} tickLine={false} axisLine={false} label={{ value: 'EBITDA (千円)', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }} />
                                    <YAxis yAxisId="right" orientation="right" fontSize={11} tickLine={false} axisLine={false} label={{ value: 'EV/EBITDA', angle: 90, position: 'insideRight', style: { fontSize: 10 } }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend iconType="circle" />
                                    <Bar yAxisId="left" dataKey="ebitda" name="EBITDA" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                    <Line yAxisId="right" type="monotone" dataKey="evEbitda" name="EV/EBITDA" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    {/* Chart 6: DuPont */}
                    <Card className="p-6 overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <div className="w-1 h-6 bg-indigo-600 rounded-full" />
                                デュポン分析 <span className="text-sm font-normal text-slate-500 ml-2">(DuPont ROE)</span>
                            </h3>
                        </div>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dupontData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                    <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
                                    <YAxis type="category" dataKey="component" fontSize={11} tickLine={false} axisLine={false} width={100} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="value" name="値" radius={[0, 4, 4, 0]}>
                                        {dupontData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">※資産回転率とレバレッジは10倍表示</p>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function KPIItem({ title, value, budgetValue, unit, isAmount }: { title: string, value: number, budgetValue?: number, unit: string, isAmount?: boolean }) {
    const displayValue = isAmount ? value.toLocaleString() : value.toFixed(1);
    const displayBudget = budgetValue !== undefined ? (isAmount ? budgetValue.toLocaleString() : budgetValue.toFixed(1)) : null;

    return (
        <Card className="p-3 bg-slate-900 border-none shadow-xl flex flex-col justify-between">
            <div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">{title}</p>
                <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-white tracking-tight">{displayValue}</span>
                    <span className="text-slate-500 text-[11px] font-bold">{unit}</span>
                </div>
            </div>
            {displayBudget !== null && (
                <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between items-center">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Budget</span>
                    <span className="text-[11px] font-mono font-bold text-indigo-400">{displayBudget}</span>
                </div>
            )}
        </Card>
    );
}

function SafetyMetric({ label, value, unit, threshold, isInverse }: { label: string, value: number, unit: string, threshold: number, isInverse?: boolean }) {
    const isOk = isInverse ? value < threshold : value > threshold;
    const statusColor = value === 0 ? "text-slate-300" : isOk ? "text-indigo-600" : "text-rose-600";
    const statusBg = value === 0 ? "bg-slate-50" : isOk ? "bg-indigo-50" : "bg-rose-50";

    return (
        <div className={`p-4 rounded-xl ${statusBg} transition-all duration-300`}>
            <p className="text-slate-500 text-sm font-medium mb-1">{label}</p>
            <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${statusColor}`}>{value.toFixed(1)}</span>
                <span className="text-slate-400 text-xs">{unit}</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">
                目安: {isInverse ? `${threshold}${unit}以下` : `${threshold}${unit}以上`}
            </p>
        </div>
    );
}

function StockMetric({ label, sub, value, unit, highlight, color }: { label: string, sub: string, value: string, unit: string, highlight?: boolean, color?: string }) {
    const bg = highlight ? 'bg-violet-50 border-violet-200' : 'bg-slate-50 border-slate-200';
    const textColor = color === 'emerald' ? 'text-emerald-600' : color === 'amber' ? 'text-amber-600' : highlight ? 'text-violet-700' : 'text-slate-800';
    return (
        <div className={`p-3 rounded-xl border ${bg}`}>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
            <p className="text-[9px] text-slate-400 mb-1">{sub}</p>
            <div className={`text-lg font-bold ${textColor}`}>{value}<span className="text-xs font-normal ml-0.5">{unit}</span></div>
        </div>
    );
}

function MetricExplainer({ name, explanation }: { name: string, explanation: string }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors font-medium border border-indigo-200"
            >
                {name}
            </button>
            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute top-full left-0 mt-2 w-96 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-4">
                        <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-slate-900">{name}</h4>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="text-sm text-slate-700 whitespace-pre-line">
                            {explanation}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
