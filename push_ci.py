#!/usr/bin/env python3
"""推 CI 改动到 tx-budget：package.json、package-lock.json、crosscheck 测试、build.yml；
然后把 v1.0.0 tag 移到最新 main，并触发 workflow_dispatch 构建 v1.0.0。"""
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
APP_DIR = pathlib.Path.home() / "workspace/budget-app"
FILES = ["package.json", "package-lock.json", "tests/crosscheck.test.mjs", ".github/workflows/build.yml"]


def api(method, path, body=None, timeout=120):
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
    for rel in FILES:
        data = (APP_DIR / rel).read_bytes()
        b64 = base64.b64encode(data).decode("ascii")
        status, cur = api("GET", f"/repos/{OWNER}/{REPO}/contents/{quote(rel)}?ref=main")
        body = {"message": f"CI 构建：{rel}", "content": b64, "branch": "main"}
        if status == 200:
            body["sha"] = cur["sha"]
        status, res = api("PUT", f"/repos/{OWNER}/{REPO}/contents/{quote(rel)}", body)
        assert status in (200, 201), f"PUT 失败 {rel}: {status} {res}"
        print("已推:", rel, flush=True)

    status, main_ref = api("GET", f"/repos/{OWNER}/{REPO}/git/refs/heads/main")
    assert status == 200, f"查 main 失败: {status} {main_ref}"
    new_sha = main_ref["object"]["sha"]
    # 移 tag v1.0.0 到最新 main（含 CI + exceljs 修复）
    status, res = api("PATCH", f"/repos/{OWNER}/{REPO}/git/refs/tags/v1.0.0", {"sha": new_sha, "force": True})
    assert status == 200, f"移 tag 失败: {status} {res}"
    print("tag v1.0.0 已移到:", new_sha, flush=True)

    # 触发 workflow_dispatch（ref=v1.0.0，workflow 文件已在该 tag 上）
    status, res = api("POST", f"/repos/{OWNER}/{REPO}/actions/workflows/build.yml/dispatches",
                      {"ref": "v1.0.0", "inputs": {"tag": "v1.0.0"}})
    assert status == 204, f"触发构建失败: {status} {res}"
    print("构建已触发", flush=True)


if __name__ == "__main__":
    main()
