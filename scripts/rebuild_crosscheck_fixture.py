#!/usr/bin/env python3
"""重建 crosscheck 夹具（增量 6，附录 B Q8）：把与引擎测试相同的场景填入 v3.0 母版，
用 LibreOffice 真实重算，产出 tests/fixtures/lo_values.json + lo_values.meta.json。

改编自 ~/workspace/build_budget_template/crosscheck.py（v1 时代脚本），差异清单：
  - 输出路径：/tmp/bt/lo_values.json -> 本仓库 tests/fixtures/lo_values.json（+ 同名 .meta.json），不再依赖 /tmp。
  - 中间文件：/tmp/bt/xcheck.xlsx -> /tmp/bt-inc6/xcheck.xlsx（避免与旧产物混淆）。
  - 新增：母版 SHA256 校验（与 meta 记录值不一致即拒绝生成）、LO 版本记录、提取键齐全性断言、
    确定性输出（sort_keys）、meta 文件（来源/命令/场景/workarounds）。
  - 场景、两处母版 bug 绕行、提取键表与 crosscheck.py 完全一致（见下方 SCENARIO / WORKAROUNDS）。

用法：python3 scripts/rebuild_crosscheck_fixture.py
重跑必须得到逐项相同的值（LO 版本不同时需在 meta 中注明并在变更记录中说明）。
夹具数值全部来自 LO 公式重算，本脚本不手写、不四舍五入任何数值。
"""
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys

import openpyxl

HOME = pathlib.Path.home()
REPO = pathlib.Path(__file__).resolve().parent.parent
SRC = HOME / "workspace/your_files/预算模板/通信概预算自动化母版_v3.0.xlsx"
EXPECTED_SHA256 = "ff5ed39fc01acad514bc46d600aa87fb8d3a320cdaae4444ac8f0675874486d4"
WORKDIR = pathlib.Path("/tmp/bt-inc6")
WORK = WORKDIR / "xcheck.xlsx"
OUTDIR = WORKDIR / "out"
FIXTURE = REPO / "tests/fixtures/lo_values.json"
META = REPO / "tests/fixtures/lo_values.meta.json"

# 与 tests/crosscheck.test.mjs 的 quantities 逐项一致（code, variant, qty；TXL4-053 系数 0.5 在母版中
# 体现为变体名含“工日X0.5”，见母版工程量表行，无需单独写 coef）。
SCENARIO = [
    ("TXL1-002", "光(电)缆工程施工测量 架空", 10),  # 勘察长度 10百米=1km，避免母版 H11 空串 #VALUE!
    ("TXL3-187", "挂钩法架设架空光缆 平原 6芯", 2),
    ("TXL3-187", "挂钩法架设架空光缆 平原 24芯", 3),
    ("TXL4-053", "架设吊线式墙壁光缆 6芯(工日X0.5)", 4),
    ("TXL7-023", "安装光分纤箱、光分路箱 架空式 二槽位（SMC）", 5),
    ("TXL7-023", "安装光分纤箱、光分路箱 架空式 48芯", 1),
    ("TXL7-043", "安装落地式光缆交接箱 288芯", 2),
]

# 提取键表（29 键，与 tests/crosscheck.test.mjs 的断言 + 完整性保留 D19 对齐）。
CHECKS = [
    ("表三甲", "H66"), ("表三甲", "I66"),
    ("表三甲", "H68"), ("表三甲", "I68"),
    ("表三乙", "J52"), ("表三丙", "J57"),
    ("表四甲（主材）", "I63"), ("表四甲（主材）", "J63"),
    ("表四乙(乙供）", "I63"),
    ("表二", "D9"), ("表二", "D13"), ("表二", "D16"),
    ("表二", "D17"), ("表二", "D18"), ("表二", "D19"),
    ("表二", "I16"), ("表二", "I23"), ("表二", "I24"),
    ("表二", "D6"), ("表二", "D5"),
    ("表一", "G6"), ("表一", "G7"), ("表一", "J9"),
    ("表一", "L9"), ("表一", "L12"),
    ("表五", "D23"), ("表五", "E23"),
    ("汇总表", "L11"),
    ("表二", "I8"),  # LO 下原为 #N/A，费率绕行（0.018 plain 数）后由 LO 真算出；测试仍用 loFixed 换算，两者应一致
]

