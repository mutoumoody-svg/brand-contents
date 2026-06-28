#!/usr/bin/env python3
"""
小红书关键词采集 - 独立版（不依赖任何智能体平台 SDK）

策略：
1. 用博查 AI Search API（中文网页搜索）发现已被搜索引擎收录的小红书笔记链接
2. 直接访问公开笔记页面，解析页面自带的 window.__INITIAL_STATE__（未登录可见的公开数据）
3. 找不到直接链接时，从外部页面摘要里用 Claude 提取小红书相关内容（质量较低，无真实互动数据）
4. 仍然不够时，回退到小红书 explore 首页热门笔记，按关键词做粗筛

只在 stdout 输出最终一行 JSON 结果；过程日志走 stderr，方便 Node 端只解析 stdout。

用法: python3 xhs_scrape.py <keyword> [max_details]
环境变量: BOCHA_API_KEY（必需）, CLAUDE_PROXY_URL（可选，默认走 Brand Center 现有代理）
"""
import sys
import os
import json
import re
import time
import random
from datetime import datetime

import requests

XHS_BASE_URL = "https://www.xiaohongshu.com"
XHS_EXPLORE_URL = f"{XHS_BASE_URL}/explore"

PC_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": f"{XHS_BASE_URL}/",
}

# 同时匹配桌面版 /explore/{id} 和移动版 /discovery/item/{id} 两种链接格式
# 真实笔记ID不一定符合"中间8位是0"的规律，去掉这条过严的校验
XHS_NOTE_LINK = re.compile(r"xiaohongshu\.com/(?:explore|discovery/item)/([a-f0-9]{16,32})")

BOCHA_API_KEY = os.environ.get("BOCHA_API_KEY", "")
BOCHA_URL = "https://api.bochaai.com/v1/web-search"
# 直连 anthorpic-proxy.mutoumoody.workers.dev 在这台服务器上遇到 DNS 污染连不通，
# 改走本机 Node 服务的内部转发端口（Node 进程本身连得通这个域名）
CLAUDE_PROXY_URL = os.environ.get("CLAUDE_PROXY_URL", "http://localhost:3000/api/internal/claude")
CLAUDE_WORKER_SECRET = "brand-worker-nz-2024"


def log(msg):
    print(msg, file=sys.stderr)


class NoteIdStore:
    def __init__(self):
        self._data = {}

    def add(self, note_id, xsec_token=""):
        if not note_id:
            return
        if note_id not in self._data or (xsec_token and not self._data.get(note_id)):
            self._data[note_id] = xsec_token or self._data.get(note_id, "")

    @property
    def ids(self):
        return list(self._data.keys())

    def get_token(self, note_id):
        return self._data.get(note_id, "")

    def __len__(self):
        return len(self._data)


def _extract_xhs_links(text, store):
    if not text:
        return
    for m in XHS_NOTE_LINK.finditer(text):
        store.add(m.group(1))


class XhsHttpClient:
    """带限速 + 退避重试的 HTTP 客户端，只访问公开页面，不使用任何账号 cookie"""

    def __init__(self, max_retries=3, retry_delay=2.0):
        self.session = requests.Session()
        self.session.headers.update(PC_HEADERS)
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self._last_request_time = 0.0

    def _throttle(self, min_interval=1.5):
        elapsed = time.time() - self._last_request_time
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed + random.uniform(0, 0.5))
        self._last_request_time = time.time()

    def get(self, url, timeout=15, **kwargs):
        for attempt in range(self.max_retries):
            try:
                self._throttle()
                resp = self.session.get(url, timeout=timeout, **kwargs)
                if resp.status_code == 200:
                    return resp
                elif resp.status_code == 429:
                    wait = self.retry_delay * (2 ** attempt) + random.uniform(1, 3)
                    log(f"    [429] 等待 {wait:.1f}s...")
                    time.sleep(wait)
                elif resp.status_code >= 500:
                    time.sleep(self.retry_delay * (2 ** attempt))
                else:
                    return None
            except requests.exceptions.Timeout:
                time.sleep(self.retry_delay)
            except requests.exceptions.ConnectionError:
                time.sleep(self.retry_delay * 2)
            except Exception as e:
                log(f"    [HTTP错误] {e}")
                return None
        return None


def parse_initial_state(html):
    match = re.search(r"window\.__INITIAL_STATE__\s*=\s*({.*?})\s*</script>", html, re.DOTALL)
    if not match:
        return None
    json_str = match.group(1).replace("undefined", "null")
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        try:
            return json.loads(json_str.replace("'", '"'))
        except Exception:
            return None


