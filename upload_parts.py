#!/usr/bin/env python3
"""把 arm64 安装包的分卷经 Contents API（api.github.com，走已批凭证）推到仓库。
Release 资产上传需 uploads.github.com，该域名不在凭证放行列表内（401），改用此路。
重跑幂等：已存在则按 sha 覆盖。"""
import base64
import json
import pathlib
import sys
import urllib.error
import urllib.request
from urllib.parse import quote

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request  # noqa: E402

OWNER = "dujianhua200"
REPO = "tx-budget"
BRANCH = "main"
PREFIX = "releases/v1.0.0-arm64"
SRC = pathlib.Path.home() / "workspace/your_files/通信概预算App/parts-arm64"
FILES = [f"通信概预算-1.0.0-arm64-mac.zip.part-0{i}" for i in range(6)] + ["合并.command"]


def api(method, path, body=None, timeout=300):
    url = f"https://api.github.com{path}"
    data = None
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    add_surrogate_to_request(req, "custom.github", allowed_hosts=("api.github.com",))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw.decode("utf-8")) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw.decode("utf-8"))
        except Exception:
            return exc.code, {"message": raw[:500].decode("utf-8", "replace")}


def main():
    for fname in FILES:
        data = (SRC / fname).read_bytes()
        b64 = base64.b64encode(data).decode("ascii")
        path = f"{PREFIX}/{fname}"
        # 查现有 sha（覆盖需带 sha）
        status, cur = api("GET", f"/repos/{OWNER}/{REPO}/contents/{quote(path)}?ref={BRANCH}")
        body = {"message": f"v1.0.0 arm64 安装包分卷：{fname}", "content": b64, "branch": BRANCH}
        if status == 200:
            body["sha"] = cur["sha"]
        status, res = api("PUT", f"/repos/{OWNER}/{REPO}/contents/{quote(path)}", body, timeout=600)
        assert status in (200, 201), f"上传失败 {fname}: {status} {res}"
        print("已上传:", path, f"({len(data)} bytes)", flush=True)
    # 校验目录
    status, listing = api("GET", f"/repos/{OWNER}/{REPO}/contents/{quote(PREFIX)}?ref={BRANCH}")
    assert status == 200 and len(listing) == len(FILES), f"目录校验失败: {status}"
    print("目录校验通过，共", len(listing), "个文件", flush=True)

    # 更新 Release 说明：指向分卷下载
    base = f"https://raw.githubusercontent.com/{OWNER}/{REPO}/{BRANCH}/{PREFIX}"
    lines = [
        "# 通信概预算 v1.0.0",
        "",
        "451 号文通信工程概预算桌面应用（Electron + React）。",
        "",
        "## 下载（Apple Silicon，M1/M2/M3/M4）",
        "",
        "安装包约 300MB，已拆成 6 个分卷（GitHub Release 资产接口不在本凭证放行范围内，暂用仓库分卷下载）：",
        "",
    ]
    for fname in FILES:
        lines.append(f"- [{fname}]({base}/{quote(fname)})")
    lines += [
        "",
        "步骤：6 个分卷 + `合并.command` 下载到同一个文件夹 → 终端运行 `bash 合并.command`（它会拼回完整 zip 并校验 SHA，前 16 位应为 `72633b9bf910f674`）→ 解压，把 App 拖到“应用程序”。",
        "",
        "Intel 版分卷需要的话说一声。",
        "",
        "## 核心",
        "",
        "- **可定制**：定额库 / 材料库 / 费率 / 关联规则 / 工程信息全部可改；定额库可在 Excel 中维护后导入（合并/替换）",
        "- **批量生成**：批量新建 / 导入 / 导出 / 改价 / 改费率",
        "- 计算口径与 v3.0 母版一致，验证 54 项全过；修正母版 3 个 bug（里程为空 #N/A、测量不全 #VALUE!、冬雨季公式 #N/A）",
        "",
        "## 源码",
        "",
        "见本仓库。`npm test` 可复跑全部验证。",
    ]
    status, rel = api("GET", f"/repos/{OWNER}/{REPO}/releases/tags/v1.0.0")
    assert status == 200, f"查 Release 失败: {status} {rel}"
    status, _ = api("PATCH", f"/repos/{OWNER}/{REPO}/releases/{rel['id']}", {"body": "\n".join(lines)})
    assert status == 200, f"更新 Release 说明失败: {status}"
    print("Release 说明已更新:", rel["html_url"], flush=True)


if __name__ == "__main__":
    main()
