import React, { useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Lock,
  Star,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';
import type { PhotoItem } from '../types/domain';
import { fileToCompressedDataUrl } from '../utils/mediaAssets';
import { formatShortDateBR } from '../utils/statsEngine';

export const GalleryPage: React.FC = () => {
  const { user, isAdmin, snapshot, selectedPelada, activePelada, runAction, busyAction } =
    useBaba();

  const [albumFilter, setAlbumFilter] = useState<string>('ALL');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadPeladaId, setUploadPeladaId] = useState('');
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadPreview, setUploadPreview] = useState('');
  const [uploadOfficial, setUploadOfficial] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!snapshot || !user) return null;

  const peladaMap = new Map(snapshot.peladas.map((p) => [p.id, p]));
  const focusPelada =
    albumFilter !== 'ALL'
      ? peladaMap.get(albumFilter)
      : selectedPelada || activePelada || snapshot.peladas[0];

  const filteredPhotos: PhotoItem[] =
    albumFilter === 'ALL'
      ? snapshot.photos
      : snapshot.photos.filter((ph) => ph.peladaId === albumFilter);

  const canUpload = isAdmin || Boolean(focusPelada?.allowPlayerUploads);

  const handleOpenUpload = () => {
    setUploadPeladaId(focusPelada?.id || snapshot.peladas[0]?.id || '');
    setUploadCaption('');
    setUploadPreview('');
    setUploadOfficial(false);
    setShowUploadModal(true);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await fileToCompressedDataUrl(file, 1080, 0.78);
    setUploadPreview(compressed);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadPreview || !uploadPeladaId) return;
    await runAction(
      () =>
        babaService.uploadPhoto(user, {
          peladaId: uploadPeladaId,
          url: uploadPreview,
          caption: uploadCaption.trim() || 'Momento da Pelada',
          isOfficial: uploadOfficial,
        }),
      'Foto publicada! 📸'
    );
    setShowUploadModal(false);
  };

  const activePhoto = lightboxIndex !== null ? filteredPhotos[lightboxIndex] : undefined;

  return (
    <div className="space-y-5">
      {/* CABEÇALHO LIMPO */}
      <div className="p-4 sm:p-5 rounded-3xl bg-[#11161F] border border-white/[0.08] flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-white">Fotos da Pelada</h1>
          <p className="text-xs text-slate-400 mt-0.5">{snapshot.photos.length} foto(s) no mural</p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && focusPelada && (
            <button
              onClick={() =>
                runAction(
                  () =>
                    babaService.updatePelada(user, focusPelada.id, {
                      allowPlayerUploads: !focusPelada.allowPlayerUploads,
                    }),
                  focusPelada.allowPlayerUploads
                    ? 'Envio restrito ao Admin'
                    : 'Atletas liberados para enviar fotos'
                )
              }
              title={
                focusPelada.allowPlayerUploads
                  ? 'Atletas podem enviar fotos'
                  : 'Apenas Admin envia fotos'
              }
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer"
            >
              {focusPelada.allowPlayerUploads ? (
                <Unlock className="w-4 h-4 text-lime-400" />
              ) : (
                <Lock className="w-4 h-4 text-rose-400" />
              )}
            </button>
          )}

          {canUpload && snapshot.peladas.length > 0 && (
            <button
              onClick={handleOpenUpload}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-xs cursor-pointer"
            >
              <ImagePlus className="w-4 h-4" />
              Enviar Foto
            </button>
          )}
        </div>
      </div>

      {/* FILTRO DE ÁLBUM (SÓ APARECE QUANDO HÁ MAIS DE 1 PELADA) */}
      {snapshot.peladas.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setAlbumFilter('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer ${
              albumFilter === 'ALL'
                ? 'bg-lime-400 text-slate-950'
                : 'bg-[#11161F] text-slate-300 border border-white/10'
            }`}
          >
            Todas
          </button>
          {snapshot.peladas.map((p) => (
            <button
              key={p.id}
              onClick={() => setAlbumFilter(p.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer ${
                albumFilter === p.id
                  ? 'bg-lime-400 text-slate-950'
                  : 'bg-[#11161F] text-slate-300 border border-white/10'
              }`}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}

      {/* GRADE DE FOTOS */}
      {filteredPhotos.length === 0 ? (
        <div className="p-12 rounded-3xl bg-[#11161F] border border-white/[0.08] text-center space-y-2">
          <Camera className="w-9 h-9 text-slate-600 mx-auto" />
          <div className="text-sm font-bold text-white">Nenhuma foto enviada ainda</div>
          <p className="text-xs text-slate-400">
            Publique a foto oficial da resenha ou do time campeão de sábado.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filteredPhotos.map((ph, idx) => (
            <button
              key={ph.id}
              onClick={() => setLightboxIndex(idx)}
              className="group relative aspect-[4/3] rounded-2xl overflow-hidden bg-[#11161F] border border-white/10 text-left cursor-pointer"
            >
              <img
                src={ph.url}
                alt={ph.caption}
                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
              />
              {ph.isOfficial && (
                <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-lime-400 text-slate-950 text-[10px] font-extrabold">
                  ★ Oficial
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent">
                <p className="text-xs font-semibold text-white truncate">{ph.caption}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* MODAL DE UPLOAD */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#121720] border border-white/10 overflow-hidden shadow-2xl animate-fade-in">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Enviar Foto</h2>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="p-5 space-y-4">
              {snapshot.peladas.length > 1 && (
                <select
                  value={uploadPeladaId}
                  onChange={(e) => setUploadPeladaId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F15] border border-white/10 text-sm text-white"
                >
                  {snapshot.peladas
                    .filter((p) => isAdmin || p.allowPlayerUploads)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({formatShortDateBR(p.date)})
                      </option>
                    ))}
                </select>
              )}

              <label className="block w-full p-5 rounded-2xl border-2 border-dashed border-white/15 hover:border-lime-400/50 bg-[#0B0F15] text-center cursor-pointer transition">
                {uploadPreview ? (
                  <img
                    src={uploadPreview}
                    alt="Prévia"
                    className="max-h-48 mx-auto rounded-xl object-contain"
                  />
                ) : (
                  <div className="space-y-1.5 py-3">
                    <ImagePlus className="w-7 h-7 text-lime-400 mx-auto" />
                    <div className="text-xs font-bold text-white">Escolher foto do aparelho</div>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  required={!uploadPreview}
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>

              <input
                type="text"
                placeholder="Legenda (opcional)"
                value={uploadCaption}
                onChange={(e) => setUploadCaption(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F15] border border-white/10 text-sm text-white focus:outline-none focus:border-lime-400"
              />

              {isAdmin && (
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={uploadOfficial}
                    onChange={(e) => setUploadOfficial(e.target.checked)}
                    className="accent-lime-400 w-4 h-4"
                  />
                  Destacar como Foto Oficial da Rodada
                </label>
              )}

              <button
                type="submit"
                disabled={busyAction || !uploadPreview}
                className="w-full py-2.5 rounded-2xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-sm cursor-pointer disabled:opacity-50"
              >
                {busyAction ? 'Enviando...' : 'Publicar Foto'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* LIGHTBOX TELA CHEIA */}
      {activePhoto && lightboxIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {peladaMap.get(activePhoto.peladaId)?.title || 'Pelada'} •{' '}
              {formatShortDateBR(activePhoto.date)}
            </span>
            <div className="flex items-center gap-2">
              {isAdmin && !activePhoto.isOfficial && (
                <button
                  onClick={() =>
                    runAction(
                      () => babaService.setOfficialPhoto(user, activePhoto.id),
                      'Marcada como Foto Oficial!'
                    )
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-lime-400 hover:text-slate-950 text-xs font-bold text-white cursor-pointer"
                >
                  <Star className="w-3.5 h-3.5" /> Oficial
                </button>
              )}
              {(isAdmin || activePhoto.uploadedByUserId === user.id) && (
                <button
                  onClick={async () => {
                    if (window.confirm('Excluir esta foto?')) {
                      await runAction(
                        () => babaService.deletePhoto(user, activePhoto.id),
                        'Foto excluída'
                      );
                      setLightboxIndex(null);
                    }
                  }}
                  className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/30 text-rose-300 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setLightboxIndex(null)}
                className="p-2 rounded-xl bg-white/10 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="relative flex-1 flex items-center justify-center my-3 min-h-0">
            {filteredPhotos.length > 1 && (
              <button
                onClick={() =>
                  setLightboxIndex(
                    (lightboxIndex - 1 + filteredPhotos.length) % filteredPhotos.length
                  )
                }
                className="absolute left-1 p-2.5 rounded-xl bg-black/60 text-white border border-white/10 cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <img
              src={activePhoto.url}
              alt={activePhoto.caption}
              className="max-h-[75vh] max-w-full rounded-2xl object-contain"
            />
            {filteredPhotos.length > 1 && (
              <button
                onClick={() => setLightboxIndex((lightboxIndex + 1) % filteredPhotos.length)}
                className="absolute right-1 p-2.5 rounded-xl bg-black/60 text-white border border-white/10 cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="text-center space-y-0.5">
            <p className="text-sm font-bold text-white">{activePhoto.caption}</p>
            <p className="text-xs text-slate-500">Por {activePhoto.uploadedByName}</p>
          </div>
        </div>
      )}
    </div>
  );
};
