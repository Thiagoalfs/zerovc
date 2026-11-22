import React, { useState, useEffect } from 'react';
import { Hash, Volume2, Lock } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { SquishSwitch } from '../ui/squish-switch';
import {
  AppModal,
  AppModalHeader,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';
import { AppInput } from '@/components/ui/app-input';
import { InlineAlert } from '@/components/ui/inline-alert';
import {
  MODAL_TOGGLE_HEADER_CLASS,
  MODAL_FIELD_LABEL_CLASS,
  MODAL_SECTION_HEADER_CLASS,
  MODAL_DESCRIPTION_CLASS,
} from '../../constants/modalTypography';

interface CreateChannelModalProps {
  isOpen: boolean;
  initialType?: 'text' | 'voice';
  initialCategoryId?: string;
  onClose: () => void;
}

export const CreateChannelModal: React.FC<CreateChannelModalProps> = ({
  isOpen,
  initialType = 'text',
  initialCategoryId,
  onClose,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<'text' | 'voice'>(initialType);
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { activeGuild, createChannel } = useGuildStore();

  useEffect(() => {
    if (isOpen) {
      setType(initialType);
      setName('');
      setIsPrivate(false);
      setSelectedRoleIds([]);
      setError('');
    }
  }, [isOpen, initialType]);

  if (!isOpen || !activeGuild) return null;

  const roles = activeGuild.roles || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    setError('');
    try {
      const formattedName = name.trim().toLowerCase().replace(/\s+/g, '-');

      await createChannel(
        activeGuild.id,
        formattedName,
        type,
        undefined,
        initialCategoryId,
        isPrivate,
        !isPrivate ? undefined : selectedRoleIds
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar canal');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      titleId="create-channel-modal-title"
    >
      <AppModalHeader
        title="Criar Canal"
        subtitle={`em ${activeGuild.name}`}
        titleId="create-channel-modal-title"
        onClose={onClose}
      />

      <AppModalBody onSubmit={handleSubmit}>
          {error && <InlineAlert variant="error">{error}</InlineAlert>}

          {/* Type Selector */}
          <div>
            <label className={MODAL_FIELD_LABEL_CLASS}>
              Tipo do Canal
            </label>
            <div className="space-y-1">
              {/* Text Option */}
              <div
                onClick={() => setType('text')}
                className="flex items-center gap-3 py-2 px-1 cursor-pointer transition-colors group select-none"
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                  type === 'text'
                    ? 'border-brand-500'
                    : 'border-gray-500 group-hover:border-gray-400'
                }`}>
                  <div className={`w-2.5 h-2.5 rounded-full bg-brand-500 transition-transform ${
                    type === 'text' ? 'scale-100' : 'scale-0'
                  }`} />
                </div>
                <Hash className={`w-5 h-5 flex-shrink-0 transition-colors ${type === 'text' ? 'text-white' : 'text-gray-400'}`} />
                <span className={`${MODAL_TOGGLE_HEADER_CLASS} transition-colors ${type === 'text' ? 'text-white' : 'text-gray-300 group-hover:text-gray-100'}`}>
                  Canal de Texto
                </span>
              </div>

              {/* Voice Option */}
              <div
                onClick={() => setType('voice')}
                className="flex items-center gap-3 py-2 px-1 cursor-pointer transition-colors group select-none"
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                  type === 'voice'
                    ? 'border-brand-500'
                    : 'border-gray-500 group-hover:border-gray-400'
                }`}>
                  <div className={`w-2.5 h-2.5 rounded-full bg-brand-500 transition-transform ${
                    type === 'voice' ? 'scale-100' : 'scale-0'
                  }`} />
                </div>
                <Volume2 className={`w-5 h-5 flex-shrink-0 transition-colors ${type === 'voice' ? 'text-white' : 'text-gray-400'}`} />
                <span className={`${MODAL_TOGGLE_HEADER_CLASS} transition-colors ${type === 'voice' ? 'text-white' : 'text-gray-300 group-hover:text-gray-100'}`}>
                  Canal de Voz
                </span>
              </div>
            </div>
          </div>

          {/* Name Field */}
          <AppInput
            label="Nome do Canal"
            leftIcon={type === 'text' ? <span className="text-sm leading-none">#</span> : <Volume2 className="w-4 h-4" />}
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === 'text' ? 'novo-canal' : 'novo-canal-de-voz'}
          />

          {/* Private Channel Toggle */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-brand-400" />
                <div>
                  <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>Canal Privado</span>
                  <span className={MODAL_DESCRIPTION_CLASS}>Apenas cargos selecionados podem ver este canal</span>
                </div>
              </div>

              <SquishSwitch
                size="sm"
                checked={isPrivate}
                onCheckedChange={setIsPrivate}
                className={isPrivate ? 'bg-brand-500' : 'bg-gray-700'}
              />
            </div>

            {/* Roles Multi-select when Private */}
            {isPrivate && roles.length > 0 && (
              <div className="space-y-1.5 p-3 rounded-xl bg-background-darkest/70 border border-white/5 animate-in fade-in">
                <span className={MODAL_SECTION_HEADER_CLASS + " block"}>
                  Quem pode acessar este canal?
                </span>
                <div className="max-h-32 overflow-y-auto space-y-1 pr-1 no-scrollbar">
                  {roles.map((role) => {
                    const isSelected = selectedRoleIds.includes(role.id);
                    return (
                      <div
                        key={role.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedRoleIds(selectedRoleIds.filter((id) => id !== role.id));
                          } else {
                            setSelectedRoleIds([...selectedRoleIds, role.id]);
                          }
                        }}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-brand-500/20 text-white border border-brand-500/30'
                            : 'text-gray-400 hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: role.color }} />
                          <span className="truncate">{role.name}</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="rounded border-gray-600 text-brand-500 focus:ring-0 pointer-events-none cursor-pointer"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <AppModalFooter
            onCancel={onClose}
            confirmText={isLoading ? 'Criando...' : 'Criar Canal'}
            confirmHtmlType="submit"
            loading={isLoading}
            disabled={!name.trim()}
          />
        </AppModalBody>
      </AppModal>
  );
};
