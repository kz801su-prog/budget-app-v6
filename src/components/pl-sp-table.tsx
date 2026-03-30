"use client"

import { PnLData } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface PLSpTableProps {
    data: PnLData;
    isThousands?: boolean;
    fiscalYear?: string;
}

const MONTH_ORDER = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];
const MONTH_NAMES = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

export function PLSpTable({ data, isThousands = true, fiscalYear = "2026" }: PLSpTableProps) {
    const currentYear = parseInt(fiscalYear);
    const prevYear = currentYear - 1;

    // Filter to P/L sheets only (損益計算書, 販売費及び一般管理費, 合併, 連結)
    const plSheets = ['損益計算書', '販売費及び一般管理費', '合併', '連結'];
    const plRows = data.rows.filter(r => plSheets.some(sheet => r.department.includes(sheet)))
        .sort((a, b) => {
            // 合併を最優先、次に損益計算書、次に販売費及び一般管理費
            if (a.department.includes('合併') && !b.department.includes('合併')) return -1;
            if (!a.department.includes('合併') && b.department.includes('合併')) return 1;
            if (a.department.includes('損益計算書') && b.department.includes('販売費')) return -1;
            if (a.department.includes('販売費') && b.department.includes('損益計算書')) return 1;
            return 0;
        });

    const renderTable = (dataType: 'budget' | 'prevYear') => {
        const dataLabel = dataType === 'budget' 
            ? { jp: `${currentYear}年度 予算`, en: `FY${currentYear} Budget` } 
            : { jp: `${prevYear}年度 実績`, en: `FY${prevYear} Actual` };

        return (
            <div className="h-[700px] w-full overflow-auto">
                <div className="min-w-[1900px]">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50 hover:bg-slate-50">
                                <TableHead className="w-[80px] sticky left-0 bg-slate-50 z-20 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Code</TableHead>
                                <TableHead className="w-[200px] sticky left-[80px] bg-slate-50 z-20 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Subject</TableHead>

                                {/* Months */}
                                {MONTH_NAMES.map(m => (
                                    <TableHead key={m} className="text-right min-w-[100px] text-slate-600 font-semibold">{m}</TableHead>
                                ))}

                                {/* Totals */}
                                <TableHead className="text-right font-bold w-[120px] bg-blue-50 text-blue-900 border-l border-blue-100 italic">1st Half<br /><span className="text-[10px] font-normal">{dataLabel.jp}</span></TableHead>
                                <TableHead className="text-right font-bold w-[120px] bg-blue-50 text-blue-900 border-blue-100 italic">2nd Half<br /><span className="text-[10px] font-normal">{dataLabel.jp}</span></TableHead>
                                <TableHead className="text-right font-bold w-[130px] bg-blue-100 text-blue-900 border-l-2 border-blue-200">年間合計 (Annual)<br /><span className="text-[10px] font-normal text-blue-700">{dataLabel.jp}</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {plRows.map((row, idx) => {
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
                                            const val = dataType === 'budget' ? (monthData?.budget || 0) : (monthData?.prevYearActual || 0);
                                            const displayVal = isThousands ? Math.floor(val / 1000) : val;
                                            return (
                                                <TableCell key={m} className="text-right text-xs text-gray-600">
                                                    {val !== 0 ? displayVal.toLocaleString() : "-"}
                                                </TableCell>
                                            );
                                        })}

                                        {/* Totals */}
                                        <TableCell className="text-right font-bold text-sm bg-blue-50/50 border-l border-blue-100 text-blue-900 italic">
                                            {(isThousands ? Math.floor((row.totalFirstHalf[dataType === 'budget' ? 'budget' : 'prevYearActual'] || 0) / 1000) : (row.totalFirstHalf[dataType === 'budget' ? 'budget' : 'prevYearActual'] || 0)).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-sm bg-blue-50/50 border-blue-100 text-blue-900 italic">
                                            {(isThousands ? Math.floor((row.totalSecondHalf[dataType === 'budget' ? 'budget' : 'prevYearActual'] || 0) / 1000) : (row.totalSecondHalf[dataType === 'budget' ? 'budget' : 'prevYearActual'] || 0)).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-sm bg-blue-100/30 border-l-2 border-blue-100 text-blue-900">
                                            {(isThousands ? Math.floor((row.totalAnnual[dataType === 'budget' ? 'budget' : 'prevYearActual'] || 0) / 1000) : (row.totalAnnual[dataType === 'budget' ? 'budget' : 'prevYearActual'] || 0)).toLocaleString()}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <Card className="w-full overflow-hidden shadow-lg border-0">
                <CardHeader className="bg-slate-50 border-b pb-4">
                    <div className="flex justify-between items-start">
                        <CardTitle className="text-xl">
                            P/L 比較 (P/L Comparison) - <span className="text-blue-600">予算 & 前年実績 ({currentYear} vs {prevYear})</span>
                        </CardTitle>
                        <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border">
                            単位: {isThousands ? "千円" : "円"}
                        </span>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Tabs defaultValue="budget" className="w-full">
                        <TabsList className="w-full grid grid-cols-2 h-12">
                            <TabsTrigger value="budget" className="text-base">{currentYear}年度 予算 (FY{currentYear} Budget)</TabsTrigger>
                            <TabsTrigger value="prevYear" className="text-base">{prevYear}年度 実績 (FY{prevYear} Actual)</TabsTrigger>
                        </TabsList>

                        <TabsContent value="budget" className="mt-0">
                            {renderTable('budget')}
                        </TabsContent>

                        <TabsContent value="prevYear" className="mt-0">
                            {renderTable('prevYear')}
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
