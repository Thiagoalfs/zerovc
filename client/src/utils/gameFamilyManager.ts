/**
 * Game Family Manager
 *
 * Handles intelligent detection, prioritization, and seamless auto-switching
 * for games that use a launcher/client architecture (e.g., League of Legends,
 * Minecraft, GTA V / FiveM, Valorant, TFT).
 */

export interface GameFamilyStage {
  stage: 'game' | 'launcher';
  label: string;
  patterns: RegExp[];
}

export interface GameFamily {
  id: string;
  name: string;
  processes: string[];
  stages: GameFamilyStage[];
}

export const GAME_FAMILIES: GameFamily[] = [
  {
    id: 'league_of_legends',
    name: 'League of Legends',
    processes: ['leagueclient.exe', 'leagueclientux.exe', 'league of legends.exe', 'riotclientservices.exe'],
    stages: [
      {
        stage: 'game',
        label: 'Partida',
        patterns: [/league of legends \(tm\)/i, /league of legends \(tm\) client/i],
      },
      {
        stage: 'launcher',
        label: 'Lobby / Cliente',
        patterns: [/riot client/i, /leagueclient/i, /league client/i, /^league of legends$/i],
      },
    ],
  },
  {
    id: 'tft',
    name: 'Teamfight Tactics',
    processes: ['leagueclient.exe', 'leagueclientux.exe', 'league of legends.exe', 'tftclient.exe', 'riotclientservices.exe'],
    stages: [
      {
        stage: 'game',
        label: 'Partida',
        patterns: [/teamfight tactics/i, /league of legends \(tm\)/i],
      },
      {
        stage: 'launcher',
        label: 'Lobby / Cliente',
        patterns: [/riot client/i, /leagueclient/i, /^league of legends$/i],
      },
    ],
  },
  {
    id: 'valorant',
    name: 'VALORANT',
    processes: ['valorant.exe', 'valorant-win64-shipping.exe', 'riotclientservices.exe'],
    stages: [
      {
        stage: 'game',
        label: 'Jogo',
        patterns: [/^valorant/i],
      },
      {
        stage: 'launcher',
        label: 'Cliente',
        patterns: [/riot client/i],
      },
    ],
  },
  {
    id: 'minecraft',
    name: 'Minecraft',
    processes: ['minecraft.exe', 'javaw.exe', 'minecraft.windows.exe'],
    stages: [
      {
        stage: 'game',
        label: 'Jogo',
        patterns: [/^minecraft\s/i, /^minecraft\*/i, /^minecraft$/i],
      },
      {
        stage: 'launcher',
        label: 'Launcher',
        patterns: [/minecraft launcher/i, /prism launcher/i, /curseforge/i, /modrinth/i],
      },
    ],
  },
  {
    id: 'gtav',
    name: 'Grand Theft Auto V',
    processes: ['gta5.exe', 'fivem.exe', 'fivem_b2699_gtaprocess.exe', 'playgtav.exe'],
    stages: [
      {
        stage: 'game',
        label: 'Jogo',
        patterns: [/grand theft auto v/i, /fivem/i],
      },
      {
        stage: 'launcher',
        label: 'Launcher',
        patterns: [/rockstar games launcher/i, /playgtav/i],
      },
    ],
  },
];

export interface MatchedWindowFamily {
  family: GameFamily;
  stage: 'game' | 'launcher';
  label: string;
}

/**
 * Identifies whether a window title belongs to a known game family.
 * If allSources is provided, disambiguates windows with identical names (e.g. League match vs lobby).
 */
export function matchWindowToGameFamily<T extends { id: string; name: string }>(
  windowTitle?: string,
  allSources?: T[],
  sourceId?: string
): MatchedWindowFamily | null {
  const cleanTitle = (windowTitle || '').trim();
  if (!cleanTitle) return null;

  // 1. Check explicit stage patterns first
  for (const family of GAME_FAMILIES) {
    for (const stageInfo of family.stages) {
      if (stageInfo.patterns.some((p) => p.test(cleanTitle))) {
        return {
          family,
          stage: stageInfo.stage,
          label: stageInfo.label,
        };
      }
    }
  }

  // 2. Special handling for League of Legends generic title "League of Legends"
  if (/^league of legends$/i.test(cleanTitle)) {
    const lolFamily = GAME_FAMILIES.find((f) => f.id === 'league_of_legends')!;
    if (allSources && allSources.length > 0) {
      // Check if there is an explicit match window running alongside
      const hasExplicitMatch = allSources.some(
        (s) => s.id?.startsWith('window:') && /league of legends \(tm\)/i.test((s.name || '').trim())
      );
      if (hasExplicitMatch) {
        return {
          family: lolFamily,
          stage: 'launcher',
          label: 'Lobby / Cliente',
        };
      }
      const lolWindows = allSources.filter(
        (s) => s.id?.startsWith('window:') && /^league of legends$/i.test((s.name || '').trim())
      );
      if (lolWindows.length > 1) {
        // If there are multiple "League of Legends" windows, first in Z-order is active match, second is lobby
        const isFirst = lolWindows[0]?.id === sourceId;
        return {
          family: lolFamily,
          stage: isFirst ? 'game' : 'launcher',
          label: isFirst ? 'Partida' : 'Lobby / Cliente',
        };
      }
    }
    // Single League of Legends window without (TM): this is the client lobby
    return {
      family: lolFamily,
      stage: 'launcher',
      label: 'Lobby / Cliente',
    };
  }

  return null;
}

