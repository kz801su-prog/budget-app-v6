"use client"

import { useState, useRef } from 'react';
import { Download, Upload, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    exportAllData,
    downloadBackup,
    downloadCompanyBackup,
    importBackupData,
    BackupData,
} from '@/lib/storage-utils';

interface BackupManagerProps {
    savedProfiles: { company: string; year: string }[];
    onDataImported: () => void;
}

export function BackupManager({ savedProfiles, onDataImported }: BackupManagerProps) {
    const [busy, setBusy]               = useState(false);
    const [importResult, setImportResult] = useState<string | null>(null);
    const fileInputRef                  = useRef<HTMLInputElement>(null);

    const handleExportAll = async () => {
        setBusy(true);
        try {
            const data = await exportAllData();
            downloadBackup(data);
        } catch (e: any) {
            alert(`エクスポート失敗: ${e.message}`);
        } finally {
            setBusy(false);
        }
    };

    const handleExportCompany = async (company: string, year: string) => {
        setBusy(true);
        try {
            await downloadCompanyBackup(company, year);
        } catch (e: any) {
            alert(`エクスポート失敗: ${e.message}`);
        } finally {
            setBusy(false);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
            setImportResult('❌ Excelファイルです。上のアップロード欄を使用してください。');
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        setBusy(true);
        setImportResult(null);

        try {
            const text = await file.text();
            let parsed: any;
            try {
                parsed = JSON.parse(text);
                if (typeof parsed === 'string') parsed = JSON.parse(parsed);
            } catch {
                throw new Error('JSON形式ではありません。');
            }

            let profilesToImport: any[] = [];

            if (parsed.profiles && Array.isArray(parsed.profiles)) {
                profilesToImport = parsed.profiles;
            } else if (Array.isArray(parsed)) {
                profilesToImport = parsed;
            } else if (parsed.companyName || parsed.company) {
                profilesToImport = [parsed];
            } else {
                // ストレージダンプからサルベージ
                Object.keys(parsed).forEach(key => {
                    if (key.startsWith('budget_app_data_')) {
                        try {
                            const val = typeof parsed[key] === 'string' ? JSON.parse(parsed[key]) : parsed[key];
                            if (val && (val.companyName || val.company)) profilesToImport.push(val);
                        } catch { /* ignore */ }
                    }
                });
            }

            if (profilesToImport.length === 0) {
                throw new Error('インポート可能なデータが見つかりませんでした。');
            }

            const normalizedProfiles = profilesToImport.map(p => ({
                companyName: p.companyName || p.company || 'Unknown',
                fiscalYear:  String(p.fiscalYear || p.year || new Date().getFullYear()),
                appMode:     p.appMode || 'standard',
                dataByMonth: p.dataByMonth || p.rows || {},
                lastUpdated: p.lastUpdated || new Date().toISOString(),
            }));

            const backupData: BackupData = {
                version:        '2.0',
                exportDate:     new Date().toISOString(),
                profiles:       normalizedProfiles,
                employeeCounts: parsed.employeeCounts || null,
            };

            const overwrite = confirm(
                savedProfiles.length > 0
                    ? '重複するデータを上書きしますか？'
                    : 'データをインポートしますか？'
            );

            const result = await importBackupData(backupData, overwrite);

            if (result.success || result.imported > 0) {
                setImportResult(`✅ ${result.imported}件の会社データを復元しました。`);
                onDataImported();
            } else {
                const errMsg = result.errors.length > 0 ? result.errors.join('\n') : 'インポートに失敗しました。';
                setImportResult(`⚠️ ${errMsg}`);
            }
        } catch (e: any) {
            setImportResult(`❌ エラー: ${e.message}`);
        } finally {
            setBusy(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <Card className="border-none shadow-md">
            <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                    <Database className="h-5 w-5 text-indigo-500" />
                    データバックアップ (SQL連携)
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Export All */}
                <Button
                    onClick={handleExportAll}
                    className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700"
                    disabled={busy || savedProfiles.length === 0}
                >
                    <Download className="h-4 w-4" />
                    {busy ? '処理中...' : `全データをバックアップ (${savedProfiles.length}件)`}
                </Button>

                {savedProfiles.length === 0 && (
                    <p className="text-xs text-slate-400 text-center">バックアップするデータがありません</p>
                )}

                {/* Import */}
                <div className="space-y-2">
                    <Input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleImport}
                        disabled={busy}
                        className="cursor-pointer"
                    />
                    <p className="text-xs text-slate-400">バックアップファイル (.json) を選択して復元</p>
                </div>

                {importResult && (
                    <div className="p-3 bg-slate-50 rounded text-xs whitespace-pre-line border border-slate-200">
                        {importResult}
                    </div>
                )}

                {/* Individual Company Exports */}
                {savedProfiles.length > 0 && (
                    <div className="pt-3 border-t border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-2">個別エクスポート</p>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                            {savedProfiles.map(p => (
                                <Button
                                    key={`${p.company}|${p.year}`}
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleExportCompany(p.company, p.year)}
                                    disabled={busy}
                                    className="w-full justify-between text-xs h-8"
                                >
                                    <span>{p.company} ({p.year})</span>
                                    <Download className="h-3 w-3" />
                                </Button>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
