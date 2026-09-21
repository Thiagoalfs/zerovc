import React, { useState, useEffect } from 'react';
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
  Search,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';
import { Channel, Permissions, ChannelPermissionOverwrite } from '../../types';
import { useGuildStore } from '../../stores/guildStore';
import { pushBackHandler } from '../../lib/mobileBackHandler';

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
  
  // Tab & Mobile Navigation state
  const [activeTab, setActiveTab] = useState<'overview' | 'permissions'>('overview');
  const [mobileView, setMobileView] = useState<'menu' | 'content'>('menu');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSubcategory, setActiveSubcategory] = useState<string>('overview-basic');
  
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
      setMobileView('menu');
      setSearchQuery('');
      setActiveSubcategory('overview-basic');
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

  // Keyboard Escape shortcut
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Android Mobile Back Handler
  useEffect(() => {
    if (!isOpen) return;

    const unregister = pushBackHandler('channel-settings-modal', () => {
      if (mobileView === 'content') {
        setMobileView('menu');
        return true;
      }
      onClose();
      return true;
    });

    return () => {
      unregister();
    };
  }, [isOpen, mobileView, onClose]);

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

  const channelCategoriesList = [
    {
      group: isCategory ? 'Configurações da Categoria' : 'Configurações do Canal',
      items: [
        {
          id: 'overview' as const,
          label: 'Visão Geral',
          icon: <SettingsIcon className="w-4 h-4" />,
          subcategories: [
            { id: 'overview-basic', label: 'Configurações Básicas' },
            { id: 'overview-delete', label: isCategory ? 'Excluir Categoria' : 'Excluir Canal' },
          ],
        },
        {
          id: 'permissions' as const,
          label: 'Permissões',
          icon: <Shield className="w-4 h-4" />,
          subcategories: [
            { id: 'permissions-roles', label: 'Cargos & Membros' },
            { id: 'permissions-advanced', label: 'Permissões Avançadas' },
          ],
        },
      ],
    },
  ];

  const filteredChannelCategories = channelCategoriesList
    .map((group) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return group;
      const items = group.items.filter((item) => {
        const itemMatch = item.label.toLowerCase().includes(q);
        const subMatch = item.subcategories.some((sub) => sub.label.toLowerCase().includes(q));
        return itemMatch || subMatch;
      });
      return { ...group, items };
    })
    .filter((group) => group.items.length > 0);

  const handleSelectSubcategory = (tab: 'overview' | 'permissions', subId?: string) => {
    setActiveTab(tab);
    if (subId) {
      setActiveSubcategory(subId);
      setTimeout(() => {
        const el = document.getElementById(subId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 70);
    }
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 md:bg-[#1e1f22] p-0 overflow-hidden animate-fade-in"
    >
      <div className="flex flex-col md:flex-row w-full h-full bg-[#18191c] md:bg-[#1e1f22] overflow-hidden text-gray-200">
        
        {/* MOBILE MENU VIEW (100% Preserved) */}
        {mobileView === 'menu' && (
          <div className="flex md:hidden flex-col w-full h-full bg-[#18191c] overflow-hidden">
            <div
              style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 2.75rem)' }}
              className="px-4 pb-3.5 border-b border-white/10 bg-[#111214] flex items-center justify-between flex-shrink-0"
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 -ml-1 text-gray-400 hover:text-white rounded-xl active:bg-white/10 transition-colors cursor-pointer"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
                <h2 className="text-base font-bold text-white">Configurações do Canal</h2>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0 overscroll-contain touch-pan-y no-scrollbar">
              {/* Channel Mini Card */}
              <div
                onClick={() => {
                  setActiveTab('overview');
                  setMobileView('content');
                }}
                className="p-3.5 bg-[#1e1f22] rounded-2xl border border-white/10 flex items-center justify-between cursor-pointer active:bg-white/5 transition-colors shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-[#111214] border border-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center text-white font-bold text-lg shadow">
                    {isCategory ? (
                      <Folder className="w-6 h-6 text-brand-400" />
                    ) : isText ? (
                      <Hash className="w-6 h-6 text-gray-400" />
                    ) : (
                      <Volume2 className="w-6 h-6 text-online" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                      {isCategory ? channel.name : `#${channel.name}`}
                    </h3>
                    <span className="text-xs text-gray-400 block mt-0.5">
                      {isCategory ? 'Categoria' : isText ? 'Canal de Texto' : 'Canal de Voz'}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
              </div>

              {/* Menu Categories */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2 block">
                  Configurações
                </span>
                <div className="bg-[#1e1f22] rounded-2xl border border-white/10 overflow-hidden divide-y divide-white/5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('overview');
                      setMobileView('content');
                    }}
                    className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <SettingsIcon className="w-5 h-5 text-gray-400" />
                      <div>
                        <div className="text-sm font-semibold text-white">Visão Geral</div>
                        <div className="text-xs text-gray-400">Nome, tópico e categoria do canal</div>
                      </div>
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
                    <div className="flex items-center gap-3">
                      <Shield className="w-5 h-5 text-gray-400" />
                      <div>
                        <div className="text-sm font-semibold text-white">Permissões</div>
                        <div className="text-xs text-gray-400">Controle de acesso por cargos</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                  </button>
                </div>
              </div>

              {/* Danger Zone Actions */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2 block">
                  Zona de Perigo
                </span>
                <div className="bg-[#1e1f22] rounded-2xl border border-white/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="w-full flex items-center justify-between p-3.5 text-left hover:bg-red-500/10 active:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <Trash2 className="w-5 h-5 text-red-400" />
                      <div>
                        <div className="text-sm font-semibold">{isCategory ? 'Excluir Categoria' : 'Excluir Canal'}</div>
                        <div className="text-xs text-red-400/70">Apagar permanentemente este canal</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-red-400/50 shrink-0" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DESKTOP SIDEBAR TABS (Discord Design) */}
        <div className="hidden md:flex w-64 bg-[#111214] border-r border-white/10 flex-col p-3.5 shrink-0 overflow-y-auto no-scrollbar justify-between select-none">
          <div className="flex flex-col items-stretch flex-1 flex-shrink-0 min-h-0">
            {/* Channel Mini Header */}
            <div className="flex items-center gap-3 px-2 py-1.5 mb-2 rounded-xl">
              <div className="w-10 h-10 rounded-2xl bg-brand-500/15 border border-brand-500/30 overflow-hidden flex-shrink-0 flex items-center justify-center text-white font-bold text-sm shadow">
                {isCategory ? (
                  <Folder className="w-5 h-5 text-brand-400" />
                ) : isText ? (
                  <Hash className="w-5 h-5 text-brand-400" />
                ) : (
                  <Volume2 className="w-5 h-5 text-online" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-white truncate leading-tight">
                  {isCategory ? channel.name : `#${channel.name}`}
                </h3>
                <span className="text-xs text-gray-400 block mt-0.5 truncate">
                  {isCategory ? 'Categoria' : isText ? 'Canal de Texto' : 'Canal de Voz'}
                </span>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative mb-3 px-1">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1e1f22] text-xs text-gray-200 pl-8 pr-7 py-2 rounded-xl border border-transparent focus:border-brand-500/50 focus:outline-none placeholder-gray-500 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Navigation Groups & Items */}
            <nav className="flex flex-col gap-3 flex-1 overflow-y-auto no-scrollbar pr-0.5">
              {filteredChannelCategories.map((group, gIdx) => (
                <div key={gIdx} className="space-y-1">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-2 block">
                    {group.group}
                  </span>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const isActiveCategory = activeTab === item.id;
                      return (
                        <div key={item.id} className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab(item.id);
                              if (item.subcategories.length > 0) {
                                handleSelectSubcategory(item.id, item.subcategories[0].id);
                              }
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                              isActiveCategory
                                ? 'bg-white/10 text-white shadow-xs'
                                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className={isActiveCategory ? 'text-brand-400' : 'text-gray-400'}>
                                {item.icon}
                              </span>
                              <span className="truncate">{item.label}</span>
                            </div>
                          </button>

                          {/* Subcategories with Vertical Indicator Guide (Smooth Top-to-Bottom Accordion Animation) */}
                          {item.subcategories.length > 0 && (
                            <div
                              className={`grid transition-all duration-300 ease-in-out ${
                                isActiveCategory || searchQuery.trim().length > 0
                                  ? 'grid-rows-[1fr] opacity-100 my-1'
                                  : 'grid-rows-[0fr] opacity-0 my-0 pointer-events-none'
                              }`}
                            >
                              <div className="overflow-hidden">
                                <div className="ml-5 pl-2.5 border-l-2 border-white/10 flex flex-col gap-1">
                                  {item.subcategories.map((sub) => {
                                    const isSubActive = activeSubcategory === sub.id && isActiveCategory;
                                    return (
                                      <button
                                        key={sub.id}
                                        type="button"
                                        onClick={() => handleSelectSubcategory(item.id, sub.id)}
                                        className={`flex items-center text-left py-1 text-xs transition-colors cursor-pointer relative ${
                                          isSubActive
                                            ? 'text-white font-bold pl-2'
                                            : 'text-gray-400 hover:text-gray-200 pl-2'
                                        }`}
                                      >
                                        {isSubActive && (
                                          <span className="absolute -left-[12px] top-1 bottom-1 w-[2.5px] bg-white rounded-r" />
                                        )}
                                        <span className="truncate">{sub.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>

          <div className="pt-2 border-t border-white/10 flex flex-col gap-1 flex-shrink-0 mt-auto">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-2 my-0.5">
              Ações
            </span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isCategory ? 'Excluir Categoria' : 'Excluir Canal'}</span>
            </button>
          </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className={`${mobileView === 'content' ? 'flex' : 'hidden md:flex'} flex-1 flex-col overflow-hidden bg-[#18191c] md:bg-[#1e1f22] relative min-w-0 min-h-0`}>
          {/* Discord Style ESC Button (Desktop) */}
          <div className="hidden md:flex flex-col items-center gap-1 absolute top-6 right-8 z-30">
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full border-2 border-gray-400/60 hover:border-white hover:bg-white/10 flex items-center justify-center text-gray-300 hover:text-white transition-all cursor-pointer group shadow-lg"
              title="Fechar (ESC)"
            >
              <X className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">ESC</span>
          </div>

          {/* Mobile Drilldown Top Bar */}
          <div 
            style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 2.75rem)' }}
            className="flex md:hidden items-center justify-between px-4 pb-3.5 border-b border-white/10 bg-[#111214] flex-shrink-0"
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileView('menu')}
                className="p-1.5 -ml-1 text-gray-300 hover:text-white rounded-xl active:bg-white/10 transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Voltar</span>
              </button>
            </div>
            <h2 className="text-sm font-bold text-white truncate max-w-[180px]">
              {activeTab === 'overview' && 'Visão Geral'}
              {activeTab === 'permissions' && 'Permissões'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white rounded-xl active:bg-white/10 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Desktop Top Header */}
          <div className="hidden md:flex items-center justify-between px-4 sm:px-8 py-3 sm:py-5 border-b border-white/10 shrink-0 bg-[#1e1f22]/40">
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                {activeTab === 'overview' && 'Visão Geral do Canal'}
                {activeTab === 'permissions' && 'Permissões por Cargo'}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {activeTab === 'overview' && 'Configure nome, categoria e tópico descritivo.'}
                {activeTab === 'permissions' && 'Defina quem pode acessar, falar e interagir neste canal.'}
              </p>
            </div>
          </div>

          {/* Status Toast Notification */}
          {saveStatus && (
            <div
              className={`mx-4 sm:mx-8 mt-4 p-3 rounded-xl text-xs flex items-center gap-2.5 animate-in fade-in flex-shrink-0 ${
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
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 no-scrollbar min-h-0 overscroll-contain touch-pan-y">
            <div className="max-w-3xl space-y-8">
              {/* TAB 1: Visão Geral */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Basic Settings Section */}
                  <div id="overview-basic" className="space-y-4 scroll-mt-6">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Configurações Básicas</h3>
                    
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
                          className="w-full bg-[#111214] border border-white/10 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
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
                          className="w-full bg-[#111214] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-brand-500 cursor-pointer"
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
                          className="w-full bg-[#111214] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500 resize-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* Danger Zone Section */}
                  <div id="overview-delete" className="pt-6 border-t border-white/10 space-y-3 scroll-mt-6">
                    <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider">Zona de Perigo</h3>
                    <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          {isCategory ? 'Excluir esta categoria' : 'Excluir este canal'}
                        </h4>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {isCategory
                            ? 'Esta ação removerá a categoria. Os canais contidos nela serão movidos para a raiz.'
                            : 'Esta ação não pode ser desfeita e todas as mensagens e histórico serão perdidos.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="bg-red-500 hover:bg-red-600 active:bg-red-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>{isCategory ? 'Excluir Categoria' : 'Excluir Canal'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: Permissões de Cargos */}
              {activeTab === 'permissions' && (
                <div className="flex flex-col md:flex-row gap-6 min-h-0">
                  {/* Left Column: Roles list selector */}
                  <div id="permissions-roles" className="w-full md:w-56 flex flex-col gap-2 shrink-0 pr-0 md:pr-4 border-b md:border-b-0 md:border-r border-white/10 pb-4 md:pb-0 scroll-mt-6">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1">
                      Cargos do Servidor
                    </span>

                    <div className="flex flex-row md:flex-col overflow-x-auto md:overflow-y-auto max-h-none md:max-h-[460px] gap-1.5 md:gap-1 pr-0 md:pr-1 no-scrollbar">
                      {roles.map((role) => {
                        const isSelected = selectedRole?.id === role.id;
                        const hasCustomOw = overwrites[role.id] && (overwrites[role.id].allow !== 0 || overwrites[role.id].deny !== 0);

                        return (
                          <div
                            key={role.id}
                            onClick={() => setSelectedRoleId(role.id)}
                            className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all flex-shrink-0 ${
                              isSelected
                                ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                                : 'text-gray-300 hover:bg-white/5 bg-[#111214] md:bg-transparent'
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
                  <div id="permissions-advanced" className="flex-1 space-y-6 overflow-y-auto max-h-[500px] pr-2 no-scrollbar scroll-mt-6">
                    {selectedRole && (
                      <>
                        {/* Header info of selected role */}
                        <div className="flex items-center justify-between pb-3 border-b border-white/10">
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
                                      className="p-3.5 rounded-2xl bg-[#111214] border border-white/5 flex items-center justify-between gap-4 transition-all hover:border-white/10"
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
                                      <div className="flex items-center bg-[#1e1f22] p-1 rounded-xl border border-white/10 shrink-0">
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
          </div>

          {/* Sticky Footer Actions Bar */}
          <div className="px-6 sm:px-8 py-4 bg-[#111214] border-t border-white/10 flex items-center justify-between flex-shrink-0">
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
    </div>
  );
};

