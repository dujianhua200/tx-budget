import { useMemo, useState } from 'react';
import { FEE_TREE, feeRowsForNode, findFeeNode } from '../lib/v3.js';
import { money } from '../lib/store.js';

/**
 * 取费左树 + 右表（v3.0 §13.11.2）：左树由表二费用结构派生；点节点切换右表分组。
 * 右表列：费用名称 / 计算基数 / 费率 / 金额 / 计算式。费率可编辑 → onRateChange(key, rateField, value)。
 * props: { profile, result, projectType, onRateChange }
 */
function TreeNode({ node, depth, selectedId, onSelect }) {
  const isSelected = node.id === selectedId;
  return (
    <div>
      <button className={isSelected ? 'fee-tree-node active' : 'fee-tree-node'}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => onSelect(node.id)}>
        {node.kind === 'group' ? '▸ ' : '· '}{node.label}
      </button>
      {node.children?.map((c) => (
        <TreeNode key={c.id} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}

export default function FeeTreeTable({ profile, result, projectType, onRateChange }) {
  const [selectedId, setSelectedId] = useState('root:all');
  const rows = useMemo(
    () => feeRowsForNode(selectedId, { profile, result, projectType }),
    [selectedId, profile, result, projectType],
  );
  const selectedNode = findFeeNode(FEE_TREE, selectedId);
  return (
    <div className="fee-tree-wrap">
      <div className="fee-tree">
        <TreeNode node={FEE_TREE} depth={0} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div className="fee-tree-table">
        <h3>{selectedNode?.label || ''} <span className="muted">（{rows.length} 项，金额为折前）</span></h3>
        <table className="table"><thead><tr>
          <th>费用名称</th><th>计算基数</th><th>费率</th><th style={{ textAlign: 'right' }}>金额（元）</th><th>计算式</th>
        </tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.key}>
              <td>{r.name}</td>
              <td className="muted">{r.base}</td>
              <td>
                {r.rateField && onRateChange ? (
                  <input className="cell-input" type="number" step="any" style={{ width: 110 }}
                    value={r.rate ?? ''} placeholder="配置值"
                    onChange={(e) => onRateChange(r.key, r.rateField, e.target.value === '' ? null : Number(e.target.value))} />
                ) : (r.rate ?? '—')}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(r.amount)}</td>
              <td className="muted">{r.basis}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="empty">该组无费用项。</td></tr>}
          </tbody></table>
        <p className="muted">费率编辑直接写回当前编辑方案的费率（走 savePatch）；冬雨季费率 null = 按地区查表。</p>
      </div>
    </div>
  );
}
