import { useState, useEffect, useCallback, useRef } from 'react';
import { getData, saveData, STORES } from '../db/indexedDB';

/**
 * Custom hook for managing IndexedDB data with React state
 * Provides a similar API to useState but persists data in IndexedDB
 * 
 * @param {string} storeName - Name of the IndexedDB object store
 * @param {string} key - Key to identify the data (typically classId)
 * @param {*} initialValue - Default value if no data exists
 * @returns {[any, Function]} - [storedValue, setValue] tuple
 */
function useIndexedDB(storeName, key, initialValue) {
    const [storedValue, setStoredValue] = useState(initialValue);
    const [isLoading, setIsLoading] = useState(true);

    // Refs to track the latest key, value, and loading state
    const keyRef = useRef(key);
    const valueRef = useRef(initialValue);
    const isReadyRef = useRef(false);

    // Keep keyRef in sync and reset ready state when key changes
    useEffect(() => {
        keyRef.current = key;
        isReadyRef.current = false;
    }, [key]);

    // Load data from IndexedDB on mount
    useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
            try {
                setIsLoading(true);
                let result = await getData(storeName, key);

                if (!isMounted) return;

                const isEmptyData = (res) => {
                    if (!res || res.data === undefined || res.data === null) return true;
                    if (Array.isArray(res.data) && res.data.length === 0) return true;
                    if (typeof res.data === 'object' && !Array.isArray(res.data) && Object.keys(res.data).length === 0) return true;
                    return false;
                };

                // Fallback 1: If key is user_classId (e.g., "송명신_1784941132951"), try without username ("1784941132951")
                if (isEmptyData(result) && key.includes('_')) {
                    const rawClassId = key.substring(key.indexOf('_') + 1);
                    if (rawClassId) {
                        const fallbackResult = await getData(storeName, rawClassId);
                        if (!isEmptyData(fallbackResult)) {
                            result = fallbackResult;
                            const keyName = storeName === STORES.HOLIDAYS ? 'year' : 'classId';
                            await saveData(storeName, {
                                [keyName]: key,
                                data: fallbackResult.data
                            });
                        }
                    }
                }

                // Fallback 2: Check 'default' key if current key isn't 'default'
                if (isEmptyData(result) && key !== 'default') {
                    const defaultResult = await getData(storeName, 'default');
                    if (!isEmptyData(defaultResult)) {
                        result = defaultResult;
                        const keyName = storeName === STORES.HOLIDAYS ? 'year' : 'classId';
                        await saveData(storeName, {
                            [keyName]: key,
                            data: defaultResult.data
                        });
                    }
                }

                // Fallback 3: Check legacy LocalStorage keys
                if (isEmptyData(result)) {
                    const cleanClassId = key.includes('_') ? key.substring(key.indexOf('_') + 1) : key;
                    const legacyKeys = [
                        `class_${cleanClassId}_${storeName}`,
                        `class_default_${storeName}`,
                        `${storeName}`,
                        `class_${key}_${storeName}`
                    ];
                    for (const lsKey of legacyKeys) {
                        const lsData = localStorage.getItem(lsKey);
                        if (lsData) {
                            try {
                                const parsed = JSON.parse(lsData);
                                if (parsed && ((Array.isArray(parsed) && parsed.length > 0) || (typeof parsed === 'object' && Object.keys(parsed).length > 0))) {
                                    result = { data: parsed };
                                    const keyName = storeName === STORES.HOLIDAYS ? 'year' : 'classId';
                                    await saveData(storeName, {
                                        [keyName]: key,
                                        data: parsed
                                    });
                                    break;
                                }
                            } catch (e) {
                                console.error('Failed to parse legacy localStorage key:', lsKey, e);
                            }
                        }
                    }
                }

                if (result && result.data !== undefined) {
                    setStoredValue(result.data);
                    valueRef.current = result.data;
                } else {
                    // If no data exists anywhere, save the initial value
                    const keyName = storeName === STORES.HOLIDAYS ? 'year' : 'classId';
                    await saveData(storeName, {
                        [keyName]: key,
                        data: initialValue
                    });
                    setStoredValue(initialValue);
                    valueRef.current = initialValue;
                }
            } catch (error) {
                if (!isMounted) return;
                console.error(`Failed to load data from ${storeName}:`, error);
                setStoredValue(initialValue);
                valueRef.current = initialValue;
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                    // Only mark ready if the key hasn't changed during loading
                    if (keyRef.current === key) {
                        isReadyRef.current = true;
                    }
                }
            }
        };

        loadData();

        return () => {
            isMounted = false;
        };
    }, [storeName, key, initialValue]);

    // Function to update value in both state and IndexedDB
    const setValue = useCallback(async (value) => {
        // Prevent saving data before initial load is complete
        // This avoids writing to a transient/wrong key
        if (!isReadyRef.current) {
            console.warn(`[useIndexedDB] Blocked save to ${storeName} — still loading (key: ${keyRef.current})`);
            return;
        }

        try {
            // Update ref and state
            const newValue = value instanceof Function ? value(valueRef.current) : value;
            valueRef.current = newValue;
            setStoredValue(newValue);

            // Always use the latest key from the ref
            const currentKey = keyRef.current;
            const keyName = storeName === STORES.HOLIDAYS ? 'year' : 'classId';
            await saveData(storeName, {
                [keyName]: currentKey,
                data: newValue
            });
        } catch (error) {
            console.error(`Failed to save data to ${storeName}:`, error);
        }
    }, [storeName]);

    return [storedValue, setValue, isLoading];
}

export default useIndexedDB;
