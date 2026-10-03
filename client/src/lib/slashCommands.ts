export interface SlashOptionChoice {
  name: string;
  value: string;
}

export interface SlashOption {
  name: string;
  description: string;
  type: 'string' | 'user' | 'choice' | 'subcommand';
  required?: boolean;
  choices?: SlashOptionChoice[];
  options?: SlashOption[];
}

export interface SlashCommand {
  name: string;
  description: string;
  subcommands?: SlashOption[];
  options?: SlashOption[];
  guildOnly?: boolean;
  requiredPermission?: 'manage_messages' | 'kick_members' | 'ban_members';
}

export const LEAGUE_REGIONS: SlashOptionChoice[] = [
  { name: 'BR (Brasil)', value: 'BR' },
  { name: 'NA (América do Norte)', value: 'NA' },
  { name: 'EUW (Europa Ocidental)', value: 'EUW' },
  { name: 'EUNE (Europa Nórdica e Oriental)', value: 'EUNE' },
  { name: 'KR (Coreia do Sul)', value: 'KR' },
  { name: 'LAN (América Latina Norte)', value: 'LAN' },
  { name: 'LAS (América Latina Sul)', value: 'LAS' },
  { name: 'OCE (Oceania)', value: 'OCE' },
  { name: 'TR (Turquia)', value: 'TR' },
  { name: 'RU (Rússia)', value: 'RU' },
  { name: 'JP (Japão)', value: 'JP' },
];

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'server',
    description: 'Comandos informativos do servidor atual',
    guildOnly: true,
    subcommands: [
      {
        name: 'icon',
        description: 'Exibe o ícone do servidor atual em alta resolução',
        type: 'subcommand',
      },
      {
        name: 'info',
        description: 'Exibe informações e estatísticas detalhadas do servidor',
        type: 'subcommand',
      },
    ],
  },
  {
    name: 'user',
    description: 'Comandos de consulta de perfil de usuário',
    subcommands: [
      {
        name: 'icon',
        description: 'Exibe a foto de perfil do usuário (ou a sua própria)',
        type: 'subcommand',
        options: [
          {
            name: 'user',
            description: 'Usuário para ver a foto (@menção)',
            type: 'user',
            required: false,
          },
        ],
      },
      {
        name: 'info',
        description: 'Exibe detalhes e informações da conta do usuário',
        type: 'subcommand',
        options: [
          {
            name: 'user',
            description: 'Usuário para ver as informações (@menção)',
            type: 'user',
            required: false,
          },
        ],
      },
    ],
  },
  {
    name: 'league',
    description: 'Estatísticas e integração oficial com League of Legends',
    subcommands: [
      {
        name: 'link',
        description: 'Vincula sua conta Riot Games ao seu perfil ZeroVC',
        type: 'subcommand',
        options: [
          {
            name: 'riot_id',
            description: 'Seu Riot ID completo com a tag (ex: Faker#BR1)',
            type: 'string',
            required: true,
          },
          {
            name: 'region',
            description: 'Região da sua conta Riot (padrão: BR)',
            type: 'choice',
            required: false,
            choices: LEAGUE_REGIONS,
          },
        ],
      },
      {
        name: 'profile',
        description: 'Exibe o perfil rico com elos Solo/Flex, maestrias e splash art',
        type: 'subcommand',
        options: [
          {
            name: 'user',
            description: 'Ver perfil do LoL de outro usuário (@menção)',
            type: 'user',
            required: false,
          },
          {
            name: 'riot_id',
            description: 'Consultar Riot ID diretamente sem vínculo (ex: Nome#TAG)',
            type: 'string',
            required: false,
          },
          {
            name: 'region',
            description: 'Região da conta (padrão: BR se omitido)',
            type: 'choice',
            required: false,
            choices: LEAGUE_REGIONS,
          },
        ],
      },
    ],
  },
  {
    name: 'clear',
    description: 'Apaga uma quantidade de mensagens recentes no canal',
    guildOnly: true,
    requiredPermission: 'manage_messages',
    options: [
      {
        name: 'amount',
        description: 'Quantidade de mensagens para apagar (1 a 100)',
        type: 'string',
        required: true,
      },
      {
        name: 'user',
        description: 'Filtrar mensagens de um usuário específico (@menção)',
        type: 'user',
        required: false,
      },
    ],
  },
  {
    name: 'kick',
    description: 'Expulsa um membro do servidor',
    guildOnly: true,
    requiredPermission: 'kick_members',
    options: [
      {
        name: 'user',
        description: 'Membro para expulsar (@menção)',
        type: 'user',
        required: true,
      },
      {
        name: 'reason',
        description: 'Motivo da expulsão',
        type: 'string',
        required: false,
      },
    ],
  },
  {
    name: 'ban',
    description: 'Bane um membro do servidor',
    guildOnly: true,
    requiredPermission: 'ban_members',
    options: [
      {
        name: 'user',
        description: 'Membro para banir (@menção)',
        type: 'user',
        required: true,
      },
      {
        name: 'reason',
        description: 'Motivo do banimento',
        type: 'string',
        required: false,
      },
    ],
  },
  {
    name: 'tts',
    description: 'Envia e narra uma mensagem de voz Text-to-Speech no canal',
    guildOnly: true,
    requiredPermission: 'manage_messages',
    options: [
      {
        name: 'message',
        description: 'Mensagem para ser lida e narrada em voz alta',
        type: 'string',
        required: true,
      },
    ],
  },
  {
    name: 'yt-dlp',
    description: 'Baixa e compartilha áudio (MP3) ou vídeo (MP4) de um link pelo Gork',
    options: [
      {
        name: 'format',
        description: 'Formato do arquivo para download',
        type: 'choice',
        required: true,
        choices: [
          { name: 'mp4 (Vídeo)', value: 'mp4' },
          { name: 'mp3 (Áudio)', value: 'mp3' },
        ],
      },
      {
        name: 'link',
        description: 'URL do vídeo/música individual (playlists não permitidas)',
        type: 'string',
        required: true,
      },
    ],
  },
  {
    name: 'tts',
    description: 'Envia uma mensagem de texto que será falada pelo sintetizador de voz',
    options: [
      {
        name: 'mensagem',
        description: 'Texto que será enviado e reproduzido em voz alta',
        type: 'string',
        required: true,
      },
    ],
  },
];

