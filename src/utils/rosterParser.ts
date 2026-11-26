import type { Player, PlayerPosition } from '../types/domain';

export interface EditableRosterItem {
  key: string;
  name: string;
  position: PlayerPosition;
  matchedPlayerId?: string;
  /** Nível informado na lista (1 = melhor ... 6 = mais fraco). */
  skillLevel?: number;
  isNew: boolean;
}

function normalizeStr(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function matchExistingPlayer(rawName: string, players: Player[]): Player | undefined {
  const norm = normalizeStr(rawName);
  if (!norm) return undefined;

  return players.find((p) => {
    const nName = normalizeStr(p.name);
    const nNick = p.nickname ? normalizeStr(p.nickname) : '';
    const combo1 = nNick ? `${nName} (${nNick})` : '';
    const combo2 = nNick ? `${nName} ${nNick}` : '';
    return (
      nName === norm ||
      (nNick && nNick === norm) ||
      (combo1 && combo1 === norm) ||
      (combo2 && combo2 === norm)
    );
  });
}

/**
 * Lê o nível escrito junto do nome: "Saladinha 2", "Saladinha - 2", "Saladinha (2)",
 * "Saladinha N2", "Saladinha nível 2". Retorna o nome limpo e o nível (1 a 6).
 */
export function extractTrailingLevel(text: string): { name: string; level?: number } {
  const prefixed = text.match(/^(.*\S)\s+(?:n[ií]vel|nv|lv|n)\s*[:\-]?\s*([1-6])\s*[)\]]?$/i);
  if (prefixed) return { name: prefixed[1].trim(), level: Number(prefixed[2]) };
  const plain = text.match(/^(.*?[^\d\s(\[\-–—:|])\s*[-–—:|]?\s*[(\[]?\s*([1-6])\s*[)\]]?$/);
  if (plain) return { name: plain[1].trim(), level: Number(plain[2]) };
  return { name: text };
}

/** "1 João / 2 Pedro / 3 ..." é numeração; "2 João / 1 Pedro / 2 ..." são níveis. */
function detectLeadingBareNumbers(lines: string[]): 'numbering' | 'levels' | 'none' {
  const nums = lines
    .map((l) => l.trim().match(/^(\d{1,2})\s+(?=\D)/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => Number(m[1]));
  if (nums.length < 2) return 'none';
  const sequential = nums.every((n, i) => n === nums[0] + i);
  if (sequential) return 'numbering';
  return nums.every((n) => n >= 1 && n <= 6) ? 'levels' : 'none';
}

export function parseRosterText(text: string, existingPlayers: Player[]): EditableRosterItem[] {
  const lines = text.split(/\r?\n/);
  const result: EditableRosterItem[] = [];
  const seenKeys = new Set<string>();
  let inGoalkeeperSection = false;
  const leadingMode = detectLeadingBareNumbers(lines);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;

    const lower = normalizeStr(raw);

    // Detecta cabeçalhos comuns de listas de WhatsApp
    if (/^(goleiros?|gks?)\s*:?$/i.test(lower)) {
      inGoalkeeperSection = true;
      continue;
    }
    if (/^(linhas?|jogadores|atletas|confirmados|lista.*)\s*:$/i.test(lower)) {
      inGoalkeeperSection = false;
      continue;
    }
    if (/^(lista da pelada|lista do baba|pelada de sabado|pelada de quarta|baba de quarta|liga das estrelas)/i.test(lower) && raw.includes(':')) {
      continue;
    }

    // Remove numeração inicial ("01.", "1 -", "1)", "✅", "•", "-")
    let level: number | undefined;
    let cleaned = raw.replace(/^[\s✅☑️✔️⚽⭐🧤•\-–—*]+/, '');
    const bare = cleaned.match(/^(\d{1,2})\s+(?=\D)/);
    if (bare && leadingMode === 'levels') {
      level = Number(bare[1]);
      cleaned = cleaned.slice(bare[0].length);
    } else if (bare && leadingMode === 'numbering') {
      cleaned = cleaned.slice(bare[0].length);
    }
    cleaned = cleaned
      .replace(/^\d{1,2}\s*[.\-–—):]\s*/, '')
      .replace(/^[\s✅☑️✔️⚽⭐•\-–—*]+/, '')
      .trim();

    if (!cleaned) continue;

    // Detecta marcação de goleiro na linha: "(GK)", "(Goleiro)", "- GK", "🧤"
    let isGk = inGoalkeeperSection;
    if (/(\(\s*(gk|goleiro|gol)\s*\)|-\s*(gk|goleiro)$|🧤)/i.test(cleaned)) {
      isGk = true;
      cleaned = cleaned
        .replace(/(\(\s*(gk|goleiro|gol)\s*\)|-\s*(gk|goleiro)$|🧤)/gi, '')
        .trim();
    }

    if (!cleaned) continue;

    if (level === undefined) {
      const lv = extractTrailingLevel(cleaned);
      cleaned = lv.name;
      level = lv.level;
    }
    if (!cleaned) continue;

    const matched = matchExistingPlayer(cleaned, existingPlayers);
    const dedupKey = matched ? `id:${matched.id}` : `name:${normalizeStr(cleaned)}`;
    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);

    result.push({
      key: matched ? matched.id : `new-${i}-${normalizeStr(cleaned)}`,
      name: matched ? matched.nickname || matched.name : cleaned,
      position: isGk ? 'Goleiro' : matched?.position || 'Meia',
      matchedPlayerId: matched?.id,
      skillLevel: level,
      isNew: !matched,
    });
  }

  return result;
}

export function formatPlayersToEditableText(
  items: { name: string; position?: PlayerPosition }[]
): string {
  return items
    .map((item, idx) => {
      const gkSuffix = item.position === 'Goleiro' ? ' (Goleiro)' : '';
      return `${idx + 1}. ${item.name}${gkSuffix}`;
    })
    .join('\n');
}
