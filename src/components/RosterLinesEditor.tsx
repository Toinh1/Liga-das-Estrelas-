import React from 'react';
import { AlertTriangle, Plus, UserPlus, X } from 'lucide-react';
import type { Player } from '../types/domain';
import { resolveRoster, rosterChoiceKey, type RosterChoices, type RosterRowStatus } from '../utils/rosterParser';
import { LevelBadge } from './ui';

/** Numeração no início da linha: "2-", "2 -", "02.", "3)", "4:" ou só "5". */
const NUMBER_PREFIX = /^(\s*\d{1,2}\s*[-.):–—]\s*|\s*\d{1,2}\s*$)/;

interface Row {
  /** Índice da linha no texto colado. */
  line: number;
  prefix: string;
  name: string;
}

/** Linhas do texto que representam uma pessoa (inclusive vagas numeradas vazias). */
function rowsFrom(text: string, parsedLines: Set<number>): Row[] {
  const rows: Row[] = [];
  text.split('\n').forEach((raw, line) => {
    const m = raw.match(NUMBER_PREFIX);
    if (m) rows.push({ line, prefix: m[0], name: raw.slice(m[0].length) });
    else if (parsedLines.has(line)) rows.push({ line, prefix: '', name: raw });
  });
  return rows;
}

/** Texto curto que diferencia homônimos: apelido, posição e nível. */
const describe = (p: Player) =>
  [p.nickname && p.nickname !== p.name ? `"${p.nickname}"` : '', p.position, `nível ${p.skillLevel}`]
    .filter(Boolean)
    .join(' · ');

/**
 * Conferência editável da lista colada do WhatsApp.
 * - vagas vazias ("2-") aparecem para preencher;
 * - nomes que podem ser mais de uma pessoa pedem "Quem é?";
 * - "Pessoa nova" cadastra um jogador novo mesmo com nome igual a alguém.
 * O texto continua sendo a fonte única: editar aqui atualiza o texto e vice-versa.
 */
