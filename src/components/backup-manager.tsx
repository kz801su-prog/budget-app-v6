"use client"

import { useState, useRef, useEffect } from 'react';
import { Download, Upload, Clock, AlertTriangle, CheckCircle2, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    exportAllData,
    downloadBackup,
    downloadCompanyBackup,
    importBackupData,
    getLastBackupTime,
    isBackupNeeded,
    BackupData
} from '@/lib/storage-utils';

interface BackupManagerProps {
    savedProfiles: { company: string; year: string }[];
    onDataImported: () => void;
}

export function BackupManager({ savedProfiles, onDataImported }: BackupManagerProps) {
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<string | null>(null);
    const [lastBackup, setLastBackup] = useState<Date | null>(null);
    const [needsBackup, setNeedsBackup] = useState(true); // Default to true to avoid hydration mismatch
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Get backup status only on client side to avoid SSR mismatch
    useEffect(() => {
        setLastBackup(getLastBackupTime());
        setNeedsBackup(isBackupNeeded());
    }, [savedProfiles]);

    const handleExportAll = () => {
        const data = exportAllData();
        downloadBackup(data);
    };

    const handleExportCompany = (company: string, year: string) => {
        try {
            downloadCompanyBackup(company, year);
        } catch (e: any) {
            alert(`Export failed: ${e.message}`);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
            setImportResult(`❌ これはExcelファイルです。上のアップロード欄（ドラッグ＆ドロップ）を使用してください。`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        setImporting(true);
        setImportResult(null);

        try {
            const text = await file.text();
            let parsed;
            try {
                parsed = JSON.parse(text);
                if (typeof parsed === 'string') parsed = JSON.parse(parsed);
            } catch (jsonErr) {
                throw new Error('JSON形式ではありません。正しいバックアップファイルを選択してください。');
            }

            let profilesToImport: any[] = [];

            // 1. 標準的な BackupData 形式かチェック
            if (parsed.profiles && Array.isArray(parsed.profiles)) {
                profilesToImport = parsed.profiles;
            }
            // 2. 配列（プロフィールのリスト）そのものかチェック
            else if (Array.isArray(parsed)) {
                profilesToImport = parsed;
            }
            // 3. 単一のプロフィールかチェック
            else if (parsed.companyName || parsed.company) {
                profilesToImport = [parsed];
            }
            // 4. ストレージダンプから抽出（以前のサルベージ機能）
            else {
                const salvaged: any[] = [];
                Object.keys(parsed).forEach(key => {
                    if (key.startsWith('budget_app_data_')) {
                        try {
                            const val = typeof parsed[key] === 'string' ? JSON.parse(parsed[key]) : parsed[key];
                            if (val && (val.companyName || val.company)) salvaged.push(val);
                        } catch (e) { }
                    }
                });
                profilesToImport = salvaged;
            }

            if (profilesToImport.length === 0) {
                throw new Error('インポート可能なデータがファイル内に見つかりませんでした。');
            }

            // データの正規化（古いキーを新しいキーに合わせる）
            const normalizedProfiles = profilesToImport.map(p => ({
                companyName: p.companyName || p.company || 'Unknown',
                fiscalYear: String(p.fiscalYear || p.year || new Date().getFullYear()),
                dataByMonth: p.dataByMonth || p.rows || {},
                lastUpdated: p.lastUpdated || new Date().toISOString()
            }));

            const backupData: BackupData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                profiles: normalizedProfiles,
                metadata: parsed.metadata || null,
                employeeCounts: parsed.employeeCounts || null
            };

            const hasExisting = savedProfiles.length > 0;
            let overwrite = confirm(hasExisting ? `重複するデータを上書きしますか？` : `データをインポートしますか？`);

            const result = importBackupData(backupData, overwrite);

            if (result.success || result.imported > 0) {
                setImportResult(`✅ ${result.imported}件の会社データを復元しました。`);
                onDataImported();
            } else {
                setImportResult(`⚠️ インポートに失敗しました。ファイルが空である可能性があります。`);
            }
        } catch (e: any) {
            setImportResult(`❌ エラー: ${e.message}`);
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <Card className="border-none shadow-md">
            <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                    <Database className="h-5 w-5 text-indigo-500" />
                    データバックアップ
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Backup Status */}
                <div className={`p-3 rounded-lg flex items-start gap-2 text-sm ${needsBackup
                    ? 'bg-amber-50 border border-amber-200'
                    : 'bg-green-50 border border-green-200'
                    }`}>
                    {needsBackup ? (
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    )}
                    <div>
                        <div className="font-medium text-slate-700">
                            {needsBackup ? 'バックアップ推奨' : 'バックアップ済み'}
                        </div>
                        {lastBackup ? (
                            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                最終: {lastBackup.toLocaleString('ja-JP')}
                            </div>
                        ) : (
                            <div className="text-xs text-slate-500 mt-1">
                                まだバックアップがありません
                            </div>
                        )}
                    </div>
                </div>

                {/* Export All */}
                <div className="space-y-2">
                    <Button
                        onClick={handleExportAll}
                        className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700"
                        disabled={savedProfiles.length === 0}
                    >
                        <Download className="h-4 w-4" />
                        全データをバックアップ ({savedProfiles.length}件)
                    </Button>

                    {savedProfiles.length === 0 && (
                        <p className="text-xs text-slate-400 text-center">
                            バックアップするデータがありません
                        </p>
                    )}
                </div>

                {/* Import */}
                <div className="space-y-2">
                    <Input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleImport}
                        disabled={importing}
                        className="cursor-pointer"
                    />
                    <p className="text-xs text-slate-400">
                        バックアップファイル (.json) を選択して復元
                    </p>
                </div>

                {importResult && (
                    <div className="p-3 bg-slate-50 rounded text-xs whitespace-pre-line border border-slate-200">
                        {importResult}
                    </div>
                )}

                {/* Individual Company Exports */}
                {savedProfiles.length > 0 && (
                    <div className="pt-3 border-t border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-2">
                            個別エクスポート
                        </p>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                            {savedProfiles.map(p => (
                                <Button
                                    key={`${p.company}|${p.year}`}
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleExportCompany(p.company, p.year)}
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
