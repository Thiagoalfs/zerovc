import { app, BrowserWindow, ipcMain, desktopCapturer, session, shell, globalShortcut, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn, execSync, ChildProcess } from 'child_process';

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

// ---- Update splash (startup) state ----
let splashWindow: BrowserWindow | null = null;
let startupPhase = true;
let isInstallingUpdate = false;
let pendingInitialUrl: string | undefined = undefined;
let pendingUpdateAvailableInfo: { version: string; releaseNotes?: any } | null = null;
let updateCheckTimer: ReturnType<typeof setInterval> | null = null;

interface UpdateAttemptRecord {
  version: string;
  count: number;
  timestamp: number;
}

function getLastUpdateAttempt(): UpdateAttemptRecord | null {
  try {
    const settingsFile = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(settingsFile)) {
      const parsed = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      const attempt = parsed?.lastUpdateAttempt;
      if (attempt && typeof attempt.version === 'string' && typeof attempt.count === 'number') {
        return {
          version: attempt.version,
          count: attempt.count,
          timestamp: Number(attempt.timestamp) || 0,
        };
      }
    }
  } catch {}
  return null;
}

function recordUpdateAttempt(version: string) {
  try {
    const settingsFile = path.join(app.getPath('userData'), 'settings.json');
    let settings: any = {};
    if (fs.existsSync(settingsFile)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      } catch {}
    }
    const prev = settings.lastUpdateAttempt;
    const count = prev && prev.version === version ? (Number(prev.count) || 0) + 1 : 1;
    settings.lastUpdateAttempt = {
      version,
      count,
      timestamp: Date.now(),
    };
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.warn('[AutoUpdater] Failed to record update attempt:', err);
  }
}

function clearUpdateAttempt() {
  try {
    const settingsFile = path.join(app.getPath('userData'), 'settings.json');
    if (!fs.existsSync(settingsFile)) return;
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    if (settings && 'lastUpdateAttempt' in settings) {
      delete settings.lastUpdateAttempt;
      fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
    }
  } catch {}
}

function loadSplashColors(): { accent: string; bg: string } {
  try {
    const settingsFile = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(settingsFile)) {
      const parsed = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      if (parsed?.splash?.accent && parsed?.splash?.bg) {
        return { accent: String(parsed.splash.accent), bg: String(parsed.splash.bg) };
      }
    }
  } catch {}
  return { accent: '99,102,241', bg: '13,17,23' };
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

function createWindow(initialUrl?: string, showImmediately = true) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#0d1117',
    icon: getAppIcon(),
    frame: false, // Frameless window for custom titlebar
    titleBarStyle: 'hidden',
    show: false, // no arranque, quem revela é o splash (finalizeStartupSplash)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  // Aberturas normais (ex.: activate no macOS): mostrar quando pronto.
  if (showImmediately) {
    mainWindow.once('ready-to-show', () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
    });
  }

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
    // Production Model: Load latest production build from server with offline fallback
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

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingUpdateAvailableInfo && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', pendingUpdateAvailableInfo);
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && minimizeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Auto-updater é orquestrado pela sequência de startup (fluxo do splash).
}

