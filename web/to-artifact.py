# Convert the build (dist/web/index.html plus its on-demand data files in dist/web/data/) into one claude.ai Artifact
# page: strips the html/head/body wrapper the Artifact host adds itself, keeps <title> first, and carries the data
# files inline as window.__PARTS__ (lib/parts.svelte.ts and lib/geoData.ts read it instead of fetching).
# Usage: python3 web/to-artifact.py dist/web/index.html <out.html>
import json, os, re, sys
s = open(sys.argv[1]).read()
head = re.search(r'<head>(.*?)</head>', s, re.S).group(1)
body = re.search(r'<body>(.*?)</body>', s, re.S).group(1)
head = re.sub(r'<meta charset="utf-8"\s*/?>', '', head)
head = re.sub(r'<meta name="viewport"[^>]*>', '', head)
title = re.search(r'<title>.*?</title>', head).group(0); head = head.replace(title, '')
meta = re.search(r'<meta name="claude:viewport-fit-sides"[^>]*>', head).group(0); head = head.replace(meta, '')
data_dir = os.path.join(os.path.dirname(sys.argv[1]), "data")
parts = {f"data/{f}": json.load(open(os.path.join(data_dir, f))) for f in sorted(os.listdir(data_dir)) if f.endswith(".json")} if os.path.isdir(data_dir) else {}
inline = "<script>window.__PARTS__=" + json.dumps(parts, separators=(",", ":")).replace("</", "<\\/") + ";</script>\n" if parts else ""
open(sys.argv[2], 'w').write(title + "\n" + meta + "\n" + inline + head.strip() + "\n" + body.strip() + "\n")
