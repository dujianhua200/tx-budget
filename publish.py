#!/usr/bin/env python3
"""推送通信概预算 App 到 GitHub：建仓库 -> 推源码 -> 打 tag -> 建 Release -> 上传安装包。
用法：python3 publish.py（中途失败可重跑，幂等：仓库已存在则跳过创建）。"""
import base64
import json
import pathlib
import sys
import urllib.error
import urllib.request

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request  # noqa: E402

OWNER = "dujianhua200"
REPO = "tx-budget"
APP_DIR = pathlib.Path.home() / "workspace/budget-app"
FILES = [
    "package.json", "README.md", "index.html", "vite.config.js", ".gitignore",
    "electron/main.cjs", "electron/preload.cjs", "electron/excel.cjs",
    "src/main.jsx", "src/App.jsx", "src/styles.css",
    "src/engine/calc.mjs", "src/lib/store.js",
    "src/pages/Projects.jsx", "src/pages/ProjectDetail.jsx",
    "src/pages/Batch.jsx", "src/pages/Settings.jsx",
    "data/seed.json",
    "tests/engine.test.mjs", "tests/crosscheck.test.mjs", "tests/excel.test.mjs",
]
RELEASE_NOTES = """# 通信概预算 v1.0.0

451 号文通信工程概预算桌面应用（Electron + React）。

## 下载

- Apple Silicon（M1/M2/M3/M4）：`通信概预算-1.0.0-arm64-mac.zip`
- Intel：`通信概预算-1.0.0-mac.zip`

安装：解压后把 App 拖到“应用程序”；首次打开右键 → 打开（未签名应用，拦截一次即可）。

## 核心

- **可定制**：定额库 / 材料库 / 费率 / 关联规则 / 工程信息全部可改；定额库可在 Excel 中维护后导入（合并/替换）
- **批量生成**：批量新建 / 导入 / 导出 / 改价 / 改费率
- 计算口径与 v3.0 母版一致，验证 54 项全过；修正母版 3 个 bug（里程为空 #N/A、测量不全 #VALUE!、冬雨季公式 #N/A）

## 源码

见本仓库。`npm test` 可复跑全部验证。
"""


