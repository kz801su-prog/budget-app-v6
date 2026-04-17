"use client"

import { useState } from 'react';
import { PnLData } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface BSTableProps {
    data: PnLData;
    isThousands?: boolean;
    dataType?: 'actual' | 'prevYear';
    onCellEdit?: (
        dept: string, code: string, subject: string,
        month: number, field: 'actual' | 'budget', rawValue: number,
    ) => void;
}

const MONTH_ORDER = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];
const MONTH_NAMES = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];

interface EditingCell { dept: string; code: string; subject: string; month: number; }

export function BSTable({ data, isThousands = true, dataType = 'actual', onCellEdit }: BSTableProps) {
    const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
    const [editValue, setEditValue]     = useState<string>('');
    const [saving, setSaving]           = useState(false);

    const canEdit = !!onCellEdit && dataType === 'actual';

    const bsRows    = data.rows.filter(r => r.department.includes('貸借対照表'));
    const dataLabel = dataType === 'actual' ? '実績' : '前年';

    const startEdit = (row: typeof bsRows[0], month: number) => {
        if (!canEdit) return;
        const rawVal     = row.monthlyData[month]?.actual || 0;
        const displayVal = isThousands ? Math.floor(rawVal / 1000) : rawVal;
        setEditingCell({ dept: row.department, code: row.code, subject: row.subject, month });
        setEditValue(displayVal === 0 ? '' : String(displayVal));
    };

    const commitEdit = async (row: typeof bsRows[0], month: number) => {
        if (!onCellEdit) return;
        const typed    = parseFloat(editValue.replace(/,/g, '')) || 0;
        const rawValue = isThousands ? typed * 1000 : typed;
        setSaving(true);
        await onCellEdit(row.department, row.code, row.subject, month, 'actual', rawValue);
        setSaving(false);
        setEditingCell(null);
    };

    const isEditing = (row: typeof bsRows[0], month: number) =>
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
                            貸借対照表 {dataLabel} (Balance Sheet {dataType === 'actual' ? 'Actual' : 'Previous Year'}) -{' '}
                            <span className="text-blue-600">Monthly Data</span>
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            {canEdit && (
                                <span className="text-[10px] text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                    ✏️ セルクリックで編集
                                </span>
                            )}
                            <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded border">
                                単位: {isThousands ? "千円" : "円"}
                            </span>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="h-[700px] w-full overflow-y-auto">
                            <Table className="min-w-[1600px]">
                                <TableHeader>
                                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                                        <TableHead className="w-[80px] sticky left-0 bg-slate-50 z-20 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Code</TableHead>
                                        <TableHead className="w-[200px] sticky left-[80px] bg-slate-50 z-20 border-r font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Subject</TableHead>
                                        {MONTH_NAMES.map(m => (
                                            <TableHead key={m} className="text-right min-w-[90px] text-slate-600 font-semibold">{m}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {bsRows.map((row, idx) => (
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
                                                const rawVal     = dataType === 'actual'
                                                    ? (row.monthlyData[m]?.actual || 0)
                                                    : (row.monthlyData[m]?.prevYearActual || 0);
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
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
