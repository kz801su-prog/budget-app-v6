"use client"

import { useMemo, useState, useEffect } from 'react';
import { PnLData, DeptHeadcount } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { analyzeDeptFinancials, DeptFinancialReport, DEPT_METRIC_DEFINITIONS } from '@/lib/dept-financial-analyzer';
import { getEmployeeCount, setEmployeeCount, getAllEmployeeCounts } from '@/lib/storage-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, TrendingUp, TrendingDown, AlertCircle, CheckCircle, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import {
    BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
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

export function DeptDashboard({ data, selectedDepartment, companyName, fiscalYear, onDepartmentChange }: DeptDashboardProps) {
    const [employeeCounts, setEmployeeCounts] = useState<Record<string, DeptHeadcount>>({});
    const [editingDept, setEditingDept] = useState<string | null>(null);
    const [tempHeadcount, setTempHeadcount] = useState<DeptHeadcount>({ sales: 0, warehouse: 0, operations: 0, accounting: 0 });

    // Load employee counts on mount
    useEffect(() => {
        const counts = getAllEmployeeCounts(companyName, fiscalYear);
        setEmployeeCounts(counts);
    }, [companyName, fiscalYear]);

    // Filter departments (exclude core sheets and specific departments)
    const CORE_SHEETS = ['貸借対照表', '損益計算書', '販売費及び一般管理費'];
    const EXCLUDED_DEPTS = [
        '8の営業部',
        '6の国際事業部',
        '5の商品管理課',
        '2の管理本部',
        '1の総括本部',
        'Sheet1'
    ];

    const departments = useMemo(() => {
        const depts = [...new Set(data.rows.map(r => r.department))];
        return depts.filter(d =>
            !CORE_SHEETS.includes(d) &&
            !EXCLUDED_DEPTS.some(excluded => d.includes(excluded) || d === excluded)
        );
    }, [data]);

    // Analyze all departments
    const deptReports = useMemo(() => {
        const reports: Record<string, DeptFinancialReport> = {};

        departments.forEach(dept => {
            const deptRows = data.rows.filter(r => r.department === dept);
            const hc = employeeCounts[dept] || { sales: 0, warehouse: 0, operations: 0, accounting: 0 };

            reports[dept] = analyzeDeptFinancials({
                department: dept,
                rows: deptRows,
                headcount: hc
            });
        });

        return reports;
    }, [data, departments, employeeCounts]);

    // Get current department report
    const currentReport = selectedDepartment && selectedDepartment !== "All"
        ? deptReports[selectedDepartment]
        : null;

    // Auto-select first department if "All" is selected
    useEffect(() => {
        if (selectedDepartment === "All" && departments.length > 0 && onDepartmentChange) {
            onDepartmentChange(departments[0]);
        }
    }, [selectedDepartment, departments, onDepartmentChange]);

    // Handle employee count update
    const handleEmployeeCountSave = (dept: string) => {
        setEmployeeCount(companyName, fiscalYear, dept, tempHeadcount);
        setEmployeeCounts(prev => ({ ...prev, [dept]: tempHeadcount }));
        setEditingDept(null);
    };

    // Department navigation logic
    const currentIndex = departments.indexOf(selectedDepartment);
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex < departments.length - 1 && currentIndex !== -1;

    const handlePrev = () => {
        if (hasPrev && onDepartmentChange) {
            onDepartmentChange(departments[currentIndex - 1]);
        }
    };

    const handleNext = () => {
        if (hasNext && onDepartmentChange) {
            onDepartmentChange(departments[currentIndex + 1]);
        }
    };

    // Prepare comparison data for all departments
    const comparisonData = useMemo(() => {
        return departments.map(dept => {
            const report = deptReports[dept];
            const fyValue = (metricId: string) => report?.values[metricId]?.['FY'] || 0;
            const hc = employeeCounts[dept] || { sales: 0, warehouse: 0, operations: 0, accounting: 0 };
            const totalHc = hc.sales + hc.warehouse + hc.operations + hc.accounting;

            return {
                name: dept.length > 10 ? dept.substring(0, 10) + '...' : dept,
                fullName: dept,
                売上高: fyValue('sales_per_employee') * (totalHc || 1), // Approximate total sales
                営業利益率: fyValue('operating_margin'),
                経常利益率: fyValue('ordinary_margin'),
                粗利率: fyValue('gross_profit_margin'),
                販管費率: fyValue('sga_ratio'),
                人件費率: fyValue('labor_cost_ratio'),
                売上成長率: fyValue('sales_growth'),
                損益分岐点比率: fyValue('breakeven_ratio'),
                営業レバレッジ: fyValue('operating_leverage')
            };
        });
    }, [deptReports, departments, employeeCounts]);

    // Prepare benchmark data (compare all departments)
    const benchmarkData = useMemo(() => {
        const metrics = ['operating_margin', 'sga_ratio', 'sales_growth', 'operating_leverage'];

        return metrics.map(metricId => {
            const metricDef = DEPT_METRIC_DEFINITIONS.find(m => m.id === metricId);
            if (!metricDef) return null;

            const dataPoint: any = { metric: metricDef.labelJp };

            departments.forEach(dept => {
                const value = deptReports[dept]?.values[metricId]?.['FY'] || 0;
                dataPoint[dept] = parseFloat(value.toFixed(1));
            });

            return dataPoint;
        }).filter(Boolean);
    }, [deptReports, departments]);

    // Prepare trend data for current department
    const trendData = useMemo(() => {
        if (!currentReport) return [];

        return MONTH_INDICES.map((mIdx, i) => {
            const dataPoint: any = { name: MONTH_NAMES[i] };

            // Key metrics to show in trend
            ['gross_profit_margin', 'operating_margin', 'sga_ratio'].forEach(metricId => {
                const value = currentReport.values[metricId]?.[mIdx] || 0;
                const metricDef = DEPT_METRIC_DEFINITIONS.find(m => m.id === metricId);
                if (metricDef) {
                    dataPoint[metricDef.labelJp] = parseFloat(value.toFixed(1));
                }
            });

            return dataPoint;
        });
    }, [currentReport]);

    // Prepare radar chart data for current department
    const radarData = useMemo(() => {
        if (!currentReport) return [];

        const metrics = [
            'gross_profit_margin',
            'operating_margin',
            'sales_growth',
            'profit_per_employee',
            'breakeven_ratio'
        ];

        return metrics.map(metricId => {
            const metricDef = DEPT_METRIC_DEFINITIONS.find(m => m.id === metricId);
            if (!metricDef) return null;

            let value = currentReport.values[metricId]?.['FY'] || 0;

            // Normalize values to 0-100 scale for radar chart
            if (metricId === 'profit_per_employee') {
                value = Math.min(value / 100, 100); // Cap at 10M yen
            } else if (metricId === 'breakeven_ratio') {
                value = 100 - value; // Invert (lower is better)
            }

            return {
                metric: metricDef.labelJp,
                value: Math.max(0, Math.min(100, value))
            };
        }).filter(Boolean);
    }, [currentReport]);

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

    return (
        <div className="space-y-6">
            {/* Header with Employee Count */}
            <Card className="bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200">
                <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-4">
                            <div>
                                <h2 className="text-2xl font-bold text-indigo-900 mb-2">{selectedDepartment}</h2>
                                <p className="text-sm text-indigo-600">部門別財務分析ダッシュボード</p>
                            </div>

                            {/* Department Navigation */}
                            {onDepartmentChange && departments.length > 1 && (
                                <div className="flex items-center gap-2 ml-6 border-l pl-6 border-indigo-200">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handlePrev}
                                        disabled={!hasPrev}
                                        className="h-8 px-2"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>

                                    <span className="text-xs text-indigo-600 min-w-[60px] text-center font-medium">
                                        {currentIndex >= 0 ? `${currentIndex + 1} / ${departments.length}` : '-'}
                                    </span>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleNext}
                                        disabled={!hasNext}
                                        className="h-8 px-2"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-3 bg-white rounded-lg p-4 shadow-sm border border-indigo-100 min-w-[320px]">
                            <div className="flex items-center justify-between border-b pb-2 mb-1">
                                <div className="flex items-center gap-2">
                                    <Users className="h-4 w-4 text-indigo-600" />
                                    <span className="text-sm font-bold text-slate-700">構成人数設定</span>
                                </div>
                                {editingDept !== selectedDepartment && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            setEditingDept(selectedDepartment);
                                            setTempHeadcount(employeeCounts[selectedDepartment] || { sales: 0, warehouse: 0, operations: 0, accounting: 0 });
                                        }}
                                        className="h-7 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                    >
                                        編集
                                    </Button>
                                )}
                            </div>

                            {editingDept === selectedDepartment ? (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">営業員</label>
                                            <Input
                                                type="number"
                                                value={tempHeadcount.sales}
                                                onChange={(e) => setTempHeadcount({ ...tempHeadcount, sales: parseInt(e.target.value) || 0 })}
                                                className="h-8 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">倉庫員</label>
                                            <Input
                                                type="number"
                                                value={tempHeadcount.warehouse}
                                                onChange={(e) => setTempHeadcount({ ...tempHeadcount, warehouse: parseInt(e.target.value) || 0 })}
                                                className="h-8 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">業務員</label>
                                            <Input
                                                type="number"
                                                value={tempHeadcount.operations}
                                                onChange={(e) => setTempHeadcount({ ...tempHeadcount, operations: parseInt(e.target.value) || 0 })}
                                                className="h-8 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">経理員</label>
                                            <Input
                                                type="number"
                                                value={tempHeadcount.accounting}
                                                onChange={(e) => setTempHeadcount({ ...tempHeadcount, accounting: parseInt(e.target.value) || 0 })}
                                                className="h-8 text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-2 justify-end pt-2 border-t">
                                        <Button size="sm" variant="outline" onClick={() => setEditingDept(null)} className="h-8 text-xs">
                                            キャンセル
                                        </Button>
                                        <Button size="sm" onClick={() => handleEmployeeCountSave(selectedDepartment)} className="h-8 text-xs bg-indigo-600">
                                            保存
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                        <div className="flex justify-between border-b border-slate-50 py-1">
                                            <span className="text-slate-500">営業:</span>
                                            <span className="font-bold">{currentReport.headcount.sales}名</span>
                                        </div>
                                        <div className="flex justify-between border-b border-slate-50 py-1">
                                            <span className="text-slate-500">倉庫:</span>
                                            <span className="font-bold">{currentReport.headcount.warehouse}名</span>
                                        </div>
                                        <div className="flex justify-between border-b border-slate-50 py-1">
                                            <span className="text-slate-500">業務:</span>
                                            <span className="font-bold">{currentReport.headcount.operations}名</span>
                                        </div>
                                        <div className="flex justify-between border-b border-slate-50 py-1">
                                            <span className="text-slate-500">経理:</span>
                                            <span className="font-bold">{currentReport.headcount.accounting}名</span>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-center bg-indigo-50 rounded py-1">
                                        <span className="text-xs text-indigo-700 font-bold">
                                            合計: {currentReport.headcount.sales + currentReport.headcount.warehouse + currentReport.headcount.operations + currentReport.headcount.accounting} 名
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* AI Alerts */}
            {currentReport.alerts.length > 0 && (
                <Card className="border-l-4 border-l-amber-500">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-amber-500" />
                            AI分析アラート
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {currentReport.alerts.map((alert, idx) => (
                                <div key={idx} className="flex items-start gap-2 text-sm">
                                    <span className="mt-0.5">{alert.startsWith('✅') ? '✅' : alert.startsWith('🚀') ? '🚀' : '⚠️'}</span>
                                    <span className="flex-1">{alert.replace(/^[✅🚀⚠️🔴]\s*/, '')}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <KPICard
                    title="営業利益率"
                    value={fyValues('operating_margin')}
                    unit="%"
                    trend={fyValues('operating_profit_growth')}
                    good={fyValues('operating_margin') > 10}
                />
                <KPICard
                    title="売上成長率"
                    value={fyValues('sales_growth')}
                    unit="%"
                    trend={fyValues('sales_growth')}
                    good={fyValues('sales_growth') > 0}
                />
                <KPICard
                    title="営業1人当売上"
                    value={fyValues('sales_per_sales_person')}
                    unit="千円"
                    good={fyValues('sales_per_sales_person') > 20000}
                />
                <KPICard
                    title="構成員1人当売上"
                    value={fyValues('sales_per_employee')}
                    unit="千円"
                    good={fyValues('sales_per_employee') > 10000}
                />
                <KPICard
                    title="損益分岐点比率"
                    value={fyValues('breakeven_ratio')}
                    unit="%"
                    good={fyValues('breakeven_ratio') < 80}
                    inverse
                />
            </div>

            {/* Charts Row 1: Trend and Radar */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Monthly Trend */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">月次推移</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={trendData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="name" fontSize={11} />
                                    <YAxis fontSize={11} />
                                    <Tooltip />
                                    <Legend />
                                    <Line type="monotone" dataKey="売上総利益率（粗利率）" stroke="#6366f1" strokeWidth={2} />
                                    <Line type="monotone" dataKey="営業利益率" stroke="#10b981" strokeWidth={2} />
                                    <Line type="monotone" dataKey="販売費及び一般管理費率" stroke="#f59e0b" strokeWidth={2} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Radar Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">総合評価レーダー</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart data={radarData}>
                                    <PolarGrid stroke="#e2e8f0" />
                                    <PolarAngleAxis dataKey="metric" fontSize={10} />
                                    <PolarRadiusAxis fontSize={10} />
                                    <Radar name="評価" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.6} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Department Comparison Charts */}
            <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-900">部門間比較分析</h3>

                {/* Row 1: Profitability Comparison */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Operating & Ordinary Margin */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">収益性比較（営業利益率・経常利益率）</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={comparisonData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="name" fontSize={10} angle={-45} textAnchor="end" height={80} />
                                        <YAxis fontSize={11} label={{ value: '%', angle: -90, position: 'insideLeft' }} />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="営業利益率" fill="#10b981" name="営業利益率 (%)" />
                                        <Bar dataKey="経常利益率" fill="#6366f1" name="経常利益率 (%)" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Gross Margin Comparison */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">粗利率比較</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={comparisonData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="name" fontSize={10} angle={-45} textAnchor="end" height={80} />
                                        <YAxis fontSize={11} label={{ value: '%', angle: -90, position: 'insideLeft' }} />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="粗利率" fill="#f59e0b" name="粗利率 (%)" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Row 2: Cost Efficiency */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* SG&A and Labor Cost Ratio */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">経費比率比較（販管費率・人件費率）</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={comparisonData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="name" fontSize={10} angle={-45} textAnchor="end" height={80} />
                                        <YAxis fontSize={11} label={{ value: '%', angle: -90, position: 'insideLeft' }} />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="販管費率" fill="#ef4444" name="販管費率 (%)" />
                                        <Bar dataKey="人件費率" fill="#f97316" name="人件費率 (%)" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Sales Growth */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">売上成長率比較（前年比）</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={comparisonData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="name" fontSize={10} angle={-45} textAnchor="end" height={80} />
                                        <YAxis fontSize={11} label={{ value: '%', angle: -90, position: 'insideLeft' }} />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="売上成長率" fill="#8b5cf6" name="売上成長率 (%)" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Row 3: Risk Metrics */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Break-even Ratio */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">損益分岐点比率比較（低いほど安全）</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={comparisonData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="name" fontSize={10} angle={-45} textAnchor="end" height={80} />
                                        <YAxis fontSize={11} label={{ value: '%', angle: -90, position: 'insideLeft' }} />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="損益分岐点比率" fill="#ec4899" name="損益分岐点比率 (%)" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Operating Leverage */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">営業レバレッジ比較（売上変動リスク）</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={comparisonData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="name" fontSize={10} angle={-45} textAnchor="end" height={80} />
                                        <YAxis fontSize={11} label={{ value: '倍', angle: -90, position: 'insideLeft' }} />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="営業レバレッジ" fill="#14b8a6" name="営業レバレッジ (倍)" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Benchmark Comparison */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">部門間ベンチマーク比較</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-96">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={benchmarkData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis type="number" fontSize={11} />
                                <YAxis type="category" dataKey="metric" fontSize={11} width={120} />
                                <Tooltip />
                                <Legend />
                                {departments.map((dept, idx) => (
                                    <Bar
                                        key={dept}
                                        dataKey={dept}
                                        fill={dept === selectedDepartment ? '#6366f1' : `hsl(${idx * 60}, 70%, 60%)`}
                                        opacity={dept === selectedDepartment ? 1 : 0.6}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function KPICard({ title, value, unit, trend, good, inverse }: {
    title: string;
    value: number;
    unit: string;
    trend?: number;
    good?: boolean;
    inverse?: boolean;
}) {
    const isGood = inverse ? !good : good;
    const trendIcon = trend !== undefined && trend > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />;
    const trendColor = trend !== undefined && trend > 0 ? "text-green-600" : "text-red-600";

    return (
        <Card className={`${isGood ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-slate-600">{title}</p>
                    {isGood ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                    )}
                </div>
                <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-slate-900">
                        {value.toFixed(unit === '千円' ? 0 : 1)}
                    </span>
                    <span className="text-sm text-slate-500">{unit}</span>
                </div>
                {trend !== undefined && (
                    <div className={`flex items-center gap-1 mt-1 text-xs ${trendColor}`}>
                        {trendIcon}
                        <span>{trend > 0 ? '+' : ''}{trend.toFixed(1)}%</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
