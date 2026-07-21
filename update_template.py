#!/usr/bin/env python3
"""Update template.html with the modified script.js content"""
import re

# Read the modified script.js
with open('unpacked/script.js', 'r', encoding='utf-8') as f:
    script_content = f.read()

# Read the current template.html
with open('unpacked/template.html', 'r', encoding='utf-8') as f:
    template_content = f.read()

# Find and replace the script content between the opening <script type="text/x-dc" tag
# and the closing </script> tag
# Pattern: <script type="text/x-dc" data-dc-script="" data-props="...">...content...</script>

# Find the opening tag
opening_pattern = r'<script type="text/x-dc"[^>]*>'
match = re.search(opening_pattern, template_content)

if not match:
    print("ERROR: Could not find opening <script type=\"text/x-dc\"> tag!")
    exit(1)

opening_end = match.end()
# Find the closing </script> tag after the opening tag
closing_match = template_content.find('</script>', opening_end)

if closing_match == -1:
    print("ERROR: Could not find closing </script> tag!")
    exit(1)

# Replace the content between the tags
new_template = template_content[:opening_end] + '\n' + script_content + '\n' + template_content[closing_match:]

# Write back to template.html
with open('unpacked/template.html', 'w', encoding='utf-8') as f:
    f.write(new_template)

print("[OK] Updated unpacked/template.html with modified script.js")
print(f"  Opening tag at position {opening_end}")
print(f"  Closing tag at position {closing_match}")
