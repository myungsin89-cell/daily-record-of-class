import React, { createContext, useContext, useState, useEffect } from 'react';
import { getAPIKey, saveAPIKey as saveAPIKeyToDB, deleteAPIKey as deleteAPIKeyFromDB } from '../db/indexedDB';
import { GoogleGenerativeAI } from '@google/generative-ai';

const APIKeyContext = createContext();

// Model priority list - try in this order
const MODEL_PRIORITY = ['gemini-2.0-flash-exp', 'gemini-2.5-flash'];

// Get last working model from localStorage
const getLastWorkingModel = () => {
    return localStorage.getItem('last_working_gemini_model') || MODEL_PRIORITY[0];
};

// Save successful model to localStorage
const saveWorkingModel = (model) => {
    localStorage.setItem('last_working_gemini_model', model);
};

export const useAPIKey = () => useContext(APIKeyContext); // eslint-disable-line react-refresh/only-export-components

export const APIKeyProvider = ({ children }) => {
    const [apiKey, setApiKey] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isConnected, setIsConnected] = useState(false);

    // Load API key from IndexedDB on mount
    useEffect(() => {
        const loadAPIKey = async () => {
            setIsLoading(true);
            try {
                const storedKey = await getAPIKey();
                if (storedKey) {
                    setApiKey(storedKey);
                    setIsConnected(true);
                }
            } catch (error) {
                console.error('Failed to load API key:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadAPIKey();
    }, []);

    /**
     * Validate API key by making a test call to Gemini with fallback support
     */
    const validateAPIKey = async (key) => {
        const genAI = new GoogleGenerativeAI(key);
        const lastModel = getLastWorkingModel();

        // First try with last successful model
        try {
            const model = genAI.getGenerativeModel({ model: lastModel });
            const result = await model.generateContent('Test');
            const response = await result.response;

            // If we get here without error, the key is valid
            return { valid: true, error: null };
        } catch (error) {
            console.log(`Model ${lastModel} validation failed, trying fallback...`);

            // Try other models in priority order
            for (const modelName of MODEL_PRIORITY) {
                if (modelName === lastModel) continue;

                try {
                    console.log(`Trying validation with model: ${modelName}`);
                    const model = genAI.getGenerativeModel({ model: modelName });
                    const result = await model.generateContent('Test');
                    const response = await result.response;

                    // Save successful model
                    saveWorkingModel(modelName);
                    console.log(`Model ${modelName} validation succeeded, saved as default`);

                    return { valid: true, error: null };
                } catch (fallbackError) {
                    console.log(`Model ${modelName} validation also failed:`, fallbackError.message);
                    continue;
                }
            }

            // All models failed
            console.error('API key validation failed with all models:', error);
            return {
                valid: false,
                error: error.message || 'API 키 검증 실패. 키가 올바른지 확인해주세요.'
            };
        }
    };

    /**
     * Save API key to IndexedDB and update state
     */
    const saveAPIKey = async (key) => {
        try {
            // Validate key first
            const validation = await validateAPIKey(key);
            if (!validation.valid) {
                return { success: false, error: validation.error };
            }

            // Save to IndexedDB
            await saveAPIKeyToDB(key);
            setApiKey(key);
            setIsConnected(true);

            return { success: true, error: null };
        } catch (error) {
            console.error('Failed to save API key:', error);
            return {
                success: false,
                error: error.message || 'API 키 저장 실패'
            };
        }
    };

    /**
     * Delete API key from IndexedDB and clear state
     */
    const deleteAPIKey = async () => {
        try {
            await deleteAPIKeyFromDB();
            setApiKey(null);
            setIsConnected(false);
            return { success: true };
        } catch (error) {
            console.error('Failed to delete API key:', error);
            return { success: false, error: error.message };
        }
    };

    /**
     * Test connection with current API key
     */
    const testConnection = async () => {
        if (!apiKey) {
            return { success: false, error: 'API 키가 설정되지 않았습니다.' };
        }

        const validation = await validateAPIKey(apiKey);
        setIsConnected(validation.valid);

        return {
            success: validation.valid,
            error: validation.error
        };
    };

    const value = {
        apiKey,
        isLoading,
        isConnected,
        hasAPIKey: !!apiKey,
        saveAPIKey,
        deleteAPIKey,
        testConnection,
        validateAPIKey
    };

    return (
        <APIKeyContext.Provider value={value}>
            {children}
        </APIKeyContext.Provider>
    );
};
