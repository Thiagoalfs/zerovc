import { app, BrowserWindow, ipcMain, desktopCapturer, session, shell, globalShortcut, Tray, Menu, nativeImage } from 'electron';
import path from 'path';

let autoUpdater: any = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (err) {
  console.warn('[AutoUpdater] electron-updater could not be loaded:', err);
}

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

// Base production server URL and Allowed Origins
const REMOTE_SERVER_URL = 'https://zerovc.safiroko.xyz';
const ALLOWED_ORIGINS = ['https://zerovc.safiroko.xyz', 'http://localhost:5173'];
const ALLOWED_DEEP_LINK_PATH_REGEX = /^\/(invite|invites|channels|@me)(\/|$)/;

// Register zerovc:// protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('zerovc', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('zerovc');
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let minimizeToTray = true;

const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAsklEQVR4nO2XwQ3DIAxFzRfXdL5mgGSodAA6XztAI24oCsFgA5XIuyEI7yNHMhCNjrmafC6fn4bk/XpEPaammBMEreSxvdFKHnOAOoOWpz9z2dRit01i4bx+o3OgzmD4AFZSP86/kvoeGiUolasEkMjFAaRyj9WU54iLAziFUxeXwCnLswLUkLMD1JJ7RM2I26juZvTX3dCEg1a3ovB2DOoMuA8ILY4OpBbUlHu6P81oeHYF80mbLXALmwAAAABJRU5ErkJggg==';

function getTrayIcon() {
  try {
    const iconPath = path.join(__dirname, 'tray-icon.png');
    if (require('fs').existsSync(iconPath)) {
      return nativeImage.createFromPath(iconPath);
    }
  } catch {}
  return nativeImage.createFromDataURL(TRAY_ICON_DATA_URL);
}

function getAppIcon() {
  try {
    const icoPath = path.join(__dirname, 'icon.ico');
    if (require('fs').existsSync(icoPath)) {
      return nativeImage.createFromPath(icoPath);
    }
    const pngPath = path.join(__dirname, 'icon.png');
    if (require('fs').existsSync(pngPath)) {
      return nativeImage.createFromPath(pngPath);
    }
  } catch {}
  return getTrayIcon();
}

function createTray() {
  if (tray) return;

  try {
    const icon = getTrayIcon();
    tray = new Tray(icon);
    tray.setToolTip('ZeroVC');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Abrir ZeroVC',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Sair do ZeroVC',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
          mainWindow.focus();
        } else {
          mainWindow.focus();
        }
      } else {
        mainWindow.show();
        mainWindow.restore();
        mainWindow.focus();
      }
    });

    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.error('[Electron] Failed to create system tray:', err);
  }
}

function extractValidTargetPath(rawUrl: string): string | null {
  try {
    let targetPath = '';
    if (rawUrl.startsWith('zerovc://')) {
      // e.g. zerovc://invite/XYZ -> /invite/XYZ
      targetPath = rawUrl.replace('zerovc://', '/');
      if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;
    } else if (rawUrl.startsWith(REMOTE_SERVER_URL)) {
      targetPath = rawUrl.replace(REMOTE_SERVER_URL, '');
    } else {
      return null;
    }

    if (ALLOWED_DEEP_LINK_PATH_REGEX.test(targetPath)) {
      return targetPath;
    }
    console.warn(`[Electron] Rejected invalid deep link targetPath: ${targetPath}`);
    return null;
  } catch (err) {
    console.error('[Electron] Error extracting targetPath:', err);
    return null;
  }
}

function handleDeepLink(rawUrl: string) {
  if (!mainWindow) return;
  try {
    const targetPath = extractValidTargetPath(rawUrl);
    if (!targetPath) return;

    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    const baseUrl = isDev ? 'http://localhost:5173' : REMOTE_SERVER_URL;
    const destination = `${baseUrl}${targetPath}`;

    mainWindow.loadURL(destination).catch((err) => {
      console.warn('[Electron] Failed to load deep link destination:', err);
    });
  } catch (err) {
    console.error('[Electron] Error handling deep link:', err);
  }
}

