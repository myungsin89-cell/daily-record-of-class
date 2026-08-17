import { exportAllData } from '../db/indexedDB';

const BACKUP_ENABLED_KEY = 'auto_backup_enabled';
const BACKUP_FOLDER_KEY = 'auto_backup_folder';
const LAST_BACKUP_TIME_KEY = 'last_auto_backup_time';

// Directory handle storage in IndexedDB for Web File System Access API
const HANDLE_DB_NAME = 'ClassDiaryBackupHandleDB';
const HANDLE_STORE_NAME = 'handles';

let inMemoryDirectoryHandle = null;

const getHandleDB = () => {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.indexedDB) return reject('No IndexedDB');
        const req = indexedDB.open(HANDLE_DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
                db.createObjectStore(HANDLE_STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

const saveHandleToIDB = async (handle) => {
    try {
        const db = await getHandleDB();
        const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
        tx.objectStore(HANDLE_STORE_NAME).put(handle, 'backup_dir');
        return new Promise((resolve) => {
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    } catch (e) {
        console.warn('Failed to save handle to IDB:', e);
        return false;
    }
};

const getHandleFromIDB = async () => {
    try {
        const db = await getHandleDB();
        const tx = db.transaction(HANDLE_STORE_NAME, 'readonly');
        const req = tx.objectStore(HANDLE_STORE_NAME).get('backup_dir');
        return new Promise((resolve) => {
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    }
};

export const isElectronEnv = () => {
    return typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isElectron;
};

export const isWebDirectorySupported = () => {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
};

export const getAutoBackupConfig = () => {
    const enabled = localStorage.getItem(BACKUP_ENABLED_KEY) === 'true';
    const folder = localStorage.getItem(BACKUP_FOLDER_KEY) || '';
    const lastTime = localStorage.getItem(LAST_BACKUP_TIME_KEY) || null;
    return { enabled, folder, lastTime };
};

export const setAutoBackupEnabled = (enabled) => {
    localStorage.setItem(BACKUP_ENABLED_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('autoBackupConfigChanged'));
};

export const setAutoBackupFolder = (folderPath) => {
    localStorage.setItem(BACKUP_FOLDER_KEY, folderPath || '');
    window.dispatchEvent(new Event('autoBackupConfigChanged'));
};

export const setLastBackupTime = (timeStr) => {
    localStorage.setItem(LAST_BACKUP_TIME_KEY, timeStr || new Date().toISOString());
    window.dispatchEvent(new Event('autoBackupConfigChanged'));
};

/**
 * 폴더 선택 대화상자 실행 (Electron 또는 Web Directory Picker)
 */
export const selectBackupFolder = async () => {
    if (isElectronEnv()) {
        try {
            const folderPath = await window.electronAPI.selectFolder();
            if (folderPath) {
                setAutoBackupFolder(folderPath);
                setAutoBackupEnabled(true);
                return { success: true, folder: folderPath };
            }
            return { success: false, error: '폴더 선택이 취소되었습니다.' };
        } catch (err) {
            console.error('Electron folder selection error:', err);
            return { success: false, error: err.message };
        }
    } else if (isWebDirectorySupported()) {
        try {
            const handle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: 'documents'
            });
            if (handle) {
                inMemoryDirectoryHandle = handle;
                await saveHandleToIDB(handle);
                const folderName = handle.name || '선택된 로컬 폴더';
                setAutoBackupFolder(folderName);
                setAutoBackupEnabled(true);
                return { success: true, folder: folderName, handle };
            }
            return { success: false, error: '폴더 선택이 취소되었습니다.' };
        } catch (err) {
            if (err.name === 'AbortError') {
                return { success: false, error: '폴더 선택이 취소되었습니다.' };
            }
            console.error('Web directory selection error:', err);
            return { success: false, error: err.message };
        }
    } else {
        return { success: false, error: '이 브라우저는 폴더 직접 지정을 지원하지 않습니다. (Chrome 또는 데스크톱 앱 권장)' };
    }
};

/**
 * 웹 디렉토리 핸들 얻기 (메모리 or IndexedDB 복원)
 */
const getValidWebDirectoryHandle = async () => {
    if (inMemoryDirectoryHandle) return inMemoryDirectoryHandle;
    const storedHandle = await getHandleFromIDB();
    if (storedHandle) {
        try {
            // 권한 확인 및 재요청
            const perm = await storedHandle.queryPermission({ mode: 'readwrite' });
            if (perm === 'granted') {
                inMemoryDirectoryHandle = storedHandle;
                return storedHandle;
            }
            const reqPerm = await storedHandle.requestPermission({ mode: 'readwrite' });
            if (reqPerm === 'granted') {
                inMemoryDirectoryHandle = storedHandle;
                return storedHandle;
            }
        } catch (e) {
            console.warn('Could not verify stored handle permission:', e);
        }
    }
    return null;
};

/**
 * 자동 백업 실행 (단일 파일 항상 덮어쓰기: class-diary-latest-backup.json)
 * @param {boolean} force - 버튼 직접 클릭 등 강제 실행 여부 (enabled 설정 무시)
 */
export const performAutoBackup = async (force = false) => {
    try {
        const { enabled, folder } = getAutoBackupConfig();
        if (!enabled && !force) {
            return { success: false, skipped: true, error: '자동 백업 비활성화' };
        }

        const data = await exportAllData();
        const jsonContent = JSON.stringify(data, null, 2);
        const fileName = 'class-diary-latest-backup.json';

        // 1. Electron 데스크톱 앱 환경
        if (isElectronEnv()) {
            let targetFolder = folder;
            if (!targetFolder) {
                // 폴더가 없으면 폴더 선택창 실행
                const folderRes = await selectBackupFolder();
                if (!folderRes.success) {
                    return { success: false, error: folderRes.error || '백업 폴더를 먼저 지정해주세요.' };
                }
                targetFolder = folderRes.folder;
            }

            const result = await window.electronAPI.saveBackupFile(targetFolder, fileName, jsonContent);
            if (result && result.success) {
                const nowIso = new Date().toISOString();
                setLastBackupTime(nowIso);
                return { success: true, time: nowIso, path: result.filePath };
            } else {
                return { success: false, error: result?.error || '파일 저장에 실패했습니다.' };
            }
        }

        // 2. 웹 브라우저 환경 (File System Access API)
        if (isWebDirectorySupported()) {
            let dirHandle = await getValidWebDirectoryHandle();
            if (!dirHandle) {
                // 핸들이 없으면 폴더 선택창 실행
                const folderRes = await selectBackupFolder();
                if (folderRes.success && folderRes.handle) {
                    dirHandle = folderRes.handle;
                } else {
                    // 선택 취소 시 직접 다운로드로 제공
                    const blob = new Blob([jsonContent], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    a.click();
                    URL.revokeObjectURL(url);
                    const nowIso = new Date().toISOString();
                    setLastBackupTime(nowIso);
                    return { success: true, time: nowIso, path: '다운로드 폴더' };
                }
            }

            try {
                const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(jsonContent);
                await writable.close();
                const nowIso = new Date().toISOString();
                setLastBackupTime(nowIso);
                return { success: true, time: nowIso, path: `${folder || dirHandle.name}/${fileName}` };
            } catch (err) {
                console.error('Web auto backup write error:', err);
                // 오류 시 브라우저 다운로드 fallback
                const blob = new Blob([jsonContent], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                a.click();
                URL.revokeObjectURL(url);
                const nowIso = new Date().toISOString();
                setLastBackupTime(nowIso);
                return { success: true, time: nowIso, path: '다운로드 폴더' };
            }
        }

        // 3. 미지원 브라우저인 경우 바로 다운로드
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        const nowIso = new Date().toISOString();
        setLastBackupTime(nowIso);
        return { success: true, time: nowIso, path: '다운로드 폴더' };

    } catch (err) {
        console.error('Auto backup execution error:', err);
        return { success: false, error: err.message };
    }
};

/**
 * 수동 백업 실행 (날짜별 별도 보관 파일 생성)
 */
export const performManualDatedBackup = async () => {
    try {
        const data = await exportAllData();
        const jsonContent = JSON.stringify(data, null, 2);
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `class-diary-backup-${dateStr}.json`;
        const { folder } = getAutoBackupConfig();

        // 1. Electron 환경이고 폴더가 설정되어 있으면 해당 폴더에도 파일 직접 저장
        let savedToFolder = false;
        if (isElectronEnv() && folder) {
            try {
                await window.electronAPI.saveBackupFile(folder, fileName, jsonContent);
                savedToFolder = true;
            } catch (e) {
                console.warn('Could not save dated backup directly to folder:', e);
            }
        }

        // 2. 브라우저 다운로드로도 확실하게 제공
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);

        return { success: true, fileName, savedToFolder };
    } catch (err) {
        console.error('Manual dated backup error:', err);
        return { success: false, error: err.message };
    }
};
