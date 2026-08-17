const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// Single instance lock - only in production to prevent multiple app windows
// In dev mode, concurrently + HMR restarts can leave stale lock files
if (app.isPackaged) {
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
        app.quit();
    }
}

// Clean corrupted Chromium QuotaManager files on startup (fixes "Failed to reset the quota database" error)
function cleanCorruptedQuotaDB() {
    const userDataPath = app.getPath('userData');
    const quotaFiles = [
        path.join(userDataPath, 'QuotaManager'),
        path.join(userDataPath, 'QuotaManager-journal'),
    ];
    // Also check inside profile subdirectories
    const subDirs = ['Default', 'Local Storage', 'IndexedDB', 'WebStorage'];
    for (const sub of subDirs) {
        quotaFiles.push(path.join(userDataPath, sub, 'QuotaManager'));
        quotaFiles.push(path.join(userDataPath, sub, 'QuotaManager-journal'));
    }
    for (const filePath of quotaFiles) {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`[Main] Cleaned corrupted quota file: ${filePath}`);
            }
        } catch (e) {
            console.warn(`[Main] Could not clean quota file: ${filePath}`, e.message);
        }
    }
}
cleanCorruptedQuotaDB();

let mainWindow;
const widgetWindowsMap = new Map();

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 420,
        height: 640,
        minWidth: 420,
        minHeight: 640,
        resizable: false,
        frame: false,
        backgroundColor: '#f8fafc',
        show: true,
        center: true,
        skipTaskbar: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false
        }
    });

    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[Renderer Console] ${message} (${sourceId}:${line})`);
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.log(`[Renderer Load Fail] ${errorCode}: ${errorDescription} (${validatedURL})`);
    });

    const distPath = path.join(__dirname, '../dist/index.html');

    if (process.env.VITE_DEV_SERVER_URL && !app.isPackaged) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else if (fs.existsSync(distPath)) {
        mainWindow.loadFile(distPath);
    } else {
        const fallbackPath = path.join(app.getAppPath(), 'dist/index.html');
        if (fs.existsSync(fallbackPath)) {
            mainWindow.loadFile(fallbackPath);
        } else {
            mainWindow.loadURL('http://localhost:5173');
        }
    }

    mainWindow.once('ready-to-show', () => {
        console.log('[Main] ready-to-show fired');
        mainWindow.show();
        mainWindow.focus();
    });

    // Fallback: if ready-to-show doesn't fire within 5s, force show
    const forceShowTimeout = setTimeout(() => {
        if (mainWindow && !mainWindow.isVisible()) {
            console.log('[Main] Force showing window (ready-to-show timeout)');
            mainWindow.show();
            mainWindow.focus();
        }
    }, 5000);

    mainWindow.once('ready-to-show', () => {
        clearTimeout(forceShowTimeout);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function createWidgetWindow(noteId) {
    if (!noteId) return;

    if (widgetWindowsMap.has(noteId)) {
        const existingWin = widgetWindowsMap.get(noteId);
        if (existingWin && !existingWin.isDestroyed()) {
            existingWin.show();
            existingWin.focus();
            return;
        }
    }

    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    const distPath = path.join(__dirname, '../dist/index.html');
    const widgetUrl = app.isPackaged 
        ? `file://${distPath}#/widget?id=${noteId}` 
        : `${devServerUrl.replace(/\/$/, '')}/#/widget?id=${noteId}`;

    const win = new BrowserWindow({
        width: 320,
        height: 340,
        minWidth: 240,
        minHeight: 240,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        hasShadow: false,
        thickFrame: false,
        show: true,
        alwaysOnTop: true,
        resizable: true,
        skipTaskbar: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false
        }
    });

    widgetWindowsMap.set(noteId, win);

    win.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[Widget Console] ${message} (${sourceId}:${line})`);
    });

    win.loadURL(widgetUrl);
    win.show();
    win.focus();
    win.setAlwaysOnTop(true, 'screen-saver');

    win.on('closed', () => {
        widgetWindowsMap.delete(noteId);
    });
}

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

app.whenReady().then(() => {
    createMainWindow();

    // Check for updates on startup (packaged production only)
    if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify().catch(err => {
            console.error('Failed to check for updates:', err);
        });
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Window mode switcher (compact login window vs full app window)
ipcMain.on('set-window-mode', (event, mode) => {
    if (!mainWindow) return;

    if (mode === 'login') {
        mainWindow.unmaximize();
        mainWindow.setResizable(true);
        mainWindow.setMinimumSize(420, 640);
        mainWindow.setSize(420, 640, true);
        mainWindow.setResizable(false);
        mainWindow.center();
        mainWindow.show();
        mainWindow.focus();
    } else if (mode === 'app') {
        mainWindow.setResizable(true);
        mainWindow.setMinimumSize(1080, 720);
        mainWindow.setSize(1440, 900, true);
        mainWindow.center();
        mainWindow.show();
        mainWindow.focus();
    }
});

// Window controls
ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
    if (mainWindow && mainWindow.isResizable()) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
});

// Select Backup Folder
ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (result.canceled) return null;
    return result.filePaths[0];
});

// Write Backup File
ipcMain.handle('save-backup-file', async (event, folderPath, filename, content) => {
    try {
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
        const filePath = path.join(folderPath, filename);
        fs.writeFileSync(filePath, content, 'utf-8');
        return { success: true, filePath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// Launch Widget
ipcMain.on('open-widget-window', (event, noteId) => {
    createWidgetWindow(noteId);
});

// Close Widget Window
ipcMain.on('close-widget-window', (event) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (senderWin) senderWin.close();
});

// Set Widget Opacity
ipcMain.on('set-widget-opacity', (event, opacity) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (senderWin) {
        senderWin.setOpacity(Math.max(0.2, Math.min(1.0, opacity)));
    }
});

// Set Widget Always on Top
ipcMain.on('set-always-on-top', (event, isAlwaysOnTop) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (senderWin) {
        senderWin.setAlwaysOnTop(isAlwaysOnTop);
    }
});

// Sync Memo Data between Main Window and ALL Widget Windows
ipcMain.on('sync-memo-update', (event, noteData) => {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('memo-synced', noteData);
    }
    for (const [id, win] of widgetWindowsMap.entries()) {
        if (win && win.webContents && !win.isDestroyed()) {
            win.webContents.send('memo-synced', noteData);
        }
    }
});