export const RosterLinesEditor: React.FC<{
  text: string;
  onChange: (text: string) => void;
  players: Player[];
  choices: RosterChoices;
  onChoicesChange: (choices: RosterChoices) => void;
}> = ({ text, onChange, players, choices, onChoicesChange }) => {
  const lines = text.split('\n');
  const { rows: statuses, items } = resolveRoster(text, players, choices);
  const statusByLine = new Map<number, RosterRowStatus>(statuses.map((st) => [st.item.line, st]));
  const rows = rowsFrom(text, new Set(statusByLine.keys()));
  const playerById = new Map(players.map((p) => [p.id, p]));

  const numberOf = (row: Row | undefined, fallback: number) => (row?.prefix.match(/\d{1,2}/) || [String(fallback)])[0];
  const empty = rows.filter((r) => !r.name.trim()).length;
  const pending = statuses.filter((st) => st.ambiguous || st.duplicateOfLine !== undefined).length;

  const setName = (row: Row, value: string) => {
    const next = [...lines];
    // Linha só com o número ("2") ganha separador para o nome não virar nível
    const prefix = row.prefix && !/[-.):–—]\s*$/.test(row.prefix) ? `${row.prefix.trimEnd()}- ` : row.prefix;
    next[row.line] = prefix + value;
    onChange(next.join('\n'));
  };

  const removeRow = (row: Row) => {
    const next = [...lines];
    next.splice(row.line, 1);
    onChange(next.join('\n'));
  };

  const addRow = () => {
    const numbers = rows.map((r) => Number((r.prefix.match(/\d{1,2}/) || [])[0])).filter((n) => n > 0);
    const n = (numbers.length ? Math.max(...numbers) : rows.length) + 1;
    const base = text.replace(/\s+$/, '');
    onChange(`${base}${base ? '\n' : ''}${n}- `);
  };

  const choose = (st: RosterRowStatus, value: string) => onChoicesChange({ ...choices, [rosterChoiceKey(st.item)]: value });

  if (rows.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-300">
          Confira a lista: {items.length} {items.length === 1 ? 'pessoa' : 'pessoas'}
          {rows.length !== items.length && <span className="text-slate-500"> ({rows.length} linhas)</span>}
        </span>
        {(empty > 0 || pending > 0) && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5" />
            {[empty > 0 ? `${empty} ${empty === 1 ? 'vaga sem nome' : 'vagas sem nome'}` : '', pending > 0 ? `${pending} para conferir` : '']
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>

      <ul className="rounded-xl border border-white/[0.08] divide-y divide-white/[0.06] max-h-[26rem] overflow-y-auto">
        {rows.map((row, i) => {
          const st = statusByLine.get(row.line);
          const item = st?.item;
          const isEmpty = !row.name.trim();
          const isDup = st?.duplicateOfLine !== undefined;
          const needsChoice = Boolean(st && (st.ambiguous || isDup));
          const typed = row.name.trim().toLowerCase();
          const linkedAs = item && !item.isNew && item.name.toLowerCase() !== typed ? item.name : undefined;
          const candidates = (item?.candidateIds ?? [])
            .map((id) => playerById.get(id))
            .filter((p): p is Player => Boolean(p));
          const currentChoice = item ? choices[rosterChoiceKey(item)] : undefined;
          // "Quem é?" aparece quando há dúvida, quando há homônimos ou quando o admin já escolheu algo
          const showPicker = Boolean(item) && (needsChoice || currentChoice !== undefined || candidates.length > 1);

          return (
            <li key={row.line} className={`px-2.5 py-1.5 ${isEmpty || needsChoice ? 'bg-amber-500/[0.06]' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-right text-xs font-semibold text-slate-500 tabular-nums">{numberOf(row, i + 1)}</span>
                <input
                  value={row.name.trimStart()}
                  onChange={(e) => setName(row, e.target.value)}
                  placeholder="Digite o nome"
                  aria-label={`Nome ${i + 1} da lista`}
                  className={`flex-1 min-w-0 bg-transparent px-2 py-1.5 rounded-md text-sm text-white placeholder:text-amber-300/70 focus:outline-none focus:bg-white/[0.05] ${
                    isEmpty ? 'border border-amber-400/40' : 'border border-transparent'
                  }`}
                />
                {item?.skillLevel !== undefined && <LevelBadge level={item.skillLevel} compact />}
                {item && (
                  <span
                    className={`shrink-0 text-[10px] font-semibold ${
                      needsChoice ? 'text-amber-300' : item.isNew ? 'text-sky-300' : 'text-lime-400'
                    }`}
                  >
                    {isDup ? 'repetido' : st?.ambiguous ? 'quem é?' : item.isNew ? 'novo' : 'cadastrado'}
                  </span>
                )}
                {!isEmpty && !item && <span className="shrink-0 text-[10px] font-semibold text-slate-500">ignorado</span>}
                <button
                  type="button"
                  onClick={() => removeRow(row)}
                  className="p-1.5 rounded-md text-slate-500 hover:text-rose-400 hover:bg-white/[0.06] cursor-pointer"
                  aria-label={`Remover linha ${i + 1}`}
                  title="Remover da lista"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Explicação da linha */}
              {st && (isDup || st.ambiguous || st.homonymNew || (linkedAs && !showPicker)) && (
                <p className={`pl-7 pr-8 pt-0.5 text-[11px] leading-snug ${needsChoice ? 'text-amber-200' : 'text-slate-500'}`}>
                  {isDup
                    ? `Caiu no mesmo jogador da linha ${numberOf(
                        rows.find((r) => r.line === st.duplicateOfLine),
                        st.duplicateOfLine! + 1
                      )}. Se for outra pessoa, toque em "Pessoa nova".`
                    : st.ambiguous
                    ? `Há ${candidates.length} jogadores com esse nome. Escolha quem é:`
                    : st.homonymNew
                    ? `Será cadastrado como jogador novo. Dica: escreva um sobrenome ou apelido (ex.: "${row.name.trim()} Silva") para diferenciar nas próximas listas.`
                    : `Ligado ao cadastro de ${linkedAs}.`}
                </p>
              )}

              {/* Quem é? */}
              {showPicker && item && st && (
                <div className="pl-7 pr-1 pt-1.5 pb-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Quem é ${row.name.trim()}?`}>
                  {candidates.map((p) => {
                    const selected = currentChoice === p.id || (!currentChoice && !needsChoice && item.matchedPlayerId === p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => choose(st, p.id)}
                        className={`text-left px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition ${
                          selected ? 'border-lime-400 bg-lime-400/10 text-white' : 'border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <span className="font-semibold">{p.name}</span>
                        <span className="block text-[10px] text-slate-500">{describe(p)}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={currentChoice === 'new'}
                    onClick={() => choose(st, 'new')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                      currentChoice === 'new' ? 'border-sky-400 bg-sky-400/10 text-sky-200' : 'border-white/10 text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Pessoa nova
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-xs font-semibold text-slate-300 hover:text-white hover:border-white/25 cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" /> Adicionar nome
      </button>
    </div>
  );
};