// -------------------------------------------------------------
// Auto-Updater Configuration (GitHub Releases)
// -------------------------------------------------------------
function setupAutoUpdater() {
  if (!autoUpdater) return;

  // Se o app já iniciou na versão da última tentativa de update, limpa o registro.
  const prevAttemptOnBoot = getLastUpdateAttempt();
  if (prevAttemptOnBoot && prevAttemptOnBoot.version === app.getVersion()) {
    clearUpdateAttempt();
  }

  // Nunca baixar nem instalar no quit sozinho: controlamos explicitamente quando
  // baixar e quando chamar quitAndInstall (evitando dupla execução do NSIS no will-quit).
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    if (startupPhase) sendSplash({ phase: 'checking' });
  });

  autoUpdater.on('update-available', (info: any) => {
    pendingUpdateAvailableInfo = {
      version: info.version,
      releaseNotes: info.releaseNotes,
    };

    if (startupPhase) {
      // Circuit breaker: se já tentamos instalar esta exata versão no boot anterior e
      // o instalador NSIS falhou (o app continua na versão antiga), não prender o usuário
      // em loop infinito no splash. Abre o app normalmente e mantém o ícone no TitleBar.
      const prevAttempt = getLastUpdateAttempt();
      if (prevAttempt && prevAttempt.version === info.version && prevAttempt.count >= 1) {
        console.warn(
          `[AutoUpdater] Circuit breaker ativo: atualização para v${info.version} falhou na tentativa anterior (#${prevAttempt.count}). Abrindo app normalmente.`
        );
        finalizeStartupSplash();
        return;
      }

      // No arranque (splash): baixa automaticamente, como o Discord.
      sendSplash({ phase: 'downloading', version: info.version, percent: 0 });
      autoUpdater.downloadUpdate().catch((err: any) => {
        sendSplash({ phase: 'error', message: String(err?.message || err) });
        setTimeout(finalizeStartupSplash, 1400);
      });
    } else {
      // App já aberto: apenas avisa (ícone de download no TitleBar). Não baixa.
      mainWindow?.webContents.send('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    pendingUpdateAvailableInfo = null;
    clearUpdateAttempt();
    if (startupPhase) finalizeStartupSplash();
  });

  autoUpdater.on('download-progress', (progressObj: any) => {
    if (startupPhase) {
      sendSplash({
        phase: 'downloading',
        percent: Math.floor(progressObj.percent),
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info: any) => {
    pendingUpdateAvailableInfo = null;
    if (startupPhase) {
      recordUpdateAttempt(info.version);
      sendSplash({ phase: 'installing', version: info.version });
      setTimeout(shutdownForUpdate, 600);
    } else {
      mainWindow?.webContents.send('update-downloaded', { version: info.version });
    }
  });

  autoUpdater.on('error', (err: any) => {
    if (startupPhase) {
      sendSplash({ phase: 'error', message: String(err?.message || err) });
      setTimeout(finalizeStartupSplash, 1400);
    } else {
      console.error('[AutoUpdater] Erro ao verificar/baixar update:', err);
    }
  });
}

// ---- Splash (startup) helpers ----
function sendSplash(data: Record<string, any>) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash-update', data);
  }
}

function finalizeStartupSplash() {
  if (!startupPhase) return;
  startupPhase = false;

  // Só inicializa a janela principal, bandeja e scanner de atividades DEPOIS que o
  // splash concluiu (evita processos filhos e locks em app.asar durante auto-update).
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow(pendingInitialUrl, false);
  }
  createTray();
  startActivityScanner();

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;

  const reveal = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  };
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.isLoading()) {
    mainWindow.once('ready-to-show', reveal);
    setTimeout(reveal, 6000); // segurança: não travar no splash se o load demorar/falhar
  } else {
    reveal();
  }

  startPeriodicUpdateChecks();
}

function startPeriodicUpdateChecks() {
  if (updateCheckTimer) return;
  updateCheckTimer = setInterval(() => {
    try {
      autoUpdater?.checkForUpdates()?.catch(() => {});
    } catch {}
  }, 15 * 60 * 1000);
}

