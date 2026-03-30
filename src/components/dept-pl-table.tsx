"use client"

import { PnLData } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DeptPLTableProps {
    data: PnLData;
    isThousands?: boolean;
    dataType?: 'actual' | 'budget' | 'prevYear';
    selectedDepartment?: string | null;
    allDepartments?: string[];
    onDepartmentChange?: (dept: string) => void;
    onToggleThousands?: () => void;
}

const MONTH_ORDER = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];
const MONTH_NAMES = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

export function DeptPLTable({ data, isThousands = true, dataType = 'actual', selectedDepartment = null, allDepartments = [], onDepartmentChange, onToggleThousands }: DeptPLTableProps) {
    const dataTypeLabels = {
        actual: { jp: '実績', en: 'Actual' },
        budget: { jp: '予算', en: 'Budget' },
        prevYear: { jp: '前年', en: 'Previous Year' }
    };
    const currentLabel = dataTypeLabels[dataType];

    // Filter out core sheets - show only departmental P/L sheets
    // Core sheets (全社シート) are excluded: 貸借対照表, 損益計算書, 販売費及び一般管理費
    const CORE_SHEETS = ['貸借対照表', '損益計算書', '販売費及び一般管理費'];

    let deptRows = data.rows.filter(r => {
        // Exclude exact matches of core sheets
        const isDepartmentSheet = !CORE_SHEETS.includes(r.department);
        return isDepartmentSheet;
    });

    // Apply department filter if selected
    if (selectedDepartment && selectedDepartment !== "All") {
        deptRows = deptRows.filter(r => r.department === selectedDepartment);
    }

    // Get unique departments
    const departments = [...new Set(deptRows.map(r => r.department))];

    // Navigation logic
    // Exclude 'All' and CORE_SHEETS from navigation
    const availableDepts = allDepartments.filter(d => d !== "All" && !CORE_SHEETS.includes(d));
    const currentIndex = selectedDepartment ? availableDepts.indexOf(selectedDepartment) : -1;
    const hasPrev = currentIndex > 0;
    // Allow Next even if currentIndex is -1 (start from first department)
    const hasNext = availableDepts.length > 0 && currentIndex < availableDepts.length - 1;

    const handlePrev = () => {
        if (hasPrev && onDepartmentChange) {
            onDepartmentChange(availableDepts[currentIndex - 1]);
        }
    };

    const handleNext = () => {
        if (onDepartmentChange) {
            if (currentIndex === -1) {
                // If currently "All" (or null), go to the first department
                onDepartmentChange(availableDepts[0]);
            } else if (hasNext) {
                onDepartmentChange(availableDepts[currentIndex + 1]);
            }
        }
    };

    // Debug information
    console.log('DeptPLTable Debug:', {
        totalRows: data.rows.length,
        deptRowsCount: deptRows.length,
        selectedDepartment: selectedDepartment,
        departments: departments,
        allDepartments: [...new Set(data.rows.map(r => r.department))],
        sampleDepartments: data.rows.slice(0, 10).map(r => r.department)
    });

    // Navigation debug
    console.log('DeptPLTable Navigation Debug:', {
        allDepartments: allDepartments,
        availableDepts: availableDepts,
        selectedDepartment: selectedDepartment,
        currentIndex: currentIndex,
        hasPrev: hasPrev,
        hasNext: hasNext,
        onDepartmentChange: typeof onDepartmentChange
    });

    return (
        <div className="space-y-6">
            <Card className="w-full overflow-hidden shadow-lg border-0">
                <CardHeader className="bg-slate-50 border-b pb-3">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <CardTitle className="text-xl">
                                各部{currentLabel.jp} (Departmental {currentLabel.en}) - <span className="text-blue-600">{selectedDepartment || "全部門"}</span>
                            </CardTitle>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Department Navigation - Right Aligned */}
                            {availableDepts.length > 0 && onDepartmentChange && (
                                <div className="flex items-center gap-2 mr-4 border-r pr-4 border-slate-200">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handlePrev}
                                        disabled={!hasPrev}
                                        className="h-8 px-2"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>

                                    <span className="text-xs text-slate-600 min-w-[60px] text-center">
                                        {currentIndex >= 0 ? `${currentIndex + 1} / ${availableDepts.length}` : 'すべて'}
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

                            <div className="flex items-center gap-2">
                                {onToggleThousands && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={onToggleThousands}
                                        className="h-7 text-[10px]"
                                    >
                                        {isThousands ? "円" : "千円"}
                                    </Button>
                                )}
                                <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border">
                                    単位: {isThousands ? "千円" : "円"}
                                </span>
                            </div>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    <div className="h-[700px] w-full overflow-auto">
                        <div className="min-w-[1600px]">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                                        <TableHead className="w-[150px] sticky left-0 bg-slate-50 z-20 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Department</TableHead>
                                        <TableHead className="w-[80px] sticky left-[150px] bg-slate-50 z-20 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Code</TableHead>
                                        <TableHead className="w-[200px] sticky left-[230px] bg-slate-50 z-20 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Subject</TableHead>

                                        {/* Months */}
                                        {MONTH_NAMES.map(m => (
                                            <TableHead key={m} className="text-right min-w-[100px] text-slate-600 font-semibold">{m}</TableHead>
                                        ))}

                                        {/* Calculated Totals */}
                                        <TableHead className="text-right font-bold w-[120px] bg-blue-50 text-blue-900 border-l border-blue-100">1st Half<br /><span className="text-[10px] font-normal">Actual</span></TableHead>
                                        <TableHead className="text-right font-bold w-[120px] bg-blue-50 text-blue-900 border-blue-100">2nd Half<br /><span className="text-[10px] font-normal">Actual</span></TableHead>
                                        <TableHead className="text-right font-bold w-[120px] bg-slate-100 text-slate-900 border-l">FY Total<br /><span className="text-[10px] font-normal">Actual</span></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {deptRows.map((row, idx) => {
                                        return (
                                            <TableRow key={`${row.department}-${row.code}-${row.subject}`} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                                                <TableCell className={cn(
                                                    "text-xs font-medium text-indigo-600 sticky left-0 z-10 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]",
                                                    idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                                                )}>{row.department}</TableCell>
                                                <TableCell className={cn(
                                                    "font-mono text-xs text-slate-500 sticky left-[150px] z-10 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]",
                                                    idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                                                )}>{row.code}</TableCell>
                                                <TableCell className={cn(
                                                    "sticky left-[230px] border-r font-medium text-sm z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]",
                                                    idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                                                )}>
                                                    {row.subject}
                                                </TableCell>

                                                {/* Monthly Data */}
                                                {MONTH_ORDER.map(m => {
                                                    const monthData = row.monthlyData[m];
                                                    const val = dataType === 'actual' ? (monthData?.actual || 0) :
                                                        dataType === 'budget' ? (monthData?.budget || 0) :
                                                            (monthData?.prevYearActual || 0);
                                                    const displayVal = isThousands ? Math.floor(val / 1000) : val;
                                                    return (
                                                        <TableCell key={m} className="text-right text-xs text-gray-600">
                                                            {val !== 0 ? displayVal.toLocaleString() : "-"}
                                                        </TableCell>
                                                    );
                                                })}

                                                {/* Totals */}
                                                <TableCell className="text-right font-bold text-sm bg-blue-50/50 border-l border-blue-100 text-blue-900">
                                                    {(isThousands ? Math.floor((row.totalFirstHalf[dataType === 'prevYear' ? 'prevYearActual' : dataType] || 0) / 1000) : (row.totalFirstHalf[dataType === 'prevYear' ? 'prevYearActual' : dataType] || 0)).toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-sm bg-blue-50/50 border-blue-100 text-blue-900">
                                                    {(isThousands ? Math.floor((row.totalSecondHalf[dataType === 'prevYear' ? 'prevYearActual' : dataType] || 0) / 1000) : (row.totalSecondHalf[dataType === 'prevYear' ? 'prevYearActual' : dataType] || 0)).toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-sm bg-slate-100/50 border-l text-slate-900">
                                                    {(isThousands ? Math.floor((row.totalAnnual[dataType === 'prevYear' ? 'prevYearActual' : dataType] || 0) / 1000) : (row.totalAnnual[dataType === 'prevYear' ? 'prevYearActual' : dataType] || 0)).toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </CardContent>
            </Card >
        </div >
    );
}
