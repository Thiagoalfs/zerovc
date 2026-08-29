import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Check, X, MessageSquare, Trash2, Menu } from 'lucide-react';
import { useFriendStore } from '../../stores/friendStore';
import { useDMStore } from '../../stores/dmStore';
import { formatAssetUrl } from '../../lib/api';
import { DMRoom } from '../../types';

interface FriendsViewProps {
  onOpenMobileDrawer?: () => void;
  onOpenDM?: (userId: string, room?: DMRoom) => void;
}

export const FriendsView: React.FC<FriendsViewProps> = ({ onOpenMobileDrawer, onOpenDM }) => {
  const [activeTab, setActiveTab] = useState<'online' | 'all' | 'pending' | 'add'>('online');
  const [usernameInput, setUsernameInput] = useState('');
  const [requestStatus, setRequestStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { friends, pending, incoming, fetchFriends, sendRequest, acceptRequest, removeFriend } = useFriendStore();
  const { openDMWithUser } = useDMStore();

  useEffect(() => {
    fetchFriends();
  }, []);

  const handleStartDM = async (userId: string) => {
    try {
      const room = await openDMWithUser(userId);
      if (onOpenDM) onOpenDM(userId, room);
    } catch (err) {
      console.error('Failed to open DM:', err);
    }
  };

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;

    setIsSubmitting(true);
    setRequestStatus(null);

    try {
      await sendRequest(usernameInput.trim());
      setRequestStatus({ type: 'success', message: `Pedido de amizade enviado com sucesso para ${usernameInput.trim()}!` });
      setUsernameInput('');
    } catch (err: any) {
      setRequestStatus({ type: 'error', message: err.message || 'Erro ao enviar pedido.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onlineFriends = friends.filter((f) => {
    const friendUser = f.friend || f.user;
    return friendUser?.status !== 'offline';
  });

  const totalPending = pending.length + incoming.length;

  return (
    <div className="flex-1 bg-background-dark flex flex-col h-full overflow-hidden select-none">
      {/* Top Header with Responsive Scrolling Tabs */}
      <div className="h-12 border-b border-black/20 px-3 md:px-6 flex items-center gap-3 md:gap-6 shadow-sm z-10 overflow-x-auto no-scrollbar">
        {onOpenMobileDrawer && (
          <button
            onClick={onOpenMobileDrawer}
            className="md:hidden text-gray-400 hover:text-white p-1 -ml-1 rounded hover:bg-white/10 transition-colors flex-shrink-0"
            title="Menu de Servidores"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center gap-2 text-gray-200 font-bold pr-3 border-r border-white/10 flex-shrink-0">
          <Users className="w-5 h-5 text-gray-400" />
          <span className="hidden sm:inline">Amigos</span>
        </div>

        <div className="flex items-center gap-2 text-xs md:text-sm flex-shrink-0">
          <button
            onClick={() => setActiveTab('online')}
            className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors ${
              activeTab === 'online' ? 'bg-background-light text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            Disponível ({onlineFriends.length})
          </button>

          <button
            onClick={() => setActiveTab('all')}
            className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors ${
              activeTab === 'all' ? 'bg-background-light text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            Todos ({friends.length})
          </button>

          <button
            onClick={() => setActiveTab('pending')}
            className={`relative px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors ${
              activeTab === 'pending' ? 'bg-background-light text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <span>Pendentes</span>
            {totalPending > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-dnd text-white rounded-full">
                {totalPending}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('add')}
            className={`px-2.5 py-1 rounded-md font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'add' ? 'bg-online/20 text-online' : 'bg-online text-white hover:bg-online/90'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Adicionar</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* ADD FRIEND TAB */}
        {activeTab === 'add' && (
          <div className="max-w-xl space-y-4 md:space-y-6">
            <div>
              <h2 className="text-base md:text-lg font-bold text-white uppercase tracking-wide">ADICIONAR AMIGO</h2>
              <p className="text-xs text-gray-400 mt-1">
                Você pode adicionar amigos usando o nome de usuário deles no ZeroVC.
              </p>
            </div>

            <form onSubmit={handleSendRequest} className="relative">
              <div className="flex flex-col sm:flex-row gap-2 bg-background-darkest rounded-xl p-2 sm:pl-4 border border-white/10 focus-within:border-brand-500 transition-colors">
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="Nome de usuário (Ex: timotei)"
                  className="flex-1 bg-transparent text-white text-sm px-2 sm:px-0 py-1.5 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !usernameInput.trim()}
                  className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors flex-shrink-0"
                >
                  {isSubmitting ? 'Enviando...' : 'Enviar Pedido'}
                </button>
              </div>

              {requestStatus && (
                <div
                  className={`mt-3 text-xs font-medium ${
                    requestStatus.type === 'success' ? 'text-online' : 'text-dnd'
                  }`}
                >
                  {requestStatus.message}
                </div>
              )}
            </form>
          </div>
        )}

        {/* PENDING TAB */}
        {activeTab === 'pending' && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                PEDIDOS RECEBIDOS — {incoming.length}
              </h3>
              {incoming.length === 0 ? (
                <div className="text-xs text-gray-500 italic py-2">Nenhum pedido de amizade pendente para aceitar.</div>
              ) : (
                <div className="space-y-2">
                  {incoming.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-background-darker/60 hover:bg-background-darker border border-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-3 truncate">
                        <div className="w-9 h-9 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                          {req.user?.avatar_url ? (
                            <img src={formatAssetUrl(req.user.avatar_url)} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            <span>{req.user?.display_name?.[0]?.toUpperCase() || req.user?.username?.[0]?.toUpperCase()}</span>
                          )}
                        </div>
                        <div className="truncate">
                          <span className="font-semibold text-white text-sm truncate block">
                            {req.user?.display_name || req.user?.username}
                          </span>
                          <span className="block text-[11px] text-gray-400">@{req.user?.username}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => acceptRequest(req.id)}
                          className="w-8 h-8 rounded-full bg-background-light hover:bg-online hover:text-white text-gray-300 flex items-center justify-center transition-colors"
                          title="Aceitar Pedido"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => removeFriend(req.id)}
                          className="w-8 h-8 rounded-full bg-background-light hover:bg-dnd hover:text-white text-gray-300 flex items-center justify-center transition-colors"
                          title="Recusar Pedido"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                PEDIDOS ENVIADOS — {pending.length}
              </h3>
              {pending.length === 0 ? (
                <div className="text-xs text-gray-500 italic py-2">Nenhum pedido de amizade enviado pendente.</div>
              ) : (
                <div className="space-y-2">
                  {pending.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-background-darker/60 hover:bg-background-darker border border-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-3 truncate">
                        <div className="w-9 h-9 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                          {req.friend?.avatar_url ? (
                            <img src={formatAssetUrl(req.friend.avatar_url)} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            <span>{req.friend?.display_name?.[0]?.toUpperCase() || req.friend?.username?.[0]?.toUpperCase()}</span>
                          )}
                        </div>
                        <div className="truncate">
                          <span className="font-semibold text-white text-sm truncate block">
                            {req.friend?.display_name || req.friend?.username}
                          </span>
                          <span className="block text-[11px] text-gray-400">@{req.friend?.username}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => removeFriend(req.id)}
                        className="w-8 h-8 rounded-full bg-background-light hover:bg-dnd hover:text-white text-gray-300 flex items-center justify-center transition-colors flex-shrink-0"
                        title="Cancelar Pedido"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ONLINE / ALL FRIENDS TAB */}
        {(activeTab === 'online' || activeTab === 'all') && (
          <div className="max-w-3xl space-y-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              {activeTab === 'online' ? `DISPONÍVEIS — ${onlineFriends.length}` : `TODOS OS AMIGOS — ${friends.length}`}
            </h3>

            {(activeTab === 'online' ? onlineFriends : friends).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <Users className="w-14 h-14 md:w-16 md:h-16 stroke-1 mb-2 text-gray-600" />
                <span className="text-sm font-medium">Ninguém por aqui no momento.</span>
                <button
                  onClick={() => setActiveTab('add')}
                  className="mt-3 text-xs bg-brand-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-brand-600 transition-colors"
                >
                  Adicionar Amigos
                </button>
              </div>
            ) : (
              (activeTab === 'online' ? onlineFriends : friends).map((f) => {
                const target = f.friend?.id ? f.friend : f.user;
                return (
                  <div
                    key={f.id}
                    onClick={() => target?.id && handleStartDM(target.id)}
                    className="flex items-center justify-between p-2.5 md:p-3 px-3 md:px-4 rounded-2xl hover:bg-background-darker border border-transparent hover:border-white/5 transition-all group cursor-pointer active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3 truncate">
                      <div className="relative w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                        {target?.avatar_url ? (
                          <img src={formatAssetUrl(target.avatar_url)} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <span>{target?.display_name?.[0]?.toUpperCase() || target?.username?.[0]?.toUpperCase()}</span>
                        )}
                        <div
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background-dark ${
                            target?.status === 'online'
                              ? 'bg-online'
                              : target?.status === 'idle'
                              ? 'bg-idle'
                              : target?.status === 'dnd'
                              ? 'bg-dnd'
                              : 'bg-offline'
                          }`}
                        />
                      </div>

                      <div className="truncate">
                        <span className="font-semibold text-white text-sm block truncate group-hover:text-brand-400 transition-colors">
                          {target?.display_name || target?.username}
                        </span>
                        <span className="block text-xs text-gray-400">
                          {target?.custom_status || (target?.status ? target.status : 'Offline')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (target?.id) handleStartDM(target.id);
                        }}
                        className="w-10 h-10 rounded-full bg-background-light hover:bg-brand-500 text-gray-300 hover:text-white flex items-center justify-center transition-colors shadow-sm"
                        title="Enviar Mensagem Direta"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFriend(f.id);
                        }}
                        className="w-10 h-10 rounded-full bg-background-light hover:bg-dnd text-gray-400 hover:text-white flex items-center justify-center transition-colors opacity-80 md:opacity-0 md:group-hover:opacity-100"
                        title="Remover Amigo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
