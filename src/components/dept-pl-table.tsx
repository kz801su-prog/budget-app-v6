"use client"

import { useState } from 'react';
import { PnLData } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// calc-first: 累計は常に月次合計から算出
const FIRST_HALF  = [3, 4, 5, 6, 7, 8];
const SECOND_HALF = [9, 10, 11, 0, 1, 2];

interface DeptPLTableProps {
    data: PnLData;
    isThousands?: boolean;
    dataType?: 'actual' | 'budget' | 'prevYear';
    selectedDepartment?: string | null;
    allDepartments?: string[];
    onDepartmentChange?: (dept: string) => void;
    onToggleThousands?: () => void;
    onCellEdit?: (
        dept: string, code: string, subject: string,
        month: number, field: 'actual' | 'budget', rawValue: number,
    ) => void;
}

const MONTH_ORDER = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];
const MONTH_NAMES = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];

interface EditingCell { dept: string; code: string; subject: string; month: number; }

export function DeptPLTable({
    data, isThousands = true, dataType = 'actual',
    selectedDepartment = null, allDepartments = [],
    onDepartmentChange, onToggleThousands, onCellEdit,
}: DeptPLTableProps) {
    const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
    const [editValue, setEditValue]     = useState<string>('');
    const [saving, setSaving]           = useState(false);

    const canEdit = !!onCellEdit && dataType !== 'prevYear';
    const editField: 'actual' | 'budget' = dataType === 'budget' ? 'budget' : 'actual';

    const dataTypeLabels = {
        actual:   { jp: '実績', en: 'Actual' },
        budget:   { jp: '予算', en: 'Budget' },
        prevYear: { jp: '前年', en: 'Previous Year' },
    };
    const currentLabel = dataTypeLabels[dataType];

    const CORE_KEYWORDS = ['貸借対照表', '損益計算書', '販売費及び一般管理費', '販売費', '合併', '連結'];
    const isCoreSheet = (dept: string) => CORE_KEYWORDS.some(k => dept.includes(k));

    let deptRows = data.rows.filter(r => !isCoreSheet(r.department));
    if (selectedDepartment && selectedDepartment !== "All") {
        deptRows = deptRows.filter(r => r.department === selectedDepartment);
    }

    // Navigation
    const availableDepts = allDepartments.filter(d => d !== "All" && !isCoreSheet(d));
    const currentIndex   = selectedDepartment ? availableDepts.indexOf(selectedDepartment) : -1;
    const hasPrev = currentIndex > 0;
    const hasNext = availableDepts.length > 0 && currentIndex < availableDepts.length - 1;

    const handlePrev = () => { if (hasPrev && onDepartmentChange) onDepartmentChange(availableDepts[currentIndex - 1]); };
    const handleNext = () => {
        if (!onDepartmentChange) return;
        if (currentIndex === -1) onDepartmentChange(availableDepts[0]);
        else if (hasNext) onDepartmentChange(availableDepts[currentIndex + 1]);
    };

    const getVal = (row: typeof deptRows[0], m: number) => {
        const md = row.monthlyData[m];
        if (dataType === 'actual')   return md?.actual         || 0;
        if (dataType === 'budget')   return md?.budget         || 0;
        return md?.prevYearActual || 0;
    };

    const sumMonths = (row: typeof deptRows[0], months: number[]) =>
        months.reduce((s, m) => s + getVal(row, m), 0);

    const startEdit = (row: typeof deptRows[0], month: number) => {
        if (!canEdit) return;
        const rawVal = getVal(row, month);
        const displayVal = isThousands ? Math.floor(rawVal / 1000) : rawVal;
        setEditingCell({ dept: row.department, code: row.code, subject: row.subject, month });
        setEditValue(displayVal === 0 ? '' : String(displayVal));
    };

    const commitEdit = async (row: typeof deptRows[0], month: number) => {
        if (!onCellEdit) return;
        const typed    = parseFloat(editValue.replace(/,/g, '')) || 0;
        const rawValue = isThousands ? typed * 1000 : typed;
        setSaving(true);
        await onCellEdit(row.department, row.code, row.subject, month, editField, rawValue);
        setSaving(false);
        setEditingCell(null);
    };

    const isEditing = (row: typeof deptRows[0], month: number) =>
        editingCell?.dept === row.department &&
        editingCell?.code === row.code &&
        editingCell?.subject === row.subject &&
        editingCell?.month === month;

    const fmt = (v: number) => (isThousands ? Math.floor(v / 1000) : v).toLocaleString();

    return (
        <div className="space-y-6">
            <Card className="w-full overflow-hidden shadow-lg border-0">
                <CardHeader className="bg-slate-50 border-b pb-3">
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-xl">
                            各部{currentLabel.jp} - <span className="text-blue-600">{selectedDepartment || "全部門"}</span>
                        </CardTitle>

                        <div className="flex items-center gap-4">
                            {availableDepts.length > 0 && onDepartmentChange && (
                                <div className="flex items-center gap-2 mr-4 border-r pr-4 border-slate-200">
                                    <Button variant="outline" size="sm" onClick={handlePrev} disabled={!hasPrev} className="h-8 px-2">
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <span className="text-xs text-slate-600 min-w-[60px] text-center">
                                        {currentIndex >= 0 ? `${currentIndex + 1} / ${availableDepts.length}` : 'すべて'}
                                    </span>
                                    <Button variant="outline" size="sm" onClick={handleNext} disabled={!hasNext} className="h-8 px-2">
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                {canEdit && (
                                    <span className="text-[10px] text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                        ✏️ セルクリックで編集
                                    </span>
                                )}
                                {onToggleThousands && (
                                    <Button variant="outline" size="sm" onClick={onToggleThousands} className="h-7 text-[10px]">
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
                    <div className="h-[700px] w-full overflow-y-auto">
                            <Table className="min-w-[1700px]">
                                <TableHeader>
                                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                                        <TableHead className="w-[90px] sticky left-0 bg-slate-50 z-20 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Dept</TableHead>
                                        <TableHead className="w-[72px] sticky left-[90px] bg-slate-50 z-20 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Code</TableHead>
                                        <TableHead className="w-[180px] sticky left-[162px] bg-slate-50 z-20 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Subject</TableHead>
                                        {MONTH_NAMES.map(m => (
                                            <TableHead key={m} className="text-right min-w-[90px] text-slate-600 font-semibold">{m}</TableHead>
                                        ))}
                                        <TableHead className="text-right font-bold w-[110px] bg-blue-50 text-blue-900 border-l border-blue-100">1st Half<br /><span className="text-[10px] font-normal">{currentLabel.en}</span></TableHead>
                                        <TableHead className="text-right font-bold w-[110px] bg-blue-50 text-blue-900">2nd Half<br /><span className="text-[10px] font-normal">{currentLabel.en}</span></TableHead>
                                        <TableHead className="text-right font-bold w-[110px] bg-slate-100 text-slate-900 border-l">FY Total<br /><span className="text-[10px] font-normal">{currentLabel.en}</span></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {deptRows.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={17} className="h-32 text-center text-slate-400 text-sm">
                                                {dataType === 'prevYear'
                                                    ? '前年データがありません。前年分のExcelをアップロードしてください。'
                                                    : '部門別データがありません。各部門のシートが含まれたExcelをアップロードしてください。'}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {deptRows.map((row, idx) => {
                                        // calc-first
                                        const h1Val = sumMonths(row, FIRST_HALF);
                                        const h2Val = sumMonths(row, SECOND_HALF);
                                        const fyVal = h1Val + h2Val;

                                        return (
                                            <TableRow
                                                key={`${row.department}-${row.code}-${row.subject}`}
                                                className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}
                                            >
                                                <TableCell className={cn(
                                                    "text-[11px] font-medium text-indigo-600 sticky left-0 z-10 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] truncate max-w-[90px]",
                                                    idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                                                )} title={row.department}>{row.department.length > 10 ? row.department.slice(0, 9) + '…' : row.department}</TableCell>
                                                <TableCell className={cn(
                                                    "font-mono text-xs text-slate-500 sticky left-[90px] z-10 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]",
                                                    idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                                                )}>{row.code}</TableCell>
                                                <TableCell className={cn(
                                                    "sticky left-[162px] border-r font-medium text-sm z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]",
                                                    idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                                                )}>{row.subject}</TableCell>

                                                {MONTH_ORDER.map(m => {
                                                    const rawVal     = getVal(row, m);
                                                    const displayVal = isThousands ? Math.floor(rawVal / 1000) : rawVal;
                                                    const editing    = isEditing(row, m);

                                                    return (
                                                        <TableCell
                                                            key={m}
                                                            className={cn(
                                                                "text-right text-xs p-0",
                                                                canEdit ? "cursor-pointer hover:bg-indigo-50" : "",
                                                                editing ? "bg-indigo-50" : ""
                                                            )}
                                                            onClick={() => !editing && startEdit(row, m)}
                                                        >
                                                            {editing ? (
                                                                <input
                                                                    autoFocus
                                                                    className="w-full text-right text-xs px-1 py-0.5 border border-indigo-400 rounded outline-none bg-white"
                                                                    value={editValue}
                                                                    onChange={e => setEditValue(e.target.value)}
                                                                    onBlur={() => commitEdit(row, m)}
                                                                    onKeyDown={e => {
                                                                        if (e.key === 'Enter') commitEdit(row, m);
                                                                        if (e.key === 'Escape') setEditingCell(null);
                                                                    }}
                                                                    disabled={saving}
                                                                />
                                                            ) : (
                                                                <span className="px-2 py-1 block">
                                                                    {rawVal !== 0 ? displayVal.toLocaleString() : "-"}
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                    );
                                                })}

                                                {/* Totals (calc-first) */}
                                                <TableCell className="text-right font-bold text-sm bg-blue-50/50 border-l border-blue-100 text-blue-900 px-2">
                                                    {fmt(h1Val)}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-sm bg-blue-50/50 text-blue-900 px-2">
                                                    {fmt(h2Val)}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-sm bg-slate-100/50 border-l text-slate-900 px-2">
                                                    {fmt(fyVal)}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
