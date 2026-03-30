"use client"

import { PnLData } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface BSTableProps {
    data: PnLData;
    isThousands?: boolean;
    dataType?: 'actual' | 'prevYear';
}

const MONTH_ORDER = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];
const MONTH_NAMES = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

export function BSTable({ data, isThousands = true, dataType = 'actual' }: BSTableProps) {
    // Filter to only show BS sheet (貸借対照表)
    const bsRows = data.rows.filter(r => r.department.includes('貸借対照表'));

    const dataLabel = dataType === 'actual' ? '実績' : '前年';

    return (
        <div className="space-y-6">
            <Card className="w-full overflow-hidden shadow-lg border-0">
                <CardHeader className="bg-slate-50 border-b pb-4">
                    <div className="flex justify-between items-start">
                        <CardTitle className="text-xl">
                            貸借対照表 {dataLabel} (Balance Sheet {dataType === 'actual' ? 'Actual' : 'Previous Year'}) - <span className="text-blue-600">Monthly Data</span>
                        </CardTitle>
                        <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border">
                            単位: {isThousands ? "千円" : "円"}
                        </span>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="h-[700px] w-full overflow-auto">
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
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {bsRows.map((row, idx) => {
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
                                                    const monthData = row.monthlyData[m];
                                                    const val = dataType === 'actual' ? (monthData?.actual || 0) : (monthData?.prevYearActual || 0);
                                                    const displayVal = isThousands ? Math.floor(val / 1000) : val;
                                                    return (
                                                        <TableCell key={m} className="text-right text-xs text-gray-600">
                                                            {val !== 0 ? displayVal.toLocaleString() : "-"}
                                                        </TableCell>
                                                    );
                                                })}
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
