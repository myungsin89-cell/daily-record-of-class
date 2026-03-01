import { createContext, useContext, useState, useEffect } from 'react';

import { registerSW } from 'virtual:pwa-register';

const UpdateContext = createContext();

export const useUpdate = () => useContext(UpdateContext);

export const UpdateProvider = ({ children }) => {
    const [needRefresh, setNeedRefresh] = useState(false);
    const [updateServiceWorkerFn, setUpdateServiceWorkerFn] = useState(null);

    useEffect(() => {
        const updateSW = registerSW({
            onNeedRefresh() {
                console.log('[UpdateContext] New content available, update needed.');
                setNeedRefresh(true);
            },
            onOfflineReady() {
                console.log('[UpdateContext] App ready to work offline');
            },
            onRegistered(registration) {
                console.log('[UpdateContext] Service Worker registered:', registration);
            }
        });

        setUpdateServiceWorkerFn(() => updateSW);
    }, []);

    const updateServiceWorker = async () => {
        if (updateServiceWorkerFn) {
            try {
                console.log('[UpdateContext] Starting update...');
                await updateServiceWorkerFn(true);
                console.log('[UpdateContext] Update completed, reloading...');
                // Small delay to ensure service worker is activated
                setTimeout(() => {
                    window.location.reload();
                }, 100);
            } catch (error) {
                console.error('[UpdateContext] Update failed:', error);
                // Force reload even if update fails
                window.location.reload();
            }
        }
    };

    return (
        <UpdateContext.Provider value={{ needRefresh, updateServiceWorker }}>
            {children}
        </UpdateContext.Provider>
    );
};
