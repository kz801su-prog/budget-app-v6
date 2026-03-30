"use client"

import { PnLData } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils'; // Assuming cn exists or use clsx directly

interface VarianceTableProps {
    data: PnLData;
    selectedDepartment: string | null;
    isThousands?: boolean;
    sheetFilter?: string[];
    dataType?: 'actual' | 'budget' | 'prevYear';
}

// Fiscal Year Order: Apr=3 ... Dec=11, Jan=0 ... Mar=2
const MONTH_ORDER = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];
const MONTH_NAMES = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

export function VarianceTable({ data, selectedDepartment, isThousands = true, sheetFilter }: VarianceTableProps) {
    // Filter rows by department if selected
    let filteredRows = selectedDepartment
        ? data.rows.filter(r => r.department === selectedDepartment)
        : data.rows;

    // Apply sheet filter if provided
    if (sheetFilter && sheetFilter.length > 0) {
        filteredRows = filteredRows.filter(r =>
            sheetFilter.some(sheet => r.department.includes(sheet))
        );
    }

    return (
        <div className="space-y-6">
            <Card className="w-full overflow-hidden shadow-lg border-0">
                <CardHeader className="bg-slate-50 border-b pb-4">
                    <div className="flex justify-between items-start">
                        <CardTitle className="text-xl">
                            P&L Matrix (Fiscal Year) - <span className="text-blue-600">{selectedDepartment || "All Departments"}</span>
                        </CardTitle>
                        <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border">
                            単位: {isThousands ? "千円" : "円"}
                        </span>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="h-[700px] w-full overflow-auto">
                        {/* 
                   Increased min-w to accommodate new columns.
                   Columns: Code(100) + Subject(200) + 12 Months(80*12=960) + 
                   1st Half(100) + 2nd Half(100) + Total(100) + Variance(80) 
                   ~ 1600px 
               */}
                        <div className="min-w-[1600px]">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                                        <TableHead className="w-[80px] sticky left-0 bg-slate-50 z-20 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Code</TableHead>
                                        <TableHead className="w-[200px] sticky left-[80px] bg-slate-50 z-20 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Subject</TableHead>

                                        {/* Months */}
                                        {MONTH_NAMES.map(m => (
                                            <TableHead key={m} className="text-right min-w-[100px] text-slate-600 font-semibold">{m}</TableHead>
                                        ))}

                                        {/* Quarterly Totals */}
                                        <TableHead className="text-right font-bold w-[110px] bg-green-50 text-green-900 border-l border-green-100">1Q<br /><span className="text-[10px] font-normal">Apr-Jun</span></TableHead>
                                        <TableHead className="text-right font-bold w-[110px] bg-green-50 text-green-900 border-green-100">2Q<br /><span className="text-[10px] font-normal">Jul-Sep</span></TableHead>
                                        <TableHead className="text-right font-bold w-[120px] bg-blue-50 text-blue-900 border-l border-blue-100">1H<br /><span className="text-[10px] font-normal">上期合計</span></TableHead>
                                        <TableHead className="text-right font-bold w-[110px] bg-orange-50 text-orange-900 border-l border-orange-100">3Q<br /><span className="text-[10px] font-normal">Oct-Dec</span></TableHead>
                                        <TableHead className="text-right font-bold w-[110px] bg-orange-50 text-orange-900 border-orange-100">4Q<br /><span className="text-[10px] font-normal">Jan-Mar</span></TableHead>
                                        <TableHead className="text-right font-bold w-[120px] bg-blue-50 text-blue-900 border-l border-blue-100">2H<br /><span className="text-[10px] font-normal">下期合計</span></TableHead>
                                        <TableHead className="text-right font-bold w-[120px] bg-slate-100 text-slate-900 border-l">FY Total<br /><span className="text-[10px] font-normal">年間</span></TableHead>

                                        {/* Variance */}
                                        <TableHead className="text-right font-bold w-[110px] text-xs">Var %<br />(vs Bud)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredRows.map((row, idx) => {
                                        const variancePercent = row.totalAnnual.budget !== 0
                                            ? ((row.totalAnnual.actual - row.totalAnnual.budget) / row.totalAnnual.budget) * 100
                                            : 0;

                                        // Alternating row colors for readability
                                        return (
                                            <TableRow key={`${row.department}-${row.code}-${row.subject}`} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                                                <TableCell className={cn(
                                                    "font-mono text-xs text-slate-500 sticky left-0 z-10 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]",
                                                    idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                                                )}>{row.code}</TableCell>
                                                <TableCell className={cn(
                                                    "sticky left-[80px] border-r font-medium text-sm z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]",
                                                    idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                                                )}>
                                                    {row.subject}
                                                </TableCell>

                                                {/* Monthly Data */}
                                                {MONTH_ORDER.map(m => {
                                                    const val = row.monthlyData[m]?.actual || 0;
                                                    const displayVal = isThousands ? Math.floor(val / 1000) : val;
                                                    return (
                                                        <TableCell key={m} className="text-right text-xs text-gray-600">
                                                            {val !== 0 ? displayVal.toLocaleString() : "-"}
                                                        </TableCell>
                                                    );
                                                })}

                                                {/* Quarterly Totals */}
                                                <TableCell className="text-right font-bold text-sm bg-green-50/50 border-l border-green-100 text-green-900">
                                                    {(() => {
                                                        const q1 = (row.monthlyData[3]?.actual || 0) + (row.monthlyData[4]?.actual || 0) + (row.monthlyData[5]?.actual || 0);
                                                        return (isThousands ? Math.floor(q1 / 1000) : q1).toLocaleString();
                                                    })()}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-sm bg-green-50/50 border-green-100 text-green-900">
                                                    {(() => {
                                                        const q2 = (row.monthlyData[6]?.actual || 0) + (row.monthlyData[7]?.actual || 0) + (row.monthlyData[8]?.actual || 0);
                                                        return (isThousands ? Math.floor(q2 / 1000) : q2).toLocaleString();
                                                    })()}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-sm bg-blue-50/50 border-l border-blue-100 text-blue-900">
                                                    {(isThousands ? Math.floor(row.totalFirstHalf.actual / 1000) : row.totalFirstHalf.actual).toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-sm bg-orange-50/50 border-l border-orange-100 text-orange-900">
                                                    {(() => {
                                                        const q3 = (row.monthlyData[9]?.actual || 0) + (row.monthlyData[10]?.actual || 0) + (row.monthlyData[11]?.actual || 0);
                                                        return (isThousands ? Math.floor(q3 / 1000) : q3).toLocaleString();
                                                    })()}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-sm bg-orange-50/50 border-orange-100 text-orange-900">
                                                    {(() => {
                                                        const q4 = (row.monthlyData[0]?.actual || 0) + (row.monthlyData[1]?.actual || 0) + (row.monthlyData[2]?.actual || 0);
                                                        return (isThousands ? Math.floor(q4 / 1000) : q4).toLocaleString();
                                                    })()}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-sm bg-blue-50/50 border-l border-blue-100 text-blue-900">
                                                    {(isThousands ? Math.floor(row.totalSecondHalf.actual / 1000) : row.totalSecondHalf.actual).toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-sm bg-slate-100/50 border-l text-slate-900">
                                                    {(isThousands ? Math.floor(row.totalAnnual.actual / 1000) : row.totalAnnual.actual).toLocaleString()}
                                                </TableCell>

                                                {/* Variance */}
                                                <TableCell className="text-right">
                                                    {row.totalAnnual.budget !== 0 && (
                                                        <span className={`text-xs font-bold ${variancePercent > 0 ? "text-red-500" : "text-green-600"}`}>
                                                            {variancePercent.toFixed(1)}%
                                                        </span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
