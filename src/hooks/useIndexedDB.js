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
                const result = await getData(storeName, key);

                if (!isMounted) return;

                if (result && result.data !== undefined) {
                    setStoredValue(result.data);
                    valueRef.current = result.data;
                } else {
                    // If no data exists, save the initial value
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
