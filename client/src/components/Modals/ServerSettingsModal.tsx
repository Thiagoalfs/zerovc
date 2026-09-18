import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Shield,
  Trash2,
  Users,
  Crown,
  Settings as SettingsIcon,
  ScrollText,
  Smile,
  Link as LinkIcon,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { Permissions, GuildEmoji, GuildInvite, User } from '../../types';
import { api, formatAssetUrl, getApiBaseUrl } from '../../lib/api';
import { copyToClipboard } from '../../utils/clipboard';
import { convertToWebP } from '../../utils/image';
import { ImageCropModal } from './ImageCropModal';
import { ServerAuditLogView } from './ServerAuditLogView';
import { pushBackHandler } from '../../lib/mobileBackHandler';

import { OverviewTab } from './ServerSettings/OverviewTab';
import { RolesTab } from './ServerSettings/RolesTab';
import { EmojisTab } from './ServerSettings/EmojisTab';
import { InvitesTab } from './ServerSettings/InvitesTab';
import { MembersTab } from './ServerSettings/MembersTab';
import { DeleteServerModal } from './ServerSettings/DeleteServerModal';
import { TransferOwnershipModal } from './ServerSettings/TransferOwnershipModal';
import { BanMemberModal } from './ServerSettings/BanMemberModal';
import { MuteMemberModal } from './ServerSettings/MuteMemberModal';

