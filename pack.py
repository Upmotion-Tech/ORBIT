import json

# Read the edited template
with open('unpacked/template.html', 'r', encoding='utf-8') as f:
    template_html = f.read()

# JSON-encode it
encoded = json.dumps(template_html, ensure_ascii=False)

# Escape </script -> <\/script to prevent HTML parser truncation
encoded = encoded.replace('</script', '<\\/script')

# Wrap in script tag lines
script_tag_open = '  <script type="__bundler/template">\n'
script_tag_close = '\n  </script>'
new_content = script_tag_open + encoded + script_tag_close

# Update both files
for path in ['ORBIT.html', 'backend/static/index.html', 'frontend/index.html']:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the old template block and replace
    start_marker = '<script type="__bundler/template">'
    end_marker = '</script>'
    
    start_idx = content.index(start_marker)
    end_idx = content.index(end_marker, start_idx + len(start_marker)) + len(end_marker)
    
    new_content_full = content[:start_idx] + new_content + content[end_idx:]
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content_full)
    
    print(f'Updated {path}')

print('Done.')