function createWindow(initialUrl?: string) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#0d1117',
    icon: getAppIcon(),
    frame: false, // Frameless window for Discord-style custom titlebar
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  // Restrict in-window navigation to allowed origins
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === 'file:') return;
      if (!ALLOWED_ORIGINS.includes(parsedUrl.origin)) {
        event.preventDefault();
        console.warn(`[Electron] Blocked will-navigate to unauthorized origin: ${parsedUrl.origin}`);
        if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
          shell.openExternal(url);
        }
      }
    } catch {
      event.preventDefault();
    }
  });

  // Restrict window.open / target="_blank" popups to allowed origins
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsedUrl = new URL(url);
      if (ALLOWED_ORIGINS.includes(parsedUrl.origin)) {
        return { action: 'allow' };
      }
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch {}
    return { action: 'deny' };
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
    mainWindow.loadURL(initialUrl || 'http://localhost:5173');
  } else {
    // Discord Model: Load latest production build from server with offline fallback
    const targetUrl = initialUrl || REMOTE_SERVER_URL;
    mainWindow.loadURL(targetUrl).catch((err) => {
      console.warn('[Electron] Remote server unavailable, loading local fallback:', err);
      mainWindow?.loadFile(path.join(__dirname, '../dist/index.html'));
    });

    // Fallback if main URL fails during navigation
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, _errorDescription, validatedURL) => {
      if (validatedURL.startsWith(REMOTE_SERVER_URL)) {
        console.warn(`[Electron] Failed to load remote (${errorCode}), falling back to local files.`);
        mainWindow?.loadFile(path.join(__dirname, '../dist/index.html'));
      }
    });
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting && minimizeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Setup auto-updater when running in packaged mode
  if (!isDev && autoUpdater) {
    setupAutoUpdater();
    setTimeout(() => {
      try {
        autoUpdater?.checkForUpdates()?.catch(() => {});
      } catch {}
    }, 3000);
    setInterval(() => {
      try {
        autoUpdater?.checkForUpdates()?.catch(() => {});
      } catch {}
    }, 15 * 60 * 1000);
  }
}

// -------------------------------------------------------------
// Auto-Updater Configuration (GitHub Releases)
// -------------------------------------------------------------
function setupAutoUpdater() {
  if (!autoUpdater) return;

  autoUpdater.autoDownload = false; // Let user click the Update button in TitleBar
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates on GitHub...');
  });

  autoUpdater.on('update-available', (info: any) => {
    console.log('[AutoUpdater] Update available:', info.version);
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] Application is up to date.');
  });

  autoUpdater.on('download-progress', (progressObj: any) => {
    mainWindow?.webContents.send('update-progress', {
      percent: progressObj.percent,
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total,
    });
  });

  autoUpdater.on('update-downloaded', (info: any) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
    mainWindow?.webContents.send('update-downloaded', {
      version: info.version,
    });
  });

  autoUpdater.on('error', (err: any) => {
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
  if (!isQuitting && minimizeToTray) {
    mainWindow?.hide();
  } else {
    mainWindow?.close();
  }
});

ipcMain.on('set-minimize-to-tray', (_event, enabled: boolean) => {
  minimizeToTray = !!enabled;
});

ipcMain.handle('get-minimize-to-tray', () => {
  return minimizeToTray;
});

ipcMain.on('set-auto-start', (_event, enabled: boolean) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      openAsHidden: true,
    });
  } catch (err) {
    console.error('[Electron] Error setting auto start:', err);
  }
});

ipcMain.handle('get-auto-start', () => {
  try {
    return app.getLoginItemSettings().openAtLogin ?? false;
  } catch {
    return false;
  }
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

ipcMain.on('check-for-updates', () => {
  if (app.isPackaged && autoUpdater) {
    autoUpdater.checkForUpdates().catch(() => {});
  }
});

ipcMain.on('start-download-update', () => {
  if (autoUpdater) {
    autoUpdater.downloadUpdate().catch((err: any) => {
      console.error('[AutoUpdater] Error on downloadUpdate:', err);
    });
  }
});

ipcMain.on('quit-and-install', () => {
  if (autoUpdater) {
    autoUpdater.quitAndInstall(false, true);
  }
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

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Focus our window if another instance was opened
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      // Find deep link in arguments
      const urlArg = commandLine.find(
        (arg) => arg.startsWith('zerovc://') || arg.startsWith('https://zerovc.safiroko.xyz')
      );
      if (urlArg) {
        handleDeepLink(urlArg);
      }
    }
  });

  app.whenReady().then(() => {
    // Check initial deep link argument on launch
    const urlArg = process.argv.find(
      (arg) => arg.startsWith('zerovc://') || arg.startsWith('https://zerovc.safiroko.xyz')
    );

    let initialUrl: string | undefined = undefined;
    if (urlArg) {
      const targetPath = extractValidTargetPath(urlArg);
      if (targetPath) {
        const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
        const baseUrl = isDev ? 'http://localhost:5173' : REMOTE_SERVER_URL;
        initialUrl = `${baseUrl}${targetPath}`;
      }
    }

    createWindow(initialUrl);
    createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (!minimizeToTray || isQuitting) {
      app.quit();
    }
  }
});