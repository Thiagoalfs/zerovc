import { app, BrowserWindow, ipcMain, desktopCapturer, session, shell, globalShortcut, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

app.name = 'ZeroVC';
process.title = 'ZeroVC';
app.setAppUserModelId('com.zerovc.app');

let autoUpdater: any = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (err) {
  console.warn('[AutoUpdater] electron-updater could not be loaded:', err);
}

// Persistent settings helper
let hardwareAccelerationEnabled = true;
let minimizeToTray = true;
try {
  const userDataPath = app.getPath('userData');
  const settingsFile = path.join(userDataPath, 'settings.json');
  if (fs.existsSync(settingsFile)) {
    const raw = fs.readFileSync(settingsFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed.hardwareAcceleration === 'boolean') {
      hardwareAccelerationEnabled = parsed.hardwareAcceleration;
    }
    if (typeof parsed.minimizeToTray === 'boolean') {
      minimizeToTray = parsed.minimizeToTray;
    }
  }
} catch (e) {
  console.warn('[Settings] Failed to load settings:', e);
}

if (!hardwareAccelerationEnabled) {
  console.log('[Electron] Hardware acceleration is DISABLED by user preference.');
  app.disableHardwareAcceleration();
} else {
  // Enable Hardware Acceleration & High-Performance Screen Capture
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-accelerated-video-decode');
  app.commandLine.appendSwitch('enable-accelerated-video-encode');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch(
    'enable-features',
    'WebRTCPipeWireCapturer,WebRtcHideLocalIpsWithMdns,MediaFoundationVideoEncodeAcceleration,VaapiVideoEncoder'
  );
}

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

const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAsklEQVR4nO2XwQ3DIAxFzRfXdL5mgGSodAA6XztAI24oCsFgA5XIuyEI7yNHMhCNjrmafC6fn4bk/XpEPaammBMEreSxvdFKHnOAOoOWpz9z2dRit01i4bx+o3OgzmD4AFZSP86/kvoeGiUolasEkMjFAaRyj9WU54iLAziFUxeXwCnLswLUkLMD1JJ7RM2I26juZvTX3dCEg1a3ovB2DOoMuA8ILY4OpBbUlHu6P81oeHYF80mbLXALmwAAAABJRU5ErkJggg==';

function getTrayIcon() {
  try {
    const candidates = [
      path.join(__dirname, 'tray-icon.png'),
      path.join(__dirname, 'icon.png'),
      path.join(__dirname, '..', 'electron', 'tray-icon.png'),
      path.join(__dirname, '..', 'dist', 'icon.png'),
      path.join(__dirname, '..', 'public', 'icon.png'),
      path.join(process.resourcesPath, 'tray-icon.png'),
      path.join(process.resourcesPath, 'icon.png'),
    ];
    for (const c of candidates) {
      if (require('fs').existsSync(c)) {
        return nativeImage.createFromPath(c);
      }
    }
  } catch {}
  return nativeImage.createFromDataURL(TRAY_ICON_DATA_URL);
}

function getAppIcon() {
  try {
    const icoCandidates = [
      path.join(__dirname, 'icon.ico'),
      path.join(__dirname, '..', 'electron', 'icon.ico'),
      path.join(__dirname, '..', 'public', 'favicon.ico'),
      path.join(__dirname, '..', 'dist', 'favicon.ico'),
      path.join(process.resourcesPath, 'icon.ico'),
    ];
    for (const c of icoCandidates) {
      if (require('fs').existsSync(c)) {
        return nativeImage.createFromPath(c);
      }
    }
    const pngCandidates = [
      path.join(__dirname, 'icon.png'),
      path.join(__dirname, '..', 'electron', 'icon.png'),
      path.join(__dirname, '..', 'dist', 'icon.png'),
      path.join(__dirname, '..', 'public', 'icon.png'),
      path.join(process.resourcesPath, 'icon.png'),
    ];
    for (const c of pngCandidates) {
      if (require('fs').existsSync(c)) {
        return nativeImage.createFromPath(c);
      }
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
  // IMPORTANTE: NÃO entregar audio:'loopback' aqui. O loopback do Electron é o mix do PC
  // inteiro SEM exclusão de árvore de processos — publicar isso retransmite as vozes da
  // própria call como eco para os outros participantes. O áudio do compartilhamento é
  // capturado pela ponte nativa WASAPI (zerovc-audio-capture.exe via processAudioBridge),
  // que exclui a árvore do ZeroVC (tela inteira) ou inclui apenas o processo da janela.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen', 'window'] })
      .then((sources) => {
        if (sources.length > 0) {
          callback({ video: sources[0] });
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
  try {
    const userDataPath = app.getPath('userData');
    const settingsFile = path.join(userDataPath, 'settings.json');
    let settings: any = {};
    if (fs.existsSync(settingsFile)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      } catch {}
    }
    settings.minimizeToTray = minimizeToTray;
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('[Settings] Failed to save minimizeToTray setting:', err);
  }
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

ipcMain.on('window-set-fullscreen', (_event, flag: boolean) => {
  mainWindow?.setFullScreen(!!flag);
});

ipcMain.handle('window-is-fullscreen', () => {
  return mainWindow?.isFullScreen() ?? false;
});

ipcMain.handle('get-gpu-info', async () => {
  try {
    const basic = await app.getGPUInfo('basic');
    const features = app.getGPUFeatureStatus();
    return {
      basic,
      features,
    };
  } catch (err) {
    console.warn('[Electron] Could not retrieve GPU info:', err);
    return null;
  }
});

ipcMain.handle('get-hardware-acceleration', () => {
  return hardwareAccelerationEnabled;
});

ipcMain.on('set-hardware-acceleration', (_event, enabled: boolean) => {
  hardwareAccelerationEnabled = enabled;
  try {
    const userDataPath = app.getPath('userData');
    const settingsFile = path.join(userDataPath, 'settings.json');
    let settings: any = {};
    if (fs.existsSync(settingsFile)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      } catch {}
    }
    settings.hardwareAcceleration = enabled;
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
    console.log('[Electron] Hardware acceleration preference saved to:', enabled);
  } catch (err) {
    console.error('[Settings] Failed to save hardware acceleration setting:', err);
  }
});

ipcMain.on('relaunch-app', () => {
  app.relaunch();
  app.exit(0);
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
    startActivityScanner();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

// -------------------------------------------------------------
// Activity / Game Detection Scanner
// -------------------------------------------------------------
interface DetectedActivity {
  type: 'playing' | 'listening' | 'watching' | 'streaming' | 'competing' | 'custom';
  name: string;
  details?: string;
  start_time: number;
}

const KNOWN_GAMES_AND_APPS: Array<{
  match: RegExp;
  name: string;
  type: 'playing' | 'listening' | 'watching' | 'streaming' | 'competing' | 'custom';
}> = [
  // Popular Games
  { match: /Minecraft|javaw\.exe|bedrock_server|Minecraft\.Windows/i, name: 'Minecraft', type: 'playing' },
  { match: /LeagueClient|League of Legends/i, name: 'League of Legends', type: 'playing' },
  { match: /VALORANT|VALORANT-Win64-Shipping/i, name: 'VALORANT', type: 'playing' },
  { match: /cs2\.exe|csgo\.exe|Counter-Strike/i, name: 'Counter-Strike 2', type: 'playing' },
  { match: /GTA5\.exe|Grand Theft Auto V|FiveM/i, name: 'Grand Theft Auto V', type: 'playing' },
  { match: /RobloxPlayerBeta|Roblox/i, name: 'Roblox', type: 'playing' },
  { match: /FortniteClient-Win64-Shipping|Fortnite/i, name: 'Fortnite', type: 'playing' },
  { match: /Overwatch|Overwatch\.exe/i, name: 'Overwatch 2', type: 'playing' },
  { match: /GenshinImpact\.exe|Genshin Impact/i, name: 'Genshin Impact', type: 'playing' },
  { match: /StarRail\.exe|Honkai: Star Rail/i, name: 'Honkai: Star Rail', type: 'playing' },
  { match: /ApexLegends|r5apex\.exe/i, name: 'Apex Legends', type: 'playing' },
  { match: /RocketLeague\.exe|Rocket League/i, name: 'Rocket League', type: 'playing' },
  { match: /Cyberpunk2077\.exe/i, name: 'Cyberpunk 2077', type: 'playing' },
  { match: /eldenring\.exe/i, name: 'ELDEN RING', type: 'playing' },
  { match: /Terraria\.exe/i, name: 'Terraria', type: 'playing' },
  { match: /Stardew Valley|StardewValley\.exe/i, name: 'Stardew Valley', type: 'playing' },
  { match: /dota2\.exe|Dota 2/i, name: 'Dota 2', type: 'playing' },
  { match: /DeadByDaylight/i, name: 'Dead by Daylight', type: 'playing' },
  { match: /RustClient\.exe|Rust/i, name: 'Rust', type: 'playing' },
  { match: /Among Us|Among Us\.exe/i, name: 'Among Us', type: 'playing' },
  { match: /osu!\.exe|osu!/i, name: 'osu!', type: 'playing' },
  { match: /RainbowSix\.exe|Rainbow Six/i, name: 'Rainbow Six Siege', type: 'playing' },
  { match: /WorldOfTanks\.exe|World of Tanks/i, name: 'World of Tanks', type: 'playing' },
  { match: /Warframe\.x64\.exe|Warframe/i, name: 'Warframe', type: 'playing' },
  { match: /Destiny2\.exe|Destiny 2/i, name: 'Destiny 2', type: 'playing' },
  { match: /TslGame\.exe|PUBG/i, name: 'PUBG: BATTLEGROUNDS', type: 'playing' },
  { match: /FallGuys_client\.exe|Fall Guys/i, name: 'Fall Guys', type: 'playing' },
  { match: /Brawlhalla\.exe|Brawlhalla/i, name: 'Brawlhalla', type: 'playing' },
  { match: /TheSims4|TS4_x64\.exe/i, name: 'The Sims 4', type: 'playing' },
  // Apps & Creative
  { match: /Spotify\.exe|Spotify/i, name: 'Spotify', type: 'listening' },
  { match: /Code\.exe|Visual Studio Code/i, name: 'Visual Studio Code', type: 'playing' },
  { match: /blender\.exe|Blender/i, name: 'Blender', type: 'playing' },
  { match: /Photoshop\.exe|Adobe Photoshop/i, name: 'Adobe Photoshop', type: 'playing' },
  { match: /obs64\.exe|obs32\.exe|OBS Studio/i, name: 'OBS Studio', type: 'streaming' },
];

let lastDetectedActivity: DetectedActivity | null = null;
let activityScanTimer: NodeJS.Timeout | null = null;

function scanProcessesForActivity() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const { exec } = require('child_process');
  let cmd = '';
  if (process.platform === 'win32') {
    cmd = 'tasklist /FO CSV /NH';
  } else if (process.platform === 'darwin' || process.platform === 'linux') {
    cmd = 'ps -eo comm=';
  } else {
    return;
  }

  exec(cmd, { maxBuffer: 1024 * 512, windowsHide: true }, (err: any, stdout: string) => {
    if (err || !stdout) return;

    let foundMatch: { name: string; type: DetectedActivity['type'] } | null = null;

    for (const item of KNOWN_GAMES_AND_APPS) {
      if (item.match.test(stdout)) {
        foundMatch = { name: item.name, type: item.type };
        break;
      }
    }

    if (foundMatch) {
      if (!lastDetectedActivity || lastDetectedActivity.name !== foundMatch.name) {
        lastDetectedActivity = {
          name: foundMatch.name,
          type: foundMatch.type,
          start_time: Math.floor(Date.now() / 1000),
        };
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('activity-detected', lastDetectedActivity);
        }
      }
    } else if (lastDetectedActivity) {
      lastDetectedActivity = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('activity-detected', null);
      }
    }
  });
}

function startActivityScanner() {
  if (activityScanTimer) return;
  setTimeout(scanProcessesForActivity, 3000);
  activityScanTimer = setInterval(scanProcessesForActivity, 20000);
}

function stopActivityScanner() {
  if (activityScanTimer) {
    clearInterval(activityScanTimer);
    activityScanTimer = null;
  }
}

ipcMain.handle('get-current-activity', () => {
  return lastDetectedActivity;
});

ipcMain.handle('start-process-audio-capture', async (_event, options?: { sourceId?: string; mode?: 'include' | 'exclude' }) => {
  if (process.platform !== 'win32') {
    return { success: false, error: 'WASAPI capture is only supported on Windows' };
  }

  if (activeAudioProcess) {
    try {
      activeAudioProcess.kill();
    } catch {}
    activeAudioProcess = null;
  }
  activeAudioBuffer = Buffer.alloc(0);

  const binPath = getAudioCaptureBinaryPath();
  if (!fs.existsSync(binPath)) {
    console.error('[AudioCapture] Binary not found at:', binPath);
    return { success: false, error: `Capture binary not found at ${binPath}` };
  }

  try {
    const args: string[] = ['--zerovc-pid', process.pid.toString()];

    if (options?.sourceId && options.sourceId.startsWith('window:')) {
      const parts = options.sourceId.split(':');
      const hwndStr = parts[1];
      if (hwndStr) {
        args.push('--hwnd', hwndStr, '--mode', 'include');
      }
    } else {
      args.push('--mode', 'exclude');
    }

    console.log('[AudioCapture] Spawning native WASAPI audio capture:', binPath, args);

    const child = spawn(binPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    activeAudioProcess = child;

    child.stdout.on('data', (chunk: Buffer) => {
      activeAudioBuffer = Buffer.concat([activeAudioBuffer, chunk]);
      while (activeAudioBuffer.length >= AUDIO_CHUNK_BYTES) {
        const packet = activeAudioBuffer.subarray(0, AUDIO_CHUNK_BYTES);
        activeAudioBuffer = activeAudioBuffer.subarray(AUDIO_CHUNK_BYTES);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('process-audio-chunk', packet);
        }
      }
    });

    child.on('close', (code) => {
      console.log(`[AudioCapture] Process exited with code ${code}`);
      if (activeAudioProcess === child) {
        activeAudioProcess = null;
      }
    });

    child.on('error', (err) => {
      console.error('[AudioCapture] Process spawn error:', err);
      if (activeAudioProcess === child) {
        activeAudioProcess = null;
      }
    });

    // Confirmação de captura real: só reportamos sucesso quando o binário sinalizar
    // "Capture Started" SEM ter caído no fallback de loopback clássico (mix do PC
    // inteiro via StartClassicDefaultEndpointLoopback). Esse fallback é a causa do eco
    // das vozes da call em servidores, grupos e DMs — nesse caso falhamos explicitamente
    // para que NENHUM áudio seja publicado (o share segue só com vídeo).
    const captureStatus = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      let settled = false;
      let started = false;
      const finish = (result: { ok: boolean; error?: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => finish({ ok: false, error: 'capture-start-timeout' }), 3000);

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        console.log(`[AudioCapture Native] ${text.trim()}`);
        if (text.includes('Capture Started') || text.includes('Started capture loop')) {
          started = true;
          finish({ ok: true });
        }
      });

      child.on('close', (code) => {
        finish({ ok: false, error: `capture-exited-before-start-${code}` });
      });
    });

    if (!captureStatus.ok) {
      console.error('[AudioCapture] Native capture did not start cleanly:', captureStatus.error);
      try { child.kill(); } catch {}
      if (activeAudioProcess === child) {
        activeAudioProcess = null;
      }
      activeAudioBuffer = Buffer.alloc(0);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('process-audio-fallback', { reason: captureStatus.error });
      }
      return { success: false, error: captureStatus.error };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[AudioCapture] Failed to start native capture:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('stop-process-audio-capture', async () => {
  if (activeAudioProcess) {
    try {
      activeAudioProcess.kill();
    } catch {}
    activeAudioProcess = null;
  }
  activeAudioBuffer = Buffer.alloc(0);
  return { success: true };
});

let activeAudioProcess: ChildProcess | null = null;
let activeAudioBuffer = Buffer.alloc(0);
const AUDIO_CHUNK_BYTES = 3840; // 480 frames * 2 channels * 4 bytes (Float32) = 10ms at 48kHz

function getAudioCaptureBinaryPath(): string {
  const binaryName = 'zerovc-audio-capture.exe';
  const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist-electron', 'bin', binaryName);
  if (fs.existsSync(unpackedPath)) return unpackedPath;

  const distBinPath = path.join(__dirname, 'bin', binaryName);
  if (fs.existsSync(distBinPath)) return distBinPath;

  const electronBinPath = path.join(__dirname, '..', 'electron', 'bin', binaryName);
  if (fs.existsSync(electronBinPath)) return electronBinPath;

  return distBinPath;
}

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  stopActivityScanner();
  globalShortcut.unregisterAll();
  if (activeAudioProcess) {
    try {
      activeAudioProcess.kill();
    } catch {}
    activeAudioProcess = null;
  }
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