function createSplashWindow(): BrowserWindow {
  const { accent, bg } = loadSplashColors();
  const splash = new BrowserWindow({
    width: 460,
    height: 360,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    center: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: `rgb(${bg})`,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const splashFile = path.join(__dirname, '../dist/splash.html');
  splash.loadFile(splashFile, { query: { accent, bg } });
  splash.once('ready-to-show', () => splash.show());
  return splash;
}

// Desliga tudo de forma limpa antes de rodar o instalador NSIS, para que ele
// não encontre o ZeroVC.exe nem processos filhos segurando a pasta de instalação.
function shutdownForUpdate() {
  if (!autoUpdater || isInstallingUpdate) return;
  isInstallingUpdate = true;
  isQuitting = true;

  // 1. Para timers e scanners que criam processos filhos (tasklist/powershell)
  stopActivityScanner();
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
  try {
    globalShortcut.unregisterAll();
  } catch {}

  // 2. Derruba o bridge de áudio nativo (zerovc-audio-capture.exe) se estiver ativo
  try {
    activeAudioProcess?.kill();
  } catch {}
  activeAudioProcess = null;

  // 3. Destrói a bandeja e TODAS as janelas (principal + splash)
  try {
    tray?.destroy();
  } catch {}
  tray = null;
  try {
    BrowserWindow.getAllWindows().forEach((w) => {
      try {
        w.destroy();
      } catch {}
    });
  } catch {}
  mainWindow = null;
  splashWindow = null;

  // 4. Muda o CWD para %TEMP% para que nem este processo nem o instalador filho
  //    bloqueiem o Rename/RMDir da pasta %LOCALAPPDATA%\Programs\ZeroVC no NSIS.
  try {
    process.chdir(os.tmpdir());
  } catch {}

  // 5. Aguarda os handles serem liberados, dispara quitAndInstall uma única vez
  //    e garante encerramento imediato do processo antigo.
  setTimeout(() => {
    if (!autoUpdater) return;
    try {
      autoUpdater.quitAndInstall(true, true);
    } catch (e) {
      console.error('[AutoUpdater] Falha ao iniciar instalação do update:', e);
      app.exit(0);
      return;
    }
    setTimeout(() => app.exit(0), 250);
  }, 300);
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

// Fecha tudo e reabre no splash para atualizar (chamado pelo ícone do TitleBar).
ipcMain.on('restart-to-update', () => {
  if (!app.isPackaged) return;
  clearUpdateAttempt();
  app.relaunch();
  app.exit(0);
});

// Renderer envia as cores resolvidas do tema (acento + fundo) para o splash ler.
ipcMain.handle('set-splash-colors', (_event, colors: { accent: string; bg: string }) => {
  try {
    const settingsFile = path.join(app.getPath('userData'), 'settings.json');
    let settings: any = {};
    if (fs.existsSync(settingsFile)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      } catch {}
    }
    settings.splash = { accent: colors?.accent, bg: colors?.bg };
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
  } catch {}
});

ipcMain.on('start-download-update', () => {
  if (autoUpdater) {
    autoUpdater.downloadUpdate().catch((err: any) => {
      console.error('[AutoUpdater] Error on downloadUpdate:', err);
    });
  }
});

ipcMain.on('quit-and-install', () => {
  clearUpdateAttempt();
  shutdownForUpdate();
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
    const urlArg = commandLine.find(
      (arg) => arg.startsWith('zerovc://') || arg.startsWith('https://zerovc.safiroko.xyz')
    );

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      if (urlArg) {
        handleDeepLink(urlArg);
      }
    } else if (urlArg) {
      const targetPath = extractValidTargetPath(urlArg);
      if (targetPath) {
        const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
        const baseUrl = isDev ? 'http://localhost:5173' : REMOTE_SERVER_URL;
        pendingInitialUrl = `${baseUrl}${targetPath}`;
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
    pendingInitialUrl = initialUrl;

    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    if (isDev || !autoUpdater) {
      startupPhase = false;
      createWindow(initialUrl, true);
      createTray();
      startActivityScanner();
    } else {
      // Fluxo com splash: cria APENAS o splash primeiro; mainWindow, Tray e ActivityScanner
      // só são criados em finalizeStartupSplash() se não houver update a instalar agora.
      setupAutoUpdater();
      splashWindow = createSplashWindow();
      autoUpdater.checkForUpdates().catch(() => finalizeStartupSplash());
    }

    app.on('activate', () => {
      if (!startupPhase && BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });

    app.on('before-quit', () => {
      isQuitting = true;
      stopActivityScanner();
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('activity-detected', null);
        } catch {}
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
  icon_url?: string;
}

const KNOWN_GAMES_AND_APPS: Array<{
  processes: string[];
  name: string;
  type: DetectedActivity['type'];
}> = [
  // Popular Games
  { processes: ['minecraft.exe', 'bedrock_server.exe', 'minecraft.windows.exe', 'javaw.exe'], name: 'Minecraft', type: 'playing' },
  { processes: ['leagueclient.exe', 'leagueclientux.exe', 'league of legends.exe'], name: 'League of Legends', type: 'playing' },
  { processes: ['valorant.exe', 'valorant-win64-shipping.exe'], name: 'VALORANT', type: 'playing' },
  { processes: ['tftclient.exe', 'tftclient-win64-shipping.exe'], name: 'Teamfight Tactics', type: 'playing' },
  { processes: ['cs2.exe', 'csgo.exe'], name: 'Counter-Strike 2', type: 'playing' },
  { processes: ['gta5.exe', 'fivem.exe', 'fivem_b2699_gtaprocess.exe'], name: 'Grand Theft Auto V', type: 'playing' },
  { processes: ['robloxplayerbeta.exe', 'roblox.exe'], name: 'Roblox', type: 'playing' },
  { processes: ['fortniteclient-win64-shipping.exe', 'fortnitelauncher.exe'], name: 'Fortnite', type: 'playing' },
  { processes: ['overwatch.exe'], name: 'Overwatch 2', type: 'playing' },
  { processes: ['genshinimpact.exe', 'yuanshen.exe'], name: 'Genshin Impact', type: 'playing' },
  { processes: ['starrail.exe'], name: 'Honkai: Star Rail', type: 'playing' },
  { processes: ['r5apex.exe'], name: 'Apex Legends', type: 'playing' },
  { processes: ['rocketleague.exe'], name: 'Rocket League', type: 'playing' },
  { processes: ['cyberpunk2077.exe'], name: 'Cyberpunk 2077', type: 'playing' },
  { processes: ['eldenring.exe'], name: 'ELDEN RING', type: 'playing' },
  { processes: ['terraria.exe'], name: 'Terraria', type: 'playing' },
  { processes: ['stardew valley.exe', 'stardewvalley.exe'], name: 'Stardew Valley', type: 'playing' },
  { processes: ['dota2.exe'], name: 'Dota 2', type: 'playing' },
  { processes: ['deadbydaylight-win64-shipping.exe', 'deadbydaylight.exe'], name: 'Dead by Daylight', type: 'playing' },
  { processes: ['rustclient.exe'], name: 'Rust', type: 'playing' },
  { processes: ['among us.exe'], name: 'Among Us', type: 'playing' },
  { processes: ['osu!.exe', 'osu.exe', 'osu!lazer.exe'], name: 'osu!', type: 'playing' },
  { processes: ['rainbowsix.exe', 'rainbowsix_vulkan.exe'], name: 'Rainbow Six Siege', type: 'playing' },
  { processes: ['worldoftanks.exe'], name: 'World of Tanks', type: 'playing' },
  { processes: ['warframe.x64.exe', 'warframe.exe'], name: 'Warframe', type: 'playing' },
  { processes: ['destiny2.exe'], name: 'Destiny 2', type: 'playing' },
  { processes: ['tslgame.exe'], name: 'PUBG: BATTLEGROUNDS', type: 'playing' },
  { processes: ['fallguys_client.exe'], name: 'Fall Guys', type: 'playing' },
  { processes: ['brawlhalla.exe'], name: 'Brawlhalla', type: 'playing' },
  { processes: ['ts4_x64.exe', 'thesims4.exe'], name: 'The Sims 4', type: 'playing' },
  // Apps & Creative
  { processes: ['spotify.exe', 'spotify'], name: 'Spotify', type: 'listening' },
  { processes: ['blender.exe'], name: 'Blender', type: 'playing' },
  { processes: ['photoshop.exe'], name: 'Adobe Photoshop', type: 'playing' },
  { processes: ['code.exe'], name: 'Visual Studio Code', type: 'playing' },
];

const DEFAULT_STREAMER_APPS: Array<{ name: string; processes: string[] }> = [
  { name: 'OBS Studio', processes: ['obs64.exe', 'obs32.exe', 'obs.exe', 'obs'] },
  { name: 'Streamlabs Desktop', processes: ['streamlabs desktop.exe', 'streamlabs obs.exe', 'streamlabs.exe', 'slobs.exe'] },
  { name: 'XSplit Broadcaster', processes: ['xsplit.core.exe', 'xsplit.exe', 'xsplit.broadcaster.exe'] },
  { name: 'Twitch Studio', processes: ['twitchstudio.exe', 'twitch studio.exe'] },
  { name: 'vMix', processes: ['vmix64.exe', 'vmix.exe'] },
];

let customStreamerProcesses: string[] = [];
let lastRunningStreamerApps: string[] = [];

let lastDetectedActivity: DetectedActivity | null = null;
let activeActivityProcesses: string[] | null = null;
let activeActivityCloseWatcherTimer: NodeJS.Timeout | null = null;
let backgroundScanTimer: NodeJS.Timeout | null = null;
let isScanning = false;
let hasPerformedInitialScan = false;

function parseRunningProcesses(stdout: string): Set<string> {
  const set = new Set<string>();
  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Tasklist CSV format: "image_name.exe","pid","session","session_num","mem"
    if (process.platform === 'win32') {
      const parts = trimmed.split('","').map((p) => p.replace(/^"|"$/g, ''));
      if (parts.length >= 3) {
        const imageName = parts[0].toLowerCase();
        const sessionName = (parts[2] || '').toLowerCase();
        const sessionNum = parts[3] || '';
        // Skip background system services (Session "Services" / 0)
        if (sessionName === 'services' || sessionNum === '0') {
          continue;
        }
        set.add(imageName);
        continue;
      }
    }
    const match = trimmed.match(/^"([^"]+)"/);
    if (match) {
      set.add(match[1].toLowerCase());
    } else {
      const proc = trimmed.split(/\s+/)[0];
      if (proc) set.add(proc.toLowerCase());
    }
  }
  return set;
}

function startActiveActivityCloseWatcher() {
  if (activeActivityCloseWatcherTimer) return;

  // Poll while an activity is actively running to catch termination quickly
  activeActivityCloseWatcherTimer = setInterval(() => {
    if (!lastDetectedActivity || !activeActivityProcesses) {
      stopActiveActivityCloseWatcher();
      return;
    }

    const { exec } = require('child_process');
    let cmd = '';
    if (process.platform === 'win32') {
      cmd = 'tasklist /FO CSV /NH';
    } else if (process.platform === 'darwin' || process.platform === 'linux') {
      cmd = 'ps -eo comm=';
    } else {
      return;
    }

    exec(cmd, { maxBuffer: 1024 * 1024 * 4, windowsHide: true }, (err: any, stdout: string) => {
      if (err || !stdout) return;

      const procSet = parseRunningProcesses(stdout);
      const isStillRunning = activeActivityProcesses && activeActivityProcesses.some((p) => procSet.has(p));

      // If the currently detected game/app is no longer in running processes
      if (!isStillRunning) {
        console.log('[Activity] Detected application close for:', lastDetectedActivity?.name);
        lastDetectedActivity = null;
        activeActivityProcesses = null;
        stopActiveActivityCloseWatcher();

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('activity-detected', null);
        }

        // Check immediately if another game/app is running
        setTimeout(scanProcessesForActivity, 300);
      }
    });
  }, 1200);
}

function stopActiveActivityCloseWatcher() {
  if (activeActivityCloseWatcherTimer) {
    clearInterval(activeActivityCloseWatcherTimer);
    activeActivityCloseWatcherTimer = null;
  }
}

const gameIconCache = new Map<string, string>();

async function getProcessIcon(gameName: string, processNames: string[]): Promise<string | undefined> {
  const cacheKey = gameName || processNames[0];
  if (gameIconCache.has(cacheKey)) {
    return gameIconCache.get(cacheKey);
  }

  try {
    const fs = require('fs');
    const path = require('path');

    const loadFileAsIconDataUrl = async (filePath: string): Promise<string | undefined> => {
      try {
        if (!filePath || !fs.existsSync(filePath)) return undefined;
        const ext = path.extname(filePath).toLowerCase();

        if (ext === '.ico' || ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
          const img = nativeImage.createFromPath(filePath);
          if (img && !img.isEmpty()) {
            return img.toDataURL();
          }
          if (ext === '.ico') {
            const buf = fs.readFileSync(filePath);
            return `data:image/x-icon;base64,${buf.toString('base64')}`;
          }
        }

        if (typeof app.getFileIcon === 'function') {
          const icon = await app.getFileIcon(filePath, { size: 'normal' });
          if (icon && !icon.isEmpty()) {
            return icon.toDataURL();
          }
        }
      } catch (e) {
        console.debug('[Activity] Error reading icon from file:', filePath, e);
      }
      return undefined;
    };

    const lowerGameName = (gameName || '').toLowerCase();

    // Always pull the classic Minecraft grass block icon from web server /assets/minecraft.webp
    const isMinecraft =
      lowerGameName === 'minecraft' ||
      lowerGameName.includes('minecraft') ||
      processNames.some((p) => {
        const lp = p.toLowerCase();
        return lp.includes('minecraft') || lp === 'javaw.exe';
      });

    if (isMinecraft) {
      gameIconCache.set(cacheKey, '/assets/minecraft.webp');
      return '/assets/minecraft.webp';
    }

    if (process.platform === 'win32') {
      // 1. Query running process executable path via PowerShell for the real native .exe icon
      for (const procName of processNames) {
        const cleanName = procName.replace(/\.exe$/i, '');
        const { exec } = require('child_process');
        const exePath: string = await new Promise((resolve) => {
          exec(
            `powershell -NoProfile -Command "(Get-Process -Name '${cleanName}' -ErrorAction SilentlyContinue).Path | Select-Object -First 1"`,
            { windowsHide: true, timeout: 2000 },
            (err: any, stdout: string) => {
              if (err || !stdout) return resolve('');
              resolve(stdout.trim());
            }
          );
        });

        if (exePath) {
          const icon = await loadFileAsIconDataUrl(exePath);
          if (icon) {
            gameIconCache.set(cacheKey, icon);
            return icon;
          }
        }
      }

      // Check Riot installs json
      try {
        const riotInstallsPath = 'C:/ProgramData/Riot Games/RiotClientInstalls.json';
        if (fs.existsSync(riotInstallsPath)) {
          const data = JSON.parse(fs.readFileSync(riotInstallsPath, 'utf8'));
          const assoc = data.associated_client || {};
          for (const dir of Object.keys(assoc)) {
            const cleanDir = dir.toLowerCase().replace(/[\/\\]+/g, '');
            const cleanName = lowerGameName.replace(/\s+/g, '');
            if (cleanDir.includes(cleanName) || (lowerGameName.includes('league') && cleanDir.includes('league'))) {
              for (const proc of processNames) {
                const exeCand = path.join(dir, proc);
                const icon = await loadFileAsIconDataUrl(exeCand);
                if (icon) {
                  gameIconCache.set(cacheKey, icon);
                  return icon;
                }
              }
            }
          }
        }
      } catch {}

      // 2. Windows Start Menu & Desktop Shortcuts (.lnk)
      const shortcutDirs = [
        path.join(process.env.ProgramData || 'C:/ProgramData', 'Microsoft/Windows/Start Menu/Programs'),
        path.join(process.env.APPDATA || '', 'Microsoft/Windows/Start Menu/Programs'),
        path.join(process.env.PUBLIC || 'C:/Users/Public', 'Desktop'),
        path.join(process.env.USERPROFILE || '', 'Desktop'),
      ];

      for (const dir of shortcutDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
          const items = fs.readdirSync(dir, { recursive: true });
          for (const item of items) {
            const itemStr = typeof item === 'string' ? item : (item as any)?.name;
            if (itemStr && itemStr.toLowerCase().endsWith('.lnk')) {
              const baseName = path.basename(itemStr, '.lnk').toLowerCase();
              if (baseName === lowerGameName || baseName.includes(lowerGameName) || lowerGameName.includes(baseName)) {
                const lnkPath = path.join(dir, itemStr);
                const icon = await loadFileAsIconDataUrl(lnkPath);
                if (icon) {
                  gameIconCache.set(cacheKey, icon);
                  return icon;
                }
              }
            }
          }
        } catch {}
      }

      // 3. Common Game Installation Paths
      const searchRoots = [
        'C:/Riot Games',
        'D:/Riot Games',
        'E:/Riot Games',
        'C:/Program Files/Riot Games',
        'C:/Program Files (x86)/Steam/steamapps/common',
        'D:/SteamLibrary/steamapps/common',
        'E:/SteamLibrary/steamapps/common',
        'C:/Program Files',
        'C:/Program Files (x86)',
      ];

      for (const root of searchRoots) {
        if (!fs.existsSync(root)) continue;
        for (const proc of processNames) {
          const directCand = path.join(root, gameName, proc);
          const icon = await loadFileAsIconDataUrl(directCand);
          if (icon) {
            gameIconCache.set(cacheKey, icon);
            return icon;
          }
        }
      }

      // 4. Query running process path via PowerShell for standard processes (Spotify, OBS, VS Code, etc.)
      for (const procName of processNames) {
        const cleanName = procName.replace(/\.exe$/i, '');
        const { exec } = require('child_process');
        const exePath: string = await new Promise((resolve) => {
          exec(
            `powershell -NoProfile -Command "(Get-Process -Name '${cleanName}' -ErrorAction SilentlyContinue).Path | Select-Object -First 1"`,
            { windowsHide: true, timeout: 2000 },
            (err: any, stdout: string) => {
              if (err || !stdout) return resolve('');
              resolve(stdout.trim());
            }
          );
        });

        if (exePath) {
          const icon = await loadFileAsIconDataUrl(exePath);
          if (icon) {
            gameIconCache.set(cacheKey, icon);
            return icon;
          }
        }
      }
    }
  } catch (e) {
    console.debug('[Activity] Non-critical icon extraction error:', e);
  }
  return undefined;
}

function scanProcessesForActivity() {
  if (!mainWindow || mainWindow.isDestroyed() || isScanning) return;
  isScanning = true;

  const { exec } = require('child_process');
  let cmd = '';
  if (process.platform === 'win32') {
    cmd = 'tasklist /FO CSV /NH';
  } else if (process.platform === 'darwin' || process.platform === 'linux') {
    cmd = 'ps -eo comm=';
  } else {
    isScanning = false;
    return;
  }

  exec(cmd, { maxBuffer: 1024 * 1024 * 4, windowsHide: true, timeout: 5000 }, (err: any, stdout: string) => {
    isScanning = false;
    if (err || !stdout) return;

    const procSet = parseRunningProcesses(stdout);

    // Check running streamer apps (case-insensitive)
    const detectedStreamApps: string[] = [];
    for (const app of DEFAULT_STREAMER_APPS) {
      if (app.processes.some((p) => procSet.has(p.toLowerCase().trim()))) {
        detectedStreamApps.push(app.name);
      }
    }
    for (const customProc of customStreamerProcesses) {
      const norm = customProc.toLowerCase().trim();
      if (procSet.has(norm) && !detectedStreamApps.includes(norm)) {
        detectedStreamApps.push(norm);
      }
    }

    const streamChanged =
      detectedStreamApps.length !== lastRunningStreamerApps.length ||
      detectedStreamApps.some((a) => !lastRunningStreamerApps.includes(a));

    if (streamChanged || !hasPerformedInitialScan) {
      lastRunningStreamerApps = detectedStreamApps;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('streamer-software-status', { runningApps: detectedStreamApps });
      }
    }

    let foundMatch: { name: string; type: DetectedActivity['type']; processes: string[] } | null = null;

    for (const item of KNOWN_GAMES_AND_APPS) {
      if (item.name === 'OBS Studio' || item.name.toLowerCase().includes('obs')) continue; // Do not broadcast or show OBS Studio as an active activity
      if (item.processes.some((p) => procSet.has(p))) {
        foundMatch = { name: item.name, type: item.type, processes: item.processes };
        break;
      }
    }

    if (foundMatch) {
      const runningMatchingProcs = foundMatch.processes.filter((p) => procSet.has(p));
      activeActivityProcesses = runningMatchingProcs.length > 0 ? runningMatchingProcs : foundMatch.processes;
      if (!lastDetectedActivity || lastDetectedActivity.name !== foundMatch.name) {
        const matchingItem = foundMatch;
        getProcessIcon(matchingItem.name, activeActivityProcesses).then((iconUrl) => {
          lastDetectedActivity = {
            name: matchingItem.name,
            type: matchingItem.type,
            start_time: Math.floor(Date.now() / 1000),
            icon_url: iconUrl,
          };
          console.log('[Activity] Detected application open:', lastDetectedActivity.name, 'with icon:', Boolean(iconUrl));
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('activity-detected', lastDetectedActivity);
          }
        });
      }
      startActiveActivityCloseWatcher();
    } else {
      const shouldClear = lastDetectedActivity !== null || !hasPerformedInitialScan;
      if (lastDetectedActivity) {
        console.log('[Activity] Application closed:', lastDetectedActivity.name);
      }
      lastDetectedActivity = null;
      activeActivityProcesses = null;
      stopActiveActivityCloseWatcher();
      if (shouldClear && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('activity-detected', null);
      }
    }
    hasPerformedInitialScan = true;
  });
}