def api(method, path, body=None, host="api.github.com", timeout=120, content_type="application/json"):
    url = f"https://{host}{path}"
    data = None
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if body is not None:
        data = json.dumps(body).encode("utf-8") if content_type == "application/json" else body
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    add_surrogate_to_request(req, "custom.github", allowed_hosts=(host,))
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
    # 1. 建仓库（已存在则跳过）
    status, repo = api("GET", f"/repos/{OWNER}/{REPO}")
    if status == 404:
        status, repo = api("POST", "/user/repos", {
            "name": REPO, "private": False,
            "description": "通信工程概预算桌面应用：451号文取费，可定制定额/费率/材料/规则，批量生成工程",
            "auto_init": False,
        })
        assert status == 201, f"建仓库失败: {status} {repo}"
        print("仓库已创建:", repo["html_url"], flush=True)
    else:
        assert status == 200, f"查仓库失败: {status} {repo}"
        print("仓库已存在:", repo["html_url"], flush=True)

    # 2. 空仓库需先用 Contents API 建一个初始提交，否则 git-database 会 409
    status, _refs = api("GET", f"/repos/{OWNER}/{REPO}/git/refs/heads/main")
    if status in (404, 409):  # 空仓库：404 或 409 Git Repository is empty
        import base64 as _b64
        readme = "# 通信概预算\n\n451 号文通信工程概预算桌面应用（Electron + React）。\n\n见 Release 下载安装包，源码见 main 分支。\n"
        status, _ = api("PUT", f"/repos/{OWNER}/{REPO}/contents/README.md",
                        {"message": "初始化仓库", "content": _b64.b64encode(readme.encode("utf-8")).decode("ascii")})
        assert status in (201, 200), f"初始化提交失败: {status} {_}"
        print("已建初始提交", flush=True)
    (APP_DIR / ".gitignore").write_text("node_modules/\ndist/\ndist-mac/\n", encoding="utf-8")

    # 3. 推源码（git-database API）
    entries = []
    for rel in FILES:
        p = APP_DIR / rel
        assert p.exists(), f"缺文件: {rel}"
        b64 = base64.b64encode(p.read_bytes()).decode("ascii")
        status, blob = api("POST", f"/repos/{OWNER}/{REPO}/git/blobs", {"content": b64, "encoding": "base64"})
        assert status == 201, f"建 blob 失败 {rel}: {status} {blob}"
        entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
        print("blob:", rel, flush=True)
    status, tree = api("POST", f"/repos/{OWNER}/{REPO}/git/trees", {"tree": entries})
    assert status == 201, f"建 tree 失败: {status} {tree}"
    # 以当前 main 为父提交（初始提交已存在），保持历史连续
    status, main_ref = api("GET", f"/repos/{OWNER}/{REPO}/git/refs/heads/main")
    parents = [main_ref["object"]["sha"]] if status == 200 else []
    status, commit = api("POST", f"/repos/{OWNER}/{REPO}/git/commits",
                         {"message": "通信概预算 v1.0.0：可定制 + 批量生成", "tree": tree["sha"], "parents": parents})
    assert status == 201, f"建 commit 失败: {status} {commit}"
    status, ref = api("PATCH", f"/repos/{OWNER}/{REPO}/git/refs/heads/main", {"sha": commit["sha"]})
    assert status == 200, f"更新 ref 失败: {status} {ref}"
    print("源码已推到 main:", commit["sha"], flush=True)

    # 4. 打 tag
    status, tag_obj = api("POST", f"/repos/{OWNER}/{REPO}/git/tags",
                          {"tag": "v1.0.0", "message": "通信概预算 v1.0.0", "object": commit["sha"], "type": "commit"})
    if status == 201:
        status, _ = api("POST", f"/repos/{OWNER}/{REPO}/git/refs", {"ref": "refs/tags/v1.0.0", "sha": tag_obj["sha"]})
    print("tag v1.0.0:", status, flush=True)

    # 5. 建 Release（已存在则复用）
    status, rel = api("GET", f"/repos/{OWNER}/{REPO}/releases/tags/v1.0.0")
    if status == 404:
        status, rel = api("POST", f"/repos/{OWNER}/{REPO}/releases",
                          {"tag_name": "v1.0.0", "name": "v1.0.0", "body": RELEASE_NOTES})
        assert status == 201, f"建 Release 失败: {status} {rel}"
    print("Release:", rel["html_url"], flush=True)

    # 6. 上传安装包（upload_url 是完整 URL，只取 path 部分；重跑时先删同名旧资产）
    from urllib.parse import quote, urlparse
    upload_path = urlparse(rel["upload_url"].split("{")[0]).path
    status, existing = api("GET", f"/repos/{OWNER}/{REPO}/releases/{rel['id']}/assets")
    old_ids = {a["name"]: a["id"] for a in existing} if status == 200 else {}
    assets_dir = pathlib.Path.home() / "workspace/your_files/通信概预算App"
    for fname in ["通信概预算-1.0.0-arm64-mac.zip", "通信概预算-1.0.0-mac.zip"]:
        if fname in old_ids:
            api("DELETE", f"/repos/{OWNER}/{REPO}/releases/assets/{old_ids[fname]}")
            print("已删同名旧资产:", fname, flush=True)
        data = (assets_dir / fname).read_bytes()
        for attempt in (1, 2):
            try:
                status, asset = api("POST", f"{upload_path}?name={quote(fname)}", data,
                                    host="uploads.github.com", timeout=1800, content_type="application/zip")
                assert status == 201, f"上传失败 {fname}: {status} {asset}"
                print("资产已上传:", asset["browser_download_url"], f"({asset['size']} bytes)", flush=True)
                break
            except (urllib.error.URLError, AssertionError) as exc:
                print(f"上传 {fname} 第 {attempt} 次失败: {exc}", flush=True)
                if attempt == 2:
                    raise
    print("完成。Release:", rel["html_url"], flush=True)


if __name__ == "__main__":
    main()
