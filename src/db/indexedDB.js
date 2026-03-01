/**
 * IndexedDB Utility Module
 * 
 * Provides core database operations for the Class Diary PWA.
 * Handles storage of student data, journals, attendance, evaluations, and API keys.
 */

const DB_NAME = 'ClassDiaryDB';
const DB_VERSION = 4; // Increment version to add holidays store

// Object Store names
const STORES = {
    STUDENTS: 'students',
    JOURNALS: 'journals',
    ATTENDANCE: 'attendance',
    EVALUATIONS: 'evaluations',
    FINALIZED_EVALUATIONS: 'finalized_evaluations',
    API_KEYS: 'api_keys',
    SETTINGS: 'settings',
    FIELD_TRIPS: 'field_trips',
    HOLIDAYS: 'holidays'
};

/**
 * Initialize IndexedDB and create object stores
 */
export const initDB = () => {
    return new Promise((resolve, reject) => {
        // Check if IndexedDB is available
        if (!window.indexedDB) {
            console.error('IndexedDB is not supported in this browser');
            reject(new Error('IndexedDB not supported'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.error);
            reject(new Error(`Failed to open IndexedDB: ${event.target.error?.message || 'Unknown error'}`));
        };

        request.onblocked = () => {
            console.warn('IndexedDB is blocked - please close other tabs with this app');
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            console.log('Upgrading IndexedDB from version', event.oldVersion, 'to', event.newVersion);

            // Create object stores if they don't exist
            console.log('Creating/Updating object stores...');

            if (!db.objectStoreNames.contains(STORES.STUDENTS)) {
                db.createObjectStore(STORES.STUDENTS, { keyPath: 'classId' });
            }
            if (!db.objectStoreNames.contains(STORES.JOURNALS)) {
                db.createObjectStore(STORES.JOURNALS, { keyPath: 'classId' });
            }
            if (!db.objectStoreNames.contains(STORES.ATTENDANCE)) {
                db.createObjectStore(STORES.ATTENDANCE, { keyPath: 'classId' });
            }
            if (!db.objectStoreNames.contains(STORES.EVALUATIONS)) {
                db.createObjectStore(STORES.EVALUATIONS, { keyPath: 'classId' });
            }
            if (!db.objectStoreNames.contains(STORES.FINALIZED_EVALUATIONS)) {
                db.createObjectStore(STORES.FINALIZED_EVALUATIONS, { keyPath: 'classId' });
            }
            if (!db.objectStoreNames.contains(STORES.API_KEYS)) {
                db.createObjectStore(STORES.API_KEYS, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
                db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(STORES.FIELD_TRIPS)) {
                db.createObjectStore(STORES.FIELD_TRIPS, { keyPath: 'classId' });
            }
            if (!db.objectStoreNames.contains(STORES.HOLIDAYS)) {
                db.createObjectStore(STORES.HOLIDAYS, { keyPath: 'year' });
            }

            console.log('IndexedDB upgrade complete');
        };
    });
};

/**
 * Generic function to get data from a store
 */
export const getData = async (storeName, key) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(new Error(`Failed to get data from ${storeName}`));
        };
    });
};

/**
 * Generic function to save data to a store
 */
export const saveData = async (storeName, data) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(data);

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(new Error(`Failed to save data to ${storeName}`));
        };
    });
};

/**
 * Generic function to delete data from a store
 */
export const deleteData = async (storeName, key) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(new Error(`Failed to delete data from ${storeName}`));
        };
    });
};

/**
 * Get all data from a store
 */
export const getAllData = async (storeName) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(new Error(`Failed to get all data from ${storeName}`));
        };
    });
};

// ==================== API Key Management ====================

/**
 * Save API key to IndexedDB
 * @param {string} apiKey - The Gemini API key
 */
export const saveAPIKey = async (apiKey) => {
    return saveData(STORES.API_KEYS, {
        id: 'gemini_api_key',
        key: apiKey,
        updatedAt: new Date().toISOString()
    });
};

/**
 * Get API key from IndexedDB
 * @returns {Promise<string|null>} - The API key or null if not found
 */
