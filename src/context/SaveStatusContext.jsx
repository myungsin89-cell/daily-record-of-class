import React, { createContext, useContext, useState, useEffect } from 'react';

const SaveStatusContext = createContext();

export const useSaveStatus = () => {
    const context = useContext(SaveStatusContext);
    if (!context) {
        throw new Error('useSaveStatus must be used within SaveStatusProvider');
    }
    return context;
};

export const SaveStatusProvider = ({ children }) => {
    const [lastSaved, setLastSaved] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // Auto-refresh time display every minute
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => {
            setTick(prev => prev + 1);
        }, 60000); // Update every minute
        return () => clearInterval(timer);
    }, []);

    const updateSaveStatus = React.useCallback(() => {
        setIsSaving(true);
        setTimeout(() => {
            setLastSaved(new Date());
            setIsSaving(false);
        }, 100); // Brief saving indication
    }, []);

    const getTimeText = () => {
        if (isSaving) return '저장 중...';
        if (!lastSaved) return '저장 대기 중';

        const now = new Date();
        const diff = Math.floor((now - lastSaved) / 1000);
        if (diff < 60) return '방금 저장됨';
        if (diff < 3600) return `${Math.floor(diff / 60)}분 전 저장`;
        return lastSaved.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    };

    const value = React.useMemo(() => ({
        lastSaved,
        isSaving,
        updateSaveStatus,
        getTimeText,
        tick // Include tick to trigger re-renders for time text
    }), [lastSaved, isSaving, updateSaveStatus, tick]);

    return (
        <SaveStatusContext.Provider value={value}>
            {children}
        </SaveStatusContext.Provider>
    );
};
