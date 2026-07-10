import re

with open('televault-desktop/src/i18n/locales.js', 'r') as f:
    content = f.read()

# Remove any lines that define a key starting with "supabase"
content = re.sub(r"^\s*supabase.*?:.*?\n", "", content, flags=re.MULTILINE)

with open('televault-desktop/src/i18n/locales.js', 'w') as f:
    f.write(content)