interface ServerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

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
  const [mobileView, setMobileView] = useState<'menu' | 'content'>('menu');

  useEffect(() => {
    if (isOpen) {
      setMobileView('menu');
    }
  }, [isOpen]);

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
  const [newRoleColor] = useState('#5865F2');
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [isReorderingRoles, setIsReorderingRoles] = useState(false);

  // Emojis State
  const [emojisList, setEmojisList] = useState<GuildEmoji[]>([]);
  const [isLoadingEmojis, setIsLoadingEmojis] = useState(false);
  const [isUploadingEmoji, setIsUploadingEmoji] = useState(false);
  const [emojiError, setEmojiError] = useState('');
  const [savingEmojiId, setSavingEmojiId] = useState<string | null>(null);
  const [copiedEmojiId, setCopiedEmojiId] = useState<string | null>(null);
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
  const [isDeleteAcknowledged, setIsDeleteAcknowledged] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
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

  // Hardware Back Button integration for mobile
  useEffect(() => {
    if (!isOpen) return;

    const unregister = pushBackHandler('server_settings_modal', () => {
      if (isCropOpen) {
        setIsCropOpen(false);
        return true;
      }
      if (isDeleteModalOpen) {
        setIsDeleteModalOpen(false);
        setTwoFactorCode('');
        return true;
      }
      if (isTransferModalOpen) {
        setIsTransferModalOpen(false);
        return true;
      }
      if (muteModalUser) {
        setMuteModalUser(null);
        return true;
      }
      if (banModalUser) {
        setBanModalUser(null);
        return true;
      }
      if (selectedRoleId) {
        setSelectedRoleId(null);
        return true;
      }
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
  }, [
    isOpen,
    mobileView,
    isCropOpen,
    isDeleteModalOpen,
    isTransferModalOpen,
    muteModalUser,
    banModalUser,
    selectedRoleId,
    onClose,
  ]);

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
      useGuildStore.setState((state) => {
        if (!state.activeGuild || state.activeGuild.id !== activeGuild.id) return state;
        return { activeGuild: { ...state.activeGuild, emojis: data || [] } };
      });
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

  const isOwner = Boolean(
    user?.id &&
    activeGuild?.owner_id &&
    String(user.id).toLowerCase() === String(activeGuild.owner_id).toLowerCase()
  );
  const currentMember = (activeGuild.members || []).find((m) => m.id === user?.id);
  const currentUserRoles = currentMember?.roles || [];
  let currentUserPerms = 0;
  currentUserRoles.forEach((r) => {
    currentUserPerms |= Number(r.permissions || 0);
  });
  const hasAdmin = (currentUserPerms & Permissions.ADMINISTRATOR) !== 0;
  const canManageGuild = isOwner || hasAdmin || (currentUserPerms & Permissions.MANAGE_GUILD) !== 0;
  const canManageRoles = isOwner || hasAdmin || (currentUserPerms & Permissions.MANAGE_ROLES) !== 0;
  const roles = activeGuild.roles || [];
  const members = activeGuild.members || [];
  const textChannels = (activeGuild.channels || []).filter((c) => c.type === 'text');
  const voiceChannels = (activeGuild.channels || []).filter((c) => c.type === 'voice');
  const onlineMembersCount = members.filter((m) => m.status && m.status !== 'offline').length;

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
  const handleSelectEmojiFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('A imagem do emoji deve ter no máximo 2MB.');
      if (emojiInputRef.current) emojiInputRef.current.value = '';
      return;
    }

    setIsUploadingEmoji(true);
    setEmojiError('');
    try {
      let fileToUpload: File;
      try {
        fileToUpload = await convertToWebP(file, { quality: 0.95, maxWidth: 512, maxHeight: 512 });
      } catch (convErr) {
        console.warn('WebP conversion fallback to original file:', convErr);
        fileToUpload = file;
      }

      const baseName = file.name.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32);
      const derivedName = baseName.length >= 2 ? baseName : `emoji_${Date.now().toString().slice(-4)}`;

      const uploadRes = await api.upload.attachment(fileToUpload);

      const newEmoji = await api.guilds.createEmoji(activeGuild.id, {
        name: derivedName,
        image_url: uploadRes.url,
      });

      setEmojisList((prev) => [newEmoji, ...prev.filter((em) => em.id !== newEmoji.id)]);
      useGuildStore.getState().handleEmojiCreateEvent(newEmoji);
    } catch (err: any) {
      console.error('Failed to upload emoji:', err);
      setEmojiError(err.message || 'Falha ao carregar emoji');
    } finally {
      setIsUploadingEmoji(false);
      if (emojiInputRef.current) emojiInputRef.current.value = '';
    }
  };

  const handleInlineRename = async (emojiId: string, rawName: string, originalName: string) => {
    const sanitized = rawName.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32);
    if (!sanitized || sanitized === originalName) {
      setEmojisList((prev) => [...prev]);
      return;
    }

    setSavingEmojiId(emojiId);
    setEmojiError('');
    try {
      const updated = await api.guilds.updateEmoji(activeGuild.id, emojiId, {
        name: sanitized,
      });
      setEmojisList((prev) => prev.map((em) => (em.id === updated.id ? updated : em)));
      useGuildStore.getState().handleEmojiUpdateEvent(updated);
    } catch (err: any) {
      console.error('Failed to rename emoji:', err);
      setEmojiError(err.message || 'Falha ao renomear emoji');
      setEmojisList((prev) => [...prev]);
    } finally {
      setSavingEmojiId(null);
    }
  };

  const handleDeleteEmoji = async (emojiId: string, name: string) => {
    if (!confirm(`Deseja remover o emoji :${name}:?`)) return;
    try {
      await api.guilds.deleteEmoji(activeGuild.id, emojiId);
      setEmojisList((prev) => prev.filter((em) => em.id !== emojiId));
      useGuildStore.getState().handleEmojiDeleteEvent({ guild_id: activeGuild.id, id: emojiId });
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

  const handleCopyInviteLink = async (code: string) => {
    const origin = (typeof window !== 'undefined' && window.location.origin && window.location.origin.startsWith('http') && !window.location.origin.includes('localhost:5173'))
      ? window.location.origin
      : getApiBaseUrl();
    const link = `${origin}/invite/${code}`;
    const ok = await copyToClipboard(link);
    if (ok) {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2500);
    }
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

  const handleConfirmDeleteGuild = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeGuild) return;

    const isMatch = deleteConfirmText.trim().toLowerCase() === activeGuild.name.trim().toLowerCase();
    if (!isMatch && !isDeleteAcknowledged) {
      setDeleteError('Por favor, digite o nome do servidor ou marque a confirmação abaixo.');
      return;
    }

    if (user?.two_factor_enabled && !twoFactorCode.trim()) {
      setDeleteError('Por favor, digite seu código de autenticação 2FA (TOTP ou código de backup).');
      return;
    }

    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteGuild(activeGuild.id, twoFactorCode.trim() || undefined);
      setIsDeleteModalOpen(false);
      setDeleteConfirmText('');
      setIsDeleteAcknowledged(false);
      setTwoFactorCode('');
      onClose();
      useGuildStore.getState().handleGuildDeleteEvent(activeGuild.id);
    } catch (err: any) {
      console.error('Failed to delete guild:', err);
      setDeleteError(err.message || 'Erro ao excluir servidor');
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-4 overflow-hidden animate-fade-in"
      >
        <div className="flex flex-col md:flex-row w-full h-full md:max-w-5xl md:h-[88vh] md:max-h-[92dvh] md:my-auto bg-[#18191c] rounded-none md:rounded-2xl shadow-2xl border-0 md:border md:border-white/10 overflow-hidden text-gray-200">
          
          {/* MOBILE MENU VIEW */}
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
                  <h2 className="text-base font-bold text-white">Configurações do Servidor</h2>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0 overscroll-contain touch-pan-y no-scrollbar">
                {/* Server Mini Card */}
                <div
                  onClick={() => {
                    setActiveTab('overview');
                    setMobileView('content');
                  }}
                  className="p-3.5 bg-[#1e1f22] rounded-2xl border border-white/10 flex items-center justify-between cursor-pointer active:bg-white/5 transition-colors shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-[#111214] border border-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center text-white font-bold text-lg shadow">
                      {activeGuild.icon_url ? (
                        <img src={formatAssetUrl(activeGuild.icon_url)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span>{activeGuild.name.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                        <span className="truncate">{activeGuild.name}</span>
                        {isOwner && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      </h3>
                      <p className="text-xs text-gray-400 truncate">
                        {members.length} membros • {onlineMembersCount} online
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-500 shrink-0" />
                </div>

                {/* Group 1: Configurações do Servidor */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2 block">
                    Configurações do Servidor
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
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-xl bg-white/5 text-gray-300">
                          <SettingsIcon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">Visão Geral</div>
                          <div className="text-xs text-gray-400">Identidade visual, ícone, banner e boas-vindas</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('roles');
                        setMobileView('content');
                      }}
                      className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-xl bg-white/5 text-gray-300">
                          <Shield className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">Cargos</div>
                          <div className="text-xs text-gray-400">{roles.length} cargos • Hierarquia e permissões</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('emojis');
                        setMobileView('content');
                      }}
                      className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-xl bg-white/5 text-gray-300">
                          <Smile className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">Emojis</div>
                          <div className="text-xs text-gray-400">{emojisList.length} de 50 slots customizados</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('invites');
                        setMobileView('content');
                      }}
                      className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-xl bg-white/5 text-gray-300">
                          <LinkIcon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">Convites</div>
                          <div className="text-xs text-gray-400">{invitesList.length} links de convite ativos</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('members');
                        setMobileView('content');
                      }}
                      className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-xl bg-white/5 text-gray-300">
                          <Users className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">Membros</div>
                          <div className="text-xs text-gray-400">{members.length} membros do servidor</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('audit_log');
                        setMobileView('content');
                      }}
                      className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-xl bg-white/5 text-gray-300">
                          <ScrollText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">Auditoria</div>
                          <div className="text-xs text-gray-400">Histórico de ações e moderação</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                    </button>
                  </div>
                </div>

                {/* Group 2: Ações de Dono */}
                {isOwner && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2 block">
                      Ações do Dono
                    </span>
                    <div className="bg-[#1e1f22] rounded-2xl border border-white/10 overflow-hidden divide-y divide-white/5">
                      <button
                        type="button"
                        onClick={() => setIsTransferModalOpen(true)}
                        className="w-full flex items-center justify-between p-3.5 text-left hover:bg-amber-500/10 active:bg-amber-500/20 text-amber-400 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                            <Crown className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold">Transferir Posse</div>
                            <div className="text-xs text-amber-400/70">Passar controle para outro membro</div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-amber-400/50 shrink-0" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsDeleteModalOpen(true)}
                        className="w-full flex items-center justify-between p-3.5 text-left hover:bg-red-500/10 active:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-xl bg-red-500/10 text-red-400">
                            <Trash2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold">Excluir Servidor</div>
                            <div className="text-xs text-red-400/70">Apagar permanentemente este servidor</div>
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
          <div className="hidden md:flex w-64 bg-[#111214] border-r border-white/10 flex-col p-4 shrink-0 overflow-y-auto no-scrollbar">
            <div className="px-3 py-2 mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono truncate">
                {activeGuild.name}
              </h2>
              <div className="text-[11px] text-gray-500 mt-0.5">Configurações do Servidor</div>
            </div>

            <nav className="flex flex-col items-stretch gap-1 flex-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  activeTab === 'overview'
                    ? 'bg-brand-500/15 text-brand-400 border-l-2 border-brand-500 font-bold'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-[#18191c]/60'
                }`}
              >
                <SettingsIcon className="w-4 h-4 shrink-0" />
                <span>Visão Geral</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('roles')}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  activeTab === 'roles'
                    ? 'bg-brand-500/15 text-brand-400 border-l-2 border-brand-500 font-bold'
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
                type="button"
                onClick={() => setActiveTab('emojis')}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  activeTab === 'emojis'
                    ? 'bg-brand-500/15 text-brand-400 border-l-2 border-brand-500 font-bold'
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
                type="button"
                onClick={() => setActiveTab('invites')}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  activeTab === 'invites'
                    ? 'bg-brand-500/15 text-brand-400 border-l-2 border-brand-500 font-bold'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-[#18191c]/60'
                }`}
              >
                <LinkIcon className="w-4 h-4 shrink-0" />
                <span>Convites</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('members')}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  activeTab === 'members'
                    ? 'bg-brand-500/15 text-brand-400 border-l-2 border-brand-500 font-bold'
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
                type="button"
                onClick={() => setActiveTab('audit_log')}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  activeTab === 'audit_log'
                    ? 'bg-brand-500/15 text-brand-400 border-l-2 border-brand-500 font-bold'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-[#18191c]/60'
                }`}
              >
                <ScrollText className="w-4 h-4 shrink-0" />
                <span>Auditoria</span>
              </button>
            </nav>

            {isOwner && (
              <div className="pt-4 border-t border-white/10 flex flex-col gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Crown className="w-4 h-4" />
                  <span>Transferir Posse</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Excluir</span>
                </button>
              </div>
            )}
          </div>

          {/* MAIN CONTENT AREA */}
          <div className={`${mobileView === 'content' ? 'flex' : 'hidden md:flex'} flex-1 flex-col overflow-hidden bg-[#18191c] relative min-w-0 min-h-0`}>
            
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
                {activeTab === 'roles' && 'Cargos'}
                {activeTab === 'emojis' && 'Emojis'}
                {activeTab === 'invites' && 'Convites'}
                {activeTab === 'members' && 'Membros'}
                {activeTab === 'audit_log' && 'Auditoria'}
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
                className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Fechar Configurações (ESC)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* TAB CONTENTS */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 no-scrollbar md:custom-scrollbar overscroll-contain touch-pan-y min-h-0">
              {activeTab === 'overview' && (
                <OverviewTab
                  activeGuild={activeGuild}
                  isOwner={isOwner}
                  members={members}
                  onlineMembersCount={onlineMembersCount}
                  textChannels={textChannels}
                  voiceChannels={voiceChannels}
                  overviewMsg={overviewMsg}
                  guildName={guildName}
                  setGuildName={setGuildName}
                  systemChannelId={systemChannelId}
                  setSystemChannelId={setSystemChannelId}
                  isSavingOverview={isSavingOverview}
                  handleSaveOverview={handleSaveOverview}
                  iconInputRef={iconInputRef}
                  bannerInputRef={bannerInputRef}
                  handleIconChange={handleIconChange}
                  handleBannerChange={handleBannerChange}
                  handleRemoveIcon={handleRemoveIcon}
                  handleRemoveBanner={handleRemoveBanner}
                  isUploadingIcon={isUploadingIcon}
                  isUploadingBanner={isUploadingBanner}
                />
              )}

              {activeTab === 'roles' && (
                <RolesTab
                  roles={roles}
                  members={members}
                  isOwner={isOwner}
                  canManageRoles={canManageRoles}
                  selectedRoleId={selectedRoleId}
                  setSelectedRoleId={setSelectedRoleId}
                  selectedRole={selectedRole}
                  newRoleName={newRoleName}
                  setNewRoleName={setNewRoleName}
                  isCreatingRole={isCreatingRole}
                  isReorderingRoles={isReorderingRoles}
                  handleMoveRoleHierarchy={handleMoveRoleHierarchy}
                  handleCreateRole={handleCreateRole}
                  handleDeleteRole={handleDeleteRole}
                  handleUpdateRoleName={handleUpdateRoleName}
                  handleUpdateRoleColor={handleUpdateRoleColor}
                  handleToggleRoleHoist={handleToggleRoleHoist}
                  handleToggleRoleMentionable={handleToggleRoleMentionable}
                  handleTogglePermission={handleTogglePermission}
                  isRoleAdmin={isRoleAdmin}
                />
              )}

              {activeTab === 'emojis' && (
                <EmojisTab
                  emojisList={emojisList}
                  isLoadingEmojis={isLoadingEmojis}
                  isUploadingEmoji={isUploadingEmoji}
                  emojiError={emojiError}
                  setEmojiError={setEmojiError}
                  emojiInputRef={emojiInputRef}
                  handleSelectEmojiFile={handleSelectEmojiFile}
                  savingEmojiId={savingEmojiId}
                  copiedEmojiId={copiedEmojiId}
                  setCopiedEmojiId={setCopiedEmojiId}
                  handleInlineRename={handleInlineRename}
                  handleDeleteEmoji={handleDeleteEmoji}
                  isOwner={isOwner}
                  hasAdmin={hasAdmin}
                  canManageGuild={canManageGuild}
                />
              )}

              {activeTab === 'invites' && (
                <InvitesTab
                  invitesList={invitesList}
                  isLoadingInvites={isLoadingInvites}
                  isCreatingInvite={isCreatingInvite}
                  handleGenerateNewInvite={handleGenerateNewInvite}
                  handleCopyInviteLink={handleCopyInviteLink}
                  handleRevokeInvite={handleRevokeInvite}
                  copiedCode={copiedCode}
                  isOwner={isOwner}
                />
              )}

              {activeTab === 'members' && (
                <MembersTab
                  activeGuild={activeGuild}
                  user={user}
                  roles={roles}
                  members={members}
                  filteredMembers={filteredMembers}
                  memberSearchQuery={memberSearchQuery}
                  setMemberSearchQuery={setMemberSearchQuery}
                  selectedRoleFilter={selectedRoleFilter}
                  setSelectedRoleFilter={setSelectedRoleFilter}
                  activeMemberMenuId={activeMemberMenuId}
                  setActiveMemberMenuId={setActiveMemberMenuId}
                  handleToggleMemberRole={handleToggleMemberRole}
                  setMuteModalUser={setMuteModalUser}
                  setBanModalUser={setBanModalUser}
                  kickMember={kickMember}
                  isOwner={isOwner}
                />
              )}

              {activeTab === 'audit_log' && (
                <div className="animate-fade-in">
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

      {/* MODAL 2: MUTE / TIMEOUT */}
      <MuteMemberModal
        isOpen={Boolean(muteModalUser)}
        onClose={() => setMuteModalUser(null)}
        muteModalUser={muteModalUser}
        onMuteDuration={handleMuteMemberWithDuration}
      />

      {/* MODAL 3: BAN MEMBER */}
      <BanMemberModal
        isOpen={Boolean(banModalUser)}
        onClose={() => {
          setBanModalUser(null);
          setBanReason('');
        }}
        banModalUser={banModalUser}
        banReason={banReason}
        setBanReason={setBanReason}
        onConfirmBan={handleConfirmBan}
      />

      {/* MODAL 4: TRANSFER OWNERSHIP */}
      <TransferOwnershipModal
        isOpen={isTransferModalOpen}
        onClose={() => {
          setIsTransferModalOpen(false);
          setTransferTargetUser(null);
          setTransferConfirmText('');
          setTransferAcknowledge(false);
        }}
        activeGuild={activeGuild}
        user={user}
        members={members}
        transferTargetUser={transferTargetUser}
        setTransferTargetUser={setTransferTargetUser}
        transferConfirmText={transferConfirmText}
        setTransferConfirmText={setTransferConfirmText}
        transferAcknowledge={transferAcknowledge}
        setTransferAcknowledge={setTransferAcknowledge}
        transferSearchQuery={transferSearchQuery}
        setTransferSearchQuery={setTransferSearchQuery}
        transferError={transferError}
        isTransferring={isTransferring}
        onConfirmTransfer={handleConfirmTransferOwnership}
      />

      {/* MODAL 5: DELETE GUILD (WITH 2FA) */}
      <DeleteServerModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeleteConfirmText('');
          setIsDeleteAcknowledged(false);
          setTwoFactorCode('');
          setDeleteError('');
        }}
        activeGuild={activeGuild}
        user={user}
        deleteConfirmText={deleteConfirmText}
        setDeleteConfirmText={setDeleteConfirmText}
        isDeleteAcknowledged={isDeleteAcknowledged}
        setIsDeleteAcknowledged={setIsDeleteAcknowledged}
        twoFactorCode={twoFactorCode}
        setTwoFactorCode={setTwoFactorCode}
        deleteError={deleteError}
        setDeleteError={setDeleteError}
        isDeleting={isDeleting}
        onConfirmDelete={handleConfirmDeleteGuild}
        membersCount={members.length}
      />
    </>
  );
};
