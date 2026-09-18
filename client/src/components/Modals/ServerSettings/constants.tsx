import React from 'react';
import {
  Settings as SettingsIcon,
  UserCheck,
  MessageSquare,
  Volume2,
  Sparkles,
} from 'lucide-react';
import { Permissions } from '../../../types';

export const PRESET_ROLE_COLORS = [
  '#5865F2', // Blurple
  '#57F287', // Green
  '#FEE75C', // Yellow
  '#EB459E', // Fuchsia
  '#ED4245', // Red
  '#9B59B6', // Purple
  '#1ABC9C', // Teal
  '#E67E22', // Orange
  '#3498DB', // Blue
  '#99AAB5', // Gray
  '#E91E63', // Pink
  '#607D8B', // Blue Grey
];

export interface PermissionDefinition {
  flag: number;
  name: string;
  description: string;
  isMaster?: boolean;
}

export const PERMISSION_GROUPS: { category: string; icon: React.ReactNode; permissions: PermissionDefinition[] }[] = [
  {
    category: 'Permissões Gerais',
    icon: <SettingsIcon className="w-4 h-4 text-brand-400" />,
    permissions: [
      {
        flag: Permissions.ADMINISTRATOR,
        name: 'Administrador (Permissão Mestre)',
        description: 'Membros com esta permissão têm acesso total irrestrito e ignoram todos os bloqueios de canais.',
        isMaster: true,
      },
      {
        flag: Permissions.VIEW_CHANNEL,
        name: 'Ver Canais',
        description: 'Permite que membros vejam canais por padrão no servidor.',
      },
      {
        flag: Permissions.MANAGE_GUILD,
        name: 'Gerenciar Servidor',
        description: 'Permite alterar o nome do servidor, ícone, banner e configurações gerais.',
      },
      {
        flag: Permissions.MANAGE_ROLES,
        name: 'Gerenciar Cargos',
        description: 'Permite criar novos cargos e editar permissões de cargos inferiores.',
      },
      {
        flag: Permissions.MANAGE_CHANNELS,
        name: 'Gerenciar Canais e Categorias',
        description: 'Permite criar, editar, reordenar ou excluir canais e categorias.',
      },
    ],
  },
  {
    category: 'Moderação de Membros',
    icon: <UserCheck className="w-4 h-4 text-amber-400" />,
    permissions: [
      {
        flag: Permissions.KICK_MEMBERS,
        name: 'Expulsar Membros',
        description: 'Permite expulsar membros com cargos inferiores do servidor.',
      },
      {
        flag: Permissions.BAN_MEMBERS,
        name: 'Banir Membros',
        description: 'Permite banir permanentemente membros com cargos inferiores.',
      },
      {
        flag: Permissions.MUTE_MEMBERS,
        name: 'Silenciar / Castigar Membros',
        description: 'Permite silenciar membros temporariamente por até 7 dias.',
      },
    ],
  },
  {
    category: 'Permissões de Texto e Chat',
    icon: <MessageSquare className="w-4 h-4 text-sky-400" />,
    permissions: [
      {
        flag: Permissions.SEND_MESSAGES,
        name: 'Enviar Mensagens',
        description: 'Permite enviar mensagens em canais de texto.',
      },
      {
        flag: Permissions.ATTACH_FILES,
        name: 'Anexar Arquivos e Mídias',
        description: 'Permite fazer upload de imagens, áudios, vídeos e documentos.',
      },
      {
        flag: Permissions.MANAGE_MESSAGES,
        name: 'Gerenciar Mensagens',
        description: 'Permite apagar ou fixar mensagens de outros usuários.',
      },
    ],
  },
  {
    category: 'Permissões de Voz e Vídeo',
    icon: <Volume2 className="w-4 h-4 text-emerald-400" />,
    permissions: [
      {
        flag: Permissions.CONNECT_VOICE,
        name: 'Conectar em Voz',
        description: 'Permite entrar nos canais de voz.',
      },
      {
        flag: Permissions.SPEAK_VOICE,
        name: 'Falar na Chamada',
        description: 'Permite transmitir áudio do microfone.',
      },
      {
        flag: Permissions.STREAM_VOICE,
        name: 'Compartilhar Tela e Câmera',
        description: 'Permite transmitir vídeo de telas de computador ou webcam.',
      },
      {
        flag: Permissions.MUTE_VOICE,
        name: 'Silenciar Membros em Voz',
        description: 'Permite mutar outros membros na chamada.',
      },
      {
        flag: Permissions.DEAFEN_VOICE,
        name: 'Ensurdecer Membros em Voz',
        description: 'Permite ensurdecer outros membros na chamada.',
      },
    ],
  },
  {
    category: 'Convites & Acesso',
    icon: <Sparkles className="w-4 h-4 text-purple-400" />,
    permissions: [
      {
        flag: Permissions.CREATE_INSTANT_INVITE,
        name: 'Criar Convites Instantâneos',
        description: 'Permite gerar links de convite para trazer novas pessoas ao servidor.',
      },
    ],
  },
];