/**
 * Event-Driven Activity Monitor:
 * Triggers on application launch, window blur (when user switches into a game), window focus,
 * restore, minimize, close and active termination watcher.
 */
function startActivityScanner() {
  // Initial detection check after app startup (fast 400ms scan + follow-up 2000ms scan)
  setTimeout(scanProcessesForActivity, 400);
  setTimeout(scanProcessesForActivity, 2000);

  if (mainWindow) {
    // When user minimizes or clicks outside into a game/app
    mainWindow.on('blur', () => {
      setTimeout(scanProcessesForActivity, 600);
    });

    // When user comes back to ZeroVC
    mainWindow.on('focus', () => {
      scanProcessesForActivity();
    });

    mainWindow.on('restore', () => {
      scanProcessesForActivity();
    });

    mainWindow.on('show', () => {
      scanProcessesForActivity();
    });

    mainWindow.on('hide', () => {
      scanProcessesForActivity();
    });

    mainWindow.on('minimize', () => {
      scanProcessesForActivity();
    });
  }

  // Periodic background scanner every 5s
  if (!backgroundScanTimer) {
    backgroundScanTimer = setInterval(scanProcessesForActivity, 5000);
  }
}

function stopActivityScanner() {
  stopActiveActivityCloseWatcher();
  if (backgroundScanTimer) {
    clearInterval(backgroundScanTimer);
    backgroundScanTimer = null;
  }
}

ipcMain.handle('get-current-activity', () => {
  return lastDetectedActivity;
});

ipcMain.on('set-custom-streamer-processes', (_event, processes: string[]) => {
  if (Array.isArray(processes)) {
    customStreamerProcesses = processes.map((p) => String(p).toLowerCase().trim()).filter(Boolean);
    scanProcessesForActivity();
  }
});

ipcMain.handle('get-streamer-software-status', () => {
  if (!hasPerformedInitialScan) {
    scanProcessesForActivity();
  }
  return { runningApps: lastRunningStreamerApps };
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
  if (isInstallingUpdate) return;
  if (process.platform !== 'darwin') {
    if (!minimizeToTray || isQuitting) {
      app.quit();
    }
  }
});