export interface BestSourceMatch<T = { id: string; name: string }> {
  source: T;
  stage: 'game' | 'launcher';
  family: GameFamily;
}

/**
 * Given a game family or name, returns all matching window sources.
 */
export function getFamilyWindowSources<T extends { id: string; name: string }>(
  gameFamilyOrName: GameFamily | string,
  sources: T[]
): { family: GameFamily; windowSources: T[] } | null {
  const clean = typeof gameFamilyOrName === 'string' ? gameFamilyOrName.toLowerCase().trim() : '';
  const family =
    typeof gameFamilyOrName === 'object'
      ? gameFamilyOrName
      : GAME_FAMILIES.find(
          (f) => f.id === clean || f.name.toLowerCase() === clean || clean.includes(f.name.toLowerCase())
        );

  if (!family) return null;

  const windowSources = sources.filter((s) => {
    if (!s.id?.startsWith('window:')) return false;
    const name = (s.name || '').trim();
    if (!name) return false;

    // Check all family stage patterns
    for (const stage of family.stages) {
      if (stage.patterns.some((p) => p.test(name))) return true;
    }
    // Generic family name check (e.g. "League of Legends")
    if (family.id === 'league_of_legends' && /^league of legends$/i.test(name)) return true;
    if (family.id === 'tft' && (/teamfight tactics/i.test(name) || /^league of legends$/i.test(name))) return true;

    return false;
  });

  return { family, windowSources };
}

/**
 * Given a game name or family ID and a list of window sources,
 * returns the best source matching the highest priority stage (in-game match > lobby/launcher).
 * If currentSourceId is provided, handles seamless transitioning when sibling windows open/close.
 */
export function findBestSourceForGameFamily<T extends { id: string; name: string }>(
  gameFamilyOrName: GameFamily | string,
  sources: T[],
  currentSourceId?: string | null
): BestSourceMatch<T> | null {
  const familyData = getFamilyWindowSources(gameFamilyOrName, sources);
  if (!familyData) return null;

  const { family, windowSources } = familyData;
  if (windowSources.length === 0) return null;

  // Single window found for this family -> always the best source
  if (windowSources.length === 1) {
    const single = windowSources[0];
    const match = matchWindowToGameFamily(single.name, windowSources, single.id);
    return {
      source: single,
      stage: match?.stage || 'game',
      family,
    };
  }

  // Multiple windows found:
  // 1. Explicit in-game match indicator (e.g. "(TM)" or "Teamfight Tactics")
  const explicitGame = windowSources.find((s) => {
    const name = (s.name || '').trim();
    return family.stages
      .find((st) => st.stage === 'game')
      ?.patterns.some((p) => p.test(name));
  });
  if (explicitGame) {
    return { source: explicitGame, stage: 'game', family };
  }

  // 2. Filter out background Riot Client tray windows if League windows exist
  const nonRiotClient = windowSources.filter((s) => !/riot client/i.test((s.name || '').trim()));
  const candidates = nonRiotClient.length > 0 ? nonRiotClient : windowSources;

  if (candidates.length === 1) {
    return { source: candidates[0], stage: 'game', family };
  }

  // 3. If currently streaming one of the candidates, retain it steadily
  if (currentSourceId) {
    const currentCandidate = candidates.find((s) => s.id === currentSourceId);
    if (currentCandidate) {
      const match = matchWindowToGameFamily(currentCandidate.name, candidates, currentCandidate.id);
      return {
        source: currentCandidate,
        stage: match?.stage || 'launcher',
        family,
      };
    }
  }

  // 4. Default: First in Z-order is the active foreground window
  const defaultSource = candidates[0];
  const defaultMatch = matchWindowToGameFamily(defaultSource.name, candidates, defaultSource.id);
  return {
    source: defaultSource,
    stage: defaultMatch?.stage || 'game',
    family,
  };
}
