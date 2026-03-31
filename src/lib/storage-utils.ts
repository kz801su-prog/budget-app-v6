import { DeptHeadcount } from './types';
import { callApi } from './api';

// ─────────────────────────────────────────────────────────────
// 従業員数 (SQL ベース)
// ─────────────────────────────────────────────────────────────

export interface DepartmentEmployeeCounts {
    [companyYear: string]: {
        [department: string]: DeptHeadcount;
    };
}

const DEFAULT_HEADCOUNT: DeptHeadcount = {
    sales: 0, warehouse: 0, operations: 0, accounting: 0,
};

export async function getAllEmployeeCounts(
    company: string, year: string,
): Promise<Record<string, DeptHeadcount>> {
    try {
        const res = await callApi('get_employee_counts', { company, year: parseInt(year) });
        if (res.success) return res.counts as Record<string, DeptHeadcount>;
    } catch (e) {
        console.warn('[EmployeeCounts] SQL fetch failed', e);
    }
    return {};
}

export async function getEmployeeCount(
    company: string, year: string, department: string,
): Promise<DeptHeadcount> {
    const all = await getAllEmployeeCounts(company, year);
    return all[department] ?? { ...DEFAULT_HEADCOUNT };
}

export async function setEmployeeCount(
    company: string, year: string, department: string, count: DeptHeadcount,
): Promise<void> {
    await callApi('save_employee_count', {
        company, year: parseInt(year), department, count,
    });
}

// ─────────────────────────────────────────────────────────────
// バックアップ
// ─────────────────────────────────────────────────────────────

export interface BackupData {
    version: string;
    exportDate: string;
    profiles: any[];
    employeeCounts?: any;
}

/** SQL から全データを取得して BackupData 形式で返す */
export async function exportAllData(): Promise<BackupData> {
    try {
        const res = await callApi('export_all_data');
        if (res.success) {
            return {
                version: res.version ?? '2.0',
                exportDate: res.exportDate ?? new Date().toISOString(),
                profiles: res.profiles ?? [],
                employeeCounts: res.employeeCounts ?? {},
            };
        }
    } catch (e) {
        console.error('[Backup] export_all_data failed', e);
    }
    return { version: '2.0', exportDate: new Date().toISOString(), profiles: [] };
}

/** BackupData を SQL にインポートする */
export async function importBackupData(
    backupData: BackupData,
    overwrite: boolean = false,
): Promise<{ success: boolean; imported: number; skipped: number; errors: string[] }> {
    const result = { success: true, imported: 0, skipped: 0, errors: [] as string[] };
    const CHUNK = 1000;

    for (const profile of backupData.profiles) {
        const company = profile.companyName ?? profile.company ?? '';
        const year    = String(profile.fiscalYear ?? profile.year ?? '');
        const mode    = profile.appMode ?? 'standard';
        const dbm     = profile.dataByMonth ?? {};

        if (!company || !year) continue;

        // overwrite=false の場合はスキップ（check は省略、SQL の UPSERT に任せる）
        try {
            const allRecords: any[] = [];
            Object.entries(dbm).forEach(([mStr, records]: [string, any]) => {
                const month = parseInt(mStr);
                (Array.isArray(records) ? records : []).forEach((r: any) => {
                    if (r.actual !== 0) allRecords.push({ month, department: r.department, code: r.code ?? '', subject: r.subject ?? '', value: r.actual ?? 0 });
                });
            });

            const budgetRecords: any[] = [];
            Object.entries(dbm).forEach(([mStr, records]: [string, any]) => {
                const month = parseInt(mStr);
                (Array.isArray(records) ? records : []).forEach((r: any) => {
                    if ((r.budget ?? 0) !== 0) budgetRecords.push({ month, department: r.department, code: r.code ?? '', subject: r.subject ?? '', value: r.budget ?? 0 });
                });
            });

            // Save actual
            for (let i = 0; i < allRecords.length; i += CHUNK) {
                await callApi('save_financial_data', {
                    company, year: parseInt(year), dataType: 'actual',
                    records: allRecords.slice(i, i + CHUNK),
                });
            }
            // Save budget
            for (let i = 0; i < budgetRecords.length; i += CHUNK) {
                await callApi('save_financial_data', {
                    company, year: parseInt(year), dataType: 'budget',
                    records: budgetRecords.slice(i, i + CHUNK),
                });
            }

            await callApi('save_profile', { company, year: parseInt(year), app_mode: mode });
            result.imported++;
        } catch (e: any) {
            result.errors.push(`${company}(${year}): ${e.message}`);
            result.success = false;
        }
    }

    // 従業員数のインポート
    if (backupData.employeeCounts) {
        for (const [key, depts] of Object.entries(backupData.employeeCounts as Record<string, any>)) {
            const parts = key.split('_');
            const yr    = parts.pop() ?? '';
            const comp  = parts.join('_');
            for (const [dept, count] of Object.entries(depts as Record<string, any>)) {
                try {
                    await callApi('save_employee_count', {
                        company: comp, year: parseInt(yr), department: dept, count,
                    });
                } catch (e) { /* ignore */ }
            }
        }
    }

    return result;
}

/** JSON ファイルとしてダウンロードする */
export function downloadBackup(data: BackupData, filename?: string) {
    if (typeof window === 'undefined') return;
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename ?? `budget_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/** 特定企業のバックアップをダウンロード */
export async function downloadCompanyBackup(company: string, year: string) {
    const res = await callApi('export_all_data');
    if (!res.success) throw new Error('エクスポート失敗');

    const profile = (res.profiles as any[]).find(
        (p: any) => p.companyName === company && String(p.fiscalYear) === year,
    );
    if (!profile) throw new Error('該当データが見つかりません');

    const empKey = `${company}_${year}`;
    const empCounts = res.employeeCounts?.[empKey] ?? {};

    downloadBackup(
        { version: '2.0', exportDate: new Date().toISOString(), profiles: [profile], employeeCounts: { [empKey]: empCounts } },
        `${company}_${year}_backup.json`,
    );
}

/** バックアップ必要か（常に true を返す簡易版） */
export function isBackupNeeded(): boolean {
    return true;
}

export function getLastBackupTime(): Date | null {
    return null;
}
