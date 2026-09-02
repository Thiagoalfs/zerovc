import { app, BrowserWindow, ipcMain, desktopCapturer, session, shell, globalShortcut } from 'electron';
import path from 'path';
const { autoUpdater } = require('electron-updater');

// Enable Hardware Acceleration & High-Performance Native Screen Capture
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-hardware-overlays', 'single-fullscreen,single-on-top,underlay');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-accelerated-video-encode');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch(
  'enable-features',
  'WindowsGraphicsCapture,WebRTCPipeWireCapturer,WebRtcHideLocalIpsWithMdns,ZeroCopy'
);

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#0d1117',
    frame: false, // Frameless window for Discord-style custom titlebar
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  // Handle media permissions automatically (Microphone, Camera, Screen share)
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = ['media', 'microphone', 'camera', 'screen', 'notifications'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Handle getDisplayMedia requests in Electron
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen', 'window'] })
      .then((sources) => {
        if (sources.length > 0) {
          callback({ video: sources[0], audio: 'loopback' });
        } else {
          callback({ video: undefined as any });
        }
      })
      .catch((err) => {
        console.error('Error handling display media request:', err);
        callback({ video: undefined as any });
      });
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    checkGitHubRepoUpdates();
  });

  // Check repo updates every 30 seconds
  setInterval(() => {
    checkGitHubRepoUpdates();
  }, 30 * 1000);

  // Setup auto-updater when running in packaged mode
  if (!isDev) {
    setupAutoUpdater();
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 3000);
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 15 * 60 * 1000);
  }
}

// -------------------------------------------------------------
// GitHub Repository Direct Commit Checker
// -------------------------------------------------------------
async function checkGitHubRepoUpdates() {
  try {
    const res = await fetch('https://api.github.com/repos/Thiagoalfs/zerovc/commits/main', {
      headers: {
        'User-Agent': 'ZeroVC-Desktop-App',
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    if (res.ok) {
      const data: any = await res.json();
      const latestSha = data.sha;
      const commitMsg = data.commit?.message?.split('\n')[0] || 'Novas alterações encontradas no repositório';
      const author = data.commit?.author?.name || 'GitHub';

      mainWindow?.webContents.send('repo-update-available', {
        latestSha,
        shortSha: latestSha.substring(0, 7),
        message: commitMsg,
        author,
        commitUrl: data.html_url,
        publishedAt: data.commit?.author?.date,
      });
    }
  } catch (err) {
    console.error('[UpdateChecker] Failed to check GitHub commits:', err);
  }
}

// -------------------------------------------------------------
// Auto-Updater Configuration (GitHub Releases)
// -------------------------------------------------------------
function setupAutoUpdater() {
  autoUpdater.autoDownload = false; // Let user click the Update button in TitleBar
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates on GitHub...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] Application is up to date.');
  });

  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents.send('update-progress', {
      percent: progressObj.percent,
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
    mainWindow?.webContents.send('update-downloaded', {
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error checking/downloading update:', err);
  });
}

// -------------------------------------------------------------
// IPC Handlers: Window Controls & Updater Actions
// -------------------------------------------------------------
ipcMain.on('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window-close', () => {
  mainWindow?.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

ipcMain.on('start-download-update', () => {
  autoUpdater.downloadUpdate().catch((err) => {
    console.error('[AutoUpdater] Error on downloadUpdate:', err);
  });
});

ipcMain.on('quit-and-install', () => {
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.on('open-external', (_event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});

ipcMain.on('reload-app', () => {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    mainWindow?.loadURL('http://localhost:5173');
  } else {
    mainWindow?.loadFile(path.join(__dirname, '../dist/index.html'));
  }
});

ipcMain.on('check-for-updates', () => {
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(() => {});
  }
});

// IPC: Get Screen Sources for Screen Sharing in WebRTC
ipcMain.handle('get-screen-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 400, height: 225 },
      fetchWindowIcons: true,
    });

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
    }));
  } catch (err) {
    console.error('Failed to get screen sources:', err);
    return [];
  }
});

// IPC: Global Shortcuts
ipcMain.handle('register-global-shortcut', (_event, shortcut: string, action: string) => {
  try {
    if (!shortcut) return false;
    // Unregister existing shortcut if already bound
    if (globalShortcut.isRegistered(shortcut)) {
      globalShortcut.unregister(shortcut);
    }
    const success = globalShortcut.register(shortcut, () => {
      mainWindow?.webContents.send('global-shortcut-triggered', action);
    });
    return success;
  } catch (err) {
    console.error('Error registering global shortcut:', err);
    return false;
  }
});

ipcMain.handle('unregister-all-shortcuts', () => {
  try {
    globalShortcut.unregisterAll();
    return true;
  } catch {
    return false;
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});