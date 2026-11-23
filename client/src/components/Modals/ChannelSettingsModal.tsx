import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Trash2,
  Hash,
  Volume2,
  Folder,
  Check,
  AlertTriangle,
  RotateCcw,
  ArrowLeft,
  ChevronRight,
  Lock,
  Minus,
  Search,
} from 'lucide-react';
import { Channel, Role, Permissions, ChannelPermissionOverwrite } from '../../types';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useGuildPermissions } from '../../hooks/useGuildPermissions';
import { canUserManageChannel } from '../../utils/userActivity';
import { api } from '../../lib/api';
import { DropdownSelect } from '../Common/DropdownSelect';
import { DeleteChannelModal } from './DeleteChannelModal';
import {
  MODAL_TOGGLE_HEADER_CLASS,
  MODAL_TITLE_CLASS,
  MODAL_DIALOG_TITLE_CLASS,
  MODAL_SECTION_HEADER_CLASS,
  MODAL_FIELD_LABEL_CLASS,
  MODAL_DIVIDER_CLASS,
  MODAL_DESCRIPTION_CLASS,
} from '../../constants/modalTypography';
import { ModalButton } from '@/components/ui/modal-button';
import { UnsavedChangesBar, useUnsavedGuard } from './UnsavedChangesBar';

interface ChannelSettingsModalProps {
  channel: Channel | null;
  isOpen: boolean;
  onClose: () => void;
}

interface PermDef {
  key: string;
  name: string;
  desc: string;
  flag: number;
}

const SLOWMODE_OPTIONS = [
  { value: '0', label: 'Desativado' },
  { value: '5', label: '5 segundos' },
  { value: '10', label: '10 segundos' },
  { value: '15', label: '15 segundos' },
  { value: '30', label: '30 segundos' },
  { value: '60', label: '1 minuto' },
  { value: '120', label: '2 minutos' },
  { value: '300', label: '5 minutos' },
  { value: '600', label: '10 minutos' },
  { value: '900', label: '15 minutos' },
  { value: '1800', label: '30 minutos' },
  { value: '3600', label: '1 hora' },
  { value: '7200', label: '2 horas' },
  { value: '10800', label: '3 horas' },
  { value: '21600', label: '6 horas' },
];

