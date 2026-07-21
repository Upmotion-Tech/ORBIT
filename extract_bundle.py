import json
import re

# Read ORBIT.html
with open('ORBIT.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the __bundler/template script tag
match = re.search(r'<script type="__bundler/template">([^<]*)<\/script>', content, re.DOTALL)
if not match:
    print('ERROR: Could not find template script tag')
    exit(1)

json_str = match.group(1).strip()

# Parse the JSON
try:
    data = json.loads(json_str)
    template_html = data.get('html', '')
    if not template_html:
        print('ERROR: No html field in template')
        exit(1)

    # Write template
    with open('unpacked/template.html', 'w', encoding='utf-8') as f:
        f.write(template_html)
    print(f'✓ Extracted template.html ({len(template_html):,} chars)')
except Exception as e:
    print(f'ERROR parsing JSON: {e}')
    exit(1)
