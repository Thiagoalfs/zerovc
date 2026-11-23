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
  Filter,
  RefreshCw,
  Plus,
  Upload,
} from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Permissions, GuildEmoji, GuildInvite, User, Role } from '../../types';
import { api, formatAssetUrl, getApiBaseUrl } from '../../lib/api';
import { copyToClipboard } from '../../utils/clipboard';
import { convertToWebP } from '../../utils/image';
import { ImageCropModal } from './ImageCropModal';
import { ServerAuditLogView, ACTION_FILTERS } from './ServerAuditLogView';
import { DropdownSelect } from '../Common/DropdownSelect';
import { pushBackHandler } from '../../lib/mobileBackHandler';
import { showAlert, showConfirm } from '../../stores/confirmModalStore';

import { ServerProfile } from './ServerSettings/ServerProfile';
import { RolesTab } from './ServerSettings/RolesTab';
import { UnsavedChangesBar, useUnsavedGuard } from './UnsavedChangesBar';
import { EmojisTab } from './ServerSettings/EmojisTab';
import { InvitesTab } from './ServerSettings/InvitesTab';
import { MembersTab } from './ServerSettings/MembersTab';
import { DeleteServerModal } from './ServerSettings/DeleteServerModal';
import { TransferOwnershipModal } from './ServerSettings/TransferOwnershipModal';
import { BanMemberModal } from './ServerSettings/BanMemberModal';
import { MuteMemberModal } from './ServerSettings/MuteMemberModal';
import { useGuildPermissions } from '../../hooks/useGuildPermissions';
import {
  MODAL_TITLE_CLASS,
  MODAL_DIALOG_TITLE_CLASS,
  MODAL_DESCRIPTION_CLASS,
} from '../../constants/modalTypography';
import { ModalButton } from '@/components/ui/modal-button';

