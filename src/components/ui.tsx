/**
 * Componentes visuais compartilhados do FutebolB3 (tema escuro + verde-limão).
 */
import React from 'react';
import { ChevronRight, X } from 'lucide-react';
import { SKILL_MAX, type Player, type Season } from '../types/domain';
import { formatMonthKey, type PeriodFilter } from '../utils/statsEngine';

export const cardClass = 'rounded-3xl bg-[#131613] border border-white/[0.08]';
export const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl bg-[#1B1F1B] border border-white/10 text-sm text-white focus:outline-none focus:border-lime-400 transition';
export const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-xs sm:text-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
export const ghostBtn =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

export const PageHeader: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, subtitle, actions }) => (
  <div className="pt-1 pb-3 border-b border-white/[0.08] flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0">
      <h1 className="text-2xl sm:text-3xl text-white">{title}</h1>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: React.ReactNode }[];
}) {
  return (
    <div
      className="grid gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="tablist"
    >
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`py-2 px-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition cursor-pointer truncate ${
            value === o.id ? 'bg-lime-400 text-slate-950' : 'text-slate-400 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ChipGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: React.ReactNode }[];
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition cursor-pointer ${
            value === o.id
              ? 'bg-lime-400/15 text-lime-400 border border-lime-400/40'
              : 'bg-[#131613] text-slate-400 border border-white/[0.06] hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  tone?: 'white' | 'lime' | 'emerald' | 'rose' | 'yellow' | 'sky' | 'slate';
  hint?: string;
}> = ({ label, value, tone = 'white', hint }) => {
  const color = {
    white: 'text-white',
    lime: 'text-lime-400',
    emerald: 'text-emerald-400',
    rose: 'text-rose-400',
    yellow: 'text-yellow-400',
    sky: 'text-sky-400',
    slate: 'text-slate-300',
  }[tone];
  return (
    <div className="p-3 rounded-xl bg-[#1B1F1B] border border-white/5 text-center" title={hint}>
      <div className={`font-display font-bold text-2xl leading-none ${color}`}>{value}</div>
      <div className="text-[11px] text-slate-400 mt-1">{label}</div>
    </div>
  );
};

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode }> = ({
  icon,
  title,
  text,
  action,
}) => (
  <div className={`${cardClass} p-10 text-center space-y-2.5`}>
    {icon && <div className="flex justify-center text-slate-600">{icon}</div>}
    <div className="text-sm font-bold text-white">{title}</div>
    {text && <p className="text-xs text-slate-400 max-w-sm mx-auto">{text}</p>}
    {action && <div className="pt-1">{action}</div>}
  </div>
);

export const PlayerAvatar: React.FC<{ player?: Player; size?: number; className?: string }> = ({
  player,
  size = 32,
  className = '',
}) => (
  <img
    src={player?.photoUrl}
    alt={player ? player.nickname || player.name : ''}
    width={size}
    height={size}
    loading="lazy"
    className={`rounded-full object-cover shrink-0 bg-[#1B1F1B] ${className}`}
    style={{ width: size, height: size }}
  />
);

/** Selo curto de goleiro, no lugar do emoji de luva. */
export const GkTag: React.FC = () => (
  <span
    className="inline-flex items-center px-1 h-4 rounded border border-sky-400/40 text-[9px] font-bold tracking-wide text-sky-300 shrink-0"
    title="Goleiro"
  >
    GOL
  </span>
);

/** Posição na tabela: 1º ouro, 2º prata, 3º bronze; o resto em cinza. */
export const PosMark: React.FC<{ pos: number }> = ({ pos }) => (
  <span
    className={`font-display font-bold text-lg tabular-nums ${
      pos === 1 ? 'text-yellow-300' : pos === 2 ? 'text-slate-200' : pos === 3 ? 'text-orange-300' : 'text-slate-500'
    }`}
  >
    {pos}º
  </span>
);

export const playerLabel = (p?: Player) => (p ? p.nickname || p.name : 'Jogador removido');

/**
 * Cores por nível num só tom de verde (cor do escudo): o nível 1 (melhor) é o
 * verde mais claro e cada nível seguinte fica mais forte, até o 6 (mais fraco).
 */
const LEVEL_HEX: Record<number, { bg: string; fg: string }> = {
  // 1 e 2 em verde-cana (amarelado), clareando para o melhor nível
  1: { bg: '#DCF08C', fg: '#0B1A07' },
  2: { bg: '#B8DC3E', fg: '#0B1A07' },
  3: { bg: '#7FDD62', fg: '#0B1A07' },
  4: { bg: '#4CBF2C', fg: '#0B1A07' },
  5: { bg: '#2E8A17', fg: '#FFFFFF' },
  6: { bg: '#185409', fg: '#FFFFFF' },
};
const levelStyle = (level: number): React.CSSProperties | undefined =>
  LEVEL_HEX[level] ? { backgroundColor: LEVEL_HEX[level].bg, color: LEVEL_HEX[level].fg } : undefined;

/** Selo do nível técnico (1 = melhor, 6 = mais fraco). */
export const LevelBadge: React.FC<{ level: number; compact?: boolean }> = ({ level, compact }) => (
  <span
    className={`${compact ? 'w-4 h-4 text-[9px] rounded' : 'px-1.5 h-5 text-[10px] rounded-md'} inline-flex items-center justify-center font-black ${
      LEVEL_HEX[level] ? '' : 'bg-white/10 text-slate-300'
    }`}
    style={levelStyle(level)}
    title={`Nível ${level} (1 = melhor, ${SKILL_MAX} = mais fraco)`}
  >
    {compact ? level : `N${level}`}
  </span>
);

/**
 * Nível técnico de 1 (melhor) a 6 (mais fraco).
 * Com onChange vira seletor numerado; sem onChange mostra o selo do nível.
 */
export const SkillMeter: React.FC<{
  value: number;
  onChange?: (v: number) => void;
  /** 'lg': botões grandes que ocupam a largura toda (bom para o dedo no celular). */
  size?: 'sm' | 'md' | 'lg';
}> = ({ value, onChange, size = 'sm' }) => {
  if (!onChange) return <LevelBadge level={value} />;
  const box = size === 'sm' ? 'w-6 h-6 text-[10px]' : size === 'md' ? 'w-8 h-8 text-xs' : 'w-full h-11 text-base';
  return (
    <div
      className={size === 'lg' ? 'grid grid-cols-6 gap-1.5 w-full' : 'inline-flex items-center gap-1'}
      role="radiogroup"
      aria-label="Nível técnico (1 = melhor)"
    >
      {Array.from({ length: SKILL_MAX }, (_, i) => {
        const level = i + 1;
        const selected = level === value;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(level)}
            title={level === 1 ? 'Nível 1 — melhor' : level === SKILL_MAX ? `Nível ${level} — mais fraco` : `Nível ${level}`}
            className={`${box} rounded-lg flex items-center justify-center font-extrabold transition cursor-pointer ${
              selected ? (size === 'lg' ? 'shadow ring-2 ring-white/30' : 'scale-110 shadow') : 'bg-white/[0.07] text-slate-400 hover:text-white'
            }`}
            style={selected ? levelStyle(level) : undefined}
          >
            {level}
          </button>
        );
      })}
    </div>
  );
};