def extract_note_detail(state, note_id):
    note_map = state.get("note", {}).get("noteDetailMap", {})
    if not note_map:
        return None
    detail = note_map.get(note_id)
    if not detail:
        for k, v in note_map.items():
            if isinstance(v, dict) and "note" in v:
                detail = v
                note_id = k
                break
    if not detail or not isinstance(detail, dict):
        return None
    note_info = detail.get("note", {})
    if not note_info:
        return None
    interact = note_info.get("interactInfo", {})
    user = note_info.get("user", {})

    images = []
    for img in note_info.get("imageList", []):
        img_data = {"url": img.get("url", ""), "urlDefault": img.get("urlDefault", "")}
        for info in img.get("infoList", []):
            if info.get("url"):
                img_data["urlHD"] = info["url"]
                break
        images.append(img_data)

    tags = [t.get("name", "") for t in note_info.get("tagList", []) if t.get("name")]

    publish_ts = note_info.get("time", "")
    publish_time_str = ""
    if publish_ts and isinstance(publish_ts, (int, float)):
        try:
            publish_time_str = datetime.fromtimestamp(publish_ts / 1000).strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            publish_time_str = str(publish_ts)

    return {
        "noteId": note_info.get("noteId", note_id),
        "title": note_info.get("title", ""),
        "desc": note_info.get("desc", ""),
        "publishTime": publish_time_str,
        "author": user.get("nickname", ""),
        "likedCount": interact.get("likedCount", "0"),
        "collectedCount": interact.get("collectedCount", "0"),
        "commentCount": interact.get("commentCount", "0"),
        "tagList": tags,
        "coverUrl": images[0]["urlHD"] if images and images[0].get("urlHD") else (images[0]["url"] if images else ""),
        "noteUrl": f"{XHS_EXPLORE_URL}/{note_id}",
    }


def fetch_note_detail(http_client, note_id, xsec_token=""):
    try:
        url = f"{XHS_EXPLORE_URL}/{note_id}"
        if xsec_token:
            url += f"?xsec_token={xsec_token}&xsec_source=pc_search"
        resp = http_client.get(url)
        if not resp:
            log(f"    [详情失败] {note_id}: HTTP 请求未成功（重试后仍失败，可能是403/429/超时）")
            return None
        state = parse_initial_state(resp.text)
        if not state:
            log(f"    [详情失败] {note_id}: 页面里没找到 __INITIAL_STATE__，可能是验证页/登录墙，页面片段：{resp.text[:150]!r}")
            return None
        detail = extract_note_detail(state, note_id)
        if not detail:
            log(f"    [详情失败] {note_id}: __INITIAL_STATE__ 解析到了但取不出笔记数据（可能是无 xsec_token 被限制返回）")
        return detail
    except Exception as e:
        log(f"    [详情错误] {note_id}: {e}")
        return None


def search_via_bocha(keyword, max_queries=3):
    """策略1: 用博查 AI Search API 发现小红书笔记链接"""
    store = NoteIdStore()
    external_pages = []
    if not BOCHA_API_KEY:
        log("  [博查] 未配置 BOCHA_API_KEY，跳过此策略")
        return store, external_pages

    queries = [
        f'"{keyword}" 小红书 xiaohongshu.com',
        f"{keyword} 小红书推荐 笔记",
        f"site:xiaohongshu.com {keyword}",
    ][:max_queries]

    for query in queries:
        try:
            log(f"  [博查搜索] {query}")
            resp = requests.post(
                BOCHA_URL,
                headers={"Authorization": f"Bearer {BOCHA_API_KEY}", "Content-Type": "application/json"},
                json={"query": query, "summary": True, "count": 10, "freshness": "noLimit"},
                timeout=15,
            )
            log(f"    [博查HTTP状态] {resp.status_code}")
            data = resp.json()
            # 调试：打印原始返回的前800字符，方便核对字段结构是否猜对
            log(f"    [博查原始返回] {json.dumps(data, ensure_ascii=False)[:800]}")
            pages = ((data.get("data") or {}).get("webPages") or {}).get("value", []) or []
            log(f"    [博查解析出] {len(pages)} 条结果")
            for p in pages:
                url = p.get("url", "") or ""
                text = f"{p.get('name','')} {p.get('snippet','')} {p.get('summary','')}"
                _extract_xhs_links(url, store)
                _extract_xhs_links(text, store)
                if "xiaohongshu.com" not in url and url.startswith("http"):
                    external_pages.append({"url": url, "text": text})
            time.sleep(0.5)
        except Exception as e:
            log(f"  [博查错误] {e}")
    return store, external_pages


