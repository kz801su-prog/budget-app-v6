"use client"

import { useMemo, useState, useEffect } from 'react';
import { PnLData, DeptHeadcount } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { analyzeDeptFinancials, DeptFinancialReport, DEPT_METRIC_DEFINITIONS } from '@/lib/dept-financial-analyzer';
import { getEmployeeCount, setEmployeeCount, getAllEmployeeCounts } from '@/lib/storage-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, TrendingUp, TrendingDown, AlertCircle, CheckCircle, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import {
    BarChart, Bar, LineChart, Line, ComposedChart,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';

interface DeptDashboardProps {
    data: PnLData;
    selectedDepartment: string;
    companyName: string;
    fiscalYear: string;
    onDepartmentChange?: (dept: string) => void;
}

const MONTH_NAMES = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const MONTH_INDICES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];
const FIRST_HALF = [3, 4, 5, 6, 7, 8];
const SECOND_HALF = [9, 10, 11, 0, 1, 2];

export function DeptDashboard({ data, selectedDepartment, companyName, fiscalYear, onDepartmentChange }: DeptDashboardProps) {
    const [employeeCounts, setEmployeeCounts] = useState<Record<string, DeptHeadcount>>({});
    const [editingDept, setEditingDept] = useState<string | null>(null);
    const [tempHeadcount, setTempHeadcount] = useState<DeptHeadcount>({ sales: 0, warehouse: 0, operations: 0, accounting: 0 });
    const [alertsExpanded, setAlertsExpanded] = useState(false);

    useEffect(() => {
        getAllEmployeeCounts(companyName, fiscalYear).then(counts => setEmployeeCounts(counts));
    }, [companyName, fiscalYear]);

    const CORE_KEYWORDS = ['貸借対照表', '損益計算書', '販売費及び一般管理費', '販売費', '合併', '連結'];
    const isCoreSheet = (dept: string) => CORE_KEYWORDS.some(k => dept.includes(k));

    const departments = useMemo(() => {
        const depts = [...new Set(data.rows.map(r => r.department))];
        return depts.filter(d => !isCoreSheet(d));
    }, [data]);

    const deptReports = useMemo(() => {
        const reports: Record<string, DeptFinancialReport> = {};
        departments.forEach(dept => {
            const deptRows = data.rows.filter(r => r.department === dept);
            const hc = employeeCounts[dept] || { sales: 0, warehouse: 0, operations: 0, accounting: 0 };
            reports[dept] = analyzeDeptFinancials({ department: dept, rows: deptRows, headcount: hc });
        });
        return reports;
    }, [data, departments, employeeCounts]);

    const currentReport = selectedDepartment && selectedDepartment !== "All"
        ? deptReports[selectedDepartment]
        : null;

    useEffect(() => {
        if (selectedDepartment === "All" && departments.length > 0 && onDepartmentChange) {
            onDepartmentChange(departments[0]);
        }
    }, [selectedDepartment, departments, onDepartmentChange]);

    const handleEmployeeCountSave = async (dept: string) => {
        await setEmployeeCount(companyName, fiscalYear, dept, tempHeadcount);
        setEmployeeCounts(prev => ({ ...prev, [dept]: tempHeadcount }));
        setEditingDept(null);
    };

    const currentIndex = departments.indexOf(selectedDepartment);
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex < departments.length - 1 && currentIndex !== -1;

    // ── Monthly trend data ──────────────────────────────────────────────────
    const trendData = useMemo(() => {
        if (!currentReport) return [];
        return MONTH_INDICES.map((mIdx, i) => {
            const sales = currentReport.values['sales_per_employee'] !== undefined
                ? (() => {
                    const deptRows = data.rows.filter(r => r.department === selectedDepartment);
                    return deptRows
                        .filter(r => r.code?.includes('9821') || r.subject.includes('売上高'))
                        .reduce((s, r) => s + (r.monthlyData[mIdx]?.actual || 0), 0) / 1000;
                })()
                : 0;

            // Get actual sales and profit from dept rows
            const deptRows = data.rows.filter(r => r.department === selectedDepartment);
            const monthlySales = deptRows
                .filter(r => r.code?.includes('9821') || r.subject.includes('売上高'))
                .reduce((s, r) => s + (r.monthlyData[mIdx]?.actual || 0), 0) / 1000;
            const monthlyProfit = deptRows
                .filter(r => r.code?.includes('9861') || r.subject.includes('営業利益'))
                .reduce((s, r) => s + (r.monthlyData[mIdx]?.actual || 0), 0) / 1000;

            return {
                name: MONTH_NAMES[i],
                売上高: monthlySales,
                営業利益: monthlyProfit,
                営業利益率: monthlySales ? parseFloat(((monthlyProfit / monthlySales) * 100).toFixed(1)) : 0,
                経費売上比率: parseFloat((currentReport.values['sga_ratio']?.[mIdx] || 0).toFixed(1)),
                損益分岐点比率: parseFloat((currentReport.values['breakeven_ratio']?.[mIdx] || 0).toFixed(1)),
            };
        });
    }, [currentReport, data, selectedDepartment]);

    // ── Cumulative trend ────────────────────────────────────────────────────
    const cumulativeTrend = useMemo(() => {
        if (!currentReport) return [];
        const deptRows = data.rows.filter(r => r.department === selectedDepartment);
        let cumSales = 0, cumProfit = 0, cumPrevSales = 0;
        return MONTH_INDICES.map((mIdx, i) => {
            const monthlySales = deptRows
                .filter(r => r.code?.includes('9821') || r.subject.includes('売上高'))
                .reduce((s, r) => s + (r.monthlyData[mIdx]?.actual || 0), 0) / 1000;
            const monthlyProfit = deptRows
                .filter(r => r.code?.includes('9861') || r.subject.includes('営業利益'))
                .reduce((s, r) => s + (r.monthlyData[mIdx]?.actual || 0), 0) / 1000;
            const monthlyPrevSales = deptRows
                .filter(r => r.code?.includes('9821') || r.subject.includes('売上高'))
                .reduce((s, r) => s + (r.monthlyData[mIdx]?.prevYearActual || 0), 0) / 1000;
            cumSales += monthlySales;
            cumProfit += monthlyProfit;
            cumPrevSales += monthlyPrevSales;
            return {
                name: MONTH_NAMES[i],
                累計売上: cumSales,
                累計営業利益: cumProfit,
                前年累計売上: cumPrevSales,
                累計利益率: cumSales ? parseFloat(((cumProfit / cumSales) * 100).toFixed(1)) : 0,
            };
        });
    }, [currentReport, data, selectedDepartment]);

    // ── Ratio trend for ratio charts ────────────────────────────────────────
    const ratioTrend = useMemo(() => {
        if (!currentReport) return [];
        return MONTH_INDICES.map((mIdx, i) => ({
            name: MONTH_NAMES[i],
            粗利率: parseFloat((currentReport.values['gross_profit_margin']?.[mIdx] || 0).toFixed(1)),
            営業利益率: parseFloat((currentReport.values['operating_margin']?.[mIdx] || 0).toFixed(1)),
            経費率: parseFloat((currentReport.values['sga_ratio']?.[mIdx] || 0).toFixed(1)),
            損益分岐点比率: parseFloat((currentReport.values['breakeven_ratio']?.[mIdx] || 0).toFixed(1)),
        }));
    }, [currentReport]);

    // ── Cross-dept ratio comparison (correct values) ────────────────────────
    const comparisonData = useMemo(() => {
        return departments.map(dept => {
            const report = deptReports[dept];
            const deptRows = data.rows.filter(r => r.department === dept);
            const fyValue = (id: string) => report?.values[id]?.['FY'] || 0;
            const actualSales = MONTH_INDICES.reduce((s, m) =>
                s + deptRows.filter(r => r.code?.includes('9821') || r.subject.includes('売上高'))
                    .reduce((ss, r) => ss + (r.monthlyData[m]?.actual || 0), 0), 0) / 1000;
            const shortName = dept.replace(/事業部|営業部|部門|課$/, '').slice(0, 8);
            return {
                name: shortName,
                fullName: dept,
                売上高: Math.round(actualSales),
                営業利益率: parseFloat(fyValue('operating_margin').toFixed(1)),
                粗利率: parseFloat(fyValue('gross_profit_margin').toFixed(1)),
                経費率: parseFloat(fyValue('sga_ratio').toFixed(1)),
                人件費率: parseFloat(fyValue('labor_cost_ratio').toFixed(1)),
                売上成長率: parseFloat(fyValue('sales_growth').toFixed(1)),
                損益分岐点比率: parseFloat(fyValue('breakeven_ratio').toFixed(1)),
                営業レバレッジ: parseFloat(fyValue('operating_leverage').toFixed(2)),
            };
        }).filter(d => d.売上高 !== 0 || d.営業利益率 !== 0);
    }, [deptReports, departments, data]);

    // ── Inventory valuation data ────────────────────────────────────────────
    const inventoryData = useMemo(() => {
        if (!currentReport) return [];
        const deptRows = data.rows.filter(r => r.department === selectedDepartment);
        const inventoryRows = deptRows.filter(r =>
            r.code?.includes('11201') || r.code?.includes('11301') ||
            ['商品', '在庫', '棚卸', '製品', '仕掛'].some(k => r.subject.includes(k))
        );
        if (inventoryRows.length === 0) return [];
        return MONTH_INDICES.map((mIdx, i) => {
            const inventoryAmt = inventoryRows.reduce((s, r) =>
                s + (r.monthlyData[mIdx]?.actual || r.monthlyData[mIdx]?.budget || 0), 0) / 1000;
            return {
                name: MONTH_NAMES[i],
                在庫金額: Math.round(inventoryAmt),
                評価損推定: Math.round(inventoryAmt * 0.5),
            };
        });
    }, [currentReport, data, selectedDepartment]);

    if (!currentReport) {
        return (
            <Card className="p-8">
                <div className="text-center text-slate-500">
                    <p className="text-lg font-medium mb-2">部門を選択してください</p>
                    <p className="text-sm">左側のフィルターから部門を選択すると、詳細な分析が表示されます。</p>
                </div>
            </Card>
        );
    }

    const fyValues = (id: string) => currentReport.values[id]?.['FY'] || 0;

    // compute KPI values directly from rows
    const deptRowsCurrent = data.rows.filter(r => r.department === selectedDepartment);
    const fySales = MONTH_INDICES.reduce((s, m) =>
        s + deptRowsCurrent.filter(r => r.code?.includes('9821') || r.subject.includes('売上高'))
            .reduce((ss, r) => ss + (r.monthlyData[m]?.actual || 0), 0), 0) / 1000;
    const fyProfit = MONTH_INDICES.reduce((s, m) =>
        s + deptRowsCurrent.filter(r => r.code?.includes('9861') || r.subject.includes('営業利益'))
            .reduce((ss, r) => ss + (r.monthlyData[m]?.actual || 0), 0), 0) / 1000;
    const h1Sales = FIRST_HALF.reduce((s, m) =>
        s + deptRowsCurrent.filter(r => r.code?.includes('9821') || r.subject.includes('売上高'))
            .reduce((ss, r) => ss + (r.monthlyData[m]?.actual || 0), 0), 0) / 1000;
    const h1Profit = FIRST_HALF.reduce((s, m) =>
        s + deptRowsCurrent.filter(r => r.code?.includes('9861') || r.subject.includes('営業利益'))
            .reduce((ss, r) => ss + (r.monthlyData[m]?.actual || 0), 0), 0) / 1000;

    const latestMonthIdx = [...MONTH_INDICES].reverse().find(m =>
        deptRowsCurrent.some(r => (r.monthlyData[m]?.actual || 0) !== 0)
    ) ?? MONTH_INDICES[0];
    const latestSales = deptRowsCurrent.filter(r => r.code?.includes('9821') || r.subject.includes('売上高'))
        .reduce((s, r) => s + (r.monthlyData[latestMonthIdx]?.actual || 0), 0) / 1000;
    const latestProfit = deptRowsCurrent.filter(r => r.code?.includes('9861') || r.subject.includes('営業利益'))
        .reduce((s, r) => s + (r.monthlyData[latestMonthIdx]?.actual || 0), 0) / 1000;

    const fmt = (v: number) => Math.abs(v) >= 1000
        ? `${(v / 1000).toFixed(1)}百万`
        : `${Math.round(v).toLocaleString()}`;

    return (
        <div className="space-y-5">
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <Card className="bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200">
                <CardContent className="p-5">
                    <div className="flex justify-between items-start gap-4">
                        <div className="flex items-center gap-4">
                            <div>
                                <h2 className="text-xl font-bold text-indigo-900 mb-1">{selectedDepartment}</h2>
                                <p className="text-xs text-indigo-600">部門別財務分析ダッシュボード</p>
                            </div>
                            {onDepartmentChange && departments.length > 1 && (
                                <div className="flex items-center gap-2 ml-4 border-l pl-4 border-indigo-200">
                                    <Button variant="outline" size="sm" onClick={() => hasPrev && onDepartmentChange(departments[currentIndex - 1])} disabled={!hasPrev} className="h-7 px-2">
                                        <ChevronLeft className="h-3.5 w-3.5" />
                                    </Button>
                                    <span className="text-xs text-indigo-600 min-w-[50px] text-center font-medium">
                                        {currentIndex >= 0 ? `${currentIndex + 1} / ${departments.length}` : '-'}
                                    </span>
                                    <Button variant="outline" size="sm" onClick={() => hasNext && onDepartmentChange(departments[currentIndex + 1])} disabled={!hasNext} className="h-7 px-2">
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Headcount panel */}
                        <div className="flex flex-col gap-2 bg-white rounded-lg p-3 shadow-sm border border-indigo-100 min-w-[280px]">
                            <div className="flex items-center justify-between border-b pb-1.5">
                                <div className="flex items-center gap-1.5">
                                    <Users className="h-3.5 w-3.5 text-indigo-600" />
                                    <span className="text-xs font-bold text-slate-700">構成人数設定</span>
                                </div>
                                {editingDept !== selectedDepartment && (
                                    <Button size="sm" variant="ghost" onClick={() => { setEditingDept(selectedDepartment); setTempHeadcount(employeeCounts[selectedDepartment] || { sales: 0, warehouse: 0, operations: 0, accounting: 0 }); }} className="h-6 text-[10px] text-indigo-600 hover:bg-indigo-50 px-2">
                                        編集
                                    </Button>
                                )}
                            </div>
                            {editingDept === selectedDepartment ? (
                                <div className="space-y-2">
                                    <div className="grid grid-cols-4 gap-2">
                                        {[['営業', 'sales'], ['倉庫', 'warehouse'], ['業務', 'operations'], ['経理', 'accounting']].map(([label, key]) => (
                                            <div key={key} className="space-y-0.5">
                                                <label className="text-[9px] font-bold text-slate-400 uppercase">{label}</label>
                                                <Input type="number" value={(tempHeadcount as any)[key]} onChange={e => setTempHeadcount({ ...tempHeadcount, [key]: parseInt(e.target.value) || 0 })} className="h-7 text-xs px-1" />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex gap-2 justify-end pt-1 border-t">
                                        <Button size="sm" variant="outline" onClick={() => setEditingDept(null)} className="h-6 text-[10px] px-2">キャンセル</Button>
                                        <Button size="sm" onClick={() => handleEmployeeCountSave(selectedDepartment)} className="h-6 text-[10px] bg-indigo-600 px-2">保存</Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-4 gap-2 text-xs">
                                    {[['営業', currentReport.headcount.sales], ['倉庫', currentReport.headcount.warehouse], ['業務', currentReport.headcount.operations], ['経理', currentReport.headcount.accounting]].map(([label, val]) => (
                                        <div key={String(label)} className="text-center">
                                            <div className="text-[9px] text-slate-400">{label}</div>
                                            <div className="font-bold text-slate-700">{val}名</div>
                                        </div>
                                    ))}
                                    <div className="col-span-4 text-center bg-indigo-50 rounded py-0.5 text-[10px] text-indigo-700 font-bold">
                                        計 {currentReport.headcount.sales + currentReport.headcount.warehouse + currentReport.headcount.operations + currentReport.headcount.accounting} 名
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ── AI Alerts (collapsible) ─────────────────────────────────── */}
            {currentReport.alerts.length > 0 && (
                <Card className="border-l-4 border-l-amber-500">
                    <button
                        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-amber-50/50 transition-colors"
                        onClick={() => setAlertsExpanded(v => !v)}
                    >
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                            <AlertCircle className="h-4 w-4 text-amber-500" />
                            AI分析アラート
                            <span className="text-[10px] font-normal bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{currentReport.alerts.length}件</span>
                        </div>
                        {alertsExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                    </button>
                    {alertsExpanded && (
                        <CardContent className="pt-0 pb-4 px-5">
                            <div className="space-y-1.5">
                                {currentReport.alerts.map((alert, idx) => (
                                    <div key={idx} className="flex items-start gap-2 text-sm">
                                        <span className="mt-0.5 shrink-0">{alert.startsWith('✅') ? '✅' : alert.startsWith('🚀') ? '🚀' : '⚠️'}</span>
                                        <span className="flex-1 text-slate-700">{alert.replace(/^[✅🚀⚠️🔴]\s*/, '')}</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    )}
                </Card>
            )}

            {/* ── New KPI Cards ───────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <KPICard2 label="売上高" sub="年間実績" value={`${fmt(fySales)}千円`} sub2={`単月: ${fmt(latestSales)}千円`} color="indigo" good={fySales > 0} />
                <KPICard2 label="営業利益" sub="年間実績" value={`${fmt(fyProfit)}千円`} sub2={`単月: ${fmt(latestProfit)}千円`} color={fyProfit >= 0 ? "emerald" : "red"} good={fyProfit > 0} />
                <KPICard2 label="営業利益率" sub="年間 / 上期" value={`${fySales ? ((fyProfit / fySales) * 100).toFixed(1) : '0.0'}%`} sub2={`上期: ${h1Sales ? ((h1Profit / h1Sales) * 100).toFixed(1) : '0.0'}%`} color="blue" good={fyProfit / (fySales || 1) > 0.05} />
                <KPICard2 label="経費売上比率" sub="年間 / 上期" value={`${fyValues('sga_ratio').toFixed(1)}%`} sub2={`粗利率: ${fyValues('gross_profit_margin').toFixed(1)}%`} color="amber" good={fyValues('sga_ratio') < 30} inverse />
                <KPICard2 label="損益分岐点比率" sub="年間" value={`${fyValues('breakeven_ratio').toFixed(1)}%`} sub2={fyValues('breakeven_ratio') < 80 ? '✅ 安全圏' : '⚠️ 要注意'} color={fyValues('breakeven_ratio') < 80 ? "emerald" : "red"} good={fyValues('breakeven_ratio') < 80} inverse />
            </div>

            {/* ── Charts Row 1: Monthly trend ─────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">売上・営業利益 月次推移（千円）</CardTitle></CardHeader>
                    <CardContent>
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={trendData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="name" fontSize={10} tickLine={false} />
                                    <YAxis yAxisId="left" fontSize={10} tickLine={false} tickFormatter={v => Math.abs(v) >= 1000 ? `${(v/1000).toFixed(0)}M` : String(v)} />
                                    <YAxis yAxisId="right" orientation="right" fontSize={10} tickLine={false} tickFormatter={v => `${v}%`} />
                                    <Tooltip formatter={((v: number | undefined, name: string) => [name.includes('率') ? `${(v??0).toFixed(1)}%` : `${(v??0).toLocaleString()}千円`, name]) as never} />
                                    <Legend iconSize={10} />
                                    <Bar yAxisId="left" dataKey="売上高" fill="#6366f1" fillOpacity={0.8} radius={[3, 3, 0, 0]} />
                                    <Bar yAxisId="left" dataKey="営業利益" fill="#10b981" fillOpacity={0.9} radius={[3, 3, 0, 0]} />
                                    <Line yAxisId="right" type="monotone" dataKey="営業利益率" stroke="#f59e0b" strokeWidth={2} dot={false} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">累計売上・利益推移（千円）</CardTitle></CardHeader>
                    <CardContent>
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={cumulativeTrend}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="name" fontSize={10} tickLine={false} />
                                    <YAxis yAxisId="left" fontSize={10} tickLine={false} tickFormatter={v => Math.abs(v) >= 1000 ? `${(v/1000).toFixed(0)}M` : String(v)} />
                                    <YAxis yAxisId="right" orientation="right" fontSize={10} tickLine={false} tickFormatter={v => `${v}%`} />
                                    <Tooltip formatter={((v: number | undefined, name: string) => [name.includes('率') ? `${(v??0).toFixed(1)}%` : `${(v??0).toLocaleString()}千円`, name]) as never} />
                                    <Legend iconSize={10} />
                                    <Bar yAxisId="left" dataKey="累計売上" fill="#6366f1" fillOpacity={0.3} radius={[3, 3, 0, 0]} />
                                    <Line yAxisId="left" type="monotone" dataKey="前年累計売上" stroke="#94a3b8" strokeDasharray="5 5" dot={false} strokeWidth={1.5} />
                                    <Line yAxisId="left" type="monotone" dataKey="累計営業利益" stroke="#10b981" strokeWidth={2} dot={false} />
                                    <Line yAxisId="right" type="monotone" dataKey="累計利益率" stroke="#f59e0b" strokeWidth={2} dot={false} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ── Charts Row 2: Ratio trends ──────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">利益率・経費率 月次推移（%）</CardTitle></CardHeader>
                    <CardContent>
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={ratioTrend}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="name" fontSize={10} tickLine={false} />
                                    <YAxis fontSize={10} tickLine={false} tickFormatter={v => `${v}%`} />
                                    <Tooltip formatter={((v: number | undefined, name: string) => [`${(v??0).toFixed(1)}%`, name]) as never} />
                                    <Legend iconSize={10} />
                                    <ReferenceLine y={0} stroke="#e2e8f0" />
                                    <Line type="monotone" dataKey="粗利率" stroke="#6366f1" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="営業利益率" stroke="#10b981" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="経費率" stroke="#ef4444" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                                    <Line type="monotone" dataKey="損益分岐点比率" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Inventory valuation chart */}
                {inventoryData.length > 0 ? (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">在庫金額・評価損推定（千円）</CardTitle>
                            <p className="text-[10px] text-slate-400">評価損 = 在庫金額 × 50%（1年在庫想定）</p>
                        </CardHeader>
                        <CardContent>
                            <div className="h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={inventoryData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="name" fontSize={10} tickLine={false} />
                                        <YAxis fontSize={10} tickLine={false} tickFormatter={v => Math.abs(v) >= 1000 ? `${(v/1000).toFixed(0)}M` : String(v)} />
                                        <Tooltip formatter={((v: number | undefined, name: string) => [`${(v??0).toLocaleString()}千円`, name]) as never} />
                                        <Legend iconSize={10} />
                                        <Bar dataKey="在庫金額" fill="#6366f1" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
                                        <Bar dataKey="評価損推定" fill="#ef4444" fillOpacity={0.6} radius={[3, 3, 0, 0]} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="border-dashed">
                        <CardHeader className="pb-2"><CardTitle className="text-base text-slate-400">在庫金額・評価損推定</CardTitle></CardHeader>
                        <CardContent className="flex items-center justify-center h-64 text-sm text-slate-400">
                            この部門に在庫データがありません<br /><span className="text-xs">(商品・棚卸資産コード: 11201, 11301)</span>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* ── Cross-dept ratio comparison charts ─────────────────────── */}
            {comparisonData.length > 1 && (
                <div className="space-y-4">
                    <h3 className="text-base font-bold text-slate-800 border-b pb-2">部門間比率比較</h3>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Profitability */}
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm">営業利益率・粗利率比較（%）</CardTitle></CardHeader>
                            <CardContent>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={comparisonData} margin={{ bottom: 30 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                            <XAxis dataKey="name" fontSize={9} angle={-30} textAnchor="end" height={50} tickLine={false} />
                                            <YAxis fontSize={10} tickLine={false} tickFormatter={v => `${v}%`} />
                                            <Tooltip formatter={((v: number | undefined, name: string) => [`${(v??0).toFixed(1)}%`, name]) as never} />
                                            <Legend iconSize={9} />
                                            <Bar dataKey="粗利率" fill="#6366f1" radius={[3, 3, 0, 0]}>
                                                {comparisonData.map((entry, i) => (
                                                    <Cell key={i} fill={entry.fullName === selectedDepartment ? '#4338ca' : '#6366f1'} fillOpacity={entry.fullName === selectedDepartment ? 1 : 0.5} />
                                                ))}
                                            </Bar>
                                            <Bar dataKey="営業利益率" fill="#10b981" radius={[3, 3, 0, 0]}>
                                                {comparisonData.map((entry, i) => (
                                                    <Cell key={i} fill={entry.fullName === selectedDepartment ? '#059669' : '#10b981'} fillOpacity={entry.fullName === selectedDepartment ? 1 : 0.5} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Cost efficiency */}
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm">経費率・人件費率比較（%）</CardTitle></CardHeader>
                            <CardContent>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={comparisonData} margin={{ bottom: 30 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                            <XAxis dataKey="name" fontSize={9} angle={-30} textAnchor="end" height={50} tickLine={false} />
                                            <YAxis fontSize={10} tickLine={false} tickFormatter={v => `${v}%`} />
                                            <Tooltip formatter={((v: number | undefined, name: string) => [`${(v??0).toFixed(1)}%`, name]) as never} />
                                            <Legend iconSize={9} />
                                            <Bar dataKey="経費率" fill="#ef4444" radius={[3, 3, 0, 0]}>
                                                {comparisonData.map((entry, i) => (
                                                    <Cell key={i} fill={entry.fullName === selectedDepartment ? '#dc2626' : '#ef4444'} fillOpacity={entry.fullName === selectedDepartment ? 1 : 0.5} />
                                                ))}
                                            </Bar>
                                            <Bar dataKey="人件費率" fill="#f59e0b" radius={[3, 3, 0, 0]}>
                                                {comparisonData.map((entry, i) => (
                                                    <Cell key={i} fill={entry.fullName === selectedDepartment ? '#d97706' : '#f59e0b'} fillOpacity={entry.fullName === selectedDepartment ? 1 : 0.5} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Growth */}
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm">売上成長率比較 前年比（%）</CardTitle></CardHeader>
                            <CardContent>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={comparisonData} margin={{ bottom: 30 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                            <XAxis dataKey="name" fontSize={9} angle={-30} textAnchor="end" height={50} tickLine={false} />
                                            <YAxis fontSize={10} tickLine={false} tickFormatter={v => `${v}%`} />
                                            <Tooltip formatter={((v: number | undefined) => [`${(v??0).toFixed(1)}%`, '売上成長率']) as never} />
                                            <ReferenceLine y={0} stroke="#94a3b8" />
                                            <Bar dataKey="売上成長率" radius={[3, 3, 0, 0]}>
                                                {comparisonData.map((entry, i) => (
                                                    <Cell key={i}
                                                        fill={entry.売上成長率 >= 0
                                                            ? (entry.fullName === selectedDepartment ? '#059669' : '#10b981')
                                                            : (entry.fullName === selectedDepartment ? '#dc2626' : '#ef4444')}
                                                        fillOpacity={entry.fullName === selectedDepartment ? 1 : 0.6}
                                                    />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>

                        {/* BEP */}
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm">損益分岐点比率比較（%、低いほど安全）</CardTitle></CardHeader>
                            <CardContent>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={comparisonData} margin={{ bottom: 30 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                            <XAxis dataKey="name" fontSize={9} angle={-30} textAnchor="end" height={50} tickLine={false} />
                                            <YAxis fontSize={10} tickLine={false} domain={[0, 120]} tickFormatter={v => `${v}%`} />
                                            <Tooltip formatter={((v: number | undefined) => [`${(v??0).toFixed(1)}%`, '損益分岐点比率']) as never} />
                                            <ReferenceLine y={80} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: '警戒80%', fontSize: 9, fill: '#f59e0b' }} />
                                            <Bar dataKey="損益分岐点比率" radius={[3, 3, 0, 0]}>
                                                {comparisonData.map((entry, i) => (
                                                    <Cell key={i}
                                                        fill={entry.損益分岐点比率 < 80
                                                            ? (entry.fullName === selectedDepartment ? '#059669' : '#10b981')
                                                            : (entry.fullName === selectedDepartment ? '#dc2626' : '#ef4444')}
                                                        fillOpacity={entry.fullName === selectedDepartment ? 1 : 0.6}
                                                    />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── New KPI Card component ──────────────────────────────────────────────────
function KPICard2({ label, sub, value, sub2, color, good, inverse }: {
    label: string; sub: string; value: string; sub2: string;
    color: string; good?: boolean; inverse?: boolean;
}) {
    const isGood = inverse ? !good : good;
    const colorMap: Record<string, string> = {
        indigo: 'border-indigo-200 bg-indigo-50',
        emerald: 'border-emerald-200 bg-emerald-50',
        blue: 'border-blue-200 bg-blue-50',
        amber: 'border-amber-200 bg-amber-50',
        red: 'border-red-200 bg-red-50',
    };
    return (
        <Card className={`${colorMap[color] || colorMap.indigo}`}>
            <CardContent className="p-3">
                <div className="flex items-start justify-between mb-1.5">
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
                        <p className="text-[9px] text-slate-400">{sub}</p>
                    </div>
                    {isGood !== undefined && (isGood
                        ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        : <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    )}
                </div>
                <div className="text-lg font-bold text-slate-900 leading-tight">{value}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{sub2}</div>
            </CardContent>
        </Card>
    );
}
