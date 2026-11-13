#!/usr/bin/env python3
"""Add/refresh ?v=STAMP on every local JS import and CSS link, so browsers never mix
cached old files with new ones after a deploy. Run before committing: python3 tools/stamp.py"""
import re, time, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
stamp = time.strftime('%Y%m%d%H%M')
pats = [
    (re.compile(r"""(from\s+'\./[\w-]+\.js)(\?v=\w+)?'"""), r"\1?v=%s'" % stamp),
    (re.compile(r"""(import\(\s*'\./[\w-]+\.js)(\?v=\w+)?'"""), r"\1?v=%s'" % stamp),
    (re.compile(r'''(href="[\w-]+\.css)(\?v=\w+)?"'''), r'\1?v=%s"' % stamp),
    (re.compile(r'''(src="\./?[\w-]+\.js)(\?v=\w+)?"'''), r'\1?v=%s"' % stamp),
]
for f in list(root.glob('*.html')) + list(root.glob('*.js')):
    s = f.read_text(); t = s
    for p, r in pats: t = p.sub(r, t)
    if t != s: f.write_text(t); print('stamped', f.name)
print('version', stamp)
