import React, { useState } from 'react';
import { api } from '../../lib/api';
import { useGuildStore } from '../../stores/guildStore';
import {
  AppModal,
  AppModalHeader,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';
import { AppInput } from '@/components/ui/app-input';
import { InlineAlert } from '@/components/ui/inline-alert';

interface JoinServerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const JoinServerModal: React.FC<JoinServerModalProps> = ({ isOpen, onClose }) => {
  const [inputCode, setInputCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { fetchGuilds, selectGuild } = useGuildStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Extract 10-char hash if full url was pasted
    let cleanCode = inputCode.trim();
    if (cleanCode.includes('/invite/')) {
      cleanCode = cleanCode.split('/invite/').pop()?.trim() || cleanCode;
    }
    cleanCode = cleanCode.replace(/[^a-zA-Z0-9]/g, '');

    if (cleanCode.length !== 10) {
      setError('O código de convite deve conter exatamente 10 caracteres.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.invites.join(cleanCode);
      await fetchGuilds();
      if (res.guild_id) {
        await selectGuild(res.guild_id);
      }
      setInputCode('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Convite inválido ou expirado.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppModal isOpen={isOpen} onClose={onClose} titleId="join-server-modal-title">
      <AppModalHeader
        title="Entrar em um servidor"
        titleId="join-server-modal-title"
        onClose={onClose}
        className="text-center"
      />

      <AppModalBody onSubmit={handleSubmit}>
        {error && <InlineAlert variant="error">{error}</InlineAlert>}

        <AppInput
          label="Link ou código de convite (10 caracteres)"
          type="text"
          required
          value={inputCode}
          onChange={(e) => setInputCode(e.target.value)}
          placeholder="Ex: aB9xK2mP8q ou http://.../invite/aB9xK2mP8q"
          className="font-mono"
        />

        <AppModalFooter
          align="between"
          onCancel={onClose}
          confirmText={isLoading ? 'Entrando...' : 'Entrar no servidor'}
          confirmType="primary"
          confirmHtmlType="submit"
          loading={isLoading}
          disabled={!inputCode.trim()}
        />
      </AppModalBody>
    </AppModal>
  );
};
