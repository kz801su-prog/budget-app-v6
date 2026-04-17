"use client"

import { useState, useEffect } from 'react';
import { PnLData } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const FIRST_HALF  = [3, 4, 5, 6, 7, 8];
const SECOND_HALF = [9, 10, 11, 0, 1, 2];
const Q1 = [3, 4, 5];
const Q2 = [6, 7, 8];
const Q3 = [9, 10, 11];
const Q4 = [0, 1, 2];

interface VarianceTableProps {
    data: PnLData;
    selectedDepartment: string | null;
    isThousands?: boolean;
    sheetFilter?: string[];
    dataType?: 'actual' | 'budget' | 'prevYear';
    onCellEdit?: (
        dept: string, code: string, subject: string,
        month: number, field: 'actual' | 'budget', rawValue: number,
    ) => void;
}

const MONTH_ORDER = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];
const MONTH_NAMES = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
const SEP_MONTH_IDX = 8; // monthIndex for September

type AdjMap = Record<string, number>; // key: `${dept}||${code}||${subject}`

interface EditingCell { dept: string; code: string; subject: string; month: number; }
interface EditingAdj  { dept: string; code: string; subject: string; }

export function VarianceTable({
    data, selectedDepartment, isThousands = true, sheetFilter, onCellEdit,
}: VarianceTableProps) {
    const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
    const [editValue, setEditValue]     = useState<string>('');
    const [saving, setSaving]           = useState(false);

    // 修正列
    const storageKey = `pl_variance_adj_${selectedDepartment ?? 'all'}_${sheetFilter?.join('_') ?? ''}`;
    const [adjMap, setAdjMap] = useState<AdjMap>({});
    const [editingAdj, setEditingAdj] = useState<EditingAdj | null>(null);
    const [adjEditValue, setAdjEditValue] = useState('');

    useEffect(() => {
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) setAdjMap(JSON.parse(raw));
        } catch { /* ignore */ }
    }, [storageKey]);

    const rowKey = (dept: string, code: string, subject: string) => `${dept}||${code}||${subject}`;

    const startAdjEdit = (dept: string, code: string, subject: string, currentRaw: number) => {
        setEditingAdj({ dept, code, subject });
        const display = isThousands ? Math.floor(currentRaw / 1000) : currentRaw;
        setAdjEditValue(display === 0 ? '' : String(display));
    };

    const commitAdjEdit = (dept: string, code: string, subject: string) => {
        const typed = parseFloat(adjEditValue.replace(/,/g, '')) || 0;
        const raw   = isThousands ? typed * 1000 : typed;
        const key   = rowKey(dept, code, subject);
        const next  = { ...adjMap, [key]: raw };
        setAdjMap(next);
        localStorage.setItem(storageKey, JSON.stringify(next));
        setEditingAdj(null);
    };

    let filteredRows = selectedDepartment
        ? data.rows.filter(r => r.department === selectedDepartment)
        : data.rows;

    if (sheetFilter && sheetFilter.length > 0) {
        filteredRows = filteredRows.filter(r =>
            sheetFilter.some(s => r.department.includes(s))
        );
    }

    const sumMonths = (row: typeof filteredRows[0], months: number[]) =>
        months.reduce((s, m) => s + (row.monthlyData[m]?.actual || 0), 0);

    const startEdit = (row: typeof filteredRows[0], month: number) => {
        if (!onCellEdit) return;
        const rawVal = row.monthlyData[month]?.actual || 0;
        const displayVal = isThousands ? Math.floor(rawVal / 1000) : rawVal;
        setEditingCell({ dept: row.department, code: row.code, subject: row.subject, month });
        setEditValue(displayVal === 0 ? '' : String(displayVal));
    };

    const commitEdit = async (row: typeof filteredRows[0], month: number) => {
        if (!onCellEdit) return;
        const typed    = parseFloat(editValue.replace(/,/g, '')) || 0;
        const rawValue = isThousands ? typed * 1000 : typed;
        setSaving(true);
        await onCellEdit(row.department, row.code, row.subject, month, 'actual', rawValue);
        setSaving(false);
        setEditingCell(null);
    };

    const isEditing = (row: typeof filteredRows[0], month: number) =>
        editingCell?.dept === row.department &&
        editingCell?.code === row.code &&
        editingCell?.subject === row.subject &&
        editingCell?.month === month;

    return (
        <div className="space-y-6">
            <Card className="w-full overflow-hidden shadow-lg border-0">
                <CardHeader className="bg-slate-50 border-b pb-4">
                    <div className="flex justify-between items-start">
                        <CardTitle className="text-xl">
                            P&L Matrix (Fiscal Year) -{' '}
                            <span className="text-blue-600">{selectedDepartment || "All Departments"}</span>
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            {onCellEdit && (
                                <span className="text-[10px] text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                    ✏️ セルクリックで編集
                                </span>
                            )}
                            <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                ✏️ Sep右の修正欄で中間修正
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border">
                                単位: {isThousands ? "千円" : "円"}
                            </span>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="h-[700px] w-full overflow-y-auto">
                            <Table className="min-w-[2000px]">
                                <TableHeader>
                                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                                        <TableHead className="w-[80px] sticky left-0 bg-slate-50 z-20 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Code</TableHead>
                                        <TableHead className="w-[200px] sticky left-[80px] bg-slate-50 z-20 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Subject</TableHead>
                                        {MONTH_NAMES.map((name, i) => (
                                            <TableHead key={name} className="text-right min-w-[90px] text-slate-600 font-semibold">
                                                {name}
                                                {MONTH_ORDER[i] === SEP_MONTH_IDX && (
                                                    <span className="block text-[9px] text-amber-500">↓修正</span>
                                                )}
                                            </TableHead>
                                        ))}
                                        {/* Sep直後の修正列ヘッダー */}
                                        <TableHead className="text-right min-w-[90px] bg-amber-50 text-amber-800 font-bold border-x border-amber-200">
                                            修正<br /><span className="text-[10px] font-normal">Adj</span>
                                        </TableHead>
                                        <TableHead className="text-right font-bold w-[100px] bg-green-50 text-green-900 border-l border-green-100">1Q<br /><span className="text-[10px] font-normal">Apr-Jun</span></TableHead>
                                        <TableHead className="text-right font-bold w-[100px] bg-green-50 text-green-900 border-green-100">2Q<br /><span className="text-[10px] font-normal">Jul-Sep</span></TableHead>
                                        <TableHead className="text-right font-bold w-[110px] bg-blue-50 text-blue-900 border-l border-blue-100">1H<br /><span className="text-[10px] font-normal">上期合計</span></TableHead>
                                        <TableHead className="text-right font-bold w-[100px] bg-orange-50 text-orange-900 border-l border-orange-100">3Q<br /><span className="text-[10px] font-normal">Oct-Dec</span></TableHead>
                                        <TableHead className="text-right font-bold w-[100px] bg-orange-50 text-orange-900 border-orange-100">4Q<br /><span className="text-[10px] font-normal">Jan-Mar</span></TableHead>
                                        <TableHead className="text-right font-bold w-[110px] bg-blue-50 text-blue-900 border-l border-blue-100">2H<br /><span className="text-[10px] font-normal">下期合計</span></TableHead>
                                        <TableHead className="text-right font-bold w-[110px] bg-slate-100 text-slate-900 border-l">FY Total<br /><span className="text-[10px] font-normal">年間</span></TableHead>
                                        <TableHead className="text-right font-bold w-[100px] text-xs">Var %<br />(vs Bud)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredRows.map((row, idx) => {
                                        const key    = rowKey(row.department, row.code, row.subject);
                                        const adjRaw = adjMap[key] || 0;
                                        const adjDisplay = isThousands ? Math.floor(adjRaw / 1000) : adjRaw;
                                        const isEditingAdjCell = editingAdj?.dept === row.department &&
                                            editingAdj?.code === row.code &&
                                            editingAdj?.subject === row.subject;

                                        const q1Val  = sumMonths(row, Q1);
                                        const q2Val  = sumMonths(row, Q2);
                                        const q3Val  = sumMonths(row, Q3);
                                        const q4Val  = sumMonths(row, Q4);
                                        const h1Val  = q1Val + q2Val;
                                        const h2Val  = q3Val + q4Val;
                                        const fyVal  = h1Val + h2Val + adjRaw; // 修正値を年間合計に加算
                                        const budFY  = FIRST_HALF.concat(SECOND_HALF).reduce((s, m) => s + (row.monthlyData[m]?.budget || 0), 0);
                                        const varPct = budFY !== 0
                                            ? ((fyVal - budFY) / budFY) * 100
                                            : 0;

                                        const fmt = (v: number) =>
                                            (isThousands ? Math.floor(v / 1000) : v).toLocaleString();

                                        return (
                                            <TableRow
                                                key={`${row.department}-${row.code}-${row.subject}`}
                                                className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}
                                            >
                                                <TableCell className={cn(
                                                    "font-mono text-xs text-slate-500 sticky left-0 z-10 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]",
                                                    idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                                                )}>{row.code}</TableCell>
                                                <TableCell className={cn(
                                                    "sticky left-[80px] border-r font-medium text-sm z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]",
                                                    idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                                                )}>{row.subject}</TableCell>

                                                {MONTH_ORDER.map(m => {
                                                    const rawVal     = row.monthlyData[m]?.actual || 0;
                                                    const displayVal = isThousands ? Math.floor(rawVal / 1000) : rawVal;
                                                    const editing    = isEditing(row, m);

                                                    return (
                                                        <TableCell
                                                            key={m}
                                                            className={cn(
                                                                "text-right text-xs p-0",
                                                                onCellEdit ? "cursor-pointer hover:bg-indigo-50" : "",
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

                                                {/* 修正列セル */}
                                                <TableCell
                                                    className="text-right text-xs bg-amber-50/60 border-x border-amber-200 cursor-pointer hover:bg-amber-100 p-0"
                                                    onClick={() => !isEditingAdjCell && startAdjEdit(row.department, row.code, row.subject, adjRaw)}
                                                >
                                                    {isEditingAdjCell ? (
                                                        <input
                                                            autoFocus
                                                            className="w-full text-right text-xs px-1 py-0.5 border border-amber-400 rounded outline-none bg-white"
                                                            value={adjEditValue}
                                                            onChange={e => setAdjEditValue(e.target.value)}
                                                            onBlur={() => commitAdjEdit(row.department, row.code, row.subject)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') commitAdjEdit(row.department, row.code, row.subject);
                                                                if (e.key === 'Escape') setEditingAdj(null);
                                                            }}
                                                        />
                                                    ) : (
                                                        <span className="px-2 py-1 block text-amber-700 font-semibold">
                                                            {adjRaw !== 0 ? adjDisplay.toLocaleString() : "-"}
                                                        </span>
                                                    )}
                                                </TableCell>

                                                {/* Quarterly / Half / Annual Totals */}
                                                <TableCell className="text-right font-bold text-sm bg-green-50/50 border-l border-green-100 text-green-900 px-2">
                                                    {fmt(q1Val)}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-sm bg-green-50/50 text-green-900 px-2">
                                                    {fmt(q2Val)}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-sm bg-blue-50/50 border-l border-blue-100 text-blue-900 px-2">
                                                    {fmt(h1Val)}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-sm bg-orange-50/50 border-l border-orange-100 text-orange-900 px-2">
                                                    {fmt(q3Val)}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-sm bg-orange-50/50 text-orange-900 px-2">
                                                    {fmt(q4Val)}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-sm bg-blue-50/50 border-l border-blue-100 text-blue-900 px-2">
                                                    {fmt(h2Val)}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-sm bg-slate-100/50 border-l text-slate-900 px-2">
                                                    {fmt(fyVal)}
                                                </TableCell>

                                                <TableCell className="text-right px-2">
                                                    {budFY !== 0 && (
                                                        <span className={`text-xs font-bold ${varPct > 0 ? "text-red-500" : "text-green-600"}`}>
                                                            {varPct.toFixed(1)}%
                                                        </span>
                                                    )}
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
