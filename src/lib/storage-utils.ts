import { StorageData, DeptHeadcount } from './types';

const STORAGE_KEY_PREFIX = 'budget_app_data_';

/**
 * Employee count management
 */
const EMPLOYEE_COUNT_KEY = 'budget_app_employee_counts';

export interface DepartmentEmployeeCounts {
    [companyYear: string]: { // "CompanyName_Year"
        [department: string]: DeptHeadcount;
    };
}

const DEFAULT_HEADCOUNT: DeptHeadcount = {
    sales: 0,
    warehouse: 0,
    operations: 0,
    accounting: 0
};

export function getEmployeeCount(company: string, year: string, department: string): DeptHeadcount {
    if (typeof window === 'undefined') return DEFAULT_HEADCOUNT;

    const key = `${company}_${year}`;
    const dataStr = localStorage.getItem(EMPLOYEE_COUNT_KEY);

    if (dataStr) {
        try {
            const data: DepartmentEmployeeCounts = JSON.parse(dataStr);
            const raw = data[key]?.[department];
            if (typeof raw === 'number') {
                // Migration for old data
                return { ...DEFAULT_HEADCOUNT, sales: raw };
            }
            return raw || DEFAULT_HEADCOUNT;
        } catch (e) {
            console.error('Failed to parse employee counts', e);
        }
    }

    return DEFAULT_HEADCOUNT;
}

export function setEmployeeCount(company: string, year: string, department: string, count: DeptHeadcount) {
    if (typeof window === 'undefined') return;

    const key = `${company}_${year}`;
    let data: DepartmentEmployeeCounts = {};

    const dataStr = localStorage.getItem(EMPLOYEE_COUNT_KEY);
    if (dataStr) {
        try {
            data = JSON.parse(dataStr);
        } catch (e) {
            console.error('Failed to parse employee counts', e);
        }
    }

    if (!data[key]) {
        data[key] = {};
    }

    data[key][department] = count;
    localStorage.setItem(EMPLOYEE_COUNT_KEY, JSON.stringify(data));
}

export function getAllEmployeeCounts(company: string, year: string): Record<string, DeptHeadcount> {
    if (typeof window === 'undefined') return {};

    const key = `${company}_${year}`;
    const dataStr = localStorage.getItem(EMPLOYEE_COUNT_KEY);

    if (dataStr) {
        try {
            const data: DepartmentEmployeeCounts = JSON.parse(dataStr);
            const counts = data[key] || {};
            // Handle migration for all entries in the object
            const result: Record<string, DeptHeadcount> = {};
            Object.keys(counts).forEach(dept => {
                const raw = counts[dept];
                if (typeof raw === 'number') {
                    result[dept] = { ...DEFAULT_HEADCOUNT, sales: raw };
                } else {
                    result[dept] = raw || DEFAULT_HEADCOUNT;
                }
            });
            return result;
        } catch (e) {
            console.error('Failed to parse employee counts', e);
        }
    }

    return {};
}
const METADATA_KEY = 'budget_app_metadata';
const LAST_BACKUP_KEY = 'budget_app_last_backup';

export interface BackupData {
    version: string;
    exportDate: string;
    profiles: StorageData[];
    metadata: any;
    employeeCounts?: any;
}

/**
 * Export all data from localStorage to JSON
 */
export function exportAllData(): BackupData {
    if (typeof window === 'undefined') {
        return { version: '1.0', exportDate: new Date().toISOString(), profiles: [], metadata: null };
    }

    const profiles: StorageData[] = [];

    // Get all storage keys
    const keys = Object.keys(localStorage);
    // Find keys like budget_app_data_Company_Year
    const dataKeys = keys.filter(k => k.startsWith(STORAGE_KEY_PREFIX));

    dataKeys.forEach(key => {
        const dataStr = localStorage.getItem(key);
        if (dataStr) {
            try {
                // Ensure we don't double-parse if it's already an object or handle double-stringified data
                let data = JSON.parse(dataStr);
                if (typeof data === 'string') data = JSON.parse(data);

                if (data && data.companyName) {
                    profiles.push(data);
                }
            } catch (e) {
                console.error(`Failed to parse ${key}`, e);
            }
        }
    });

    // Get metadata
    const metaStr = localStorage.getItem(METADATA_KEY);
    let metadata = null;
    if (metaStr) {
        try {
            metadata = JSON.parse(metaStr);
            if (typeof metadata === 'string') metadata = JSON.parse(metadata);
        } catch (e) {
            console.error('Failed to parse metadata', e);
        }
    }

    // Get employee counts
    const countsStr = localStorage.getItem(EMPLOYEE_COUNT_KEY);
    let employeeCounts = null;
    if (countsStr) {
        try {
            employeeCounts = JSON.parse(countsStr);
            if (typeof employeeCounts === 'string') employeeCounts = JSON.parse(employeeCounts);
        } catch (e) {
            console.error('Failed to parse employee counts', e);
        }
    }

    return {
        version: '1.0',
        exportDate: new Date().toISOString(),
        profiles: profiles,
        metadata: metadata,
        employeeCounts: employeeCounts
    };
}

/**
 * Export specific company data
 */
