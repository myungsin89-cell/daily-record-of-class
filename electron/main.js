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

// AutoUpdater Setup - Interactive Dialog Flow
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-available', (info) => {
    console.log(`[AutoUpdater] Update available: v${info.version}`);
    if (!mainWindow || mainWindow.isDestroyed()) return;
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '🌱 학급일지 업데이트 알림',
        message: `새로운 버전(v${info.version})이 출시되었습니다!`,
        detail: '최신 기능 및 개선사항을 적용하기 위해 지금 다운로드하시겠습니까?',
        buttons: ['지금 다운로드', '나중에'],
        defaultId: 0,
        cancelId: 1
    }).then(result => {
        if (result.response === 0) {
            autoUpdater.downloadUpdate().catch(err => {
                console.error('[AutoUpdater] Download error:', err);
            });
            if (mainWindow && !mainWindow.isDestroyed()) {
                dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: '🌱 학급일지 업데이트',
                    message: '업데이트 다운로드를 시작합니다.',
                    detail: '다운로드가 완료되면 재시작 안내창이 나타납니다. 평소처럼 앱을 사용하셔도 됩니다.',
                    buttons: ['확인']
                });
            }
        }
    });
});

autoUpdater.on('update-downloaded', (info) => {
    console.log(`[AutoUpdater] Update downloaded: v${info.version}`);
    if (!mainWindow || mainWindow.isDestroyed()) {
        autoUpdater.quitAndInstall(false, true);
        return;
    }
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '✨ 학급일지 업데이트 준비 완료',
        message: `v${info.version} 버전 다운로드가 완료되었습니다!`,
        detail: '지금 바로 프로그램을 재시작하여 최신 버전을 적용하시겠습니까?',
        buttons: ['지금 재시작하여 적용', '나중에 (종료 시 자동 적용)'],
        defaultId: 0,
        cancelId: 1
    }).then(result => {
        if (result.response === 0) {
            autoUpdater.quitAndInstall(false, true);
        }
    });
});

autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err == null ? 'unknown' : (err.stack || err).toString());
});

app.whenReady().then(() => {
    createMainWindow();

    // Check for updates on startup (packaged production only)
    if (app.isPackaged) {
        autoUpdater.checkForUpdates().catch(err => {
            console.error('[AutoUpdater] Check for updates error:', err);
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

// Save PDF to temp folder and open with system default viewer for printing
ipcMain.handle('save-temp-and-open', async (event, pdfDataArray, fileName) => {
    try {
        const os = require('os');
        const tmpDir = path.join(os.tmpdir(), 'ClassDiary_Print');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        const filePath = path.join(tmpDir, fileName);
        const buffer = Buffer.from(pdfDataArray);
        fs.writeFileSync(filePath, buffer);
        await shell.openPath(filePath);
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

// Sync Memo Data between Main Window and ALL Widget Windows (Exclude Sender to prevent IME stutter)
ipcMain.on('sync-memo-update', (event, noteData) => {
    const senderWebContents = event.sender;
    if (mainWindow && mainWindow.webContents && mainWindow.webContents !== senderWebContents) {
        mainWindow.webContents.send('memo-synced', noteData);
    }
    for (const [id, win] of widgetWindowsMap.entries()) {
        if (win && win.webContents && !win.isDestroyed() && win.webContents !== senderWebContents) {
            win.webContents.send('memo-synced', noteData);
        }
    }
});
