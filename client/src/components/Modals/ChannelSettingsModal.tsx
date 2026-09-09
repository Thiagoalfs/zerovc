import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Trash2,
  Hash,
  Volume2,
  Folder,
  Shield,
  Check,
  Slash,
  Eye,
  Settings as SettingsIcon,
  MessageSquare,
  Paperclip,
  Mic,
  Monitor,
  VolumeX,
  Headphones,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { Channel, Role, Permissions, ChannelPermissionOverwrite } from '../../types';
import { useGuildStore } from '../../stores/guildStore';

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
  icon: React.ReactNode;
}

export const ChannelSettingsModal: React.FC<ChannelSettingsModalProps> = ({
  channel,
  isOpen,
  onClose,
}) => {
  const { activeGuild, updateChannel, deleteChannel } = useGuildStore();
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'overview' | 'permissions'>('overview');
  
  // Overview Form
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  
  // Permissions State: map of roleId -> { allow: number, deny: number }
  const [overwrites, setOverwrites] = useState<Record<string, { allow: number; deny: number }>>({});
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  
  // Status
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Initialize state when modal opens or channel changes
  useEffect(() => {
    if (channel && isOpen) {
      setActiveTab('overview');
      setName(channel.name || '');
      setTopic(channel.topic || '');
      setCategoryId(channel.category_id);
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
  }, [channel, isOpen, activeGuild]);

  if (!isOpen || !channel || !activeGuild) return null;

  const isCategory = channel.type === 'category';
  const isText = channel.type === 'text';
  const isVoice = channel.type === 'voice';

  const categories = (activeGuild.channels || []).filter(
    (c) => c.type === 'category' && c.id !== channel.id
  );

  // Sort roles: custom roles first, @everyone last
  const roles = [...(activeGuild.roles || [])].sort((a, b) => {
    if (a.name === '@everyone') return 1;
    if (b.name === '@everyone') return -1;
    return (a.position || 0) - (b.position || 0);
  });

  const selectedRole = roles.find((r) => r.id === selectedRoleId) || roles[0];

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
          icon: <Eye className="w-4 h-4 text-sky-400" />,
        },
        {
          key: 'MANAGE_CHANNELS',
          name: 'Gerenciar Canal',
          desc: 'Permite aos membros alterarem as configurações, nome, tópico ou excluir este canal.',
          flag: Permissions.MANAGE_CHANNELS,
          icon: <SettingsIcon className="w-4 h-4 text-amber-400" />,
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
                icon: <MessageSquare className="w-4 h-4 text-emerald-400" />,
              },
              {
                key: 'ATTACH_FILES',
                name: 'Anexar Arquivos e Mídias',
                desc: 'Permite aos membros enviarem fotos, vídeos, áudios e outros arquivos.',
                flag: Permissions.ATTACH_FILES,
                icon: <Paperclip className="w-4 h-4 text-indigo-400" />,
              },
              {
                key: 'MANAGE_MESSAGES',
                name: 'Gerenciar Mensagens',
                desc: 'Permite aos membros apagarem e fixarem mensagens de outros membros neste canal.',
                flag: Permissions.MANAGE_MESSAGES,
                icon: <Shield className="w-4 h-4 text-red-400" />,
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
                icon: <Volume2 className="w-4 h-4 text-online" />,
              },
              {
                key: 'SPEAK_VOICE',
                name: 'Falar na Call',
                desc: 'Permite aos membros falarem no microfone durante a chamada.',
                flag: Permissions.SPEAK_VOICE,
                icon: <Mic className="w-4 h-4 text-purple-400" />,
              },
              {
                key: 'STREAM_VOICE',
                name: 'Transmitir Tela e Vídeo',
                desc: 'Permite aos membros compartilharem suas telas ou câmeras de vídeo na sala.',
                flag: Permissions.STREAM_VOICE,
                icon: <Monitor className="w-4 h-4 text-teal-400" />,
              },
              {
                key: 'MUTE_VOICE',
                name: 'Silenciar Outros Membros',
                desc: 'Permite mutar o microfone de outros participantes na call.',
                flag: Permissions.MUTE_VOICE,
                icon: <VolumeX className="w-4 h-4 text-amber-400" />,
              },
              {
                key: 'DEAFEN_VOICE',
                name: 'Ensurdecer Outros Membros',
                desc: 'Permite desativar o áudio de outros participantes na call.',
                flag: Permissions.DEAFEN_VOICE,
                icon: <Headphones className="w-4 h-4 text-dnd" />,
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
    setOverwrites((prev) => {
      const next = { ...prev };
      delete next[roleId];
      return next;
    });
  };

  // Save all changes (Overview + Permissions)
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    setSaveStatus(null);
    try {
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
        category_id: isCategory ? undefined : categoryId,
        clear_category: !isCategory && !categoryId,
        permission_overwrites: owArray,
      });

      setSaveStatus({ type: 'success', text: 'Configurações e permissões salvas com sucesso!' });
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      console.error('Failed to update channel:', err);
      setSaveStatus({ type: 'error', text: err?.message || 'Erro ao salvar alterações do canal' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmMessage = isCategory
      ? `Tem certeza que deseja excluir a categoria "${channel.name}"? Os canais dentro dela serão movidos para a raiz.`
      : `Tem certeza que deseja excluir o canal #${channel.name}? Esta ação não pode ser desfeita.`;

    if (confirm(confirmMessage)) {
      setIsDeleting(true);
      try {
        await deleteChannel(channel.id);
        onClose();
      } catch (err) {
        console.error('Failed to delete channel:', err);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4 overflow-hidden animate-in fade-in duration-150"
    >
      <div className="bg-background-darkest w-full max-w-2xl max-h-[92dvh] my-auto flex flex-col rounded-3xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between border-b border-white/5 bg-background-darker/60 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            {isCategory ? (
              <Folder className="w-5 h-5 text-brand-400" />
            ) : channel.type === 'text' ? (
              <Hash className="w-5 h-5 text-gray-400" />
            ) : (
              <Volume2 className="w-5 h-5 text-online" />
            )}
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white leading-tight">
                {isCategory ? `Categoria: ${channel.name}` : `#${channel.name}`}
              </h2>
              <p className="text-[11px] text-gray-400">Configurações do Canal</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/5 px-4 sm:px-6 gap-2 bg-background-darker/30 flex-shrink-0 overflow-x-auto no-scrollbar touch-pan-x">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex-shrink-0 ${
              activeTab === 'overview'
                ? 'border-brand-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <SettingsIcon className="w-4 h-4" />
            <span>Visão Geral</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('permissions')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex-shrink-0 ${
              activeTab === 'permissions'
                ? 'border-brand-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Permissões por Cargo</span>
          </button>
        </div>

        {/* Status Toast Notification */}
        {saveStatus && (
          <div
            className={`mx-6 mt-3 p-3 rounded-xl text-xs flex items-center gap-2.5 animate-in fade-in ${
              saveStatus.type === 'success'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'bg-red-500/15 text-red-300 border border-red-500/30'
            }`}
          >
            {saveStatus.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{saveStatus.text}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 no-scrollbar min-h-0 overscroll-contain touch-pan-y">
          {/* TAB 1: Visão Geral */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  {isCategory ? 'Nome da Categoria' : 'Nome do Canal'}
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-gray-400">
                    {isCategory ? <Folder className="w-4 h-4" /> : isText ? '#' : <Volume2 className="w-4 h-4" />}
                  </span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={isCategory ? 'COMUNIDADE' : 'novo-canal'}
                    className="w-full bg-background-darker border border-white/10 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {!isCategory && categories.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                    Categoria Pai
                  </label>
                  <select
                    value={categoryId || ''}
                    onChange={(e) => setCategoryId(e.target.value ? e.target.value : undefined)}
                    className="w-full bg-background-darker border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="">Nenhuma (Canal na Raiz)</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        📁 {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!isCategory && (
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                    Tópico do Canal
                  </label>
                  <textarea
                    rows={3}
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Descreva o propósito deste canal..."
                    className="w-full bg-background-darker border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500 resize-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Permissões de Cargos */}
          {activeTab === 'permissions' && (
            <div className="flex flex-col md:flex-row gap-4 sm:gap-5 min-h-0 md:min-h-[380px]">
              {/* Left Column: Roles list selector */}
              <div className="w-full md:w-52 flex flex-col gap-1.5 shrink-0 pr-0 md:pr-2 border-b md:border-b-0 md:border-r border-white/5 pb-3 md:pb-0">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1">
                  Cargos do Servidor
                </span>

                <div className="flex flex-row md:flex-col overflow-x-auto md:overflow-y-auto max-h-none md:max-h-96 gap-1.5 md:gap-1 pr-0 md:pr-1 no-scrollbar">
                  {roles.map((role) => {
                    const isSelected = selectedRole?.id === role.id;
                    const isEveryone = role.name === '@everyone';
                    const hasCustomOw = overwrites[role.id] && (overwrites[role.id].allow !== 0 || overwrites[role.id].deny !== 0);

                    return (
                      <div
                        key={role.id}
                        onClick={() => setSelectedRoleId(role.id)}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all flex-shrink-0 ${
                          isSelected
                            ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                            : 'text-gray-300 hover:bg-white/5 bg-background-darker/60 md:bg-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate min-w-0">
                          <span
                            className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                            style={{ backgroundColor: role.color || '#99AAB5' }}
                          />
                          <span className="truncate">{role.name}</span>
                        </div>

                        {hasCustomOw && (
                          <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-brand-400'} shrink-0 ml-1`} title="Possui permissões configuradas neste canal" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Permissions for selected role */}
              <div className="flex-1 space-y-5 overflow-y-auto max-h-96 pr-2 no-scrollbar">
                {selectedRole && (
                  <>
                    {/* Header info of selected role */}
                    <div className="flex items-center justify-between pb-3 border-b border-white/5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: selectedRole.color || '#99AAB5' }}
                        />
                        <span className="font-bold text-sm text-white">{selectedRole.name}</span>
                        {selectedRole.name === '@everyone' && (
                          <span className="text-[10px] bg-white/10 text-gray-300 px-2 py-0.5 rounded-full font-medium">
                            Cargo Padrão
                          </span>
                        )}
                      </div>

                      {overwrites[selectedRole.id] && (
                        <button
                          type="button"
                          onClick={() => handleResetRolePermissions(selectedRole.id)}
                          className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                          title="Restaurar todas as permissões para o padrão do servidor"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Redefinir</span>
                        </button>
                      )}
                    </div>

                    {/* Permissions Groups */}
                    <div className="space-y-6">
                      {channelPermsList.map((group) => (
                        <div key={group.category} className="space-y-2.5">
                          <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                            {group.category}
                          </h4>

                          <div className="space-y-2">
                            {group.perms.map((perm) => {
                              const state = getPermissionState(selectedRole.id, perm.flag);

                              return (
                                <div
                                  key={perm.key}
                                  className="p-3 rounded-2xl bg-background-darker/70 border border-white/5 flex items-center justify-between gap-4 transition-all hover:border-white/10"
                                >
                                  <div className="space-y-0.5 min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      {perm.icon}
                                      <span className="text-xs font-bold text-gray-100">{perm.name}</span>
                                    </div>
                                    <p className="text-[11px] text-gray-400 leading-tight">
                                      {perm.desc}
                                    </p>
                                  </div>

                                  {/* 3-State Toggle: ❌ Negar | ⚪ Herdar | ✅ Permitir */}
                                  <div className="flex items-center bg-background-darkest p-1 rounded-xl border border-white/10 shrink-0">
                                    {/* Deny Button ❌ */}
                                    <button
                                      type="button"
                                      onClick={() => setPermissionState(selectedRole.id, perm.flag, state === 'deny' ? 'inherit' : 'deny')}
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all cursor-pointer ${
                                        state === 'deny'
                                          ? 'bg-red-500 text-white shadow-md shadow-red-500/30'
                                          : 'text-gray-400 hover:text-red-400 hover:bg-white/5'
                                      }`}
                                      title="Negar permissão neste canal"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Inherit Button ⚪ */}
                                    <button
                                      type="button"
                                      onClick={() => setPermissionState(selectedRole.id, perm.flag, 'inherit')}
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all cursor-pointer ${
                                        state === 'inherit'
                                          ? 'bg-white/15 text-gray-100'
                                          : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                      }`}
                                      title="Padrão / Herdar permissão do servidor"
                                    >
                                      <Slash className="w-3 h-3 rotate-90" />
                                    </button>

                                    {/* Allow Button ✅ */}
                                    <button
                                      type="button"
                                      onClick={() => setPermissionState(selectedRole.id, perm.flag, state === 'allow' ? 'inherit' : 'allow')}
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all cursor-pointer ${
                                        state === 'allow'
                                          ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                                          : 'text-gray-400 hover:text-emerald-400 hover:bg-white/5'
                                      }`}
                                      title="Permitir ação neste canal"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-background-darker/60 border-t border-white/5 flex items-center justify-between flex-shrink-0">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-dnd hover:bg-dnd/10 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isCategory ? 'Excluir Categoria' : 'Excluir Canal'}</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-gray-300 hover:underline cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={isSaving}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-xs transition-all shadow-lg shadow-brand-500/25 cursor-pointer"
            >
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
