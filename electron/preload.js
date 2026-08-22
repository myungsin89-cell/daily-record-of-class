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
    isElectron: true
});
