const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),
    setWindowMode: (mode) => ipcRenderer.send('set-window-mode', mode),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    saveBackupFile: (folderPath, filename, content) => ipcRenderer.invoke('save-backup-file', folderPath, filename, content),
    saveTempAndOpen: (pdfData, fileName) => ipcRenderer.invoke('save-temp-and-open', pdfData, fileName),
    openWidgetWindow: (noteId) => ipcRenderer.send('open-widget-window', noteId),
    closeWidgetWindow: () => ipcRenderer.send('close-widget-window'),
    setWidgetOpacity: (opacity) => ipcRenderer.send('set-widget-opacity', opacity),
    setAlwaysOnTop: (isAlwaysOnTop) => ipcRenderer.send('set-always-on-top', isAlwaysOnTop),
    syncMemoUpdate: (noteData) => ipcRenderer.send('sync-memo-update', noteData),
    onMemoSync: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('memo-synced', handler);
        return () => ipcRenderer.removeListener('memo-synced', handler);
    },
    // In-App AutoUpdater IPC APIs
    onUpdateAvailable: (callback) => {
        const handler = (event, info) => callback(info);
        ipcRenderer.on('update-available', handler);
        return () => ipcRenderer.removeListener('update-available', handler);
    },
    onUpdateDownloadProgress: (callback) => {
        const handler = (event, progress) => callback(progress);
        ipcRenderer.on('update-download-progress', handler);
        return () => ipcRenderer.removeListener('update-download-progress', handler);
    },
    onUpdateDownloaded: (callback) => {
        const handler = (event, info) => callback(info);
        ipcRenderer.on('update-downloaded', handler);
        return () => ipcRenderer.removeListener('update-downloaded', handler);
    },
    onUpdateError: (callback) => {
        const handler = (event, error) => callback(error);
        ipcRenderer.on('update-error', handler);
        return () => ipcRenderer.removeListener('update-error', handler);
    },
    startUpdateDownload: () => ipcRenderer.invoke('start-update-download'),
    quitAndInstallUpdate: () => ipcRenderer.invoke('quit-and-install-update'),
    isElectron: true
});