def extract_via_claude(text, keyword):
    """策略2: 用 Claude 从外部页面摘要里提取小红书相关内容（质量较低，无真实互动数据）"""
    if not text or len(text) < 30:
        return []
    prompt = (
        f"以下是一段网页摘要文字，可能引用/转载了小红书上关于「{keyword}」的内容。"
        f"如果其中包含具体的小红书笔记信息，提取标题、正文内容、作者昵称、点赞数（没有就留空字符串）、话题标签，"
        f'严格输出 JSON 数组，不要任何其他文字，格式如：[{{"title":"","desc":"","author":"","likedCount":"","tagList":[]}}]。'
        f"如果没有相关内容，输出空数组 []。\n\n网页摘要：\n{text[:3000]}"
    )
    try:
        resp = requests.post(
            CLAUDE_PROXY_URL,
            headers={"Content-Type": "application/json", "x-worker-secret": CLAUDE_WORKER_SECRET},
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 1200,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=30,
        )
        data = resp.json()
        raw = "".join(b.get("text", "") for b in data.get("content", []))
        f = raw.find("[")
        l = raw.rfind("]")
        if f == -1 or l == -1:
            return []
        items = json.loads(raw[f:l + 1])
        return items if isinstance(items, list) else []
    except Exception as e:
        log(f"  [Claude提取错误] {e}")
        return []


def search_notes(keyword, max_details=20):
    log(f"\n{'='*50}\n搜索关键词: {keyword}\n{'='*50}")
    http_client = XhsHttpClient()

    # 策略1: 博查搜索发现笔记链接
    id_store, external_pages = search_via_bocha(keyword)
    log(f"  → 博查发现 {len(id_store)} 个笔记 ID，{len(external_pages)} 个外部页面待提取")

    # 策略2: 笔记数不足时，从外部页面用 Claude 提取
    extracted_notes = []
    if len(id_store) < 5:
        log("  → 笔记ID不足，尝试从外部页面用 Claude 提取内容")
        for page in external_pages[:5]:
            items = extract_via_claude(page["text"], keyword)
            for it in items:
                extracted_notes.append({
                    "noteId": "", "title": it.get("title", ""), "desc": it.get("desc", ""),
                    "author": it.get("author", ""), "likedCount": it.get("likedCount", ""),
                    "collectedCount": "", "commentCount": "", "tagList": it.get("tagList", []),
                    "coverUrl": "", "noteUrl": "",
                    "_source": page["url"], "_extraction_method": "llm_from_external",
                })

    # 策略3: 直接抓取公开笔记页详情（数据最完整：真实点赞/收藏/评论）
    # 先多抓一些候选（不直接按 max_details 截断），抓完详情后按点赞数排序，
    # 再只保留 Top N —— 确保拿到的是这个关键词下互动最高、最值得参考的内容，
    # 而不是博查搜索结果里随便排在前面的几条。
    detailed_notes = []
    if len(id_store) > 0:
        fetch_pool_size = min(len(id_store.ids), max(max_details * 2, 30))
        ids = list(id_store.ids)[:fetch_pool_size]
        log(f"  → 候选 {len(ids)} 条，抓取详情后按点赞排序取前 {max_details} 条")
        for note_id in ids:
            xsec = id_store.get_token(note_id)
            detail = fetch_note_detail(http_client, note_id, xsec)
            if detail:
                detail["_extraction_method"] = "direct_fetch"
                detailed_notes.append(detail)

        def _likes(n):
            raw = str(n.get("likedCount", 0) or 0)
            try:
                if "万" in raw:
                    return int(float(raw.replace("万", "")) * 10000)
                return int(float(raw))
            except (ValueError, TypeError):
                return 0

        detailed_notes.sort(key=_likes, reverse=True)
        detailed_notes = detailed_notes[:max_details]

    # 不再用 explore 首页热门兜底凑数：那批内容跟关键词毫无关系，
    # 混进结果里只会让人觉得"搜A出来的是B"。宁可结果少，不要塞不相关内容。
    if len(detailed_notes) == 0 and len(extracted_notes) == 0:
        log("  ⚠️ 没有找到与关键词相关的真实小红书内容，建议换个更通用/更常见的关键词试试")

    result = detailed_notes + extracted_notes
    for n in result:
        n["_keyword"] = keyword
    log(f"\n完成: 共获取 {len(result)} 条与关键词相关的笔记")
    return result


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "缺少关键词参数"}))
        sys.exit(1)
    keyword = sys.argv[1]
    max_details = int(sys.argv[2]) if len(sys.argv) > 2 else 20

    try:
        notes = search_notes(keyword, max_details)
        print(json.dumps({"keyword": keyword, "totalNotes": len(notes), "notes": notes}, ensure_ascii=False))
    except Exception as e:
        log(f"[致命错误] {e}")
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