export const ChannelSettingsModal: React.FC<ChannelSettingsModalProps> = ({
  channel,
  isOpen,
  onClose,
}) => {
  const { user } = useAuthStore();
  const { activeGuild, updateChannel, deleteChannel } = useGuildStore();
  const liveChannel = useMemo(
    () => activeGuild?.channels?.find((c) => c.id === channel?.id) || channel,
    [activeGuild?.channels, channel]
  );
  const perms = useGuildPermissions(activeGuild);
  const canManageThisChannel = Boolean(liveChannel && canUserManageChannel(liveChannel, activeGuild, user));
  const hasChannelPermission = Boolean(channel && (canManageThisChannel || perms.canManageRoles));
  const canSaveOverviewAndOverwrites = hasChannelPermission;
  const reducedMotion = useSettingsStore((state) => state.reducedMotion);

  // Tab & View state
  const [activeTab, setActiveTab] = useState<'overview' | 'permissions'>('overview');
  const [mobileView, setMobileView] = useState<'menu' | 'content'>('menu');

  // Overview Form
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [slowmodeSeconds, setSlowmodeSeconds] = useState<number>(0);

  // Permissions State: map of roleId -> { allow: number, deny: number }
  const [overwrites, setOverwrites] = useState<Record<string, { allow: number; deny: number }>>({});
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [permSearch, setPermSearch] = useState('');

  // Status
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Initialize state when modal opens or channel changes
  useEffect(() => {
    if (channel && isOpen) {
      setActiveTab(canManageThisChannel ? 'overview' : 'permissions');
      setMobileView('menu');
      setName(channel.name || '');
      setTopic(channel.topic || '');
      setSlowmodeSeconds(Number(channel.slowmode_seconds || 0));
      setPermSearch('');
      setSaveStatus(null);

      // Load overwrites
      const owMap: Record<string, { allow: number; deny: number }> = {};
      (channel.permission_overwrites || []).forEach((ow) => {
        owMap[ow.role_id] = { allow: Number(ow.allow || 0), deny: Number(ow.deny || 0) };
      });
      setOverwrites(owMap);

      // Select @everyone role or first available role by default
      const everyoneRole = activeGuild?.roles?.find((r) => r.name === '@everyone');
      if (everyoneRole) {
        setSelectedRoleId(everyoneRole.id);
      } else if (activeGuild?.roles && activeGuild.roles.length > 0) {
        setSelectedRoleId(activeGuild.roles[0].id);
      }
    }
  }, [channel?.id, isOpen]);

  const isCategory = liveChannel?.type === 'category';
  const isText = liveChannel?.type === 'text';
  const hasUnsavedChanges = (() => {
    if (!isOpen || !liveChannel || !activeGuild || !hasChannelPermission) return false;
    if (canManageThisChannel) {
      const formattedCurrent = isCategory
        ? name.trim()
        : name.trim().toLowerCase().replace(/\s+/g, '-');
      if (formattedCurrent !== (liveChannel.name || '')) return true;
      if (!isCategory && topic.trim() !== (liveChannel.topic || '').trim()) return true;
      if (isText && slowmodeSeconds !== Number(liveChannel.slowmode_seconds || 0)) return true;
    }

    const origMap: Record<string, { allow: number; deny: number }> = {};
    (liveChannel.permission_overwrites || []).forEach((ow) => {
      const allow = Number(ow.allow || 0);
      const deny = Number(ow.deny || 0);
      if (allow !== 0 || deny !== 0) origMap[ow.role_id] = { allow, deny };
    });

    const curMap: Record<string, { allow: number; deny: number }> = {};
    Object.entries(overwrites).forEach(([rid, val]) => {
      if (val.allow !== 0 || val.deny !== 0) curMap[rid] = val;
    });

    const allRoleIds = new Set([...Object.keys(origMap), ...Object.keys(curMap)]);
    for (const rid of allRoleIds) {
      const a = origMap[rid] || { allow: 0, deny: 0 };
      const b = curMap[rid] || { allow: 0, deny: 0 };
      if (a.allow !== b.allow || a.deny !== b.deny) return true;
    }
    return false;
  })();

  const { isShaking, attemptClose } = useUnsavedGuard(hasUnsavedChanges, onClose);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        attemptClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, attemptClose]);

  if (!isOpen || !channel || !activeGuild || !hasChannelPermission) return null;

  const isVoice = channel.type === 'voice';

  // Sort roles: custom roles first, @everyone last
  const roles = [...(activeGuild.roles || [])].sort((a, b) => {
    if (a.name === '@everyone') return 1;
    if (b.name === '@everyone') return -1;
    return (a.position || 0) - (b.position || 0);
  });

  const selectedRole = roles.find((r) => r.id === selectedRoleId) || roles[0];

  const canEditRole = (role: Role | undefined): boolean => {
    if (!hasChannelPermission || !role) return false;
    if (perms.isCurrentOwner || role.name === '@everyone') return true;
    const rolePos = typeof role.position === 'number' ? role.position : 999;
    return rolePos > perms.currentUserHighestPos;
  };

  const canEditSelectedRole = canEditRole(selectedRole);
  const roleEditBlockedReason = !canEditSelectedRole
    ? 'Você não pode editar permissões de um cargo igual ou superior ao seu na hierarquia'
    : undefined;

  const countFlagBits = (mask: number): number => {
    let n = mask >>> 0;
    let count = 0;
    while (n) {
      count += n & 1;
      n >>>= 1;
    }
    return count;
  };

  const handleRevert = () => {
    const base = liveChannel || channel;
    setName(base.name || '');
    setTopic(base.topic || '');
    setSlowmodeSeconds(Number(base.slowmode_seconds || 0));
    setSaveStatus(null);
    const owMap: Record<string, { allow: number; deny: number }> = {};
    (base.permission_overwrites || []).forEach((ow) => {
      owMap[ow.role_id] = { allow: Number(ow.allow || 0), deny: Number(ow.deny || 0) };
    });
    setOverwrites(owMap);
  };

  // Defined permissions for this channel type
  const channelPermsList: { category: string; perms: PermDef[] }[] = [
    {
      category: 'Permissões Gerais do Canal',
      perms: [
        {
          key: 'VIEW_CHANNEL',
          name: 'Ver Canal',
          desc: 'Permite aos membros verem este canal e lerem seu histórico. Se negado, o canal fica oculto para este cargo.',
          flag: Permissions.VIEW_CHANNEL,
        },
        {
          key: 'MANAGE_CHANNELS',
          name: 'Gerenciar Canal',
          desc: 'Permite aos membros alterarem as configurações, nome, tópico ou excluir este canal.',
          flag: Permissions.MANAGE_CHANNELS,
        },
      ],
    },
    ...(isText || isCategory
      ? [
          {
            category: 'Permissões de Texto',
            perms: [
              {
                key: 'SEND_MESSAGES',
                name: 'Enviar Mensagens',
                desc: 'Permite aos membros enviarem mensagens de texto neste canal.',
                flag: Permissions.SEND_MESSAGES,
              },
              {
                key: 'ATTACH_FILES',
                name: 'Anexar Arquivos e Mídias',
                desc: 'Permite aos membros enviarem fotos, vídeos, áudios e outros arquivos.',
                flag: Permissions.ATTACH_FILES,
              },
              {
                key: 'MANAGE_MESSAGES',
                name: 'Gerenciar Mensagens',
                desc: 'Permite aos membros apagarem e fixarem mensagens de outros membros neste canal.',
                flag: Permissions.MANAGE_MESSAGES,
              },
              {
                key: 'SEND_TTS',
                name: 'Permitir TTS',
                desc: 'Permite aos membros utilizarem o comando /tts para que suas mensagens sejam reproduzidas em voz alta neste canal.',
                flag: Permissions.SEND_TTS,
              },
              {
                key: 'USE_COMMANDS',
                name: 'Usar Comandos de Barra',
                desc: 'Permite aos membros utilizarem comandos com barra (slash commands) neste canal.',
                flag: Permissions.USE_COMMANDS,
              },
            ],
          },
        ]
      : []),
    ...(isVoice || isCategory
      ? [
          {
            category: 'Permissões de Voz',
            perms: [
              {
                key: 'CONNECT_VOICE',
                name: 'Conectar na Call',
                desc: 'Permite aos membros entrarem e ouvirem a sala de voz.',
                flag: Permissions.CONNECT_VOICE,
              },
              {
                key: 'SPEAK_VOICE',
                name: 'Falar na Call',
                desc: 'Permite aos membros falarem no microfone durante a chamada.',
                flag: Permissions.SPEAK_VOICE,
              },
              {
                key: 'STREAM_VOICE',
                name: 'Transmitir Tela e Vídeo',
                desc: 'Permite aos membros compartilharem suas telas ou câmeras de vídeo na sala.',
                flag: Permissions.STREAM_VOICE,
              },
              {
                key: 'MUTE_VOICE',
                name: 'Silenciar Outros Membros',
                desc: 'Permite mutar o microfone de outros participantes na call.',
                flag: Permissions.MUTE_VOICE,
              },
              {
                key: 'DEAFEN_VOICE',
                name: 'Ensurdecer Outros Membros',
                desc: 'Permite desativar o áudio de outros participantes na call.',
                flag: Permissions.DEAFEN_VOICE,
              },
            ],
          },
        ]
      : []),
  ];

  // Get current overwrite state for a permission flag ('allow' | 'deny' | 'inherit')
  const getPermissionState = (roleId: string, flag: number): 'allow' | 'deny' | 'inherit' => {
    const roleOw = overwrites[roleId];
    if (!roleOw) return 'inherit';
    if ((roleOw.allow & flag) !== 0) return 'allow';
    if ((roleOw.deny & flag) !== 0) return 'deny';
    return 'inherit';
  };

  // Set permission state for a role ('allow' | 'deny' | 'inherit')
  const setPermissionState = (roleId: string, flag: number, newState: 'allow' | 'deny' | 'inherit') => {
    const targetRole = roles.find((r) => r.id === roleId);
    if (!canEditRole(targetRole)) return;

    setOverwrites((prev) => {
      const current = prev[roleId] || { allow: 0, deny: 0 };
      let newAllow = current.allow & ~flag;
      let newDeny = current.deny & ~flag;

      if (newState === 'allow') {
        newAllow |= flag;
      } else if (newState === 'deny') {
        newDeny |= flag;
      }

      return {
        ...prev,
        [roleId]: { allow: newAllow, deny: newDeny },
      };
    });
  };

  // Reset all permissions for currently selected role to Inherit (Neutral)
  const handleResetRolePermissions = (roleId: string) => {
    const targetRole = roles.find((r) => r.id === roleId);
    if (!canEditRole(targetRole)) return;

    setOverwrites((prev) => {
      const next = { ...prev };
      delete next[roleId];
      return next;
    });
  };

  // Save all changes (Overview + Permissions)
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canSaveOverviewAndOverwrites) return;
    if (canManageThisChannel && !name.trim()) return;

    setIsSaving(true);
    setSaveStatus(null);
    try {
      if (canManageThisChannel) {
        const formattedName = isCategory
          ? name.trim()
          : name.trim().toLowerCase().replace(/\s+/g, '-');

        // Convert overwrites map to array for payload
        const owArray: ChannelPermissionOverwrite[] = Object.entries(overwrites)
          .filter(([_, val]) => val.allow !== 0 || val.deny !== 0)
          .map(([roleId, val]) => ({
            channel_id: channel.id,
            role_id: roleId,
            allow: val.allow,
            deny: val.deny,
          }));

        await updateChannel(channel.id, {
          name: formattedName,
          topic: isCategory ? undefined : topic.trim(),
          slowmode_seconds: isText ? slowmodeSeconds : undefined,
          permission_overwrites: owArray,
        });
      } else {
        const prevMap = new Map<string, { allow: number; deny: number }>();
        (channel.permission_overwrites || []).forEach((ow) => {
          prevMap.set(ow.role_id, { allow: Number(ow.allow || 0), deny: Number(ow.deny || 0) });
        });

        let latestChannel: Channel | null = null;
        for (const role of roles) {
          if (!canEditRole(role)) continue;
          const prev = prevMap.get(role.id) || { allow: 0, deny: 0 };
          const curr = overwrites[role.id] || { allow: 0, deny: 0 };
          if (curr.allow === prev.allow && curr.deny === prev.deny) continue;

          if (curr.allow === 0 && curr.deny === 0) {
            latestChannel = await api.channels.deletePermissionOverwrite(channel.id, role.id);
          } else {
            latestChannel = await api.channels.updatePermissionOverwrite(channel.id, role.id, {
              allow: curr.allow,
              deny: curr.deny,
            });
          }
        }

        if (latestChannel) {
          useGuildStore.setState((state) => {
            if (!state.activeGuild) return state;
            const channels = (state.activeGuild.channels || []).map((c) =>
              c.id === channel.id ? { ...c, ...latestChannel } : c
            );
            const activeChannel =
              state.activeChannel?.id === channel.id
                ? { ...state.activeChannel, ...latestChannel }
                : state.activeChannel;
            return {
              activeGuild: { ...state.activeGuild, channels },
              activeChannel,
            };
          });
        }
      }

      setSaveStatus({ type: 'success', text: 'Configurações e permissões salvas com sucesso!' });
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      console.error('Failed to update channel:', err);
      setSaveStatus({ type: 'error', text: err?.message || 'Erro ao salvar alterações do canal' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!canManageThisChannel) return;
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!canManageThisChannel) return;
    setIsDeleting(true);
    try {
      await deleteChannel(channel.id);
      setIsDeleteModalOpen(false);
      onClose();
    } catch (err) {
      console.error('Failed to delete channel:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const customOverwritesCount = Object.values(overwrites).filter(
    (ow) => ow.allow !== 0 || ow.deny !== 0
  ).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="channel-settings-title"
      className={`fixed inset-0 z-50 flex flex-col md:flex-row w-screen h-screen md:pt-8 bg-background-dark overflow-hidden text-gray-200 select-none ${
        reducedMotion ? '' : 'animate-in fade-in duration-150'
      }`}
    >
      {/* MOBILE MENU VIEW */}
      {mobileView === 'menu' && (
        <div className="flex md:hidden flex-col w-full h-full bg-background-dark overflow-hidden">
          <div
            style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 2.75rem)' }}
            className="px-4 pb-3.5 border-b border-white/10 bg-background-darkest flex items-center justify-between flex-shrink-0"
          >
            <div className="flex items-center gap-3">
              <ModalButton
                type="tertiary"
                shape="circle"
                size="small"
                svgOnly
                onClick={attemptClose}
                aria-label="Fechar configurações do canal"
                title="Fechar"
                className="-ml-1"
              >
                <X className="w-5 h-5" />
              </ModalButton>
              <h2 className={MODAL_DIALOG_TITLE_CLASS}>Configurações do Canal</h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0 overscroll-contain touch-pan-y no-scrollbar">
            {/* Channel Mini Card */}
            <div
              onClick={() => {
                setActiveTab('overview');
                setMobileView('content');
              }}
              className="p-3.5 bg-background-darker rounded-2xl border border-white/10 flex items-center justify-between cursor-pointer active:bg-white/5 transition-colors shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-background-darker flex items-center justify-center text-gray-300 flex-shrink-0 border border-white/10">
                  {isCategory ? (
                    <Folder className="w-5 h-5 text-brand-400" />
                  ) : isText ? (
                    <Hash className="w-5 h-5 text-gray-400" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-online" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">
                    {isCategory ? channel.name : `#${channel.name}`}
                  </div>
                  <div className="text-xs text-gray-400">
                    {isCategory ? 'Categoria' : isText ? 'Canal de Texto' : 'Canal de Voz'}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500 shrink-0" />
            </div>

            {/* Navigation Group */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2 block">
                Navegação
              </span>
              <div className="bg-background-darker rounded-2xl border border-white/10 overflow-hidden divide-y divide-white/5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('overview');
                    setMobileView('content');
                  }}
                  className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">Visão Geral</div>
                    <div className="text-xs text-gray-400">Nome, tópico e categoria pai</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('permissions');
                    setMobileView('content');
                  }}
                  className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">Permissões</div>
                    <div className="text-xs text-gray-400">
                      {customOverwritesCount > 0
                        ? `${customOverwritesCount} cargos personalizados`
                        : 'Configurar acesso por cargo'}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                </button>
              </div>
            </div>

            {/* Danger Actions */}
            {canManageThisChannel && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2 block">
                  Ações
                </span>
                <div className="bg-background-darker rounded-2xl border border-white/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="w-full flex items-center justify-between p-3.5 text-left hover:bg-red-500/10 active:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">
                        {isCategory ? 'Excluir Categoria' : 'Excluir Canal'}
                      </div>
                      <div className="text-xs text-red-400/70">
                        {isCategory
                          ? 'Remove a categoria (move canais para a raiz)'
                          : 'Apagar permanentemente este canal'}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-red-400/50 shrink-0" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DESKTOP SIDEBAR TABS */}
      <div className="hidden md:flex flex-1 max-w-[280px] lg:max-w-[320px] xl:max-w-[360px] 2xl:max-w-[400px] min-w-[220px] justify-end bg-background-darkest border-r border-white/10 shrink-0 overflow-y-auto no-scrollbar">
        <div className="w-56 lg:w-60 flex flex-col p-4 py-6 xl:py-8 shrink-0">
          <div className="flex flex-col items-stretch flex-1 flex-shrink-0">
            <div className="px-3 py-2 mb-2">
              <div className="flex items-center gap-2">
                {isCategory ? (
                  <Folder className="w-4 h-4 text-brand-400 flex-shrink-0" />
                ) : isText ? (
                  <Hash className="w-4 h-4 text-gray-400 flex-shrink-0" />
                ) : (
                  <Volume2 className="w-4 h-4 text-online flex-shrink-0" />
                )}
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-300 truncate">
                  {channel.name}
                </h2>
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                {isCategory ? 'Configurações da Categoria' : 'Configurações do Canal'}
              </div>
            </div>

            <nav className="flex flex-col items-stretch gap-0.5 flex-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                aria-current={activeTab === 'overview' ? 'page' : undefined}
                className={`flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  activeTab === 'overview'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <span>Visão Geral</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('permissions')}
                aria-current={activeTab === 'permissions' ? 'page' : undefined}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  activeTab === 'permissions'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <span>Permissões</span>
                {customOverwritesCount > 0 && (
                  <span className="text-xs bg-background-dark px-1.5 py-0.5 rounded text-gray-300 font-bold">
                    {customOverwritesCount}
                  </span>
                )}
              </button>

              {canManageThisChannel && (
                <div className="pt-2 mt-2 border-t border-white/10 flex flex-col gap-0.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    <span>{isCategory ? 'Excluir Categoria' : 'Excluir Canal'}</span>
                  </button>
                </div>
              )}
            </nav>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div
        className={`${
          mobileView === 'content' ? 'flex' : 'hidden md:flex'
        } flex-1 flex-col overflow-hidden bg-background-dark relative min-w-0 min-h-0`}
      >
        {/* Mobile Drilldown Top Bar */}
        <div
          style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 2.75rem)' }}
          className="flex md:hidden items-center justify-between px-4 pb-3.5 border-b border-white/10 bg-background-darkest flex-shrink-0"
        >
          <div className="flex items-center gap-2">
            <ModalButton
              type="tertiary"
              size="small"
              onClick={() => setMobileView('menu')}
              aria-label="Voltar ao menu"
              prefix={<ArrowLeft className="w-5 h-5" />}
              className="-ml-1"
            >
              Voltar
            </ModalButton>
          </div>
          <h2 className="text-sm font-bold text-white truncate max-w-[180px]">
            {activeTab === 'overview' ? 'Visão Geral' : 'Permissões'}
          </h2>
          <ModalButton
            type="tertiary"
            shape="circle"
            size="small"
            svgOnly
            onClick={attemptClose}
            aria-label="Fechar configurações do canal"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </ModalButton>
        </div>

        {/* Desktop Top Header */}
        <div className="hidden md:flex items-center justify-between px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-24 py-3 sm:py-5 border-b border-white/10 shrink-0 bg-background-darker/40">
          <div>
            <h1 id="channel-settings-title" className={`${MODAL_TITLE_CLASS} flex items-center gap-2`}>
              {activeTab === 'overview'
                ? isCategory
                  ? 'Visão Geral da Categoria'
                  : 'Visão Geral do Canal'
                : 'Permissões por Cargo'}
            </h1>
            <p className={`${MODAL_DESCRIPTION_CLASS} mt-0.5`}>
              {activeTab === 'overview'
                ? isCategory
                  ? 'Altere o nome da categoria para organizar melhor os canais do servidor'
                  : 'Defina o nome, tópico e categoria deste canal'
                : 'Personalize o acesso e as ações permitidas ou negadas para cada cargo'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ModalButton
              type="tertiary"
              shape="circle"
              size="small"
              svgOnly
              onClick={attemptClose}
              aria-label="Fechar configurações do canal"
              title="Fechar Configurações (ESC)"
            >
              <X className="w-5 h-5" />
            </ModalButton>
          </div>
        </div>

        {/* Error Notification */}
        {saveStatus?.type === 'error' && (
          <div className="mx-4 sm:mx-8 lg:mx-12 xl:mx-16 2xl:mx-24 mt-4 p-3 rounded-xl text-xs flex items-center gap-2.5 animate-in fade-in flex-shrink-0 bg-red-500/15 text-red-300 border border-red-500/30">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{saveStatus.text}</span>
          </div>
        )}

        {/* TAB CONTENTS */}
        <div className="flex-1 overflow-y-auto py-0 px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-24 no-scrollbar min-h-0 overscroll-contain touch-pan-y">
          {/* TAB 1: Visão Geral */}
          {activeTab === 'overview' && (
            <div className="max-w-2xl space-y-6 py-6">
              {!canManageThisChannel && (
                <div className="p-3 rounded-xl text-xs bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Você possui permissão apenas para gerenciar permissões de cargos neste canal.</span>
                </div>
              )}

              <div>
                <label className={MODAL_FIELD_LABEL_CLASS}>
                  {isCategory ? 'Nome da Categoria' : 'Nome do Canal'}
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-gray-400">
                    {isCategory ? (
                      <Folder className="w-4 h-4" />
                    ) : isText ? (
                      '#'
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </span>
                  <input
                    type="text"
                    required
                    disabled={!canManageThisChannel}
                    title={!canManageThisChannel ? 'Você precisa da permissão Gerenciar Canal para editar este campo' : undefined}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={isCategory ? 'COMUNIDADE' : 'novo-canal'}
                    className="w-full bg-background-darkest border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {isText && (
                <div>
                  <label className={MODAL_FIELD_LABEL_CLASS}>
                    Modo Lento (Slowmode)
                  </label>
                  <p className={`${MODAL_DESCRIPTION_CLASS} mb-2`}>
                    Define o intervalo mínimo entre mensagens para membros sem a permissão de Gerenciar Mensagens.
                  </p>
                  <DropdownSelect
                    value={String(slowmodeSeconds)}
                    disabled={!canManageThisChannel}
                    onChange={(val) => setSlowmodeSeconds(Number(val) || 0)}
                    options={SLOWMODE_OPTIONS}
                    placeholder="Desativado"
                  />
                </div>
              )}

              {!isCategory && (
                <div>
                  <label className={MODAL_FIELD_LABEL_CLASS}>
                    Tópico do Canal
                  </label>
                  <textarea
                    rows={4}
                    disabled={!canManageThisChannel}
                    title={!canManageThisChannel ? 'Você precisa da permissão Gerenciar Canal para editar este campo' : undefined}
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Descreva o propósito deste canal..."
                    className="w-full bg-background-darkest border border-white/10 rounded-xl p-3.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500 resize-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Permissões de Cargos */}
          {activeTab === 'permissions' && (
            <div className="flex flex-col md:flex-row gap-6 min-h-0 h-auto md:h-[calc(100vh-175px)] py-4 md:py-6">
              {/* Left Column: Roles list selector */}
              <div className="w-full md:w-64 flex flex-col gap-2 shrink-0 md:pr-6 md:border-r border-white/10 border-b md:border-b-0 pb-4 md:pb-0">
                <span className={`${MODAL_SECTION_HEADER_CLASS} pb-2 mb-1 border-b border-white/10 px-1 block`}>
                  Cargos do Servidor
                </span>

                <div className="flex flex-row md:flex-col overflow-x-auto md:overflow-y-auto max-h-none md:max-h-[calc(100vh-245px)] gap-1.5 md:gap-1 no-scrollbar">
                  {roles.map((role) => {
                    const isSelected = selectedRole?.id === role.id;
                    const roleOw = overwrites[role.id];
                    const allowCount = roleOw ? countFlagBits(roleOw.allow) : 0;
                    const denyCount = roleOw ? countFlagBits(roleOw.deny) : 0;
                    const isRoleLocked = !canEditRole(role);

                    return (
                      <div
                        key={role.id}
                        onClick={() => setSelectedRoleId(role.id)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all flex-shrink-0 ${
                          isSelected
                            ? 'bg-brand-500/15 text-white border border-brand-500/30 font-semibold'
                            : 'text-gray-300 hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate min-w-0">
                          <span
                            className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                            style={{ backgroundColor: role.color || '#99AAB5' }}
                          />
                          <span className="truncate">{role.name}</span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-1.5">
                          {isRoleLocked && (
                            <span title="Cargo igual ou superior ao seu na hierarquia">
                              <Lock className="w-3 h-3 text-amber-400/80" />
                            </span>
                          )}
                          {allowCount > 0 && (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400"
                              title={`${allowCount} permissão(ões) permitida(s)`}
                            >
                              +{allowCount}
                            </span>
                          )}
                          {denyCount > 0 && (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400"
                              title={`${denyCount} permissão(ões) negada(s)`}
                            >
                              -{denyCount}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Permissions for selected role */}
              <div className="flex-1 space-y-6 overflow-y-auto max-h-[calc(100vh-255px)] no-scrollbar md:pl-2 max-w-3xl pr-4 md:pr-6">
                {selectedRole && (
                  <>
                    {/* Header info of selected role */}
                    <div className="flex items-center justify-between pb-4 border-b border-white/10">
                      <div className="flex items-center gap-3">
                        <span
                          className="w-4 h-4 rounded-full shadow-sm"
                          style={{ backgroundColor: selectedRole.color || '#99AAB5' }}
                        />
                        <span className="font-bold text-base text-white">{selectedRole.name}</span>
                      </div>

                      <div
                        className={overwrites[selectedRole.id] ? '' : 'invisible pointer-events-none'}
                        aria-hidden={!overwrites[selectedRole.id]}
                        title={roleEditBlockedReason || 'Restaurar todas as permissões para o padrão do servidor'}
                      >
                        <ModalButton
                          type="secondary"
                          size="small"
                          disabled={!canEditSelectedRole || !overwrites[selectedRole.id]}
                          onClick={() => handleResetRolePermissions(selectedRole.id)}
                          prefix={<RotateCcw className="w-3.5 h-3.5" />}
                          className={!canEditSelectedRole ? 'opacity-50 cursor-not-allowed' : undefined}
                          title={roleEditBlockedReason || 'Restaurar todas as permissões para o padrão do servidor'}
                        >
                          Redefinir Cargo
                        </ModalButton>
                      </div>
                    </div>

                    {!canEditSelectedRole && roleEditBlockedReason && (
                      <div className="p-3 rounded-xl text-xs bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{roleEditBlockedReason}</span>
                      </div>
                    )}

                    {/* Search Permissions */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={permSearch}
                        onChange={(e) => setPermSearch(e.target.value)}
                        placeholder="Filtrar permissões..."
                        className="w-full bg-background-darkest border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
                      />
                    </div>

                    {/* Permissions Groups */}
                    <div className="space-y-6">
                      {channelPermsList
                        .map((group) => {
                          const q = permSearch.trim().toLowerCase();
                          const filteredPerms = q
                            ? group.perms.filter(
                                (p) =>
                                  p.name.toLowerCase().includes(q) ||
                                  p.desc.toLowerCase().includes(q)
                              )
                            : group.perms;
                          return { ...group, perms: filteredPerms };
                        })
                        .filter((group) => group.perms.length > 0)
                        .map((group, idx) => (
                        <React.Fragment key={group.category}>
                          {idx > 0 && <div className={MODAL_DIVIDER_CLASS} />}
                          <div className="space-y-3">
                            <h4 className={MODAL_SECTION_HEADER_CLASS}>
                              {group.category}
                            </h4>

                            <div className="space-y-4">
                              {group.perms.map((perm) => {
                                const state = getPermissionState(selectedRole.id, perm.flag);

                                return (
                                  <div
                                    key={perm.key}
                                    className="flex items-center justify-between gap-4 py-1"
                                  >
                                  <div className="space-y-0.5 min-w-0 flex-1">
                                    <span className={MODAL_TOGGLE_HEADER_CLASS}>
                                      {perm.name}
                                    </span>
                                    <p className={MODAL_DESCRIPTION_CLASS}>
                                      {perm.desc}
                                    </p>
                                  </div>

                                  {/* 3-State Toggle: ❌ Negar | ➖ Herdar | ✅ Permitir */}
                                  <div
                                    title={roleEditBlockedReason}
                                    className={`flex items-center bg-background-darker p-1 rounded-xl border border-white/10 shrink-0 ${
                                      !canEditSelectedRole ? 'opacity-50 cursor-not-allowed' : ''
                                    }`}
                                  >
                                    {/* Deny Button ❌ */}
                                    <button
                                      type="button"
                                      disabled={!canEditSelectedRole}
                                      onClick={() =>
                                        setPermissionState(
                                          selectedRole.id,
                                          perm.flag,
                                          state === 'deny' ? 'inherit' : 'deny'
                                        )
                                      }
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                                        !canEditSelectedRole ? 'cursor-not-allowed' : 'cursor-pointer'
                                      } ${
                                        state === 'deny'
                                          ? 'bg-red-500 text-white shadow-md shadow-red-500/30'
                                          : canEditSelectedRole
                                          ? 'text-gray-400 hover:text-red-400 hover:bg-white/5'
                                          : 'text-gray-400'
                                      }`}
                                      title={roleEditBlockedReason || 'Negar permissão neste canal'}
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Inherit Button ➖ */}
                                    <button
                                      type="button"
                                      disabled={!canEditSelectedRole}
                                      onClick={() =>
                                        setPermissionState(selectedRole.id, perm.flag, 'inherit')
                                      }
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                                        !canEditSelectedRole ? 'cursor-not-allowed' : 'cursor-pointer'
                                      } ${
                                        state === 'inherit'
                                          ? 'bg-white/15 text-gray-100'
                                          : canEditSelectedRole
                                          ? 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                          : 'text-gray-500'
                                      }`}
                                      title={roleEditBlockedReason || 'Padrão / Herdar permissão do servidor'}
                                    >
                                      <Minus className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Allow Button ✅ */}
                                    <button
                                      type="button"
                                      disabled={!canEditSelectedRole}
                                      onClick={() =>
                                        setPermissionState(
                                          selectedRole.id,
                                          perm.flag,
                                          state === 'allow' ? 'inherit' : 'allow'
                                        )
                                      }
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                                        !canEditSelectedRole ? 'cursor-not-allowed' : 'cursor-pointer'
                                      } ${
                                        state === 'allow'
                                          ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                                          : canEditSelectedRole
                                          ? 'text-gray-400 hover:text-emerald-400 hover:bg-white/5'
                                          : 'text-gray-400'
                                      }`}
                                      title={roleEditBlockedReason || 'Permitir ação neste canal'}
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </React.Fragment>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mobile Bottom Bar */}
        <div className="flex md:hidden p-4 bg-background-darkest border-t border-white/10 items-center justify-between flex-shrink-0">
          <ModalButton
            type="secondary"
            onClick={attemptClose}
          >
            Fechar
          </ModalButton>
        </div>
      </div>

      <UnsavedChangesBar
        show={hasUnsavedChanges}
        isShaking={isShaking}
        isSaving={isSaving}
        error={saveStatus?.type === 'error' ? saveStatus.text : null}
        onSave={() => handleSave()}
        onRevert={handleRevert}
      />

      <DeleteChannelModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        channel={channel}
        isDeleting={isDeleting}
      />
    </div>
  );
};
