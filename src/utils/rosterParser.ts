import type { Player, PlayerPosition } from '../types/domain';

export interface EditableRosterItem {
  key: string;
  name: string;
  position: PlayerPosition;
  matchedPlayerId?: string;
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

export function parseRosterText(text: string, existingPlayers: Player[]): EditableRosterItem[] {
  const lines = text.split(/\r?\n/);
  const result: EditableRosterItem[] = [];
  const seenKeys = new Set<string>();
  let inGoalkeeperSection = false;

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
    if (/^(lista da pelada|lista do baba|pelada de sabado|liga das estrelas)/i.test(lower) && raw.includes(':')) {
      continue;
    }

    // Remove numeração inicial ("01.", "1 -", "1)", "✅", "•", "-")
    let cleaned = raw
      .replace(/^[\s✅☑️✔️⚽⭐🧤•\-–—*]+/, '')
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

    const matched = matchExistingPlayer(cleaned, existingPlayers);
    const dedupKey = matched ? `id:${matched.id}` : `name:${normalizeStr(cleaned)}`;
    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);

    result.push({
      key: matched ? matched.id : `new-${i}-${normalizeStr(cleaned)}`,
      name: matched ? matched.nickname || matched.name : cleaned,
      position: isGk ? 'Goleiro' : matched?.position || 'Meia',
      matchedPlayerId: matched?.id,
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