interface ServerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuthStore();
  const reducedMotion = useSettingsStore((state) => state.reducedMotion);
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

  const perms = useGuildPermissions(activeGuild);

  const [activeTab, setActiveTab] = useState<'overview' | 'roles' | 'emojis' | 'invites' | 'members' | 'audit_log'>('overview');
  const [mobileView, setMobileView] = useState<'menu' | 'content'>('menu');

  useEffect(() => {
    if (isOpen) {
      setMobileView('menu');
    }
  }, [isOpen]);

  // Overview State
  const [guildName, setGuildName] = useState('');
  const [systemChannelId, setSystemChannelId] = useState<string>('');
  const [pendingIcon, setPendingIcon] = useState<{ file: File; previewUrl: string } | 'remove' | null>(null);
  const [pendingBanner, setPendingBanner] = useState<{ file: File; previewUrl: string } | 'remove' | null>(null);
  const [isSavingOverview, setIsSavingOverview] = useState(false);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [overviewMsg, setOverviewMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Roles State
  const [draftRoles, setDraftRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [isReorderingRoles, setIsReorderingRoles] = useState(false);

  const hasRoleChanges = (() => {
    if (!activeGuild) return false;
    const origRoles = activeGuild.roles || [];
    for (const dr of draftRoles) {
      const orig = origRoles.find((r) => r.id === dr.id);
      if (!orig) continue;
      if (
        dr.name !== orig.name ||
        (dr.color || '') !== (orig.color || '') ||
        Boolean(dr.hoist) !== Boolean(orig.hoist) ||
        Boolean(dr.mentionable) !== Boolean(orig.mentionable) ||
        Number(dr.permissions || 0) !== Number(orig.permissions || 0) ||
        Number(dr.position || 0) !== Number(orig.position || 0)
      ) {
        return true;
      }
    }
    return false;
  })();

  const hasUnsavedChanges = Boolean(
    isOpen &&
      activeGuild &&
      (guildName.trim() !== (activeGuild.name || '').trim() ||
        (systemChannelId || '') !== (activeGuild.system_channel_id || '') ||
        pendingIcon !== null ||
        pendingBanner !== null ||
        hasRoleChanges)
  );

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
  const [muteModalUser, setMuteModalUser] = useState<User | null>(null);
  const [banModalUser, setBanModalUser] = useState<User | null>(null);
  const [banReason, setBanReason] = useState('');

  // Audit Log State
  const [auditFilter, setAuditFilter] = useState('ALL');
  const [auditRefreshTrigger, setAuditRefreshTrigger] = useState(0);
  const [isAuditLoading, setIsAuditLoading] = useState(false);

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
  const [is2FARequiredByServer, setIs2FARequiredByServer] = useState(false);

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
      attemptClose();
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
    attemptClose,
  ]);

  useEffect(() => {
    if (activeGuild && isOpen) {
      setGuildName(activeGuild.name || '');
      setSystemChannelId(activeGuild.system_channel_id || '');
      setDraftRoles(activeGuild.roles || []);
      setPendingIcon((prev) => {
        if (prev && typeof prev === 'object') URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
      setPendingBanner((prev) => {
        if (prev && typeof prev === 'object') URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
      setOverviewMsg(null);
    }
  }, [activeGuild?.id, isOpen]);

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

  const isOwner = perms.isCurrentOwner;
  const hasAdmin = perms.hasAdmin;
  const canManageGuild = perms.canManageGuild;
  const canManageRoles = perms.canManageRoles;
  const roles = draftRoles;
  const members = activeGuild.members || [];
  const textChannels = (activeGuild.channels || []).filter((c) => c.type === 'text');
  const voiceChannels = (activeGuild.channels || []).filter((c) => c.type === 'voice');
  const onlineMembersCount = members.filter((m) => m.status && m.status !== 'offline').length;

  const selectedRole = roles.find((r) => r.id === selectedRoleId) || roles[0];
  const isRoleAdmin = selectedRole ? (Number(selectedRole.permissions || 0) & Permissions.ADMINISTRATOR) !== 0 : false;

  const handleRevert = () => {
    setGuildName(activeGuild.name || '');
    setSystemChannelId(activeGuild.system_channel_id || '');
    setDraftRoles(activeGuild.roles || []);
    setPendingIcon((prev) => {
      if (prev && typeof prev === 'object') URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setPendingBanner((prev) => {
      if (prev && typeof prev === 'object') URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setOverviewMsg(null);
  };

  const handleSaveAll = async () => {
    if (!guildName.trim()) {
      setOverviewMsg({ text: 'O nome do servidor não pode ficar vazio.', type: 'error' });
      return;
    }

    setIsSavingOverview(true);
    setOverviewMsg(null);
    try {
      const overviewChanged =
        guildName.trim() !== (activeGuild.name || '').trim() ||
        (systemChannelId || '') !== (activeGuild.system_channel_id || '') ||
        pendingIcon !== null ||
        pendingBanner !== null;

      if (overviewChanged) {
        const payload: {
          name?: string;
          system_channel_id?: string;
          clear_system_channel?: boolean;
          icon_url?: string;
          banner_url?: string;
        } = {
          name: guildName.trim(),
        };
        if (systemChannelId) {
          payload.system_channel_id = systemChannelId;
        } else {
          payload.clear_system_channel = true;
        }

        if (pendingIcon === 'remove') {
          payload.icon_url = '';
        } else if (pendingIcon && typeof pendingIcon === 'object') {
          setIsUploadingIcon(true);
          const res = await api.upload.guildIcon(pendingIcon.file);
          payload.icon_url = res.url;
          URL.revokeObjectURL(pendingIcon.previewUrl);
          setIsUploadingIcon(false);
        }

        if (pendingBanner === 'remove') {
          payload.banner_url = '';
        } else if (pendingBanner && typeof pendingBanner === 'object') {
          setIsUploadingBanner(true);
          const res = await api.upload.guildBanner(pendingBanner.file);
          payload.banner_url = res.url;
          URL.revokeObjectURL(pendingBanner.previewUrl);
          setIsUploadingBanner(false);
        }

        await updateGuild(activeGuild.id, payload);
        setPendingIcon(null);
        setPendingBanner(null);
      }

      if (hasRoleChanges) {
        const origRoles = activeGuild.roles || [];
        let positionsChanged = false;

        for (const dr of draftRoles) {
          const orig = origRoles.find((r) => r.id === dr.id);
          if (!orig) continue;
          const updates: Partial<Role> = {};
          if (dr.name !== orig.name) updates.name = dr.name;
          if ((dr.color || '') !== (orig.color || '')) updates.color = dr.color;
          if (Boolean(dr.hoist) !== Boolean(orig.hoist)) updates.hoist = Boolean(dr.hoist);
          if (Boolean(dr.mentionable) !== Boolean(orig.mentionable)) updates.mentionable = Boolean(dr.mentionable);
          if (Number(dr.permissions || 0) !== Number(orig.permissions || 0)) {
            updates.permissions = Number(dr.permissions || 0);
          }
          if (Number(dr.position || 0) !== Number(orig.position || 0)) {
            positionsChanged = true;
          }
          if (Object.keys(updates).length > 0) {
            await updateRole(activeGuild.id, dr.id, updates);
          }
        }

        if (positionsChanged) {
          const sortedDraft = [...draftRoles].sort((a, b) => a.position - b.position);
          await reorderRoles(
            activeGuild.id,
            sortedDraft.map((r, idx) => ({ id: r.id, position: idx }))
          );
        }
      }

      setOverviewMsg({ text: 'Alterações salvas com sucesso!', type: 'success' });
    } catch (err: any) {
      setOverviewMsg({ text: err.message || 'Erro ao salvar alterações', type: 'error' });
    } finally {
      setIsSavingOverview(false);
      setIsUploadingIcon(false);
      setIsUploadingBanner(false);
    }
  };

  // 1. Overview Actions
  const handleSaveOverview = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSaveAll();
  };

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    setCropType('guildIcon');
    setIsCropOpen(true);
    if (iconInputRef.current) iconInputRef.current.value = '';
  };

  const handleRemoveIcon = () => {
    setPendingIcon((prev) => {
      if (prev && typeof prev === 'object') URL.revokeObjectURL(prev.previewUrl);
      return 'remove';
    });
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    setCropType('guildBanner');
    setIsCropOpen(true);
    if (bannerInputRef.current) bannerInputRef.current.value = '';
  };

  const handleRemoveBanner = () => {
    setPendingBanner((prev) => {
      if (prev && typeof prev === 'object') URL.revokeObjectURL(prev.previewUrl);
      return 'remove';
    });
  };

  const handleCropConfirmed = (croppedFile: File) => {
    setIsCropOpen(false);
    const previewUrl = URL.createObjectURL(croppedFile);
    if (cropType === 'guildIcon') {
      setPendingIcon((prev) => {
        if (prev && typeof prev === 'object') URL.revokeObjectURL(prev.previewUrl);
        return { file: croppedFile, previewUrl };
      });
    } else {
      setPendingBanner((prev) => {
        if (prev && typeof prev === 'object') URL.revokeObjectURL(prev.previewUrl);
        return { file: croppedFile, previewUrl };
      });
    }
  };

  // 2. Roles Actions (staged locally until Save)
  const handleCreateRole = async () => {
    if (!canManageRoles) return;

    setIsCreatingRole(true);
    try {
      const everyoneRole = roles.find((r) => r.name === '@everyone');
      const everyonePermissions = Number(everyoneRole?.permissions ?? 0);
      const created = await createRole(activeGuild.id, 'Novo cargo', '#99AAB5', everyonePermissions, false, false);
      setDraftRoles((prev) => [...prev, created]);
      setSelectedRoleId(created.id);
    } catch (err) {
      console.error('Failed to create role:', err);
    } finally {
      setIsCreatingRole(false);
    }
  };

  const updateDraftRole = (roleId: string, patch: Partial<Role>) => {
    setDraftRoles((prev) => prev.map((r) => (r.id === roleId ? { ...r, ...patch } : r)));
  };

  const handleUpdateRoleColor = async (color: string) => {
    if (!selectedRole || !canManageRoles) return;
    updateDraftRole(selectedRole.id, { color });
  };

  const handleUpdateRoleName = async (name: string) => {
    if (!selectedRole || !name.trim() || !canManageRoles) return;
    updateDraftRole(selectedRole.id, { name });
  };

  const handleToggleRoleHoist = async () => {
    if (!selectedRole || !canManageRoles) return;
    updateDraftRole(selectedRole.id, { hoist: !Boolean(selectedRole.hoist) });
  };

  const handleToggleRoleMentionable = async () => {
    if (!selectedRole || !canManageRoles) return;
    updateDraftRole(selectedRole.id, { mentionable: !Boolean(selectedRole.mentionable) });
  };

  const handleMoveRoleHierarchy = async (roleId: string, direction: 'up' | 'down') => {
    if (!canManageRoles || isReorderingRoles) return;
    const sortedRoles = [...roles].sort((a, b) => a.position - b.position);
    const currentIndex = sortedRoles.findIndex((r) => r.id === roleId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sortedRoles.length) return;

    const temp = sortedRoles[currentIndex];
    sortedRoles[currentIndex] = sortedRoles[targetIndex];
    sortedRoles[targetIndex] = temp;
    setDraftRoles(sortedRoles.map((r, idx) => ({ ...r, position: idx })));
  };

  const handleReorderRoles = async (newOrderedRoles: Role[]) => {
    if (!canManageRoles || isReorderingRoles || !activeGuild) return;
    setDraftRoles(newOrderedRoles.map((r, idx) => ({ ...r, position: idx })));
  };

  const handleTogglePermission = async (flag: number) => {
    if (!selectedRole || !canManageRoles) return;

    const currentPermissions = Number(selectedRole.permissions || 0);
    const hasAdminPerm = (currentPermissions & Permissions.ADMINISTRATOR) !== 0;

    let newPermissions: number;

    if (flag === Permissions.ADMINISTRATOR) {
      newPermissions = hasAdminPerm
        ? currentPermissions & ~Permissions.ADMINISTRATOR
        : currentPermissions | Permissions.ADMINISTRATOR;
    } else {
      const hasFlag = (currentPermissions & flag) !== 0;
      newPermissions = hasFlag ? currentPermissions & ~flag : currentPermissions | flag;
    }

    updateDraftRole(selectedRole.id, { permissions: newPermissions });
  };

  const handleClearPermissions = async () => {
    if (!selectedRole || !canManageRoles || selectedRole.name === '@everyone') return;
    updateDraftRole(selectedRole.id, { permissions: 0 });
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!canManageRoles) return;
    const targetRole = roles.find((r) => r.id === roleId);
    if (targetRole?.name === '@everyone') {
      showAlert({
        title: 'Ação não permitida',
        message: 'O cargo @everyone é o cargo padrão do servidor e não pode ser excluído.',
        variant: 'warning',
      });
      return;
    }

    const ok = await showConfirm({
      title: 'Excluir cargo',
      message: 'Tem certeza que deseja excluir este cargo?',
      confirmText: 'Excluir',
      variant: 'danger',
    });
    if (ok) {
      try {
        await deleteRole(activeGuild.id, roleId);
        setDraftRoles((prev) => prev.filter((r) => r.id !== roleId));
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
      showAlert({
        title: 'Arquivo muito grande',
        message: 'A imagem do emoji deve ter no máximo 2MB.',
        variant: 'warning',
      });
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
    const ok = await showConfirm({
      title: 'Remover emoji',
      message: `Deseja remover o emoji :${name}:?`,
      confirmText: 'Remover',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.guilds.deleteEmoji(activeGuild.id, emojiId);
      setEmojisList((prev) => prev.filter((em) => em.id !== emojiId));
      useGuildStore.getState().handleEmojiDeleteEvent({ guild_id: activeGuild.id, id: emojiId });
    } catch (err: any) {
      showAlert({ title: 'Erro', message: err.message || 'Erro ao remover emoji', variant: 'danger' });
    }
  };

  // 4. Invites Actions
  const handleGenerateNewInvite = async () => {
    setIsCreatingInvite(true);
    try {
      const inv = await api.guilds.createInvite(activeGuild.id, true);
      setInvitesList((prev) => [inv, ...prev.filter((item) => item.code !== inv.code)]);
    } catch (err: any) {
      showAlert({ title: 'Erro', message: err.message || 'Erro ao gerar novo convite', variant: 'danger' });
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
    const ok = await showConfirm({
      title: 'Revogar convite',
      message: 'Deseja revogar e invalidar este link de convite?',
      confirmText: 'Revogar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.guilds.deleteInvite(activeGuild.id, code);
      setInvitesList((prev) => prev.filter((i) => i.code !== code));
    } catch (err: any) {
      showAlert({ title: 'Erro', message: err.message || 'Erro ao revogar convite', variant: 'danger' });
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
      showAlert({ title: 'Erro', message: err.message || 'Erro ao alterar status de silêncio', variant: 'danger' });
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
      showAlert({ title: 'Erro', message: err.message || 'Erro ao banir membro', variant: 'danger' });
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

    const requires2FA = Boolean(user?.two_factor_enabled) || is2FARequiredByServer;
    if (requires2FA && !twoFactorCode.trim()) {
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
      setIs2FARequiredByServer(false);
      onClose();
      useGuildStore.getState().handleGuildDeleteEvent(activeGuild.id);
    } catch (err: any) {
      console.error('Failed to delete guild:', err);
      const is2FA = err.requires_2fa || err.status === 428 || err.message?.includes('2fa_required') || err.message?.includes('Autenticação de dois fatores') || err.message?.includes('2FA');
      if (is2FA) {
        setIs2FARequiredByServer(true);
        useAuthStore.getState().setUser({ two_factor_enabled: true });
        setDeleteError('Autenticação 2FA necessária. Digite o código de 6 dígitos ou backup abaixo.');
      } else {
        setDeleteError(err.message || 'Erro ao excluir servidor');
      }
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="server-settings-title"
        className={`fixed inset-0 z-50 flex flex-col md:flex-row w-screen h-screen md:pt-8 bg-background-dark overflow-hidden text-gray-200 select-none ${reducedMotion ? '' : 'animate-in fade-in duration-150'}`}
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
                    aria-label="Fechar configurações do servidor"
                    title="Fechar"
                    className="-ml-1"
                  >
                    <X className="w-5 h-5" />
                  </ModalButton>
                  <h2 className={MODAL_DIALOG_TITLE_CLASS}>Configurações do Servidor</h2>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0 overscroll-contain touch-pan-y chat-scrollbar">
                {/* Server Mini Card */}
                <div
                  onClick={() => {
                    setActiveTab('overview');
                    setMobileView('content');
                  }}
                  className="p-3.5 bg-background-darker rounded-2xl border border-white/10 flex items-center justify-between cursor-pointer active:bg-white/5 transition-colors shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-background-darkest border border-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center text-white font-bold text-lg shadow">
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
                        <div className="text-sm font-semibold text-white">Perfil do servidor</div>
                        <div className="text-xs text-gray-400">Identidade visual, ícone, banner e boas-vindas</div>
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
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">Cargos</div>
                        <div className="text-xs text-gray-400">Hierarquia e permissões</div>
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
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">Emojis</div>
                        <div className="text-xs text-gray-400">Slots customizados</div>
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
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">Convites</div>
                        <div className="text-xs text-gray-400">Links de convite ativos</div>
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
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">Membros</div>
                        <div className="text-xs text-gray-400">Membros do servidor</div>
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
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">Auditoria</div>
                        <div className="text-xs text-gray-400">Histórico de ações e moderação</div>
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
                    <div className="bg-background-darker rounded-2xl border border-white/10 overflow-hidden divide-y divide-white/5">
                      <button
                        type="button"
                        onClick={() => setIsTransferModalOpen(true)}
                        className="w-full flex items-center justify-between p-3.5 text-left hover:bg-amber-500/10 active:bg-amber-500/20 text-amber-400 transition-colors cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">Transferir Posse</div>
                          <div className="text-xs text-amber-400/70">Passar controle para outro membro</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-amber-400/50 shrink-0" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsDeleteModalOpen(true)}
                        className="w-full flex items-center justify-between p-3.5 text-left hover:bg-red-500/10 active:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">Excluir Servidor</div>
                          <div className="text-xs text-red-400/70">Apagar permanentemente este servidor</div>
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
          <div className="hidden md:flex flex-1 max-w-[280px] lg:max-w-[320px] xl:max-w-[360px] 2xl:max-w-[400px] min-w-[220px] justify-end bg-background-darkest border-r border-white/10 shrink-0 overflow-y-auto chat-scrollbar">
            <div className="w-56 lg:w-60 flex flex-col p-4 py-6 xl:py-8 shrink-0 justify-between">
              <div className="flex flex-col items-stretch flex-1 flex-shrink-0">
                <div className="px-2.5 mb-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 truncate">
                    {activeGuild.name}
                  </h2>
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
                    <span>Perfil do servidor</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('roles')}
                    aria-current={activeTab === 'roles' ? 'page' : undefined}
                    className={`flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      activeTab === 'roles'
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    }`}
                  >
                    <span>Cargos</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('emojis')}
                    aria-current={activeTab === 'emojis' ? 'page' : undefined}
                    className={`flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      activeTab === 'emojis'
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    }`}
                  >
                    <span>Emojis</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('invites')}
                    aria-current={activeTab === 'invites' ? 'page' : undefined}
                    className={`flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      activeTab === 'invites'
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    }`}
                  >
                    <span>Convites</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('members')}
                    aria-current={activeTab === 'members' ? 'page' : undefined}
                    className={`flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      activeTab === 'members'
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    }`}
                  >
                    <span>Membros</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('audit_log')}
                    aria-current={activeTab === 'audit_log' ? 'page' : undefined}
                    className={`flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      activeTab === 'audit_log'
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    }`}
                  >
                    <span>Auditoria</span>
                  </button>
                </nav>
              </div>

              {isOwner && (
                <div className="pt-2 border-t border-white/10 flex flex-col gap-0.5 flex-shrink-0 mt-auto">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2.5 my-1">
                    Ações do Dono
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsTransferModalOpen(true)}
                    className="flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium text-amber-400 hover:bg-amber-500/10 transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <span>Transferir Posse</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(true)}
                    className="flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <span>Excluir Servidor</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* MAIN CONTENT AREA */}
          <div className={`${mobileView === 'content' ? 'flex' : 'hidden md:flex'} flex-1 flex-col overflow-hidden bg-background-dark relative min-w-0 min-h-0`}>
            
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
                {activeTab === 'overview' && 'Perfil do servidor'}
                {activeTab === 'roles' && 'Cargos'}
                {activeTab === 'emojis' && 'Emojis'}
                {activeTab === 'invites' && 'Convites'}
                {activeTab === 'members' && 'Membros'}
                {activeTab === 'audit_log' && 'Auditoria'}
              </h2>
              <ModalButton
                type="tertiary"
                shape="circle"
                size="small"
                svgOnly
                onClick={attemptClose}
                aria-label="Fechar configurações do servidor"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </ModalButton>
            </div>

            {/* Desktop Top Header */}
            <div className="hidden md:flex items-center justify-between px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-24 py-3 sm:py-5 border-b border-white/10 shrink-0 bg-background-darker/40">
              <div>
                <h1 id="server-settings-title" className={`${MODAL_TITLE_CLASS} flex items-center gap-2`}>
                  {activeTab === 'overview' && 'Perfil do servidor'}
                  {activeTab === 'roles' && 'Gerenciamento de Cargos e Hierarquia'}
                  {activeTab === 'emojis' && 'Emojis Customizados do Servidor'}
                  {activeTab === 'invites' && 'Links de Convite Ativos'}
                  {activeTab === 'members' && 'Membros do Servidor e Moderação'}
                  {activeTab === 'audit_log' && 'Registro de Auditoria'}
                </h1>
                <p className={`${MODAL_DESCRIPTION_CLASS} mt-0.5`}>
                  {activeTab === 'overview' && 'Personalize a identidade visual, canal do sistema e veja estatísticas'}
                  {activeTab === 'roles' && 'Defina permissões, ordem na hierarquia e exibição de membros'}
                  {activeTab === 'emojis' && 'Adicione até 50 emojis exclusivos para membros usarem no chat'}
                  {activeTab === 'invites' && 'Monitore quem criou cada link, contagem de usos e revogue convites'}
                  {activeTab === 'members' && 'Busque membros rapidamente, gerencie cargos, silenciamentos e expulsões'}
                  {activeTab === 'audit_log' && 'Histórico completo de alterações e ações de moderação'}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {activeTab === 'members' && (
                  <DropdownSelect
                    className="w-48 sm:w-60"
                    value={selectedRoleFilter}
                    onChange={(val) => setSelectedRoleFilter(String(val))}
                    options={[
                      { value: 'all', label: `Todos os Cargos (${members.length})` },
                      ...roles.map((r) => ({
                        value: r.id,
                        label: r.name,
                        icon: <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color || '#99aab5' }} />,
                      })),
                    ]}
                    placeholder={`Todos os Cargos (${members.length})`}
                  />
                )}

                {activeTab === 'invites' && (
                  <ModalButton
                    type="primary"
                    onClick={handleGenerateNewInvite}
                    loading={isCreatingInvite}
                    prefix={<Plus className="w-4 h-4" />}
                  >
                    {isCreatingInvite ? 'Gerando...' : 'Gerar Novo Link'}
                  </ModalButton>
                )}

                {activeTab === 'emojis' && (
                  <ModalButton
                    type="primary"
                    onClick={() => emojiInputRef.current?.click()}
                    disabled={!isOwner && !hasAdmin && !canManageGuild}
                    loading={isUploadingEmoji}
                    prefix={<Upload className="w-4 h-4" />}
                  >
                    {isUploadingEmoji ? 'Carregando...' : 'Carregar Emoji'}
                  </ModalButton>
                )}

                {activeTab === 'audit_log' && (
                  <div className="flex items-center gap-2">
                    <DropdownSelect
                      className="w-48 sm:w-56"
                      prefixIcon={<Filter className="w-3.5 h-3.5" />}
                      value={auditFilter}
                      onChange={(val) => setAuditFilter(String(val))}
                      options={ACTION_FILTERS.map((f) => ({
                        value: f.value,
                        label: f.label,
                      }))}
                      placeholder="Filtrar ações..."
                    />

                    <ModalButton
                      type="secondary"
                      size="small"
                      svgOnly
                      onClick={() => setAuditRefreshTrigger((prev) => prev + 1)}
                      disabled={isAuditLoading}
                      aria-label="Recarregar registro de auditoria"
                      title="Recarregar"
                    >
                      <RefreshCw className={`w-4 h-4 ${isAuditLoading ? 'animate-spin text-brand-400' : ''}`} />
                    </ModalButton>
                  </div>
                )}

                <ModalButton
                  type="tertiary"
                  shape="circle"
                  size="small"
                  svgOnly
                  onClick={attemptClose}
                  aria-label="Fechar configurações do servidor"
                  title="Fechar Configurações (ESC)"
                >
                  <X className="w-5 h-5" />
                </ModalButton>
              </div>
            </div>

            {/* TAB CONTENTS */}
            <div className="flex-1 overflow-y-auto py-0 px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-24 chat-scrollbar overscroll-contain touch-pan-y min-h-0">
              {activeTab === 'overview' && (
                <ServerProfile
                  activeGuild={activeGuild}
                  isOwner={isOwner}
                  canManageGuild={canManageGuild}
                  hasAdmin={hasAdmin}
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
                  previewIconUrl={
                    pendingIcon === 'remove'
                      ? ''
                      : pendingIcon && typeof pendingIcon === 'object'
                      ? pendingIcon.previewUrl
                      : undefined
                  }
                  previewBannerUrl={
                    pendingBanner === 'remove'
                      ? ''
                      : pendingBanner && typeof pendingBanner === 'object'
                      ? pendingBanner.previewUrl
                      : undefined
                  }
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
                  isCreatingRole={isCreatingRole}
                  isReorderingRoles={isReorderingRoles}
                  handleMoveRoleHierarchy={handleMoveRoleHierarchy}
                  handleReorderRoles={handleReorderRoles}
                  handleCreateRole={handleCreateRole}
                  handleDeleteRole={handleDeleteRole}
                  handleUpdateRoleName={handleUpdateRoleName}
                  handleUpdateRoleColor={handleUpdateRoleColor}
                  handleToggleRoleHoist={handleToggleRoleHoist}
                  handleToggleRoleMentionable={handleToggleRoleMentionable}
                  handleTogglePermission={handleTogglePermission}
                  handleClearPermissions={handleClearPermissions}
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
                  hasAdmin={hasAdmin}
                  canManageGuild={canManageGuild}
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
                  handleToggleMemberRole={handleToggleMemberRole}
                  setMuteModalUser={setMuteModalUser}
                  setBanModalUser={setBanModalUser}
                  kickMember={kickMember}
                  isOwner={isOwner}
                />
              )}

              {activeTab === 'audit_log' && (
                <div className="animate-fade-in">
                  <ServerAuditLogView
                    guildId={activeGuild.id}
                    selectedFilter={auditFilter}
                    setSelectedFilter={setAuditFilter}
                    refreshTrigger={auditRefreshTrigger}
                    onLoadingChange={setIsAuditLoading}
                  />
                </div>
              )}
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
          setIs2FARequiredByServer(false);
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
        is2FARequired={is2FARequiredByServer}
      />
      <UnsavedChangesBar
        show={hasUnsavedChanges}
        isShaking={isShaking}
        isSaving={isSavingOverview}
        error={overviewMsg?.type === 'error' ? overviewMsg.text : null}
        onSave={handleSaveAll}
        onRevert={handleRevert}
      />
    </>
  );
};