export const getAPIKey = async () => {
    try {
        const result = await getData(STORES.API_KEYS, 'gemini_api_key');
        return result ? result.key : null;
    } catch (error) {
        console.error('Failed to get API key:', error);
        return null;
    }
};

/**
 * Delete API key from IndexedDB
 */
export const deleteAPIKey = async () => {
    return deleteData(STORES.API_KEYS, 'gemini_api_key');
};

// ==================== Migration Functions ====================

/**
 * Migrate data from LocalStorage to IndexedDB
 * This runs once on first app load after the update
 */
export const migrateFromLocalStorage = async (classId = 'default') => {
    try {
        // Check if migration has already been done
        const migrationStatus = await getData(STORES.SETTINGS, 'migration_completed');
        if (migrationStatus?.value) {
            console.log('Migration already completed');
            return { success: true, alreadyMigrated: true };
        }

        console.log('Starting LocalStorage to IndexedDB migration...');

        // Migrate students
        const studentsKey = `class_${classId}_students`;
        const studentsData = localStorage.getItem(studentsKey);
        if (studentsData) {
            await saveData(STORES.STUDENTS, {
                classId,
                data: JSON.parse(studentsData)
            });
            console.log('✓ Migrated students');
        }

        // Migrate journals
        const journalsKey = `class_${classId}_journals`;
        const journalsData = localStorage.getItem(journalsKey);
        if (journalsData) {
            await saveData(STORES.JOURNALS, {
                classId,
                data: JSON.parse(journalsData)
            });
            console.log('✓ Migrated journals');
        }

        // Migrate attendance
        const attendanceKey = `class_${classId}_attendance`;
        const attendanceData = localStorage.getItem(attendanceKey);
        if (attendanceData) {
            await saveData(STORES.ATTENDANCE, {
                classId,
                data: JSON.parse(attendanceData)
            });
            console.log('✓ Migrated attendance');
        }

        // Migrate evaluations
        const evaluationsKey = `class_${classId}_evaluations`;
        const evaluationsData = localStorage.getItem(evaluationsKey);
        if (evaluationsData) {
            await saveData(STORES.EVALUATIONS, {
                classId,
                data: JSON.parse(evaluationsData)
            });
            console.log('✓ Migrated evaluations');
        }

        // Migrate finalized evaluations
        const finalizedKey = `class_${classId}_finalized_evaluations`;
        const finalizedData = localStorage.getItem(finalizedKey);
        if (finalizedData) {
            await saveData(STORES.FINALIZED_EVALUATIONS, {
                classId,
                data: JSON.parse(finalizedData)
            });
            console.log('✓ Migrated finalized evaluations');
        }

        // Mark migration as completed
        await saveData(STORES.SETTINGS, {
            key: 'migration_completed',
            value: true,
            completedAt: new Date().toISOString()
        });

        console.log('✅ Migration completed successfully');
        return { success: true, alreadyMigrated: false };

    } catch (error) {
        console.error('Migration failed:', error);
        return { success: false, error: error.message };
    }
};

// ==================== Data Export/Import ====================

/**
 * Export all IndexedDB data to JSON
 * @returns {Promise<object>} - All data as JSON object
 */
export const exportAllData = async () => {
    try {
        // Export IndexedDB data
        const exportData = {
            version: DB_VERSION,
            exportedAt: new Date().toISOString(),
            indexedDB: {
                students: await getAllData(STORES.STUDENTS),
                journals: await getAllData(STORES.JOURNALS),
                attendance: await getAllData(STORES.ATTENDANCE),
                evaluations: await getAllData(STORES.EVALUATIONS),
                finalizedEvaluations: await getAllData(STORES.FINALIZED_EVALUATIONS),
                apiKeys: await getAllData(STORES.API_KEYS),
                settings: await getAllData(STORES.SETTINGS),
                fieldTrips: await getAllData(STORES.FIELD_TRIPS),
                holidays: await getAllData(STORES.HOLIDAYS),
            },
            // Export ALL localStorage data
            localStorage: {}
        };

        // Copy all localStorage items
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
                exportData.localStorage[key] = localStorage.getItem(key);
            }
        }

        console.log('✅ Export completed - IndexedDB and localStorage data included');
        console.log(`   - IndexedDB stores: ${Object.keys(exportData.indexedDB).length}`);
        console.log(`   - localStorage items: ${Object.keys(exportData.localStorage).length}`);
        return exportData;
    } catch (error) {
        console.error('Export failed:', error);
        throw error;
    }
};

