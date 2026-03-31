"use client"

import { useMemo, useEffect, useState } from 'react';
import { PnLData, DeptHeadcount } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { analyzeDeptFinancials, DeptFinancialReport, DEPT_METRIC_DEFINITIONS } from '@/lib/dept-financial-analyzer';
import { getAllEmployeeCounts } from '@/lib/storage-utils';

interface DeptRatioTableProps {
    data: PnLData;
    selectedDepartment: string;
    companyName: string;
    fiscalYear: string;
}

const MONTH_NAMES = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const MONTH_INDICES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];

const CATEGORY_LABELS: Record<string, string> = {
    profitability: '収益性指標',
    cost_efficiency: '費用効率',
    growth: '成長性',
    productivity: '営業効率',
    quality: '利益構造の健全性',
    advanced: '高度分析'
};

export function DeptRatioTable({ data, selectedDepartment, companyName, fiscalYear }: DeptRatioTableProps) {
    const [employeeCounts, setEmployeeCounts] = useState<Record<string, DeptHeadcount>>({});

    // Load employee counts (async SQL)
    useEffect(() => {
        getAllEmployeeCounts(companyName, fiscalYear).then(counts => {
            setEmployeeCounts(counts);
        });
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

    // Analyze current department
    const currentReport = useMemo(() => {
        if (!selectedDepartment || selectedDepartment === "All") return null;

        const deptRows = data.rows.filter(r => r.department === selectedDepartment);
        const hc = employeeCounts[selectedDepartment] || { sales: 0, warehouse: 0, operations: 0, accounting: 0 };

        return analyzeDeptFinancials({
            department: selectedDepartment,
            rows: deptRows,
            headcount: hc
        });
    }, [data, selectedDepartment, employeeCounts]);

    // Group metrics by category
    const metricsByCategory = useMemo(() => {
        const grouped: Record<string, typeof DEPT_METRIC_DEFINITIONS> = {};

        DEPT_METRIC_DEFINITIONS.forEach(metric => {
            if (!grouped[metric.category]) {
                grouped[metric.category] = [];
            }
            grouped[metric.category].push(metric);
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

    return (
        <div className="space-y-6">
            {Object.entries(metricsByCategory).map(([category, metrics]) => (
                <Card key={category}>
                    <CardHeader className="bg-slate-50">
                        <CardTitle className="text-lg">
                            {CATEGORY_LABELS[category] || category}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-[400px] w-full">
                            <div className="min-w-[1600px]">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-50">
                                            <TableHead className="w-[200px] sticky left-0 bg-slate-50 border-r z-20 font-bold">
                                                指標名
                                            </TableHead>
                                            <TableHead className="w-[300px] sticky left-[200px] bg-slate-50 border-r z-20 font-bold">
                                                意味
                                            </TableHead>
                                            <TableHead className="w-[80px] sticky left-[500px] bg-slate-50 border-r z-20 font-bold text-center">
                                                単位
                                            </TableHead>

                                            {/* Months */}
                                            {MONTH_NAMES.map(m => (
                                                <TableHead key={m} className="text-right w-[100px]">{m}</TableHead>
                                            ))}

                                            {/* Periods */}
                                            <TableHead className="text-right w-[100px] bg-blue-50 border-l">1H</TableHead>
                                            <TableHead className="text-right w-[100px] bg-blue-50">2H</TableHead>
                                            <TableHead className="text-right w-[100px] bg-slate-100 border-l">FY</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {metrics.map((metric) => (
                                            <TableRow key={metric.id} className="hover:bg-indigo-50/30">
                                                <TableCell className="font-medium sticky left-0 bg-white border-r z-10 text-sm">
                                                    {metric.labelJp}
                                                    <br />
                                                    <span className="text-xs text-slate-500">{metric.labelEng}</span>
                                                </TableCell>
                                                <TableCell className="text-xs sticky left-[200px] bg-white border-r z-10 text-slate-600">
                                                    {metric.meaning}
                                                </TableCell>
                                                <TableCell className="text-xs sticky left-[500px] bg-white border-r z-10 text-center font-medium">
                                                    {metric.unit}
                                                </TableCell>

                                                {/* Monthly values */}
                                                {MONTH_INDICES.map(m => {
                                                    const val = currentReport.values[metric.id]?.[m] || 0;
                                                    const formatted = formatValue(val, metric.unit);
                                                    return (
                                                        <TableCell key={m} className="text-right text-xs">
                                                            <span className={getValueColor(val, metric.id)}>
                                                                {formatted}
                                                            </span>
                                                        </TableCell>
                                                    );
                                                })}

                                                {/* Period values */}
                                                {['1H', '2H', 'FY'].map((period, idx) => {
                                                    const val = currentReport.values[metric.id]?.[period] || 0;
                                                    const formatted = formatValue(val, metric.unit);
                                                    const bgClass = idx === 0 || idx === 1 ? 'bg-blue-50/50' : 'bg-slate-100/50';
                                                    const borderClass = idx === 0 || idx === 2 ? 'border-l' : '';
                                                    return (
                                                        <TableCell key={period} className={`text-right text-xs font-bold ${bgClass} ${borderClass}`}>
                                                            <span className={getValueColor(val, metric.id)}>
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
            ))}

            {/* Metric Explanations */}
            <Card>
                <CardHeader>
                    <CardTitle>指標の詳細説明</CardTitle>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[400px]">
                        <div className="space-y-4">
                            {Object.entries(metricsByCategory).map(([category, metrics]) => (
                                <div key={category}>
                                    <h3 className="font-bold text-lg mb-3 text-indigo-900 border-b pb-2">
                                        {CATEGORY_LABELS[category]}
                                    </h3>
                                    <div className="space-y-3 mb-6">
                                        {metrics.map(metric => (
                                            <div key={metric.id} className="bg-slate-50 p-3 rounded-lg">
                                                <div className="flex justify-between items-start mb-1">
                                                    <h4 className="font-semibold text-sm text-slate-900">
                                                        {metric.labelJp} ({metric.labelEng})
                                                    </h4>
                                                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                                                        {metric.unit}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-slate-600">{metric.meaning}</p>
                                                {getMetricGuidance(metric.id) && (
                                                    <p className="text-xs text-indigo-600 mt-1">
                                                        💡 {getMetricGuidance(metric.id)}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}

function formatValue(val: number, unit: string): string {
    if (unit === '%') {
        return val.toFixed(1);
    } else if (unit === '千円') {
        return Math.floor(val).toLocaleString();
    } else if (unit === '倍') {
        return val.toFixed(2);
    }
    return val.toFixed(1);
}

function getValueColor(val: number, metricId: string): string {
    // Color coding based on metric type and value
    const goodMetrics = ['gross_profit_margin', 'operating_margin', 'ordinary_margin', 'sales_growth', 'operating_profit_growth', 'sales_per_employee', 'profit_per_employee', 'operating_leverage'];
    const badMetrics = ['sga_ratio', 'labor_cost_ratio', 'advertising_ratio', 'variable_cost_ratio', 'fixed_cost_ratio', 'breakeven_ratio'];

    if (goodMetrics.includes(metricId)) {
        if (val > 10) return 'text-green-600 font-semibold';
        if (val > 5) return 'text-slate-900';
        return 'text-amber-600';
    }

    if (badMetrics.includes(metricId)) {
        if (val > 30) return 'text-red-600 font-semibold';
        if (val > 20) return 'text-amber-600';
        return 'text-green-600';
    }

    return 'text-slate-900';
}

function getMetricGuidance(metricId: string): string | null {
    const guidance: Record<string, string> = {
        'operating_margin': '一般的に10%以上が優良、5%未満は改善が必要',
        'sga_ratio': '業種により異なるが、30%以下が目安',
        'sales_growth': '5%以上の成長が理想的',
        'breakeven_ratio': '70%以下なら安全、90%以上は危険',
        'operating_leverage': '3倍以上は売上変動の影響が大きい',
        'sales_per_employee': '業種により異なるが、1,000万円以上が目安'
    };

    return guidance[metricId] || null;
}