export interface ParsedCommand {
  command: string;
  subcommand?: string;
  args: Record<string, any>;
  raw: string;
}

export function parseSlashCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  // Split tokens respecting double quotes
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  const tokens: string[] = [];
  let match;
  while ((match = regex.exec(trimmed.slice(1))) !== null) {
    tokens.push(match[1] || match[2] || match[0]);
  }

  if (tokens.length === 0) return null;

  const cmdName = tokens[0].toLowerCase();
  const subOrArg = tokens[1]?.toLowerCase() || '';

  if (cmdName === 'server') {
    const subcommand = subOrArg === 'icon' ? 'icon' : 'info';
    return { command: 'server', subcommand, args: {}, raw: trimmed };
  }

  if (cmdName === 'user') {
    let subcommand = 'info';
    let userArg: string | undefined;

    if (subOrArg === 'icon') {
      subcommand = 'icon';
      userArg = tokens[2];
    } else if (subOrArg === 'info') {
      subcommand = 'info';
      userArg = tokens[2];
    } else if (subOrArg !== '') {
      subcommand = 'info';
      userArg = tokens[1];
    }

    return {
      command: 'user',
      subcommand,
      args: { user: userArg },
      raw: trimmed,
    };
  }

  if (cmdName === 'league') {
    if (subOrArg === 'link') {
      const rest = tokens.slice(2);
      if (rest.length === 0) {
        return { command: 'league', subcommand: 'link', args: {}, raw: trimmed };
      }

      let region = 'BR';
      let riotId = '';
      const lastToken = rest[rest.length - 1].toUpperCase();
      const validRegions = ['BR', 'NA', 'EUW', 'EUNE', 'KR', 'LAN', 'LAS', 'OCE', 'TR', 'RU', 'JP'];

      if (validRegions.includes(lastToken) && rest.length > 1) {
        region = lastToken;
        riotId = rest.slice(0, -1).join(' ');
      } else {
        riotId = rest.join(' ');
      }

      riotId = riotId.replace(/^riot_id:\s*/i, '').replace(/^region:\s*/i, '').trim();

      return {
        command: 'league',
        subcommand: 'link',
        args: { riot_id: riotId, region },
        raw: trimmed,
      };
    }

    // Default or 'profile'
    const subcommand = 'profile';
    const rest = tokens.slice(subOrArg === 'profile' ? 2 : 1);

    if (rest.length === 0) {
      return { command: 'league', subcommand: 'profile', args: {}, raw: trimmed };
    }

    let userArg: string | undefined;
    let riotId: string | undefined;
    let region = 'BR';

    if (rest[0].startsWith('@') || rest[0].startsWith('<@')) {
      userArg = rest[0];
    } else {
      const lastToken = rest[rest.length - 1].toUpperCase();
      const validRegions = ['BR', 'NA', 'EUW', 'EUNE', 'KR', 'LAN', 'LAS', 'OCE', 'TR', 'RU', 'JP'];
      if (validRegions.includes(lastToken) && rest.length > 1) {
        region = lastToken;
        riotId = rest.slice(0, -1).join(' ');
      } else {
        riotId = rest.join(' ');
      }
      riotId = riotId.replace(/^riot_id:\s*/i, '').replace(/^user:\s*/i, '').replace(/^region:\s*/i, '').trim();
    }

    return {
      command: 'league',
      subcommand,
      args: { user: userArg, riot_id: riotId, region },
      raw: trimmed,
    };
  }

  if (cmdName === 'yt-dlp' || cmdName === 'ytdlp') {
    let format = 'mp4';
    let link = '';

    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];
      const lower = token.toLowerCase();
      if (lower === 'mp3' || lower === 'format:mp3' || lower.startsWith('format:mp3')) {
        format = 'mp3';
      } else if (lower === 'mp4' || lower === 'format:mp4' || lower.startsWith('format:mp4')) {
        format = 'mp4';
      } else if (lower.startsWith('link:')) {
        const extracted = token.slice(5).trim();
        if (extracted) {
          link = extracted;
        }
      } else if (
        lower.startsWith('http://') ||
        lower.startsWith('https://') ||
        lower.includes('youtube.com') ||
        lower.includes('youtu.be') ||
        lower.includes('tiktok.com') ||
        lower.includes('instagram.com') ||
        lower.includes('twitter.com') ||
        lower.includes('x.com')
      ) {
        link = token.trim();
      }
    }

    if (!link) {
      const nonFormatTokens = tokens
        .slice(1)
        .filter((t) => !t.toLowerCase().startsWith('format:') && t.toLowerCase() !== 'mp3' && t.toLowerCase() !== 'mp4');
      link = nonFormatTokens.join(' ').replace(/^link:\s*/i, '').trim();
    } else {
      link = link.replace(/^link:\s*/i, '').trim();
    }

    return {
      command: 'yt-dlp',
      args: { format, link },
      raw: trimmed,
    };
  }

  if (cmdName === 'clear' || cmdName === 'purge' || cmdName === 'limpar') {
    let amount = '10';
    let userArg: string | undefined;

    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];
      if (/^\d+$/.test(token)) {
        amount = token;
      } else if (token.startsWith('@') || token.startsWith('<@')) {
        userArg = token;
      } else if (token.toLowerCase().startsWith('amount:')) {
        amount = token.slice(7).trim();
      } else if (token.toLowerCase().startsWith('user:')) {
        userArg = token.slice(5).trim();
      }
    }

    return {
      command: 'clear',
      args: { amount, user: userArg },
      raw: trimmed,
    };
  }

  if (cmdName === 'kick') {
    let userArg: string | undefined;
    let reason: string | undefined;

    const rest = tokens.slice(1);
    if (rest.length > 0) {
      if (rest[0].toLowerCase().startsWith('user:')) {
        userArg = rest[0].slice(5).trim();
        reason = rest.slice(1).join(' ').replace(/^reason:\s*/i, '').trim();
      } else {
        userArg = rest[0];
        reason = rest.slice(1).join(' ').replace(/^reason:\s*/i, '').trim();
      }
    }

    return {
      command: 'kick',
      args: { user: userArg, reason },
      raw: trimmed,
    };
  }

  if (cmdName === 'ban') {
    let userArg: string | undefined;
    let reason: string | undefined;

    const rest = tokens.slice(1);
    if (rest.length > 0) {
      if (rest[0].toLowerCase().startsWith('user:')) {
        userArg = rest[0].slice(5).trim();
        reason = rest.slice(1).join(' ').replace(/^reason:\s*/i, '').trim();
      } else {
        userArg = rest[0];
        reason = rest.slice(1).join(' ').replace(/^reason:\s*/i, '').trim();
      }
    }

    return {
      command: 'ban',
      args: { user: userArg, reason },
      raw: trimmed,
    };
  }

  if (cmdName === 'tts') {
    const messageText = (trimmed.slice(4).replace(/^\s*(mensagem|message):\s*/i, '') || tokens.slice(1).join(' ')).trim();
    return {
      command: 'tts',
      args: { mensagem: messageText, message: messageText },
      raw: trimmed,
    };
  }

  return {
    command: cmdName,
    subcommand: tokens[1],
    args: { raw_args: tokens.slice(2) },
    raw: trimmed,
  };
}

