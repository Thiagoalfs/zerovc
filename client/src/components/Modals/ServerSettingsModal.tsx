import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Shield,
  Plus,
  Trash2,
  Check,
  Users,
  Lock,
  Crown,
  MessageSquare,
  Volume2,
  Settings as SettingsIcon,
  UserCheck,
  AlertTriangle,
  Palette,
  Upload,
  Image as ImageIcon,
  ChevronDown,
  ScrollText,
  Smile,
  Link as LinkIcon,
  Copy,
  ArrowUp,
  ArrowDown,
  Search,
  MoreVertical,
  Clock,
  UserX,
  Ban,
  Hash,
  Sparkles,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { Permissions, Role, GuildEmoji, GuildInvite, User } from '../../types';
import { api, formatAssetUrl } from '../../lib/api';
import { ImageCropModal } from './ImageCropModal';
import { ServerAuditLogView } from './ServerAuditLogView';

interface ServerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_ROLE_COLORS = [
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

interface PermissionDefinition {
  flag: number;
  name: string;
  description: string;
  isMaster?: boolean;
}

const PERMISSION_GROUPS: { category: string; icon: React.ReactNode; permissions: PermissionDefinition[] }[] = [
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
        description: 'Permite banir membros com cargos inferiores permanentemente.',
      },
      {
        flag: Permissions.MUTE_MEMBERS,
        name: 'Silenciar Membros no Servidor',
        description: 'Permite aplicar timeout/silenciamento temporário ou permanente a membros.',
      },
    ],
  },
  {
    category: 'Permissões de Chat de Texto',
    icon: <MessageSquare className="w-4 h-4 text-sky-400" />,
    permissions: [
      {
        flag: Permissions.SEND_MESSAGES,
        name: 'Enviar Mensagens',
        description: 'Permite enviar mensagens de texto e iniciar conversas nos canais.',
      },
      {
        flag: Permissions.MANAGE_MESSAGES,
        name: 'Gerenciar Mensagens',
        description: 'Permite deletar mensagens de outros usuários e fixar mensagens.',
      },
      {
        flag: Permissions.ATTACH_FILES,
        name: 'Anexar Arquivos e Imagens',
        description: 'Permite enviar fotos, arquivos e mídias nos canais de texto.',
      },
    ],
  },
  {
    category: 'Permissões de Voz',
    icon: <Volume2 className="w-4 h-4 text-emerald-400" />,
    permissions: [
      {
        flag: Permissions.CONNECT_VOICE,
        name: 'Conectar em Canais de Voz',
        description: 'Permite entrar e ouvir conversas nos canais de voz.',
      },
      {
        flag: Permissions.SPEAK_VOICE,
        name: 'Falar em Voz',
        description: 'Permite ativar o microfone e transmitir áudio nos canais de voz.',
      },
      {
        flag: Permissions.STREAM_VOICE,
        name: 'Transmitir Tela e Vídeo',
        description: 'Permite compartilhar a tela ou transmitir vídeo nos canais de voz.',
      },
      {
        flag: Permissions.MUTE_VOICE,
        name: 'Silenciar Membros em Voz',
        description: 'Permite silenciar o microfone de outros usuários na sala de voz.',
      },
      {
        flag: Permissions.DEAFEN_VOICE,
        name: 'Ensurdecer Membros em Voz',
        description: 'Permite desativar o áudio de outros usuários na sala de voz.',
      },
    ],
  },
];

