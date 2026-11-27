import type { Player, PlayerPosition } from '../types/domain';

export interface EditableRosterItem {
  key: string;
  name: string;
  position: PlayerPosition;
  matchedPlayerId?: string;
  /** Nível informado na lista (1 = melhor ... 6 = mais fraco). */
  skillLevel?: number;
  isNew: boolean;
  /** Linha do texto colado em que o nome apareceu. */
  line: number;
  /** Nome como foi escrito na lista (sem número, nível ou marcação de goleiro). */
  typedName: string;
  /** Todos os jogadores cadastrados com esse nome/apelido (2+ = homônimos). */
  candidateIds: string[];
  /** Cadastrar como jogador novo mesmo existindo alguém com o mesmo nome. */
  forceNew?: boolean;
}

export function normalizeStr(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function matchExistingPlayer(rawName: string, players: Player[]): Player | undefined {
  return findPlayerCandidates(rawName, players)[0];
}

/** Todos os jogadores cujo nome, apelido ou "nome (apelido)" batem com o texto. */
export function findPlayerCandidates(rawName: string, players: Player[]): Player[] {
  const norm = normalizeStr(rawName);
  if (!norm) return [];

  return players.filter((p) => {
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

/** Lê a lista linha a linha, sem juntar repetidos (cada item guarda a linha de origem). */
export function parseRosterLines(text: string, existingPlayers: Player[]): EditableRosterItem[] {
  const lines = text.split(/\r?\n/);
  const result: EditableRosterItem[] = [];
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

    const candidates = findPlayerCandidates(cleaned, existingPlayers);
    const matched = candidates[0];

    result.push({
      key: matched ? matched.id : `new-${i}-${normalizeStr(cleaned)}`,
      name: matched ? matched.nickname || matched.name : cleaned,
      position: isGk ? 'Goleiro' : matched?.position || 'Meia',
      matchedPlayerId: matched?.id,
      skillLevel: level,
      isNew: !matched,
      line: i,
      typedName: cleaned,
      candidateIds: candidates.map((p) => p.id),
    });
  }

  return result;
}

/** Lista para importar: um item por pessoa (a mesma pessoa repetida conta uma vez). */
export function parseRosterText(text: string, existingPlayers: Player[]): EditableRosterItem[] {
  return resolveRoster(text, existingPlayers, {}).items;
}

/** Escolha do admin para uma linha: id do jogador cadastrado ou 'new' (pessoa nova). */
export type RosterChoices = Record<string, string>;

/** Chave da escolha: muda se o nome da linha for editado, para não aplicar escolha antiga. */
export const rosterChoiceKey = (item: Pick<EditableRosterItem, 'line' | 'typedName'>) =>
  `${item.line}:${normalizeStr(item.typedName)}`;

export interface RosterRowStatus {
  item: EditableRosterItem;
  /** Há mais de um cadastro com esse nome e o admin ainda não escolheu. */
  ambiguous: boolean;
  /** Mesma pessoa de uma linha anterior (não conta de novo). */
  duplicateOfLine?: number;
  /** Pessoa nova com o mesmo nome de alguém já cadastrado. */
  homonymNew: boolean;
}

/**
 * Aplica as escolhas do admin ("Quem é?") e devolve:
 *  - rows: situação de cada linha (para a tela de conferência);
 *  - items: o que será importado, sem repetir pessoas.
 */
export function resolveRoster(
  text: string,
  existingPlayers: Player[],
  choices: RosterChoices
): { rows: RosterRowStatus[]; items: EditableRosterItem[] } {
  const byId = new Map(existingPlayers.map((p) => [p.id, p]));
  const rows: RosterRowStatus[] = [];
  const items: EditableRosterItem[] = [];
  const firstLineOf = new Map<string, number>(); // pessoa -> linha em que apareceu primeiro

  for (const raw of parseRosterLines(text, existingPlayers)) {
    const choice = choices[rosterChoiceKey(raw)];
    let item: EditableRosterItem = raw;
    if (choice === 'new') {
      item = {
        ...raw,
        key: `new-${raw.line}-${normalizeStr(raw.typedName)}`,
        name: raw.typedName,
        matchedPlayerId: undefined,
        isNew: true,
        forceNew: true,
      };
    } else if (choice && byId.has(choice)) {
      const p = byId.get(choice)!;
      item = {
        ...raw,
        key: p.id,
        name: p.nickname || p.name,
        matchedPlayerId: p.id,
        isNew: false,
        position: raw.position === 'Goleiro' ? 'Goleiro' : p.position,
      };
    }
    const personKey = item.matchedPlayerId
      ? `id:${item.matchedPlayerId}`
      : item.forceNew
      ? `line:${item.line}`
      : `name:${normalizeStr(item.typedName)}`;
    const firstLine = firstLineOf.get(personKey);
    if (firstLine === undefined) {
      firstLineOf.set(personKey, item.line);
      items.push(item);
    }
    rows.push({
      item,
      ambiguous: !choice && raw.candidateIds.length > 1,
      duplicateOfLine: firstLine,
      homonymNew: Boolean(item.forceNew) && raw.candidateIds.length > 0,
    });
  }
  return { rows, items };
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