export const Modal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}> = ({ title, onClose, children, wide }) => (
  <div
    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 sm:p-4"
    onClick={onClose}
  >
    <div
      className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#141714] border border-white/10 shadow-2xl animate-fade-in`}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
        <h2 className="text-base font-bold uppercase tracking-wide text-white">{title}</h2>
        <button
          onClick={onClose}
          className="-mr-1.5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer transition"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="overflow-y-auto">{children}</div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Filtro de período (todas / temporada / mês / pelada)
// ---------------------------------------------------------------------------

export function periodKey(f: PeriodFilter): string {
  switch (f.kind) {
    case 'all':
      return 'all';
    case 'pelada':
      return `pelada:${f.peladaId}`;
    case 'month':
      return `month:${f.month}`;
    case 'season':
      return `season:${f.seasonId}`;
  }
}

export function parsePeriodKey(key: string): PeriodFilter {
  const [kind, id] = key.split(':');
  if (kind === 'pelada' && id) return { kind: 'pelada', peladaId: id };
  if (kind === 'month' && id) return { kind: 'month', month: id };
  if (kind === 'season' && id) return { kind: 'season', seasonId: id };
  return { kind: 'all' };
}

export const PeriodSelect: React.FC<{
  value: PeriodFilter;
  onChange: (f: PeriodFilter) => void;
  seasons: Season[];
  months: string[];
  peladas?: { id: string; title: string; date: string }[];
}> = ({ value, onChange, seasons, months, peladas }) => (
  <select
    value={periodKey(value)}
    onChange={(e) => onChange(parsePeriodKey(e.target.value))}
    className="px-3 py-2 rounded-xl bg-[#131613] border border-white/10 text-xs font-bold text-white focus:outline-none focus:border-lime-400 cursor-pointer max-w-full"
    aria-label="Período"
  >
    <option value="all">Todo o histórico</option>
    {seasons.length > 0 && (
      <optgroup label="Temporadas">
        {seasons.map((s) => (
          <option key={s.id} value={`season:${s.id}`}>
            {s.name}
            {s.status === 'active' ? ' (atual)' : ''}
          </option>
        ))}
      </optgroup>
    )}
    {months.length > 0 && (
      <optgroup label="Meses">
        {months.map((m) => (
          <option key={m} value={`month:${m}`}>
            {formatMonthKey(m)}
          </option>
        ))}
      </optgroup>
    )}
    {peladas && peladas.length > 0 && (
      <optgroup label="Peladas">
        {peladas.map((p) => (
          <option key={p.id} value={`pelada:${p.id}`}>
            {p.title} — {p.date.split('-').reverse().join('/')}
          </option>
        ))}
      </optgroup>
    )}
  </select>
);

// ---------------------------------------------------------------------------
// Estrutura "sessões" (cartões com ícone, chips e placar)
// ---------------------------------------------------------------------------

export type TileTone = 'lime' | 'orange' | 'emerald' | 'rose' | 'sky' | 'yellow' | 'slate';

const TILE_TONES: Record<TileTone, string> = {
  lime: 'text-lime-400',
  orange: 'text-orange-400',
  emerald: 'text-emerald-400',
  rose: 'text-rose-400',
  sky: 'text-sky-400',
  yellow: 'text-yellow-300',
  slate: 'text-slate-300',
};

export const IconTile: React.FC<{ icon: React.ElementType; tone?: TileTone; size?: 'sm' | 'md' }> = ({
  icon: Icon,
  tone = 'lime',
  size = 'md',
}) => (
  <div
    className={`${size === 'md' ? 'w-10 h-10 rounded-xl' : 'w-8 h-8 rounded-lg'} flex items-center justify-center shrink-0 bg-white/[0.05] border border-white/[0.06] ${TILE_TONES[tone]}`}
  >
    <Icon className={size === 'md' ? 'w-5 h-5' : 'w-4 h-4'} />
  </div>
);

export const InfoChip: React.FC<{ icon?: React.ElementType; children: React.ReactNode; tone?: 'default' | 'lime' }> = ({
  icon: Icon,
  children,
  tone = 'default',
}) => (
  <span
    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap ${
      tone === 'lime' ? 'bg-lime-400/15 text-lime-300' : 'bg-white/[0.06] text-slate-300'
    }`}
  >
    {Icon && <Icon className="w-3.5 h-3.5 opacity-80" />}
    {children}
  </span>
);

/** Placar em caixinhas: [3] : [1] */
export const ScoreBox: React.FC<{ home: number; away: number }> = ({ home, away }) => (
  <div className="flex items-center gap-1 shrink-0 font-display font-bold text-base text-white">
    <span className="w-7 h-7 rounded-lg bg-white/[0.07] border border-white/10 flex items-center justify-center">{home}</span>
    <span className="text-slate-500">:</span>
    <span className="w-7 h-7 rounded-lg bg-white/[0.07] border border-white/10 flex items-center justify-center">{away}</span>
  </div>
);

export const SessionCard: React.FC<{
  icon: React.ElementType;
  tone?: TileTone;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  chips?: React.ReactNode;
  onClick?: () => void;
  actions?: React.ReactNode;
}> = ({ icon, tone, title, subtitle, right, chips, onClick, actions }) => {
  const body = (
    <>
      <div className="flex items-start gap-3">
        <IconTile icon={icon} tone={tone} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white truncate">{title}</div>
          {subtitle && <div className="text-[11px] text-slate-400 mt-0.5 truncate">{subtitle}</div>}
        </div>
        {right}
      </div>
      {(chips || onClick || actions) && (
        <div className="flex items-center justify-between gap-2 mt-3">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">{chips}</div>
          <div className="flex items-center gap-1 shrink-0">
            {actions}
            {onClick && (
              <ChevronRight className="w-4 h-4 text-slate-500" aria-hidden />
            )}
          </div>
        </div>
      )}
    </>
  );
  const cls = 'w-full text-left rounded-2xl bg-[#131613] border border-white/[0.07] p-3.5 transition';
  return onClick ? (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
      className={`${cls} hover:border-lime-400/30 hover:bg-[#1A1A1A] cursor-pointer`}
    >
      {body}
    </div>
  ) : (
    <div className={cls}>{body}</div>
  );
};

/** Anel de progresso (ex.: 75% confirmados). */
export const RingProgress: React.FC<{ value: number; size?: number; label?: string }> = ({ value, size = 34, label }) => {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={label ?? `${v}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#52CC33"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-extrabold text-white">{v}%</span>
    </div>
  );
};

/** Seletor em pílula (Overall / Technical / Physical). */
export function PillTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: React.ReactNode }[];
}) {
  return (
    <div className="flex p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]" role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
            value === o.id ? 'bg-lime-400 text-slate-950' : 'text-slate-400 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Período do dia a partir do horário "HH:mm". */
export function dayPeriod(time?: string): string {
  const h = Number((time || '').split(':')[0]);
  if (!Number.isFinite(h)) return '';
  if (h < 12) return 'Manhã';
  if (h < 18) return 'Tarde';
  return 'Noite';
}

// ---------------------------------------------------------------------------
// Marca FutebolB3
// ---------------------------------------------------------------------------

/** Escudo oficial do baba. */
export const BrandLogo: React.FC<{ size?: number; className?: string }> = ({ size = 40, className = '' }) => (
  <img
    src={size > 128 ? '/brand/icon-512.png' : '/brand/logo-256.png'}
    alt="FutebolB3"
    width={size}
    height={size}
    className={`shrink-0 object-contain mix-blend-screen ${className}`}
    style={{ width: size, height: size }}
  />
);

/** Nome no estilo do logo: "Futebol" prateado + "B3" verde-neon, itálico e pesado. */
export const BrandWordmark: React.FC<{ className?: string }> = ({ className = 'text-base' }) => (
  <span className={`font-display font-bold uppercase tracking-wide leading-none ${className}`}>
    <span className="text-chrome">Futebol</span>
    <span className="text-neon">B3</span>
  </span>
);
