import React, { useState } from 'react';
import {
  EyeOff,
  Radio,
  Tv,
  BellOff,
  VolumeX,
  Shield,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { useStreamerModeStore, censorUsername } from '../../../stores/streamerModeStore';

export const StreamerModeTab: React.FC = () => {
  const {
    enabled,
    autoDetect,
    censorUsernames,
    hidePersonalData,
    hideInviteLinks,
    disableSounds,
    disableNotifications,
    customProcesses,
    runningStreamApps,
    setEnabled,
    setAutoDetect,
    setCensorUsernames,
    setHidePersonalData,
    setHideInviteLinks,
    setDisableSounds,
    setDisableNotifications,
    addCustomProcess,
    removeCustomProcess,
    dismissForSession,
  } = useStreamerModeStore();

  const [newProcInput, setNewProcInput] = useState('');

  const handleAddProcess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProcInput.trim()) return;
    addCustomProcess(newProcInput.trim());
    setNewProcInput('');
  };

  const hasRunningApps = runningStreamApps.length > 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* -------------------------------------------------------------
          1. HEADER / STATUS CARD
      ------------------------------------------------------------- */}
      <div
        className={`p-5 sm:p-6 rounded-2xl border transition-all ${
          enabled
            ? 'bg-indigo-950/40 border-indigo-500/40 shadow-lg shadow-indigo-900/20'
            : 'bg-white/5 border-white/10'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                enabled ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30' : 'bg-white/10 text-gray-400'
              }`}
            >
              <EyeOff className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white">Modo Streamer</h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    enabled
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                      : 'bg-white/10 text-gray-400'
                  }`}
                >
                  {enabled ? 'Ativo' : 'Desativado'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-400 mt-0.5 leading-relaxed">
                {enabled
                  ? 'Suas informações sensíveis, nomes de usuários e alertas sonoros estão protegidos contra vazamento na transmissão.'
                  : 'Proteja seus dados, nomes de amigos e alertas ao compartilhar tela ou transmitir ao vivo.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (enabled) {
                dismissForSession();
              } else {
                setEnabled(true);
              }
            }}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-2 flex-shrink-0 ${
              enabled
                ? 'bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30'
            }`}
          >
            {enabled ? 'Desativar Modo Streamer' : 'Ativar Modo Streamer'}
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------
          2. GENERAL & AUTOMATION CONTROLS
      ------------------------------------------------------------- */}
      <div className="space-y-4">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Automação & Detecção
        </h4>

        {/* Toggle: Auto-detect */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Tv className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-semibold text-white">
                Ativar automaticamente ao detectar softwares de streaming
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              O ZeroVC detecta a abertura do OBS Studio, Streamlabs, XSplit, Twitch Studio ou vMix e liga o modo
              streamer sozinho. Ao fechar os programas, ele se desliga automaticamente.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={autoDetect}
            onClick={() => setAutoDetect(!autoDetect)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              autoDetect ? 'bg-indigo-600' : 'bg-white/15'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                autoDetect ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Live App Detection Indicator (Only shown when autoDetect is on) */}
        {autoDetect && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between transition-colors ${
              hasRunningApps
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                : 'bg-white/[0.03] border-white/5 text-gray-400'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  hasRunningApps ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'
                }`}
              />
              <span>
                {hasRunningApps
                  ? `Software detectado em execução: ${runningStreamApps.join(', ')}`
                  : 'Nenhum software de streaming em execução no momento.'}
              </span>
            </div>

            {hasRunningApps && (
              <span className="text-[11px] font-mono bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-200 border border-emerald-500/30">
                Monitorando
              </span>
            )}
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------
          3. CUSTOM PROCESSES (PORTABLES / RENAMED EXECUTABLES)
      ------------------------------------------------------------- */}
      <div className="space-y-4">
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Processos Personalizados (Portables & Customizados)
          </h4>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            Se você usa uma versão portable ou executável renomeado do OBS/software de live, adicione o nome do
            processo abaixo (sem diferenciar maiúsculas de minúsculas).
          </p>
        </div>

        <form onSubmit={handleAddProcess} className="flex gap-2">
          <input
            type="text"
            value={newProcInput}
            onChange={(e) => setNewProcInput(e.target.value)}
            placeholder="Ex: obs-portable.exe ou custom_stream.exe"
            className="flex-1 px-3.5 py-2 rounded-xl bg-background-darkest border border-white/10 text-white placeholder-gray-500 text-xs sm:text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!newProcInput.trim()}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs sm:text-sm transition-colors flex items-center gap-1.5 cursor-pointer flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar</span>
          </button>
        </form>

        {/* Custom Processes List */}
        {customProcesses.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {customProcesses.map((proc) => (
              <div
                key={proc}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-200"
              >
                <span className="font-mono text-indigo-300">{proc}</span>
                <button
                  onClick={() => removeCustomProcess(proc)}
                  className="text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                  title="Remover processo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------
          4. PRIVACY PROTECTIONS (GRANULAR)
      ------------------------------------------------------------- */}
      <div className="space-y-4">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Proteções de Privacidade
        </h4>

        {/* Censurar Nomes de Usuários (3 letras + ...) */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-semibold text-white">
                Censurar nomes de usuários (primeiras 3 letras)
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Exibe apenas as 3 primeiras letras de todos os usuários seguidas de reticências no chat, listas de
              membros e canais de voz (Ex: Thiago vira{' '}
              <span className="font-mono text-indigo-300 font-bold">{censorUsername('Thiago')}</span>).
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={censorUsernames}
            onClick={() => setCensorUsernames(!censorUsernames)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              censorUsernames ? 'bg-indigo-600' : 'bg-white/15'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                censorUsernames ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Ocultar Informações Pessoais */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 gap-4">
          <div className="space-y-1">
            <span className="text-sm font-semibold text-white block">
              Ocultar informações pessoais
            </span>
            <p className="text-xs text-gray-400 leading-relaxed">
              Mascara seu endereço de e-mail, IDs de conta e detalhes de rede nas abas de configurações.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={hidePersonalData}
            onClick={() => setHidePersonalData(!hidePersonalData)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              hidePersonalData ? 'bg-indigo-600' : 'bg-white/15'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                hidePersonalData ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Ocultar Links de Convite */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 gap-4">
          <div className="space-y-1">
            <span className="text-sm font-semibold text-white block">
              Ocultar links de convite de servidores
            </span>
            <p className="text-xs text-gray-400 leading-relaxed">
              Converte URLs e códigos de convites em bolinhas na tela (zerovc.gg/••••••••) para evitar invasões na sua live.
              O botão de copiar continua funcionando normalmente.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={hideInviteLinks}
            onClick={() => setHideInviteLinks(!hideInviteLinks)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              hideInviteLinks ? 'bg-indigo-600' : 'bg-white/15'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                hideInviteLinks ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------
          5. SOUNDS & NOTIFICATIONS
      ------------------------------------------------------------- */}
      <div className="space-y-4">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Sons e Notificações
        </h4>

        {/* Desativar Notificações na Área de Trabalho */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BellOff className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-semibold text-white">
                Desativar notificações na área de trabalho
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Bloqueia alertas e popups nativos do Windows/desktop para evitar que prévias de conversas privadas apareçam na sua transmissão.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={disableNotifications}
            onClick={() => setDisableNotifications(!disableNotifications)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              disableNotifications ? 'bg-indigo-600' : 'bg-white/15'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                disableNotifications ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Silenciar Efeitos Sonoros */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <VolumeX className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-semibold text-white">
                Silenciar efeitos sonoros do ZeroVC
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Muta sons de novas mensagens, alertas de entrada e saída de pessoas nos canais de voz e pings.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={disableSounds}
            onClick={() => setDisableSounds(!disableSounds)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              disableSounds ? 'bg-indigo-600' : 'bg-white/15'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                disableSounds ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
};
