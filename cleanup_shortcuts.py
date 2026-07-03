from pathlib import Path
import re

root = Path('frontend/src/pos')
attrs = re.compile(r"\s*(data-shortcut-letter|data-shortcut)=(?:\"[^\"]*\"|\'[^\']*\')")
title = re.compile(r"title=(\"|\')(.*?)(?:\s*\(Esc, Alt\+[A-Z]\)|\s*\(Alt\+[A-Z]\))\1")
title2 = re.compile(r"title=\{\s*`\$\{action\.label\}\s*\(Alt\+\$\{action\.shortcutLetter\}\)`\s*\}")
altlit1 = re.compile(r'"([^"\n]*?)\s*\(Alt\+[A-Z]\)"')
altlit2 = re.compile(r"'([^'\n]*?)\s*\(Alt\+[A-Z]\)'")
alttemplate = re.compile(r"\(Alt\+\$\{[^}]+\}\)")

changed = []
for path in sorted(root.rglob('*.tsx')):
    text = path.read_text(encoding='utf-8')
    new_text = text
    new_text = attrs.sub('', new_text)
    new_text = title.sub(lambda m: f'title={m.group(1)}{m.group(2).strip()}{m.group(1)}', new_text)
    new_text = title2.sub('title={action.label}', new_text)
    new_text = altlit1.sub(r'"\1"', new_text)
    new_text = altlit2.sub(r"'\1'", new_text)
    new_text = alttemplate.sub('', new_text)
    if new_text != text:
        path.write_text(new_text, encoding='utf-8')
        changed.append(path)

print('Modified files:', len(changed))
for path in changed:
    print(path)