WORKAROUNDS = [
    "费率表 G17:K17 冬雨季嵌套 TEXT(HLOOKUP) 在 LO 下算出 #N/A，按母版本意（Ⅲ类地区 -> 0.018）写成 plain 数 0.018；值仍由 LO 其余公式算出，非手编。",
    "母版表五 H11=(J1365+J1366+J1367)/10，空量行 J 为 \"\" 空串，LO 下 \"\"+10 会 #VALUE!；把另两行定额表 J1365/J1367 置 0（母版 bug 绕行）。",
    "表二!I8 在 LO 下原为 #N/A，费率绕行（0.018 plain 数）后由 LO 真算出 156.96；tests/crosscheck.test.mjs 用 loFixed 按母版本意换算，两者应在容差内一致。",
    "表二!I14（调遣费）测试沿用硬编码 1410（母版调遣单价 141 × 10 人），未从 LO 取用，不纳入提取键。",
]


def sha256_of(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    if not SRC.exists():
        print(f"母版不存在: {SRC}")
        return 1
    actual_sha = sha256_of(SRC)
    if actual_sha != EXPECTED_SHA256:
        print(f"母版 SHA256 不一致，拒绝生成：\n  期望 {EXPECTED_SHA256}\n  实际 {actual_sha}\n请核对母版文件是否被改动后再更新 EXPECTED_SHA256。")
        return 1
    lo_version = subprocess.run(["soffice", "--version"], capture_output=True, text=True,
                                timeout=60).stdout.strip()

    WORKDIR.mkdir(parents=True, exist_ok=True)
    wb = openpyxl.load_workbook(SRC)
    ws = wb["工程量"]
    ws["B1"] = 1
    found = []
    for code, variant, qty in SCENARIO:
        hit = False
        for r in range(4, ws.max_row + 1):
            if ws.cell(r, 2).value == code and ws.cell(r, 3).value == variant:
                ws.cell(r, 5).value = qty  # E列 = 工程1
                hit = True
                found.append((code, variant, qty, r))
                break
        if not hit:
            print(f"未找到工程量行: {code} | {variant}")
            return 1
    ci = wb["综合信息"]
    ci["B13"] = "通信线路工程"
    ci["B16"] = 1  # 施工折扣=1，与引擎测试一致
    ci["B27"] = 36  # 施工实际里程（为空时母版 HLOOKUP 会 #N/A；36km -> 调遣单价 141）
    fr = wb["费率"]
    for c in range(7, 12):
        fr.cell(17, c).value = 0.018  # 绕行 1：冬雨季 Ⅲ类地区 0.018
    dq = wb["定额"]
    dq.cell(1365, 10).value = 0  # 绕行 2：表五 H11 空串 #VALUE! 绕行
    dq.cell(1367, 10).value = 0
    wb.save(WORK)
    print("已写入:", WORK)

    if OUTDIR.exists():
        shutil.rmtree(OUTDIR)
    OUTDIR.mkdir(parents=True)
    subprocess.run(["soffice", "--headless", "--calc", "--convert-to", "xlsx",
                    "--outdir", str(OUTDIR), str(WORK)], check=True,
                   capture_output=True, timeout=300)
    recalc = OUTDIR / "xcheck.xlsx"
    wb2 = openpyxl.load_workbook(recalc, data_only=True)

    lo = {}
    for sheet, cell in CHECKS:
        v = wb2[sheet][cell].value
        if v is None and not (sheet == "表二" and cell == "I8"):
            print(f"提取到空值（非预期）：{sheet}!{cell}")
            return 1
        if v is not None and not isinstance(v, (int, float)):
            print(f"提取到非数值（非预期）：{sheet}!{cell} = {v!r}")
            return 1
        lo[f"{sheet}!{cell}"] = v
    FIXTURE.write_text(json.dumps(lo, ensure_ascii=False, sort_keys=True, indent=1) + "\n",
                       encoding="utf-8")
    meta = {
        "generatedBy": "scripts/rebuild_crosscheck_fixture.py",
        "source": str(SRC),
        "sourceSha256": actual_sha,
        "libreOfficeVersion": lo_version,
        "command": "python3 scripts/rebuild_crosscheck_fixture.py",
        "scenario": [{"code": c, "variant": v, "qty": q, "masterRow": r} for c, v, q, r in found],
        "info": {"工程类型": "通信线路工程", "施工折扣": 1, "施工实际里程": 36,
                 "冬雨季施工费": "Ⅲ类地区", "甲供增值税": 0.13, "乙供增值税": 0.09},
        "workarounds": WORKAROUNDS,
        "note": "数值全部来自 LibreOffice 公式重算，未手编、未四舍五入。表二!I8 在费率绕行后由 LO 真算出（原 #N/A），测试内 loFixed 换算值应与之在容差内一致。",
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, sort_keys=True, indent=1) + "\n",
                    encoding="utf-8")
    print(json.dumps(lo, ensure_ascii=False, indent=1))
    print(f"夹具已写入: {FIXTURE}")
    print(f"元数据已写入: {META}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