/**
 * Import data from JSON to IndexedDB
 * @param {object} importData - Data object to import
 */
export const importAllData = async (importData) => {
    try {
        // Validate data structure
        if (!importData || typeof importData !== 'object') {
            throw new Error('Invalid import data format');
        }

        console.log('Starting data import...');

        // Determine if this is the new format (with indexedDB object) or old format (direct properties)
        const dbData = importData.indexedDB || importData;

        // Import IndexedDB data
        // Import students
        if (dbData.students && Array.isArray(dbData.students)) {
            for (const item of dbData.students) {
                await saveData(STORES.STUDENTS, item);
            }
            console.log(`✓ Imported ${dbData.students.length} student records`);
        }

        // Import journals
        if (dbData.journals && Array.isArray(dbData.journals)) {
            for (const item of dbData.journals) {
                await saveData(STORES.JOURNALS, item);
            }
            console.log(`✓ Imported ${dbData.journals.length} journal records`);
        }

        // Import attendance
        if (dbData.attendance && Array.isArray(dbData.attendance)) {
            for (const item of dbData.attendance) {
                await saveData(STORES.ATTENDANCE, item);
            }
            console.log(`✓ Imported ${dbData.attendance.length} attendance records`);
        }

        // Import evaluations
        if (dbData.evaluations && Array.isArray(dbData.evaluations)) {
            for (const item of dbData.evaluations) {
                await saveData(STORES.EVALUATIONS, item);
            }
            console.log(`✓ Imported ${dbData.evaluations.length} evaluation records`);
        }

        // Import finalized evaluations
        if (dbData.finalizedEvaluations && Array.isArray(dbData.finalizedEvaluations)) {
            for (const item of dbData.finalizedEvaluations) {
                await saveData(STORES.FINALIZED_EVALUATIONS, item);
            }
            console.log(`✓ Imported ${dbData.finalizedEvaluations.length} finalized evaluation records`);
        }

        // Import API keys
        if (dbData.apiKeys && Array.isArray(dbData.apiKeys)) {
            for (const item of dbData.apiKeys) {
                await saveData(STORES.API_KEYS, item);
            }
            console.log(`✓ Imported ${dbData.apiKeys.length} API key records`);
        }

        // Import settings
        if (dbData.settings && Array.isArray(dbData.settings)) {
            for (const item of dbData.settings) {
                await saveData(STORES.SETTINGS, item);
            }
            console.log(`✓ Imported ${dbData.settings.length} settings records`);
        }

        // Import field trips
        if (dbData.fieldTrips && Array.isArray(dbData.fieldTrips)) {
            for (const item of dbData.fieldTrips) {
                await saveData(STORES.FIELD_TRIPS, item);
            }
            console.log(`✓ Imported ${dbData.fieldTrips.length} field trip records`);
        }

        // Import holidays
        if (dbData.holidays && Array.isArray(dbData.holidays)) {
            for (const item of dbData.holidays) {
                await saveData(STORES.HOLIDAYS, item);
            }
            console.log(`✓ Imported ${dbData.holidays.length} holiday records`);
        }

        // Import localStorage data (if present in new format)
        if (importData.localStorage && typeof importData.localStorage === 'object') {
            let localStorageCount = 0;
            for (const [key, value] of Object.entries(importData.localStorage)) {
                localStorage.setItem(key, value);
                localStorageCount++;
            }
            console.log(`✓ Imported ${localStorageCount} localStorage items`);
        }

        console.log('✅ Import completed successfully - all data restored');
        return { success: true };

    } catch (error) {
        console.error('Import failed:', error);
        throw error;
    }
};

export { STORES };