export const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuthStore();
  const {
    activeGuild,
    updateGuild,
    transferOwnership,
    deleteGuild,
    createRole,
    updateRole,
    reorderRoles,
    deleteRole,
    assignRole,
    removeRole,
    kickMember,
    banMember,
    muteMember,
  } = useGuildStore();

  const [activeTab, setActiveTab] = useState<'overview' | 'roles' | 'emojis' | 'invites' | 'members' | 'audit_log'>('overview');

  // Overview State
  const [guildName, setGuildName] = useState('');
  const [systemChannelId, setSystemChannelId] = useState<string>('');
  const [isSavingOverview, setIsSavingOverview] = useState(false);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [overviewMsg, setOverviewMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Roles State
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#5865F2');
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [isReorderingRoles, setIsReorderingRoles] = useState(false);

  // Emojis State
  const [emojisList, setEmojisList] = useState<GuildEmoji[]>([]);
  const [isLoadingEmojis, setIsLoadingEmojis] = useState(false);
  const [isUploadingEmoji, setIsUploadingEmoji] = useState(false);
  const [emojiUploadModalOpen, setEmojiUploadModalOpen] = useState(false);
  const [emojiFile, setEmojiFile] = useState<File | null>(null);
  const [emojiPreviewUrl, setEmojiPreviewUrl] = useState<string>('');
  const [emojiName, setEmojiName] = useState('');
  const [emojiError, setEmojiError] = useState('');
  const emojiInputRef = useRef<HTMLInputElement>(null);

  // Invites State
  const [invitesList, setInvitesList] = useState<GuildInvite[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Members & Search State
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');
  const [activeMemberMenuId, setActiveMemberMenuId] = useState<string | null>(null);
  const [muteModalUser, setMuteModalUser] = useState<User | null>(null);
  const [banModalUser, setBanModalUser] = useState<User | null>(null);
  const [banReason, setBanReason] = useState('');

  // Crop Modal State
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropType, setCropType] = useState<'guildIcon' | 'guildBanner'>('guildIcon');
  const [isCropOpen, setIsCropOpen] = useState(false);

  const iconInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Delete Server Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Transfer Ownership Modal State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferTargetUser, setTransferTargetUser] = useState<User | null>(null);
  const [transferConfirmText, setTransferConfirmText] = useState('');
  const [transferAcknowledge, setTransferAcknowledge] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [transferSearchQuery, setTransferSearchQuery] = useState('');

  useEffect(() => {
    if (activeGuild) {
      setGuildName(activeGuild.name || '');
      setSystemChannelId(activeGuild.system_channel_id || '');
    }
  }, [activeGuild]);

  // Load Emojis when tab opens
  useEffect(() => {
    if (isOpen && activeGuild && activeTab === 'emojis') {
      loadGuildEmojis();
    }
  }, [isOpen, activeGuild?.id, activeTab]);

  // Load Invites when tab opens
  useEffect(() => {
    if (isOpen && activeGuild && activeTab === 'invites') {
      loadGuildInvites();
    }
  }, [isOpen, activeGuild?.id, activeTab]);

  const loadGuildEmojis = async () => {
    if (!activeGuild) return;
    setIsLoadingEmojis(true);
    try {
      const data = await api.guilds.getEmojis(activeGuild.id);
      setEmojisList(data || []);
    } catch (err) {
      console.error('Failed to load emojis:', err);
    } finally {
      setIsLoadingEmojis(false);
    }
  };

  const loadGuildInvites = async () => {
    if (!activeGuild) return;
    setIsLoadingInvites(true);
    try {
      const data = await api.guilds.getInvites(activeGuild.id);
      setInvitesList(data || []);
    } catch (err) {
      console.error('Failed to load invites:', err);
    } finally {
      setIsLoadingInvites(false);
    }
  };

  if (!isOpen || !activeGuild) return null;

  const isOwner = activeGuild.owner_id === user?.id;
  const currentMember = (activeGuild.members || []).find((m) => m.id === user?.id);
  const currentUserRoles = currentMember?.roles || [];
  let currentUserPerms = 0;
  currentUserRoles.forEach((r) => {
    currentUserPerms |= Number(r.permissions || 0);
  });
  const hasAdmin = (currentUserPerms & Permissions.ADMINISTRATOR) !== 0;
  const canManageRoles = isOwner || hasAdmin || (currentUserPerms & Permissions.MANAGE_ROLES) !== 0;
  const roles = activeGuild.roles || [];
  const members = activeGuild.members || [];
  const textChannels = (activeGuild.channels || []).filter((c) => c.type === 'text');
  const voiceChannels = (activeGuild.channels || []).filter((c) => c.type === 'voice');
  const onlineMembersCount = members.filter((m) => m.status && m.status !== 'offline').length;
  const initials = (activeGuild.name || '')
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .slice(0, 3)
    .toUpperCase() || 'SRV';

  const selectedRole = roles.find((r) => r.id === selectedRoleId) || roles[0];
  const isRoleAdmin = selectedRole ? (Number(selectedRole.permissions || 0) & Permissions.ADMINISTRATOR) !== 0 : false;

  // 1. Overview Actions
  const handleSaveOverview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guildName.trim()) return;

    setIsSavingOverview(true);
    setOverviewMsg(null);
    try {
      const payload: { name: string; system_channel_id?: string; clear_system_channel?: boolean } = {
        name: guildName.trim(),
      };
      if (systemChannelId) {
        payload.system_channel_id = systemChannelId;
      } else {
        payload.clear_system_channel = true;
      }

      await updateGuild(activeGuild.id, payload);
      setOverviewMsg({ text: 'Configurações do servidor salvas com sucesso!', type: 'success' });
    } catch (err: any) {
      setOverviewMsg({ text: err.message || 'Erro ao salvar alterações', type: 'error' });
    } finally {
      setIsSavingOverview(false);
    }
  };

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    setCropType('guildIcon');
    setIsCropOpen(true);
    if (iconInputRef.current) iconInputRef.current.value = '';
  };

  const handleRemoveIcon = async () => {
    if (!confirm('Deseja remover o ícone do servidor?')) return;
    setIsUploadingIcon(true);
    try {
      await updateGuild(activeGuild.id, { icon_url: '' });
      setOverviewMsg({ text: 'Ícone do servidor removido.', type: 'success' });
    } catch (err: any) {
      setOverviewMsg({ text: err.message || 'Erro ao remover ícone', type: 'error' });
    } finally {
      setIsUploadingIcon(false);
    }
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    setCropType('guildBanner');
    setIsCropOpen(true);
    if (bannerInputRef.current) bannerInputRef.current.value = '';
  };

  const handleRemoveBanner = async () => {
    if (!confirm('Deseja remover o banner do servidor?')) return;
    setIsUploadingBanner(true);
    try {
      await updateGuild(activeGuild.id, { banner_url: '' });
      setOverviewMsg({ text: 'Banner do servidor removido.', type: 'success' });
    } catch (err: any) {
      setOverviewMsg({ text: err.message || 'Erro ao remover banner', type: 'error' });
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const handleCropConfirmed = async (croppedFile: File) => {
    setIsCropOpen(false);
    if (cropType === 'guildIcon') {
      setIsUploadingIcon(true);
      setOverviewMsg(null);
      try {
        const res = await api.upload.guildIcon(croppedFile);
        await updateGuild(activeGuild.id, { icon_url: res.url });
        setOverviewMsg({ text: 'Ícone do servidor alterado com sucesso!', type: 'success' });
      } catch (err: any) {
        setOverviewMsg({ text: err.message || 'Erro ao enviar ícone', type: 'error' });
      } finally {
        setIsUploadingIcon(false);
      }
    } else {
      setIsUploadingBanner(true);
      setOverviewMsg(null);
      try {
        const res = await api.upload.guildBanner(croppedFile);
        await updateGuild(activeGuild.id, { banner_url: res.url });
        setOverviewMsg({ text: 'Banner do servidor alterado com sucesso!', type: 'success' });
      } catch (err: any) {
        setOverviewMsg({ text: err.message || 'Erro ao enviar banner', type: 'error' });
      } finally {
        setIsUploadingBanner(false);
      }
    }
  };

  // 2. Roles Actions
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim() || !canManageRoles) return;

    setIsCreatingRole(true);
    try {
      const created = await createRole(activeGuild.id, newRoleName.trim(), newRoleColor, 0, false, false);
      setSelectedRoleId(created.id);
      setNewRoleName('');
    } catch (err) {
      console.error('Failed to create role:', err);
    } finally {
      setIsCreatingRole(false);
    }
  };

  const handleUpdateRoleColor = async (color: string) => {
    if (!selectedRole || !canManageRoles) return;
    try {
      await updateRole(activeGuild.id, selectedRole.id, { color });
    } catch (err) {
      console.error('Failed to update role color:', err);
    }
  };

  const handleUpdateRoleName = async (name: string) => {
    if (!selectedRole || !name.trim() || !canManageRoles) return;
    try {
      await updateRole(activeGuild.id, selectedRole.id, { name });
    } catch (err) {
      console.error('Failed to update role name:', err);
    }
  };

  const handleToggleRoleHoist = async () => {
    if (!selectedRole || !canManageRoles) return;
    try {
      await updateRole(activeGuild.id, selectedRole.id, { hoist: !Boolean(selectedRole.hoist) });
    } catch (err) {
      console.error('Failed to toggle hoist:', err);
    }
  };

  const handleToggleRoleMentionable = async () => {
    if (!selectedRole || !canManageRoles) return;
    try {
      await updateRole(activeGuild.id, selectedRole.id, { mentionable: !Boolean(selectedRole.mentionable) });
    } catch (err) {
      console.error('Failed to toggle mentionable:', err);
    }
  };

  const handleMoveRoleHierarchy = async (roleId: string, direction: 'up' | 'down') => {
    if (!canManageRoles || isReorderingRoles) return;
    const sortedRoles = [...roles].sort((a, b) => a.position - b.position);
    const currentIndex = sortedRoles.findIndex((r) => r.id === roleId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sortedRoles.length) return;

    setIsReorderingRoles(true);
    try {
      const temp = sortedRoles[currentIndex];
      sortedRoles[currentIndex] = sortedRoles[targetIndex];
      sortedRoles[targetIndex] = temp;

      const payload = sortedRoles.map((r, idx) => ({ id: r.id, position: idx }));
      await reorderRoles(activeGuild.id, payload);
    } catch (err) {
      console.error('Failed to reorder roles:', err);
    } finally {
      setIsReorderingRoles(false);
    }
  };

  const handleTogglePermission = async (flag: number) => {
    if (!selectedRole || !canManageRoles) return;

    const currentPermissions = Number(selectedRole.permissions || 0);
    const hasAdminPerm = (currentPermissions & Permissions.ADMINISTRATOR) !== 0;

    let newPermissions: number;

    if (flag === Permissions.ADMINISTRATOR) {
      if (hasAdminPerm) {
        newPermissions = currentPermissions & ~Permissions.ADMINISTRATOR;
      } else {
        newPermissions = currentPermissions | Permissions.ADMINISTRATOR;
      }
    } else {
      const hasFlag = (currentPermissions & flag) !== 0;
      if (hasFlag) {
        newPermissions = currentPermissions & ~flag;
      } else {
        newPermissions = currentPermissions | flag;
      }
    }

    try {
      await updateRole(activeGuild.id, selectedRole.id, { permissions: newPermissions });
    } catch (err) {
      console.error('Failed to toggle permission:', err);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!canManageRoles) return;
    const targetRole = roles.find((r) => r.id === roleId);
    if (targetRole?.name === '@everyone') {
      alert('O cargo @everyone é o cargo padrão do servidor e não pode ser excluído.');
      return;
    }

    if (confirm('Tem certeza que deseja excluir este cargo?')) {
      try {
        await deleteRole(activeGuild.id, roleId);
        if (selectedRoleId === roleId) {
          setSelectedRoleId(null);
        }
      } catch (err) {
        console.error('Failed to delete role:', err);
      }
    }
  };

  // 3. Emojis Actions
  const handleSelectEmojiFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('A imagem do emoji deve ter no máximo 2MB.');
      return;
    }

    setEmojiFile(file);
    setEmojiPreviewUrl(URL.createObjectURL(file));
    const autoName = file.name.split('.')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
    setEmojiName(autoName.slice(0, 32));
    setEmojiError('');
    setEmojiUploadModalOpen(true);
    if (emojiInputRef.current) emojiInputRef.current.value = '';
  };

  const handleConfirmUploadEmoji = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emojiFile || !emojiName.trim()) return;

    setIsUploadingEmoji(true);
    setEmojiError('');
    try {
      const uploadRes = await api.upload.attachment(emojiFile);
      const newEmoji = await api.guilds.createEmoji(activeGuild.id, {
        name: emojiName.trim(),
        image_url: uploadRes.url,
      });
      setEmojisList((prev) => [newEmoji, ...prev]);
      setEmojiUploadModalOpen(false);
      setEmojiFile(null);
      setEmojiPreviewUrl('');
      setEmojiName('');
    } catch (err: any) {
      setEmojiError(err.message || 'Falha ao carregar emoji');
    } finally {
      setIsUploadingEmoji(false);
    }
  };

  const handleDeleteEmoji = async (emojiId: string, name: string) => {
    if (!confirm(`Deseja remover o emoji :${name}:?`)) return;
    try {
      await api.guilds.deleteEmoji(activeGuild.id, emojiId);
      setEmojisList((prev) => prev.filter((em) => em.id !== emojiId));
    } catch (err: any) {
      alert(err.message || 'Erro ao remover emoji');
    }
  };

  // 4. Invites Actions
  const handleGenerateNewInvite = async () => {
    setIsCreatingInvite(true);
    try {
      const inv = await api.guilds.createInvite(activeGuild.id, true);
      setInvitesList((prev) => [inv, ...prev.filter((item) => item.code !== inv.code)]);
    } catch (err: any) {
      alert(err.message || 'Erro ao gerar novo convite');
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleCopyInviteLink = (code: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://zerovc.safiroko.xyz';
    const link = `${origin}/invite/${code}`;
    navigator.clipboard.writeText(link);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleRevokeInvite = async (code: string) => {
    if (!confirm('Deseja revogar e invalidar este link de convite?')) return;
    try {
      await api.guilds.deleteInvite(activeGuild.id, code);
      setInvitesList((prev) => prev.filter((i) => i.code !== code));
    } catch (err: any) {
      alert(err.message || 'Erro ao revogar convite');
    }
  };

  // 5. Members Filter & Actions
  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      !memberSearchQuery.trim() ||
      m.username?.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
      (m.display_name && m.display_name.toLowerCase().includes(memberSearchQuery.toLowerCase()));

    const matchesRole =
      selectedRoleFilter === 'all' ||
      (m.roles && m.roles.some((r) => r.id === selectedRoleFilter));

    return matchesSearch && matchesRole;
  });

  const handleToggleMemberRole = async (memberId: string, roleId: string, hasRole: boolean) => {
    try {
      if (hasRole) {
        await removeRole(activeGuild.id, memberId, roleId);
      } else {
        await assignRole(activeGuild.id, memberId, roleId);
      }
    } catch (err) {
      console.error('Failed to toggle role:', err);
    }
  };

  const handleMuteMemberWithDuration = async (seconds: number) => {
    if (!muteModalUser) return;
    try {
      await muteMember(activeGuild.id, muteModalUser.id, seconds);
      setMuteModalUser(null);
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar status de silêncio');
    }
  };

  const handleConfirmBan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!banModalUser) return;
    try {
      await banMember(activeGuild.id, banModalUser.id, banReason.trim());
      setBanModalUser(null);
      setBanReason('');
    } catch (err: any) {
      alert(err.message || 'Erro ao banir membro');
    }
  };

  const handleConfirmTransferOwnership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTargetUser || !transferAcknowledge) return;
    if (transferConfirmText.trim() !== activeGuild.name.trim()) return;

    setIsTransferring(true);
    setTransferError('');
    try {
      await transferOwnership(activeGuild.id, transferTargetUser.id);
      setIsTransferModalOpen(false);
      setTransferTargetUser(null);
      setTransferConfirmText('');
      setTransferAcknowledge(false);
    } catch (err: any) {
      setTransferError(err.message || 'Erro ao transferir posse do servidor');
    } finally {
      setIsTransferring(false);
    }
  };

  const handleConfirmDeleteGuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteConfirmText.trim() !== activeGuild.name.trim()) return;

    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteGuild(activeGuild.id);
      setIsDeleteModalOpen(false);
      onClose();
    } catch (err: any) {
      setDeleteError(err.message || 'Erro ao excluir servidor');
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
        <div className="flex w-full max-w-5xl h-[88vh] bg-[#18191c] rounded-2xl shadow-2xl border border-white/10 overflow-hidden text-gray-200">
          
          {/* SIDEBAR TABS */}
          <div className="w-64 bg-[#111214] border-r border-white/10 flex flex-col p-4 shrink-0 select-none">
            <div className="px-3 py-2 mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
                {activeGuild.name}
              </h2>
              <div className="text-[11px] text-gray-500 mt-0.5">Configurações do Servidor</div>
            </div>

            <nav className="flex-1 space-y-1">
              <button
                onClick={() => setActiveTab('overview')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'overview'
                    ? 'bg-brand-500/15 text-brand-400 border-l-2 border-brand-500'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-[#18191c]/60'
                }`}
              >
                <SettingsIcon className="w-4 h-4 shrink-0" />
                <span>Visão Geral</span>
              </button>

              <button
                onClick={() => setActiveTab('roles')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'roles'
                    ? 'bg-brand-500/15 text-brand-400 border-l-2 border-brand-500'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-[#18191c]/60'
                }`}
              >
                <Shield className="w-4 h-4 shrink-0" />
                <span>Cargos</span>
                <span className="ml-auto text-xs bg-[#18191c] px-1.5 py-0.5 rounded text-gray-400">
                  {roles.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('emojis')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'emojis'
                    ? 'bg-brand-500/15 text-brand-400 border-l-2 border-brand-500'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-[#18191c]/60'
                }`}
              >
                <Smile className="w-4 h-4 shrink-0" />
                <span>Emojis</span>
                <span className="ml-auto text-xs bg-[#18191c] px-1.5 py-0.5 rounded text-gray-400">
                  {emojisList.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('invites')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'invites'
                    ? 'bg-brand-500/15 text-brand-400 border-l-2 border-brand-500'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-[#18191c]/60'
                }`}
              >
                <LinkIcon className="w-4 h-4 shrink-0" />
                <span>Links de Convite</span>
              </button>

              <button
                onClick={() => setActiveTab('members')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'members'
                    ? 'bg-brand-500/15 text-brand-400 border-l-2 border-brand-500'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-[#18191c]/60'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>Membros</span>
                <span className="ml-auto text-xs bg-[#18191c] px-1.5 py-0.5 rounded text-gray-400">
                  {members.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('audit_log')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'audit_log'
                    ? 'bg-brand-500/15 text-brand-400 border-l-2 border-brand-500'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-[#18191c]/60'
                }`}
              >
                <ScrollText className="w-4 h-4 shrink-0" />
                <span>Registro de Auditoria</span>
              </button>
            </nav>

            {isOwner && (
              <div className="pt-4 border-t border-white/10 space-y-1.5">
                <button
                  onClick={() => setIsTransferModalOpen(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
                >
                  <Crown className="w-4 h-4" />
                  <span>Transferir Posse</span>
                </button>
                <button
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Excluir Servidor</span>
                </button>
              </div>
            )}
          </div>

          {/* MAIN CONTENT AREA */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#18191c] relative">
            {/* TOP HEADER */}
            <div className="flex items-center justify-between px-8 py-5 border-b border-white/10 shrink-0 bg-[#1e1f22]/40">
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  {activeTab === 'overview' && 'Visão Geral do Servidor'}
                  {activeTab === 'roles' && 'Gerenciamento de Cargos e Hierarquia'}
                  {activeTab === 'emojis' && 'Emojis Customizados do Servidor'}
                  {activeTab === 'invites' && 'Links de Convite Ativos'}
                  {activeTab === 'members' && 'Membros do Servidor e Moderação'}
                  {activeTab === 'audit_log' && 'Registro de Auditoria'}
                </h1>
                <p className="text-xs text-gray-400 mt-0.5">
                  {activeTab === 'overview' && 'Personalize a identidade visual, canal do sistema e veja estatísticas'}
                  {activeTab === 'roles' && 'Defina permissões, ordem na hierarquia e exibição de membros'}
                  {activeTab === 'emojis' && 'Adicione até 50 emojis exclusivos para membros usarem no chat'}
                  {activeTab === 'invites' && 'Monitore quem criou cada link, contagem de usos e revogue convites'}
                  {activeTab === 'members' && 'Busque membros rapidamente, gerencie cargos, silenciamentos e expulsões'}
                  {activeTab === 'audit_log' && 'Histórico completo de alterações e ações de moderação'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10/60 transition-colors"
                title="Fechar Configurações (ESC)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* TAB CONTENTS */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">

              {/* TAB 1: VISÃO GERAL */}
              {activeTab === 'overview' && (
                <div className="max-w-3xl space-y-8 animate-fade-in">
                  {/* Quick Stats Grid */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 font-mono">
                      Métricas do Servidor
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-4 rounded-xl bg-[#1e1f22] border border-white/10 flex flex-col">
                        <div className="flex items-center justify-between text-gray-400 text-xs mb-1">
                          <span>Total Membros</span>
                          <Users className="w-4 h-4 text-brand-400" />
                        </div>
                        <span className="text-2xl font-bold text-white">{members.length}</span>
                        <span className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          {onlineMembersCount} online
                        </span>
                      </div>

                      <div className="p-4 rounded-xl bg-[#1e1f22] border border-white/10 flex flex-col">
                        <div className="flex items-center justify-between text-gray-400 text-xs mb-1">
                          <span>Canais Texto</span>
                          <Hash className="w-4 h-4 text-sky-400" />
                        </div>
                        <span className="text-2xl font-bold text-white">{textChannels.length}</span>
                        <span className="text-[11px] text-gray-500 mt-1">salas de bate-papo</span>
                      </div>

                      <div className="p-4 rounded-xl bg-[#1e1f22] border border-white/10 flex flex-col">
                        <div className="flex items-center justify-between text-gray-400 text-xs mb-1">
                          <span>Canais Voz</span>
                          <Volume2 className="w-4 h-4 text-emerald-400" />
                        </div>
                        <span className="text-2xl font-bold text-white">{voiceChannels.length}</span>
                        <span className="text-[11px] text-gray-500 mt-1">com áudio & vídeo</span>
                      </div>

                      <div className="p-4 rounded-xl bg-[#1e1f22] border border-white/10 flex flex-col">
                        <div className="flex items-center justify-between text-gray-400 text-xs mb-1">
                          <span>Criação</span>
                          <Calendar className="w-4 h-4 text-purple-400" />
                        </div>
                        <span className="text-sm font-semibold text-white mt-1">
                          {activeGuild.created_at ? new Date(activeGuild.created_at).toLocaleDateString('pt-BR') : 'Hoje'}
                        </span>
                        <span className="text-[11px] text-gray-500 mt-auto">data de fundação</span>
                      </div>
                    </div>
                  </div>

                  {overviewMsg && (
                    <div
                      className={`p-3.5 rounded-xl text-sm flex items-center gap-2.5 ${
                        overviewMsg.type === 'success'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-red-500/15 text-red-300 border border-red-500/30'
                      }`}
                    >
                      {overviewMsg.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                      )}
                      <span>{overviewMsg.text}</span>
                    </div>
                  )}

                  {/* Visual Identity (Icon & Banner) */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
                      Identidade Visual
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#1e1f22] p-5 rounded-2xl border border-white/10">
                      {/* Icon */}
                      <div className="flex flex-col gap-3">
                        <label className="text-xs font-medium text-gray-300">Ícone do Servidor</label>
                        <div className="flex items-center gap-4">
                          <div className="w-20 h-20 rounded-2xl bg-[#2b2d31] border-2 border-white/15 flex items-center justify-center overflow-hidden shrink-0 shadow-lg">
                            {activeGuild.icon_url ? (
                              <img
                                src={formatAssetUrl(activeGuild.icon_url)}
                                alt={activeGuild.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-xl font-bold text-white">{initials}</span>
                            )}
                          </div>
                          <div className="flex flex-col gap-2">
                            <input
                              type="file"
                              ref={iconInputRef}
                              onChange={handleIconChange}
                              accept="image/*"
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={() => iconInputRef.current?.click()}
                              disabled={!isOwner || isUploadingIcon}
                              className="px-3.5 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>{isUploadingIcon ? 'Enviando...' : 'Trocar Ícone'}</span>
                            </button>
                            {activeGuild.icon_url && isOwner && (
                              <button
                                type="button"
                                onClick={handleRemoveIcon}
                                disabled={isUploadingIcon}
                                className="text-xs text-red-400 hover:text-red-300 text-left transition-colors"
                              >
                                Remover Ícone
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Banner */}
                      <div className="flex flex-col gap-3">
                        <label className="text-xs font-medium text-gray-300">Banner do Servidor</label>
                        <div className="flex flex-col gap-2">
                          <div className="w-full h-20 rounded-xl bg-[#2b2d31] border border-white/15 overflow-hidden relative group">
                            {activeGuild.banner_url ? (
                              <img
                                src={formatAssetUrl(activeGuild.banner_url)}
                                alt="Banner"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs gap-1.5">
                                <ImageIcon className="w-4 h-4" />
                                <span>Sem banner definido</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              type="file"
                              ref={bannerInputRef}
                              onChange={handleBannerChange}
                              accept="image/*"
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={() => bannerInputRef.current?.click()}
                              disabled={!isOwner || isUploadingBanner}
                              className="px-3.5 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>{isUploadingBanner ? 'Enviando...' : 'Trocar Banner'}</span>
                            </button>
                            {activeGuild.banner_url && isOwner && (
                              <button
                                type="button"
                                onClick={handleRemoveBanner}
                                disabled={isUploadingBanner}
                                className="text-xs text-red-400 hover:text-red-300 transition-colors"
                              >
                                Remover Banner
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* General Form */}
                  <form onSubmit={handleSaveOverview} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
                        Nome do Servidor
                      </label>
                      <input
                        type="text"
                        value={guildName}
                        onChange={(e) => setGuildName(e.target.value)}
                        disabled={!isOwner}
                        placeholder="Nome do servidor"
                        className="w-full px-4 py-2.5 bg-[#111214] border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors disabled:opacity-60"
                      />
                    </div>

                    {/* System Welcome Channel Selector */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
                        Canal de Mensagens do Sistema (Boas-Vindas)
                      </label>
                      <p className="text-xs text-gray-400">
                        O canal onde o servidor pode receber novos membros e avisos importantes.
                      </p>
                      <select
                        value={systemChannelId}
                        onChange={(e) => setSystemChannelId(e.target.value)}
                        disabled={!isOwner}
                        className="w-full px-4 py-2.5 bg-[#111214] border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-500 transition-colors disabled:opacity-60"
                      >
                        <option value="">Nenhum (Desativado)</option>
                        {textChannels.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            # {ch.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {isOwner && (
                      <div className="flex justify-end pt-2">
                        <button
                          type="submit"
                          disabled={isSavingOverview || !guildName.trim()}
                          className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-brand-500/20 transition-all disabled:opacity-50"
                        >
                          {isSavingOverview ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                      </div>
                    )}
                  </form>
                </div>
              )}

              {/* TAB 2: CARGOS (ROLES) */}
              {activeTab === 'roles' && (
                <div className="flex gap-6 h-[68vh] animate-fade-in">
                  {/* Roles Sidebar / Hierarchy List */}
                  <div className="w-72 bg-[#1e1f22] rounded-2xl border border-white/10 flex flex-col p-3 shrink-0">
                    <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/10 px-2">
                      <span className="text-xs font-bold uppercase text-gray-400 font-mono">
                        Cargos ({roles.length})
                      </span>
                      {isOwner && (
                        <button
                          onClick={() => {
                            setSelectedRoleId(null);
                            setNewRoleName('');
                          }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10/50 transition-colors"
                          title="Novo Cargo"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                      {roles
                        .slice()
                        .sort((a, b) => a.position - b.position)
                        .map((role, idx) => {
                          const isSelected = (selectedRoleId === role.id) || (!selectedRoleId && idx === 0);
                          const isEveryone = role.name === '@everyone';
                          const memberCount = isEveryone
                            ? members.length
                            : members.filter((m) => m.roles && m.roles.some((r) => r.id === role.id)).length;

                          return (
                            <div
                              key={role.id}
                              onClick={() => setSelectedRoleId(role.id)}
                              className={`group flex items-center justify-between px-3 py-2 rounded-xl text-sm cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-brand-500/15 text-white border border-brand-500/30'
                                  : 'text-gray-300 hover:bg-[#18191c]/80'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                                  style={{ backgroundColor: role.color || '#99AAB5' }}
                                />
                                <span className="truncate font-medium">
                                  {role.name}
                                </span>
                                {isEveryone && (
                                  <span className="text-[10px] bg-white/10 text-gray-300 px-1.5 py-0.5 rounded font-mono">
                                    Padrão
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                                <span className="text-[11px] text-gray-500 mr-1">{memberCount}</span>
                                {canManageRoles && !isEveryone && (
                                  <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      disabled={idx === 0 || isReorderingRoles}
                                      onClick={() => handleMoveRoleHierarchy(role.id, 'up')}
                                      className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-20"
                                      title="Subir na Hierarquia"
                                    >
                                      <ArrowUp className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={idx === roles.length - 1 || isReorderingRoles || roles[idx + 1]?.name === '@everyone'}
                                      onClick={() => handleMoveRoleHierarchy(role.id, 'down')}
                                      className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-20"
                                      title="Descer na Hierarquia"
                                    >
                                      <ArrowDown className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>

                    {canManageRoles && (
                      <form onSubmit={handleCreateRole} className="mt-3 pt-3 border-t border-white/10 space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newRoleName}
                            onChange={(e) => setNewRoleName(e.target.value)}
                            placeholder="Nome do novo cargo..."
                            className="flex-1 px-3 py-1.5 bg-[#111214] border border-white/10 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
                          />
                          <button
                            type="submit"
                            disabled={isCreatingRole || !newRoleName.trim()}
                            className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
                          >
                            Criar
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                  {/* Role Details Editor */}
                  {selectedRole ? (
                    <div className="flex-1 bg-[#1e1f22] rounded-2xl border border-white/10 flex flex-col p-6 overflow-hidden">
                      <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
                        <div className="flex items-center gap-3">
                          <span
                            className="w-5 h-5 rounded-full shadow"
                            style={{ backgroundColor: selectedRole.color || '#99AAB5' }}
                          />
                          <h2 className="text-base font-bold text-white">{selectedRole.name}</h2>
                          {selectedRole.name === '@everyone' && (
                            <span className="text-[10px] bg-white/10 text-gray-200 px-2 py-0.5 rounded-full font-medium">
                              Cargo Base de Todos
                            </span>
                          )}
                          {selectedRole.hoist && (
                            <span className="text-[10px] bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded-full font-medium">
                              Separado
                            </span>
                          )}
                          {selectedRole.mentionable && (
                            <span className="text-[10px] bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded-full font-medium">
                              Mencionável
                            </span>
                          )}
                        </div>

                        {canManageRoles && selectedRole.name !== '@everyone' && (
                          <button
                            onClick={() => handleDeleteRole(selectedRole.id)}
                            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Excluir Cargo</span>
                          </button>
                        )}
                      </div>

                      <div className="flex-1 overflow-y-auto space-y-6 pt-5 pr-2 custom-scrollbar">
                        {/* Role Name */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
                            Nome do Cargo
                          </label>
                          <input
                            type="text"
                            defaultValue={selectedRole.name}
                            key={selectedRole.id + selectedRole.name}
                            onBlur={(e) => handleUpdateRoleName(e.target.value)}
                            disabled={!canManageRoles || selectedRole.name === '@everyone'}
                            className="w-full px-4 py-2 bg-[#111214] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand-500 disabled:opacity-60"
                          />
                          {selectedRole.name === '@everyone' && (
                            <p className="text-xs text-gray-500">
                              O cargo @everyone representa as permissões padrão atribuídas a todos os membros do servidor.
                            </p>
                          )}
                        </div>

                        {/* Role Color */}
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
                            Cor do Cargo
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            {PRESET_ROLE_COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => handleUpdateRoleColor(c)}
                                disabled={!canManageRoles}
                                className={`w-7 h-7 rounded-full transition-transform flex items-center justify-center ${
                                  selectedRole.color?.toLowerCase() === c.toLowerCase()
                                    ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#111214]'
                                    : 'hover:scale-105'
                                } disabled:opacity-50`}
                                style={{ backgroundColor: c }}
                              >
                                {selectedRole.color?.toLowerCase() === c.toLowerCase() && (
                                  <Check className="w-3.5 h-3.5 text-black drop-shadow" />
                                )}
                              </button>
                            ))}
                            <div className="flex items-center gap-2 ml-2">
                              <input
                                type="color"
                                value={selectedRole.color || '#5865F2'}
                                onChange={(e) => handleUpdateRoleColor(e.target.value)}
                                disabled={!canManageRoles}
                                className="w-8 h-8 rounded-lg bg-transparent border-0 cursor-pointer disabled:opacity-50"
                                title="Cor personalizada"
                              />
                              <span className="text-xs font-mono text-gray-400">{selectedRole.color || '#5865F2'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Role Display Switches (Hoist & Mentionable) */}
                        <div className="space-y-3 pt-3 border-t border-white/10">
                          <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
                            Exibição de Membros
                          </label>
                          <div className="space-y-3">
                            <div
                              onClick={() => {
                                if (canManageRoles && selectedRole.name !== '@everyone') {
                                  handleToggleRoleHoist();
                                }
                              }}
                              className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                                selectedRole.hoist
                                  ? 'bg-[#111214]/80 border-white/15'
                                  : 'bg-[#111214]/50 border-white/10 hover:border-white/15'
                              } ${canManageRoles && selectedRole.name !== '@everyone' ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
                            >
                              <div className="pr-4 select-none">
                                <div className="text-sm font-semibold text-white">
                                  Exibir membros deste cargo separadamente
                                </div>
                                <div className="text-xs text-gray-400 mt-1 leading-relaxed">
                                  {selectedRole.name === '@everyone'
                                    ? 'O cargo @everyone engloba todos os membros e não pode ser exibido separadamente.'
                                    : 'Membros com este cargo aparecerão em uma categoria própria na lista lateral de membros.'}
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={!canManageRoles || selectedRole.name === '@everyone'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleRoleHoist();
                                }}
                                className={`w-11 h-6 flex items-center rounded-full p-1 shrink-0 transition-colors cursor-pointer ${
                                  selectedRole.hoist ? 'bg-[#23a55a]' : 'bg-[#4e5058]'
                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                              >
                                <div
                                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                                    selectedRole.hoist ? 'translate-x-5' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            </div>

                            <div
                              onClick={() => {
                                if (canManageRoles) {
                                  handleToggleRoleMentionable();
                                }
                              }}
                              className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                                selectedRole.mentionable
                                  ? 'bg-[#111214]/80 border-white/15'
                                  : 'bg-[#111214]/50 border-white/10 hover:border-white/15'
                              } ${canManageRoles ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
                            >
                              <div className="pr-4 select-none">
                                <div className="text-sm font-semibold text-white">
                                  Permitir que qualquer um @mencione este cargo
                                </div>
                                <div className="text-xs text-gray-400 mt-1 leading-relaxed">
                                  Permite que membros enviem mensagens com @cargo para notificar todos com este cargo.
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={!canManageRoles}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleRoleMentionable();
                                }}
                                className={`w-11 h-6 flex items-center rounded-full p-1 shrink-0 transition-colors cursor-pointer ${
                                  selectedRole.mentionable ? 'bg-[#23a55a]' : 'bg-[#4e5058]'
                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                              >
                                <div
                                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                                    selectedRole.mentionable ? 'translate-x-5' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Permission Groups */}
                        <div className="space-y-5 pt-3 border-t border-white/10">
                          <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
                            Permissões do Cargo
                          </label>

                          {PERMISSION_GROUPS.map((group) => (
                            <div key={group.category} className="space-y-3">
                              <div className="flex items-center gap-2 text-xs font-semibold text-gray-300">
                                {group.icon}
                                <span>{group.category}</span>
                              </div>

                              <div className="space-y-2">
                                {group.permissions.map((perm) => {
                                  const currentPerms = Number(selectedRole.permissions || 0);
                                  const isChecked = isRoleAdmin || (currentPerms & perm.flag) !== 0;

                                  return (
                                    <div
                                      key={perm.flag}
                                      onClick={() => {
                                        if (canManageRoles && (!isRoleAdmin || perm.flag === Permissions.ADMINISTRATOR)) {
                                          handleTogglePermission(perm.flag);
                                        }
                                      }}
                                      className={`flex items-start justify-between p-4 rounded-xl border transition-all ${
                                        perm.isMaster
                                          ? 'bg-amber-500/10 border-amber-500/30'
                                          : isChecked
                                          ? 'bg-[#111214]/80 border-white/15'
                                          : 'bg-[#111214]/50 border-white/10 hover:border-white/15'
                                      } ${canManageRoles ? 'cursor-pointer' : 'opacity-70'}`}
                                    >
                                      <div className="pr-4 select-none">
                                        <div className="text-sm font-semibold text-white flex items-center gap-2">
                                          <span>{perm.name}</span>
                                          {perm.isMaster && (
                                            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-medium">
                                              Mestre
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1 leading-relaxed">{perm.description}</div>
                                      </div>

                                      <button
                                        type="button"
                                        disabled={!isOwner || (isRoleAdmin && perm.flag !== Permissions.ADMINISTRATOR)}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (isOwner && (!isRoleAdmin || perm.flag === Permissions.ADMINISTRATOR)) {
                                            handleTogglePermission(perm.flag);
                                          }
                                        }}
                                        className={`w-11 h-6 flex items-center rounded-full p-1 shrink-0 transition-colors cursor-pointer ${
                                          isChecked ? 'bg-[#23a55a]' : 'bg-[#4e5058]'
                                        } disabled:opacity-50`}
                                      >
                                        <div
                                          className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                                            isChecked ? 'translate-x-5' : 'translate-x-0'
                                          }`}
                                        />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 bg-[#1e1f22] rounded-2xl border border-white/10 flex flex-col items-center justify-center text-gray-400">
                      <Shield className="w-12 h-12 stroke-1 mb-2 text-gray-500" />
                      <p className="text-sm">Selecione ou crie um cargo na lista ao lado.</p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: EMOJIS */}
              {activeTab === 'emojis' && (
                <div className="max-w-4xl space-y-6 animate-fade-in">
                  <div className="flex items-center justify-between p-5 rounded-2xl bg-[#1e1f22] border border-white/10">
                    <div>
                      <h3 className="text-sm font-bold text-white">Slots de Emojis do Servidor</h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {emojisList.length} de 50 slots utilizados
                      </p>
                    </div>
                    <div>
                      <input
                        type="file"
                        ref={emojiInputRef}
                        onChange={handleSelectEmojiFile}
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => emojiInputRef.current?.click()}
                        disabled={!isOwner && !user}
                        className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-semibold shadow-lg shadow-brand-500/20 transition-all flex items-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Carregar Emoji</span>
                      </button>
                    </div>
                  </div>

                  {isLoadingEmojis ? (
                    <div className="flex items-center justify-center py-16 text-gray-400">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
                    </div>
                  ) : emojisList.length === 0 ? (
                    <div className="text-center py-16 px-4 rounded-2xl bg-[#1e1f22]/60 border border-white/10">
                      <Smile className="w-12 h-12 stroke-1 text-gray-500 mx-auto mb-3" />
                      <h4 className="text-base font-semibold text-white">Nenhum emoji personalizado ainda</h4>
                      <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
                        Carregue imagens quadradas (PNG, GIF, WebP) para que todos os membros possam usar no chat com :nome:!
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {emojisList.map((em) => (
                        <div
                          key={em.id}
                          className="p-3.5 rounded-2xl bg-[#1e1f22] border border-white/10 hover:border-white/15 transition-all flex flex-col group relative"
                        >
                          <div className="w-full h-24 rounded-xl bg-[#111214] flex items-center justify-center p-2 mb-2.5 overflow-hidden">
                            <img
                              src={formatAssetUrl(em.image_url)}
                              alt={em.name}
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white truncate font-mono">:{em.name}:</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(`:${em.name}:`);
                                  alert(`:${em.name}: copiado para a área de transferência!`);
                                }}
                                className="p-1 text-gray-400 hover:text-white rounded"
                                title="Copiar código"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              {isOwner && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEmoji(em.id, em.name)}
                                  className="p-1 text-red-400 hover:text-red-300 rounded"
                                  title="Excluir Emoji"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          {em.creator && (
                            <span className="text-[10px] text-gray-500 mt-1">Por @{em.creator.username}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: CONVITES (INVITES) */}
              {activeTab === 'invites' && (
                <div className="max-w-4xl space-y-6 animate-fade-in">
                  <div className="flex items-center justify-between p-5 rounded-2xl bg-[#1e1f22] border border-white/10">
                    <div>
                      <h3 className="text-sm font-bold text-white">Gerenciamento de Links de Convite</h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Veja todos os links de convite ativos gerados para este servidor.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleGenerateNewInvite}
                      disabled={isCreatingInvite}
                      className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-semibold shadow-lg shadow-brand-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{isCreatingInvite ? 'Gerando...' : 'Gerar Novo Link'}</span>
                    </button>
                  </div>

                  {isLoadingInvites ? (
                    <div className="flex items-center justify-center py-16 text-gray-400">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
                    </div>
                  ) : invitesList.length === 0 ? (
                    <div className="text-center py-16 px-4 rounded-2xl bg-[#1e1f22]/60 border border-white/10">
                      <LinkIcon className="w-12 h-12 stroke-1 text-gray-500 mx-auto mb-3" />
                      <h4 className="text-base font-semibold text-white">Nenhum link de convite ativo</h4>
                      <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
                        Crie um link de convite acima para convidar seus amigos para o servidor!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {invitesList.map((inv) => {
                        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://zerovc.safiroko.xyz';
                        const fullLink = `${origin}/invite/${inv.code}`;
                        const isCopied = copiedCode === inv.code;

                        return (
                          <div
                            key={inv.code}
                            className="p-4 rounded-2xl bg-[#1e1f22] border border-white/10 flex items-center justify-between gap-4"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-mono font-bold text-brand-400">{inv.code}</span>
                                <span className="text-xs text-gray-500 truncate font-mono">({fullLink})</span>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                                <span>Criado por @{inv.creator?.username || 'membro'}</span>
                                <span>•</span>
                                <span className="text-white font-medium">{inv.uses} {inv.uses === 1 ? 'uso' : 'usos'}</span>
                                <span>•</span>
                                <span>{inv.created_at ? new Date(inv.created_at).toLocaleDateString('pt-BR') : 'Hoje'}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleCopyInviteLink(inv.code)}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                  isCopied
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                    : 'bg-white/10 hover:bg-white/15 text-white'
                                }`}
                              >
                                {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                <span>{isCopied ? 'Copiado!' : 'Copiar'}</span>
                              </button>

                              {isOwner && (
                                <button
                                  type="button"
                                  onClick={() => handleRevokeInvite(inv.code)}
                                  className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors"
                                  title="Revogar / Excluir Convite"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: MEMBROS & MODERAÇÃO RÁPIDA */}
              {activeTab === 'members' && (
                <div className="max-w-4xl space-y-6 animate-fade-in">
                  {/* Search and Role Filter Bar */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={memberSearchQuery}
                        onChange={(e) => setMemberSearchQuery(e.target.value)}
                        placeholder="Buscar por nome de usuário ou apelido..."
                        className="w-full pl-10 pr-4 py-2 bg-[#1e1f22] border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <select
                      value={selectedRoleFilter}
                      onChange={(e) => setSelectedRoleFilter(e.target.value)}
                      className="px-4 py-2 bg-[#1e1f22] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand-500"
                    >
                      <option value="all">Todos os Cargos ({members.length})</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="text-xs text-gray-400">
                    Mostrando {filteredMembers.length} de {members.length} membros
                  </div>

                  {/* Members List Table */}
                  <div className="space-y-2.5">
                    {filteredMembers.map((member) => {
                      const isMemberOwner = member.id === activeGuild.owner_id;
                      const memberRoles = member.roles || [];
                      const isMuted = !!member.muted_until && new Date(member.muted_until) > new Date();
                      const isMenuOpen = activeMemberMenuId === member.id;

                      return (
                        <div
                          key={member.id}
                          className="p-3.5 rounded-2xl bg-[#1e1f22] border border-white/10 flex items-center justify-between gap-4 hover:border-white/15 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="relative">
                              <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden shrink-0">
                                {member.avatar_url ? (
                                  <img
                                    src={formatAssetUrl(member.avatar_url)}
                                    alt={member.username}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center font-bold text-white text-sm bg-brand-600">
                                    {member.username[0]?.toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <span
                                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#1e1f22] ${
                                  member.status === 'online'
                                    ? 'bg-emerald-500'
                                    : member.status === 'idle'
                                    ? 'bg-amber-500'
                                    : member.status === 'dnd'
                                    ? 'bg-red-500'
                                    : 'bg-gray-500'
                                }`}
                              />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white text-sm truncate">
                                  {member.display_name || member.username}
                                </span>
                                {isMemberOwner && (
                                  <span className="p-0.5 text-amber-400" title="Dono do Servidor">
                                    <Crown className="w-3.5 h-3.5" />
                                  </span>
                                )}
                                {isMuted && (
                                  <span className="text-[10px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full font-medium">
                                    Silenciado
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-gray-400">@{member.username}</span>
                            </div>
                          </div>

                          {/* Member Roles & Quick Actions */}
                          <div className="flex items-center gap-3">
                            <div className="hidden sm:flex flex-wrap items-center gap-1.5 max-w-md justify-end">
                              {memberRoles
                                .filter((r) => r.name !== '@everyone')
                                .map((r) => (
                                <span
                                  key={r.id}
                                  className="text-[11px] px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1.5"
                                  style={{
                                    backgroundColor: `${r.color || '#5865F2'}20`,
                                    color: r.color || '#5865F2',
                                    border: `1px solid ${r.color || '#5865F2'}40`,
                                  }}
                                >
                                  <span
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: r.color || '#5865F2' }}
                                  />
                                  <span>{r.name}</span>
                                </span>
                              ))}
                            </div>

                            {/* Moderation Popover Menu */}
                            {isOwner && member.id !== user?.id && (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setActiveMemberMenuId(isMenuOpen ? null : member.id)}
                                  className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10/60 transition-colors"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>

                                {isMenuOpen && (
                                  <div className="absolute right-0 top-10 z-30 w-56 p-2 bg-[#111214] border border-white/10 rounded-2xl shadow-2xl space-y-1 animate-fade-in">
                                    <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-gray-400 font-mono">
                                      Cargos
                                    </div>
                                    <div className="max-h-36 overflow-y-auto space-y-0.5 custom-scrollbar pr-1">
                                      {roles
                                        .filter((r) => r.name !== '@everyone')
                                        .map((r) => {
                                        const hasThisRole = memberRoles.some((mr) => mr.id === r.id);
                                        return (
                                          <button
                                            key={r.id}
                                            type="button"
                                            onClick={() => handleToggleMemberRole(member.id, r.id, hasThisRole)}
                                            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-[#18191c] text-left transition-colors"
                                          >
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span
                                                className="w-2 h-2 rounded-full"
                                                style={{ backgroundColor: r.color || '#99AAB5' }}
                                              />
                                              <span className="truncate text-white">{r.name}</span>
                                            </div>
                                            {hasThisRole && <Check className="w-3.5 h-3.5 text-brand-400" />}
                                          </button>
                                        );
                                      })}
                                    </div>

                                    <div className="pt-2 mt-1 border-t border-white/10 space-y-0.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveMemberMenuId(null);
                                          setMuteModalUser(member);
                                        }}
                                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-amber-300 hover:bg-amber-500/15 transition-colors"
                                      >
                                        <Clock className="w-3.5 h-3.5" />
                                        <span>{isMuted ? 'Alterar Silenciamento' : 'Silenciar (Timeout)'}</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveMemberMenuId(null);
                                          if (confirm(`Expulsar @${member.username} do servidor?`)) {
                                            kickMember(activeGuild.id, member.id);
                                          }
                                        }}
                                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/15 transition-colors"
                                      >
                                        <UserX className="w-3.5 h-3.5" />
                                        <span>Expulsar Membro</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveMemberMenuId(null);
                                          setBanModalUser(member);
                                        }}
                                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-500/20 font-semibold transition-colors"
                                      >
                                        <Ban className="w-3.5 h-3.5" />
                                        <span>Banir Membro</span>
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 6: AUDIT LOG */}
              {activeTab === 'audit_log' && (
                <div className="h-full animate-fade-in">
                  <ServerAuditLogView guildId={activeGuild.id} />
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* MODAL 1: CROP IMAGE */}
      {isCropOpen && cropFile && (
        <ImageCropModal
          isOpen={isCropOpen}
          file={cropFile}
          cropType={cropType}
          onConfirm={handleCropConfirmed}
          onCancel={() => {
            setIsCropOpen(false);
            setCropFile(null);
          }}
        />
      )}

      {/* MODAL 2: UPLOAD EMOJI */}
      {emojiUploadModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md bg-[#1e1f22] rounded-2xl border border-white/10 shadow-2xl p-6 text-gray-200">
            <h3 className="text-base font-bold text-white mb-1">Carregar Novo Emoji</h3>
            <p className="text-xs text-gray-400 mb-5">
              Escolha um nome para seu emoji personalizado. Membros digitarão :nome: no chat.
            </p>

            {emojiError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
                {emojiError}
              </div>
            )}

            <form onSubmit={handleConfirmUploadEmoji} className="space-y-4">
              <div className="w-24 h-24 mx-auto rounded-2xl bg-[#111214] border border-white/10 flex items-center justify-center p-3 overflow-hidden shadow-inner">
                {emojiPreviewUrl ? (
                  <img src={emojiPreviewUrl} alt="Preview" className="max-h-full max-w-full object-contain" />
                ) : (
                  <Smile className="w-8 h-8 text-gray-500" />
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
                  Nome do Emoji
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-gray-400 font-mono text-sm">:</span>
                  <input
                    type="text"
                    value={emojiName}
                    onChange={(e) => setEmojiName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                    placeholder="nome_do_emoji"
                    maxLength={32}
                    className="w-full pl-7 pr-7 py-2 bg-[#111214] border border-white/10 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-brand-500"
                  />
                  <span className="absolute right-3 text-gray-400 font-mono text-sm">:</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setEmojiUploadModalOpen(false);
                    setEmojiFile(null);
                  }}
                  className="px-4 py-2 text-gray-400 hover:text-white text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUploadingEmoji || !emojiName.trim()}
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors"
                >
                  {isUploadingEmoji ? 'Enviando...' : 'Salvar Emoji'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: MUTE / TIMEOUT DURATION */}
      {muteModalUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md bg-[#1e1f22] rounded-2xl border border-white/10 shadow-2xl p-6 text-gray-200">
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <span>Silenciar @{muteModalUser.username}</span>
            </h3>
            <p className="text-xs text-gray-400 mb-5">
              Escolha por quanto tempo o membro ficará silenciado no servidor.
            </p>

            <div className="grid grid-cols-2 gap-2.5 mb-6">
              <button
                type="button"
                onClick={() => handleMuteMemberWithDuration(15 * 60)}
                className="p-3 bg-[#18191c] hover:bg-[#2b2d31] text-white rounded-xl text-xs font-semibold text-center border border-white/10 transition-colors"
              >
                15 Minutos
              </button>
              <button
                type="button"
                onClick={() => handleMuteMemberWithDuration(60 * 60)}
                className="p-3 bg-[#18191c] hover:bg-[#2b2d31] text-white rounded-xl text-xs font-semibold text-center border border-white/10 transition-colors"
              >
                1 Hora
              </button>
              <button
                type="button"
                onClick={() => handleMuteMemberWithDuration(24 * 60 * 60)}
                className="p-3 bg-[#18191c] hover:bg-[#2b2d31] text-white rounded-xl text-xs font-semibold text-center border border-white/10 transition-colors"
              >
                24 Horas (1 Dia)
              </button>
              <button
                type="button"
                onClick={() => handleMuteMemberWithDuration(7 * 24 * 60 * 60)}
                className="p-3 bg-[#18191c] hover:bg-[#2b2d31] text-white rounded-xl text-xs font-semibold text-center border border-white/10 transition-colors"
              >
                7 Dias (1 Semana)
              </button>
              <button
                type="button"
                onClick={() => handleMuteMemberWithDuration(-1)}
                className="p-3 bg-red-500/10 hover:bg-red-500/20 text-red-300 rounded-xl text-xs font-semibold text-center border border-red-500/30 transition-colors"
              >
                Permanente
              </button>
              <button
                type="button"
                onClick={() => handleMuteMemberWithDuration(0)}
                className="p-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded-xl text-xs font-semibold text-center border border-emerald-500/30 transition-colors"
              >
                Remover Silêncio
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setMuteModalUser(null)}
                className="px-4 py-2 text-gray-400 hover:text-white text-xs font-medium"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: BAN MEMBER WITH REASON */}
      {banModalUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md bg-[#1e1f22] rounded-2xl border border-red-500/30 shadow-2xl p-6 text-gray-200">
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-500" />
              <span>Banir @{banModalUser.username}</span>
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              O membro será desconectado e impedido de reentrar no servidor até ser desbanido.
            </p>

            <form onSubmit={handleConfirmBan} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
                  Motivo do Banimento (Opcional)
                </label>
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Ex: Violação das regras da comunidade..."
                  rows={3}
                  className="w-full px-3 py-2 bg-[#111214] border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-red-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setBanModalUser(null);
                    setBanReason('');
                  }}
                  className="px-4 py-2 text-gray-400 hover:text-white text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold shadow-lg shadow-red-600/20 transition-colors"
                >
                  Confirmar Banimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: TRANSFER OWNERSHIP */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-[#1e1f22] rounded-2xl border border-amber-500/40 shadow-2xl p-6 text-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400">
                <Crown className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Transferir Posse do Servidor</h3>
                <p className="text-xs text-gray-400">Passe o controle total deste servidor para outro membro</p>
              </div>
            </div>

            <div className="p-3.5 my-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed">
              ⚠️ <strong>Atenção:</strong> Você deixará de ser o dono do servidor e passará a ser um administrador. Esta ação não poderá ser desfeita por você após a confirmação.
            </div>

            {transferError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
                {transferError}
              </div>
            )}

            <form onSubmit={handleConfirmTransferOwnership} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
                  1. Selecione o Novo Dono
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={transferSearchQuery}
                    onChange={(e) => setTransferSearchQuery(e.target.value)}
                    placeholder="Filtrar membro..."
                    className="w-full pl-9 pr-4 py-2 bg-[#111214] border border-white/10 rounded-xl text-white text-xs mb-2 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1 bg-[#111214]/60 p-2 rounded-xl border border-white/10 custom-scrollbar">
                  {members
                    .filter((m) => m.id !== user?.id)
                    .filter((m) =>
                      !transferSearchQuery.trim() ||
                      m.username.toLowerCase().includes(transferSearchQuery.toLowerCase()) ||
                      (m.display_name && m.display_name.toLowerCase().includes(transferSearchQuery.toLowerCase()))
                    )
                    .map((m) => {
                      const isSelected = transferTargetUser?.id === m.id;
                      return (
                        <div
                          key={m.id}
                          onClick={() => setTransferTargetUser(m)}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                            isSelected ? 'bg-amber-500/20 border border-amber-500/40 text-white' : 'hover:bg-[#18191c] text-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 rounded-full bg-white/10 overflow-hidden shrink-0">
                              {m.avatar_url ? (
                                <img src={formatAssetUrl(m.avatar_url)} alt={m.username} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white bg-brand-600">
                                  {m.username[0]?.toUpperCase()}
                                </div>
                              )}
                            </div>
                            <span className="text-xs font-semibold">{m.display_name || m.username}</span>
                            <span className="text-[11px] text-gray-500">@{m.username}</span>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-amber-400" />}
                        </div>
                      );
                    })}
                </div>
              </div>

              {transferTargetUser && (
                <div className="space-y-3 pt-2">
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs text-gray-300 select-none">
                    <input
                      type="checkbox"
                      checked={transferAcknowledge}
                      onChange={(e) => setTransferAcknowledge(e.target.checked)}
                      className="mt-0.5 rounded bg-[#111214] border-white/10 text-amber-500 focus:ring-0"
                    />
                    <span>
                      Reconheço que estou transferindo irreversivelmente a posse para <strong>@{transferTargetUser.username}</strong>.
                    </span>
                  </label>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
                      2. Digite o nome do servidor para confirmar: <span className="text-white select-all">{activeGuild.name}</span>
                    </label>
                    <input
                      type="text"
                      value={transferConfirmText}
                      onChange={(e) => setTransferConfirmText(e.target.value)}
                      placeholder={activeGuild.name}
                      className="w-full px-4 py-2 bg-[#111214] border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setIsTransferModalOpen(false);
                    setTransferTargetUser(null);
                    setTransferConfirmText('');
                    setTransferAcknowledge(false);
                  }}
                  className="px-4 py-2 text-gray-400 hover:text-white text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    isTransferring ||
                    !transferTargetUser ||
                    !transferAcknowledge ||
                    transferConfirmText.trim() !== activeGuild.name.trim()
                  }
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-lg shadow-amber-600/20 transition-all disabled:opacity-50"
                >
                  {isTransferring ? 'Transferindo...' : 'Confirmar Transferência'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: DELETE GUILD */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md bg-[#1e1f22] rounded-2xl border border-red-500/40 shadow-2xl p-6 text-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-red-500/15 text-red-500">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Excluir Servidor</h3>
                <p className="text-xs text-gray-400">Esta ação é permanente e irreversível</p>
              </div>
            </div>

            <p className="text-xs text-gray-300 my-4 leading-relaxed">
              Você tem certeza de que deseja excluir <strong>{activeGuild.name}</strong>? Todos os canais, mensagens, cargos e convites serão apagados permanentemente.
            </p>

            {deleteError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
                {deleteError}
              </div>
            )}

            <form onSubmit={handleConfirmDeleteGuild} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
                  Digite o nome do servidor: <span className="text-white select-all">{activeGuild.name}</span>
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={activeGuild.name}
                  className="w-full px-4 py-2.5 bg-[#111214] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isDeleting || deleteConfirmText.trim() !== activeGuild.name.trim()}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold shadow-lg shadow-red-600/20 transition-all disabled:opacity-50"
                >
                  {isDeleting ? 'Excluindo...' : 'Excluir Servidor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
