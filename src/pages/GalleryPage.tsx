import React, { useEffect, useMemo, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, ImagePlus, Lock, Star, Tag, Trash2, Unlock, X } from 'lucide-react';
import { ChipGroup, EmptyState, Modal, PageHeader, PlayerAvatar, ghostBtn, inputClass, playerLabel, primaryBtn } from '../components/ui';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';
import type { Pelada, PhotoItem, Player } from '../types/domain';
import { fileToCompressedDataUrl } from '../utils/mediaAssets';
import { formatDateBR } from '../utils/statsEngine';

type Filter = 'all' | 'mine' | 'tagged';

/** Seletor de jogadores para marcar numa foto. */
const TagPicker: React.FC<{ players: Player[]; value: string[]; onChange: (ids: string[]) => void }> = ({
  players,
  value,
  onChange,
}) => (
  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
    {players.map((p) => {
      const on = value.includes(p.id);
      return (
        <button
          key={p.id}
          type="button"
          onClick={() => onChange(on ? value.filter((id) => id !== p.id) : [...value, p.id])}
          className={`inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-[11px] font-semibold border transition cursor-pointer ${
            on ? 'bg-lime-400/15 border-lime-400/50 text-lime-300' : 'bg-[#1B1F1B] border-white/10 text-slate-300'
          }`}
        >
          <PlayerAvatar player={p} size={18} />
          {playerLabel(p)}
        </button>
      );
    })}
  </div>
);

