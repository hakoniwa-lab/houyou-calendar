"""記事の <details class="faq-item"> から FAQPage の JSON-LD を作って <!--FAQ_JSONLD--> に入れる。
本文のよくある質問と構造化データが食い違わないように、本文の方を正にする。
使い方: python scripts/faq_jsonld.py guide/mochu-giri-kyodai/index.html ...(手書きの記事で使う。何度流しても同じ結果)
"""
import json
import re
import sys

for p in sys.argv[1:]:
    s = open(p, encoding="utf-8").read()
    items = re.findall(r'<details class="faq-item">\s*<summary>(.*?)</summary>\s*<p>(.*?)</p>\s*</details>', s, re.S)
    assert items, f"FAQがない: {p}"
    strip = lambda t: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", t)).strip()
    data = {
        "@context": "https://schema.org", "@type": "FAQPage",
        "mainEntity": [{"@type": "Question", "name": strip(q),
                        "acceptedAnswer": {"@type": "Answer", "text": strip(a)}} for q, a in items],
    }
    tag = '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "</script>"
    if "<!--FAQ_JSONLD-->" in s:
        s = s.replace("<!--FAQ_JSONLD-->", tag)
    else:
        s, n = re.subn(r'<script type="application/ld\+json">\{"@context":"https://schema.org","@type":"FAQPage".*?</script>', lambda m: tag, s, flags=re.S)
        assert n == 1, f"JSON-LDの置き場所がない: {p}"
    out = s.encode("utf-8")
    with open(p, "wb") as f:
        f.write(out)
    print(p, len(items), "問")