export function exportCompanyData(company: string, year: string): StorageData | null {
    if (typeof window === 'undefined') return null; // SSR check

    const storageKey = `${STORAGE_KEY_PREFIX}${company}_${year}`;
    const dataStr = localStorage.getItem(storageKey);

    if (dataStr) {
        try {
            return JSON.parse(dataStr);
        } catch (e) {
            console.error('Failed to parse company data', e);
            return null;
        }
    }

    return null;
}

/**
 * Import backup data into localStorage
 */
export function importBackupData(backupData: BackupData, overwrite: boolean = false): {
    success: boolean;
    imported: number;
    skipped: number;
    errors: string[];
} {
    if (typeof window === 'undefined') {
        return { success: false, imported: 0, skipped: 0, errors: ['localStorage not available'] };
    }

    const result = {
        success: true,
        imported: 0,
        skipped: 0,
        errors: [] as string[]
    };

    const importedProfiles: { company: string; year: string }[] = [];

    // Import profiles
    backupData.profiles.forEach(profile => {
        const storageKey = `${STORAGE_KEY_PREFIX}${profile.companyName}_${profile.fiscalYear}`;
        const exists = localStorage.getItem(storageKey) !== null;

        if (exists && !overwrite) {
            result.skipped++;
            return;
        }

        try {
            localStorage.setItem(storageKey, JSON.stringify(profile));
            result.imported++;
            importedProfiles.push({ company: profile.companyName, year: profile.fiscalYear });
        } catch (e: any) {
            result.errors.push(`Failed to import ${profile.companyName} (${profile.fiscalYear}): ${e.message}`);
            result.success = false;
        }
    });

    // Update metadata
    try {
        const metaStr = localStorage.getItem(METADATA_KEY);
        let currentMeta: any = { savedProfiles: [] };

        if (metaStr) {
            try {
                currentMeta = JSON.parse(metaStr);
                if (!currentMeta.savedProfiles) currentMeta.savedProfiles = [];
            } catch (e) {
                // If metadata is corrupted, start fresh
            }
        }

        // If backup has its own metadata, we can choose to merge or overwrite
        // Let's merge savedProfiles from backup if present
        if (backupData.metadata && backupData.metadata.savedProfiles) {
            backupData.metadata.savedProfiles.forEach((p: any) => {
                const exists = currentMeta.savedProfiles.some((cp: any) => cp.company === p.company && cp.year === p.year);
                if (!exists) {
                    currentMeta.savedProfiles.push(p);
                }
            });
            // Also update lastUsedProfile if provided and none exists
            if (backupData.metadata.lastUsedProfile && !currentMeta.lastUsedProfile) {
                currentMeta.lastUsedProfile = backupData.metadata.lastUsedProfile;
            }
        }

        // Ensure all actually imported profiles are in the metadata list
        importedProfiles.forEach(p => {
            const exists = currentMeta.savedProfiles.some((cp: any) => cp.company === p.company && cp.year === p.year);
            if (!exists) {
                currentMeta.savedProfiles.push(p);
            }
        });

        localStorage.setItem(METADATA_KEY, JSON.stringify(currentMeta));
    } catch (e: any) {
        result.errors.push(`Failed to update metadata: ${e.message}`);
    }

    // Update employee counts if present
    if (backupData.employeeCounts) {
        try {
            localStorage.setItem(EMPLOYEE_COUNT_KEY, JSON.stringify(backupData.employeeCounts));
        } catch (e: any) {
            result.errors.push(`Failed to import employee counts: ${e.message}`);
        }
    }

    return result;
}

/**
 * Download backup file
 */
export function downloadBackup(data: BackupData, filename?: string) {
    if (typeof window === 'undefined') return; // SSR check

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `budget_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Update last backup time
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
}

/**
 * Download specific company backup
 */
export function downloadCompanyBackup(company: string, year: string) {
    const data = exportCompanyData(company, year);
    if (!data) {
        throw new Error('Company data not found');
    }

    const countsStr = localStorage.getItem(EMPLOYEE_COUNT_KEY);
    let employeeCounts = null;
    if (countsStr) {
        try {
            employeeCounts = JSON.parse(countsStr);
            if (typeof employeeCounts === 'string') employeeCounts = JSON.parse(employeeCounts);
        } catch (e) {
            console.error('Failed to parse employee counts', e);
        }
    }

    const backupData: BackupData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        profiles: [data],
        metadata: null,
        employeeCounts: employeeCounts
    };

    downloadBackup(backupData, `${company}_${year}_backup.json`);
}

/**
 * Get last backup timestamp
 */
export function getLastBackupTime(): Date | null {
    if (typeof window === 'undefined') return null; // SSR check

    const timestamp = localStorage.getItem(LAST_BACKUP_KEY);
    if (timestamp) {
        return new Date(timestamp);
    }
    return null;
}

/**
 * Check if backup is needed (older than 7 days)
 */
export function isBackupNeeded(): boolean {
    const lastBackup = getLastBackupTime();
    if (!lastBackup) return true;

    const daysSinceBackup = (Date.now() - lastBackup.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceBackup > 7;
}

/**
 * Auto-create backup when data changes
 */
export function createAutoBackup(companyName: string, fiscalYear: string) {
    const allData = exportAllData();
    downloadBackup(allData, `auto_backup_${companyName}_${fiscalYear}_${Date.now()}.json`);
}



