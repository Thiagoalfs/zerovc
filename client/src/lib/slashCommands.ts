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
  requiredPermission?: 'manage_messages' | 'kick_members' | 'ban_members' | 'send_tts';
}

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
    description: 'Envia uma mensagem de texto narrada pelo sintetizador de voz',
    guildOnly: true,
    requiredPermission: 'send_tts',
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
    if (optionName === 'mensagem' || optionName === 'message') {
      if (!trimmed) {
        return {
          isValid: false,
          errorTitle: 'Mensagem Vazia',
          errorMessage: 'Informe a mensagem para narração por voz.',
        };
      }
    }
  }

  return { isValid: true };
}

