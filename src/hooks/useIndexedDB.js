import { useState, useEffect, useCallback } from 'react';
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
                } else {
                    // If no data exists, save the initial value
                    // Use the correct key name based on the store
                    const keyName = storeName === STORES.HOLIDAYS ? 'year' : 'classId';
                    await saveData(storeName, {
                        [keyName]: key,
                        data: initialValue
                    });
                    setStoredValue(initialValue);
                }
            } catch (error) {
                if (!isMounted) return;
                console.error(`Failed to load data from ${storeName}:`, error);
                setStoredValue(initialValue);
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        loadData();

        return () => {
            isMounted = false;
        };
    }, [storeName, key]); // Removed initialValue from dependencies to prevent infinite loops

    // Function to update value in both state and IndexedDB
    const setValue = useCallback(async (value) => {
        try {
            // Use functional setState to always get the latest storedValue
            // This prevents race conditions and stale closure issues
            let valueToStore;
            setStoredValue((currentValue) => {
                // Allow value to be a function so we have same API as useState
                valueToStore = value instanceof Function ? value(currentValue) : value;
                return valueToStore;
            });

            // Save to IndexedDB with correct key name
            const keyName = storeName === STORES.HOLIDAYS ? 'year' : 'classId';
            await saveData(storeName, {
                [keyName]: key,
                data: valueToStore
            });
        } catch (error) {
            console.error(`Failed to save data to ${storeName}:`, error);
        }
    }, [storeName, key]); // Removed storedValue from dependencies to prevent unnecessary recreations


    return [storedValue, setValue, isLoading];
}

export default useIndexedDB;