export interface SlashValidationResult {
  isValid: boolean;
  errorTitle?: string;
  errorMessage?: string;
}

export function isPlaylistOrRadioUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase().trim();

  if (
    lower.includes('list=') ||
    lower.includes('/playlist') ||
    lower.includes('playlist?') ||
    lower.includes('start_radio=') ||
    lower.includes('&radio=') ||
    lower.includes('?radio=') ||
    (lower.includes('soundcloud.com') && lower.includes('/sets/')) ||
    (lower.includes('spotify.com') && (lower.includes('/playlist/') || lower.includes('/album/')))
  ) {
    return true;
  }

  return false;
}

export function validateSlashOption(
  commandName: string,
  optionName: string,
  value: string
): SlashValidationResult {
  const trimmed = (value || '').trim();
  if (!trimmed) {
    return { isValid: false };
  }

  const lowerCmd = commandName.toLowerCase();

  if (lowerCmd === 'clear') {
    if (optionName === 'amount') {
      const num = parseInt(trimmed, 10);
      if (isNaN(num) || num < 1 || num > 100) {
        return {
          isValid: false,
          errorTitle: 'Quantidade Inválida',
          errorMessage: 'A quantidade de mensagens deve ser um número entre 1 e 100.',
        };
      }
    }
  }

  if (lowerCmd === 'kick' || lowerCmd === 'ban') {
    if (optionName === 'user') {
      if (!trimmed) {
        return {
          isValid: false,
          errorTitle: 'Membro Obrigatório',
          errorMessage: 'Mencione ou informe o usuário.',
        };
      }
    }
  }

  if (lowerCmd === 'tts') {
    if (optionName === 'message') {
      if (!trimmed) {
        return {
          isValid: false,
          errorTitle: 'Mensagem Vazia',
          errorMessage: 'Informe a mensagem para narração por voz.',
        };
      }
    }
  }

  if (lowerCmd === 'yt-dlp' || lowerCmd === 'ytdlp') {
    if (optionName === 'link') {
      const lower = trimmed.toLowerCase();

      if (isPlaylistOrRadioUrl(trimmed)) {
        return {
          isValid: false,
          errorTitle: 'Playlist / Rádio Não Suportada',
          errorMessage: 'Playlists e mixes de rádio (start_radio) não são permitidos. Por favor, insira o link de um vídeo ou áudio individual.',
        };
      }

      if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
        return {
          isValid: false,
          errorTitle: 'Link Inválido',
          errorMessage: 'O link deve começar com http:// ou https://.',
        };
      }

      try {
        new URL(trimmed);
      } catch {
        return {
          isValid: false,
          errorTitle: 'Link Inválido',
          errorMessage: 'Formato de URL inválido. Verifique o link digitado.',
        };
      }
    }

    if (optionName === 'format') {
      const lower = trimmed.toLowerCase();
      if (lower !== 'mp4' && lower !== 'mp3') {
        return {
          isValid: false,
          errorTitle: 'Formato Inválido',
          errorMessage: 'O formato deve ser "mp4" (Vídeo) ou "mp3" (Áudio).',
        };
      }
    }
  }

  return { isValid: true };
}