export const GalleryPage: React.FC = () => {
  const { user, isAdmin, snapshot, selectedPelada, activePelada, runAction, busyAction, pushToast, openPlayerProfile } = useBaba();

  const [album, setAlbum] = useState<string>('ALL');
  const [filter, setFilter] = useState<Filter>('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadPeladaId, setUploadPeladaId] = useState('');
  const [caption, setCaption] = useState('');
  const [preview, setPreview] = useState('');
  const [official, setOfficial] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [editingTags, setEditingTags] = useState<string[] | null>(null);

  const photos = useMemo(() => {
    if (!snapshot || !user) return [];
    return snapshot.photos.filter((ph) => {
      if (album !== 'ALL' && ph.peladaId !== album) return false;
      if (filter === 'mine' && ph.uploadedByUserId !== user.id) return false;
      if (filter === 'tagged' && !(ph.taggedPlayerIds || []).includes(user.playerId)) return false;
      return true;
    });
  }, [snapshot, user, album, filter]);

  // Navegação por teclado na tela cheia
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === 'ArrowLeft') setLightbox((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, photos.length]);

  if (!snapshot || !user) return null;

  const peladaMap = new Map(snapshot.peladas.map((p) => [p.id, p]));
  const playerMap = new Map(snapshot.players.map((p) => [p.id, p]));
  const focusPelada = album !== 'ALL' ? peladaMap.get(album) : selectedPelada || activePelada;
  const uploadablePeladas = snapshot.peladas.filter((p) => isAdmin || p.allowPlayerUploads);
  const canUpload = uploadablePeladas.length > 0;

  // Agrupa por pelada (data) para o feed
  const groups: { pelada?: Pelada; items: { photo: PhotoItem; index: number }[] }[] = [];
  photos.forEach((photo, index) => {
    const last = groups[groups.length - 1];
    if (last && last.pelada?.id === photo.peladaId) last.items.push({ photo, index });
    else groups.push({ pelada: peladaMap.get(photo.peladaId), items: [{ photo, index }] });
  });
  groups.sort((a, b) => (b.pelada?.date || '').localeCompare(a.pelada?.date || ''));

  const openUpload = () => {
    const target = focusPelada && (isAdmin || focusPelada.allowPlayerUploads) ? focusPelada : uploadablePeladas[0];
    setUploadPeladaId(target?.id || '');
    setCaption('');
    setPreview('');
    setOfficial(false);
    setTags([]);
    setUploadOpen(true);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return pushToast('Selecione um arquivo de imagem', undefined, 'error');
    try {
      setPreview(await fileToCompressedDataUrl(file, 1080, 0.78));
    } catch (err: any) {
      pushToast('Imagem inválida', err?.message, 'error');
    }
  };

  const submitUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview || !uploadPeladaId) return;
    const res = await runAction(
      () => babaService.uploadPhoto({ peladaId: uploadPeladaId, url: preview, caption, isOfficial: official, taggedPlayerIds: tags }),
      'Foto publicada!'
    );
    if (res) setUploadOpen(false);
  };

  const active = lightbox !== null ? photos[lightbox] : undefined;
  const canManage = (ph: PhotoItem) => isAdmin || ph.uploadedByUserId === user.id;
  const uploadPelada = peladaMap.get(uploadPeladaId);
  const taggablePlayers = (p?: Pelada) => {
    const ids = p && p.presentPlayerIds.length ? new Set(p.presentPlayerIds) : null;
    return snapshot.players.filter((pl) => (ids ? ids.has(pl.id) : pl.active));
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Momentos da Pelada"
        subtitle={`${snapshot.photos.length} foto(s) no mural`}
        actions={
          <>
            {isAdmin && focusPelada && (
              <button
                disabled={busyAction}
                onClick={() =>
                  runAction(
                    () => babaService.updatePelada(focusPelada.id, { allowPlayerUploads: !focusPelada.allowPlayerUploads }),
                    focusPelada.allowPlayerUploads ? 'Envio restrito ao admin' : 'Atletas liberados para enviar fotos'
                  )
                }
                className={ghostBtn}
                title={`${focusPelada.title}: ${focusPelada.allowPlayerUploads ? 'atletas podem enviar' : 'apenas admin envia'}`}
              >
                {focusPelada.allowPlayerUploads ? <Unlock className="w-4 h-4 text-lime-400" /> : <Lock className="w-4 h-4 text-rose-400" />}
              </button>
            )}
            {canUpload && (
              <button onClick={openUpload} className={primaryBtn}>
                <ImagePlus className="w-4 h-4" /> Enviar foto
              </button>
            )}
          </>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <ChipGroup
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: 'Todas' },
            { id: 'tagged', label: 'Em que estou' },
            { id: 'mine', label: 'Enviadas por mim' },
          ]}
        />
        {snapshot.peladas.length > 1 && (
          <select
            value={album}
            onChange={(e) => setAlbum(e.target.value)}
            className="sm:ml-auto px-3 py-2 rounded-xl bg-[#131613] border border-white/10 text-xs font-bold text-white cursor-pointer"
            aria-label="Filtrar por pelada"
          >
            <option value="ALL">Todas as peladas</option>
            {snapshot.peladas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} — {p.date.split('-').reverse().join('/')}
              </option>
            ))}
          </select>
        )}
      </div>

      {photos.length === 0 ? (
        <EmptyState icon={<Camera className="w-9 h-9" />} title="Nenhuma foto por aqui" text="Publique a foto oficial da resenha ou do time campeão." />
      ) : (
        groups.map((g) => (
          <section key={g.pelada?.id ?? g.items[0].photo.id} className="space-y-2.5">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-base font-bold uppercase tracking-wide text-white">{g.pelada?.title ?? 'Pelada'}</h2>
              <span className="text-[11px] text-slate-500">{g.pelada ? formatDateBR(g.pelada.date) : ''}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {g.items.map(({ photo: ph, index }) => (
                <button
                  key={ph.id}
                  onClick={() => setLightbox(index)}
                  className="relative group aspect-square rounded-2xl overflow-hidden bg-[#1B1F1B] border border-white/[0.06] cursor-pointer"
                >
                  <img src={ph.url} alt={ph.caption} loading="lazy" className="w-full h-full object-cover transition duration-300 group-hover:scale-105" />
                  {ph.isOfficial && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-lime-400 text-slate-950 text-[10px] font-bold uppercase tracking-wide">Oficial</span>
                  )}
                  {(ph.taggedPlayerIds?.length ?? 0) > 0 && (
                    <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/60 text-[10px] text-white">
                      <Tag className="w-3 h-3" /> {ph.taggedPlayerIds!.length}
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent text-left">
                    <p className="text-xs font-semibold text-white truncate">{ph.caption}</p>
                    <p className="text-[10px] text-slate-300 truncate">por {ph.uploadedByName}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      {/* UPLOAD */}
      {uploadOpen && (
        <Modal title="Enviar foto" onClose={() => setUploadOpen(false)}>
          <form onSubmit={submitUpload} className="p-5 space-y-4">
            <select value={uploadPeladaId} onChange={(e) => { setUploadPeladaId(e.target.value); setTags([]); }} className={inputClass} aria-label="Pelada">
              {uploadablePeladas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.date.split('-').reverse().join('/')})
                </option>
              ))}
            </select>
            <label className="block w-full p-4 rounded-2xl border-2 border-dashed border-white/15 hover:border-lime-400/50 bg-[#1B1F1B] text-center cursor-pointer transition">
              {preview ? (
                <img src={preview} alt="Prévia" className="max-h-56 mx-auto rounded-xl object-contain" />
              ) : (
                <div className="space-y-1.5 py-4">
                  <ImagePlus className="w-7 h-7 text-lime-400 mx-auto" />
                  <div className="text-xs font-bold text-white">Escolher foto do aparelho</div>
                </div>
              )}
              <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
            </label>
            <input maxLength={140} placeholder="Legenda (opcional)" value={caption} onChange={(e) => setCaption(e.target.value)} className={inputClass} />
            <div className="space-y-1.5">
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> Marcar jogadores ({tags.length})
              </div>
              <TagPicker players={taggablePlayers(uploadPelada)} value={tags} onChange={setTags} />
            </div>
            {isAdmin && (
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input type="checkbox" checked={official} onChange={(e) => setOfficial(e.target.checked)} className="accent-lime-400" />
                Destacar como foto oficial da pelada
              </label>
            )}
            <button type="submit" disabled={busyAction || !preview} className={`${primaryBtn} w-full`}>
              {busyAction ? 'Enviando...' : 'Publicar foto'}
            </button>
          </form>
        </Modal>
      )}

      {/* TELA CHEIA */}
      {active && lightbox !== null && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col p-3 sm:p-6 animate-fade-in" role="dialog" aria-modal="true">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400 truncate">
              {peladaMap.get(active.peladaId)?.title || 'Pelada'} • {active.date.split('-').reverse().join('/')}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {canManage(active) && (
                <button onClick={() => setEditingTags(active.taggedPlayerIds || [])} className="p-2 rounded-xl bg-white/10 text-slate-200 cursor-pointer" title="Marcar jogadores">
                  <Tag className="w-4 h-4" />
                </button>
              )}
              {isAdmin && !active.isOfficial && (
                <button
                  disabled={busyAction}
                  onClick={() => runAction(() => babaService.setOfficialPhoto(active.id), 'Marcada como foto oficial!')}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-lime-400 text-slate-950 text-xs font-extrabold cursor-pointer"
                >
                  <Star className="w-3.5 h-3.5" /> Oficial
                </button>
              )}
              {canManage(active) && (
                <button
                  disabled={busyAction}
                  onClick={async () => {
                    if (!window.confirm('Excluir esta foto?')) return;
                    const res = await runAction(() => babaService.deletePhoto(active.id), 'Foto excluída');
                    if (res) setLightbox(null);
                  }}
                  className="p-2 rounded-xl bg-rose-500/20 text-rose-300 cursor-pointer"
                  title="Excluir"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setLightbox(null)} className="p-2 rounded-xl bg-white/10 text-white cursor-pointer" aria-label="Fechar">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="relative flex-1 flex items-center justify-center my-3 min-h-0">
            {photos.length > 1 && (
              <button onClick={() => setLightbox((lightbox - 1 + photos.length) % photos.length)} className="absolute left-0 sm:left-2 p-2.5 rounded-full bg-black/60 text-white cursor-pointer z-10" aria-label="Anterior">
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <img src={active.url} alt={active.caption} className="max-w-full max-h-full object-contain rounded-xl" />
            {photos.length > 1 && (
              <button onClick={() => setLightbox((lightbox + 1) % photos.length)} className="absolute right-0 sm:right-2 p-2.5 rounded-full bg-black/60 text-white cursor-pointer z-10" aria-label="Próxima">
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="text-center space-y-2">
            <p className="text-sm font-bold text-white">{active.caption}</p>
            <p className="text-xs text-slate-500">Por {active.uploadedByName}</p>
            {(active.taggedPlayerIds?.length ?? 0) > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {active.taggedPlayerIds!.map((id) => playerMap.get(id)).filter(Boolean).map((p) => (
                  <button
                    key={p!.id}
                    onClick={() => {
                      setLightbox(null);
                      openPlayerProfile(p!.id);
                    }}
                    className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-white/10 text-[11px] text-white cursor-pointer hover:bg-white/15"
                  >
                    <PlayerAvatar player={p} size={18} /> {playerLabel(p)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {editingTags && active && (
        <Modal title="Marcar jogadores na foto" onClose={() => setEditingTags(null)}>
          <div className="p-5 space-y-4">
            <TagPicker players={taggablePlayers(peladaMap.get(active.peladaId))} value={editingTags} onChange={setEditingTags} />
            <button
              disabled={busyAction}
              onClick={async () => {
                const res = await runAction(() => babaService.updatePhoto(active.id, { taggedPlayerIds: editingTags }), 'Marcações salvas!');
                if (res) setEditingTags(null);
              }}
              className={`${primaryBtn} w-full`}
            >
              Salvar marcações
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default GalleryPage;
