import { useMemo, useRef, useState } from 'react';
import { quotaSuggestions } from '../lib/v3.js';

/**
 * 定额编号联想输入（v3.0 §13.5）：输入编号/名称关键字出候选（常用短单在前），
 * 回车选第一条；选后回调 onPick(row)，由调用方决定下一焦点。
 * props: { libs, value, onChange(value), onPick(row), placeholder, autoFocus }
 */
export default function QuotaAutocomplete({ libs, value, onChange, onPick, placeholder, autoFocus }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const suggestions = useMemo(() => quotaSuggestions(libs, value, 50), [libs, value]);
  const pick = (row) => {
    if (!row) return;
    setOpen(false);
    if (onPick) onPick(row);
  };
  return (
    <div className="autocomplete" style={{ position: 'relative', flex: 1 }}>
      <input ref={inputRef} className="input" style={{ width: '100%' }} autoFocus={!!autoFocus}
        placeholder={placeholder || '输入定额编号 / 项目名称，如 TXL3-187…'}
        value={value} onChange={(e) => { onChange(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(suggestions[active]); }
          else if (e.key === 'Escape') setOpen(false);
        }} />
      {open && suggestions.length > 0 && (
        <ul className="autocomplete-list">
          {suggestions.map((r, i) => (
            <li key={`${r.code}|${r.name}|${i}`} className={i === active ? 'active' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}
              onMouseEnter={() => setActive(i)}>
              <span>{r.code}</span> <span className="muted">{r.name}</span> <span className="muted">（{r.unit}）</span>
            </li>
          ))}
        </ul>
      )}
      {open && value.trim() && !suggestions.length && (
        <div className="autocomplete-empty">无匹配定额。可到“基础库 → 定额库”新增。</div>
      )}
    </div>
  );
}
