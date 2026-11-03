# Convert the single-file build (dist/web/index.html) into a claude.ai Artifact page:
# strips the html/head/body wrapper the Artifact host adds itself; keeps <title> first.
# Usage: python3 web/to-artifact.py dist/web/index.html <out.html>
import re, sys
s = open(sys.argv[1]).read()
head = re.search(r'<head>(.*?)</head>', s, re.S).group(1)
body = re.search(r'<body>(.*?)</body>', s, re.S).group(1)
head = re.sub(r'<meta charset="utf-8"\s*/?>', '', head)
head = re.sub(r'<meta name="viewport"[^>]*>', '', head)
title = re.search(r'<title>.*?</title>', head).group(0); head = head.replace(title, '')
meta = re.search(r'<meta name="claude:viewport-fit-sides"[^>]*>', head).group(0); head = head.replace(meta, '')
open(sys.argv[2], 'w').write(title + "\n" + meta + "\n" + head.strip() + "\n" + body.strip() + "\n")
