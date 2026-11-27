/**
 * Partida ao vivo (cronômetro) — fica só no aparelho do admin.
 *
 * O estado é salvo no localStorage a cada mudança, então o cronômetro continua
 * certo mesmo se a tela apagar, o app for fechado ou a página recarregar:
 * o tempo é calculado pela hora de início, não por contagem de "ticks".
 */

/** A partida acaba quando uma linha chega a este número de gols... */
export const GOALS_TO_WIN = 2;
/** ...ou quando o tempo (em minutos) acaba — o que vier primeiro. */
export const DURATION_OPTIONS = [5, 7, 8, 10, 12, 15];
const DEFAULT_MINUTES = 10;

export type EndReason = 'time' | 'goals' | 'manual';

export interface LiveMatchState {
  matchId: string;
  homeLineId: string;
  awayLineId: string;
  homeGoals: number;
  awayGoals: number;
  durationMin: number;
  /** Momento (ms) em que o cronômetro voltou a correr; null = pausado/encerrado. */
  runningSince: number | null;
  /** Tempo já corrido antes do trecho atual (ms). */
  elapsedMs: number;
  finished: boolean;
  endReason?: EndReason;
}

const key = (peladaId: string) => `fb3_live_match_${peladaId}`;
const DURATION_KEY = 'fb3_match_minutes';

export function loadLive(peladaId: string): LiveMatchState | null {
  try {
    const raw = localStorage.getItem(key(peladaId));
    return raw ? (JSON.parse(raw) as LiveMatchState) : null;
  } catch {
    return null;
  }
}

export function saveLive(peladaId: string, state: LiveMatchState) {
  try {
    localStorage.setItem(key(peladaId), JSON.stringify(state));
  } catch {
    /* armazenamento indisponível: o cronômetro segue só em memória */
  }
}

export function clearLive(peladaId: string) {
  try {
    localStorage.removeItem(key(peladaId));
  } catch {
    /* ignore */
  }
}

export function loadDuration(): number {
  try {
    const n = Number(localStorage.getItem(DURATION_KEY));
    return DURATION_OPTIONS.includes(n) ? n : DEFAULT_MINUTES;
  } catch {
    return DEFAULT_MINUTES;
  }
}

export function saveDuration(minutes: number) {
  try {
    localStorage.setItem(DURATION_KEY, String(minutes));
  } catch {
    /* ignore */
  }
}

export const elapsedOf = (s: LiveMatchState, now = Date.now()) =>
  s.elapsedMs + (s.runningSince ? now - s.runningSince : 0);

/** 534000 → "08:54" */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Aviso de fim de jogo: vibração + três apitos curtos (se o aparelho permitir). */
export function signalEnd() {
  try {
    navigator.vibrate?.([400, 150, 400, 150, 700]);
  } catch {
    /* ignore */
  }
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = i === 2 ? 1400 : 1100;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + (i === 2 ? 0.6 : 0.25));
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.65);
    });
    setTimeout(() => ctx.close().catch(() => undefined), 1800);
  } catch {
    /* ignore */
  }
}
