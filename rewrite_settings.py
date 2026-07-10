import re

# Update SettingsScreen.jsx
with open('televault-desktop/src/screens/SettingsScreen.jsx', 'r') as f:
    content = f.read()

# Remove AccountPanel import
content = re.sub(r"import \{ AccountPanel \} from '\.\./components/AccountPanel';\n", "", content)

# Remove account, onSignOut props documentation
target_props_doc = r"""/\*\*
 \* @param \{\{
 \*   account\?: \{
 \*     email\?: string \| null,
 \*     userType\?: string \| null,
 \*     createdAt\?: string \| null,
 \*     freeRemainingTokens\?: number \| null,
 \*     isFreeTier\?: boolean,
 \*   \},
 \*   onSignOut\?: \(\) => void,
 \* \}\} props
 \*/
"""
content = re.sub(target_props_doc, "", content)

# Remove account, onSignOut props from SettingsScreen signature
content = re.sub(r"export function SettingsScreen\(\{ account, onSignOut \}\) \{", "export function SettingsScreen() {", content)

# Remove AccountPanel usage inside return
target_account_panel = r"""          <AccountPanel
            variant="settings"
            email=\{account\?\.email\}
            televaultTier=\{account\?\.televaultTier\}
            createdAt=\{account\?\.createdAt\}
            freeRemainingTokens=\{account\?\.freeRemainingTokens\}
            isFreeTier=\{account\?\.isFreeTier\}
            onSignOut=\{onSignOut\}
          />\n"""
content = re.sub(target_account_panel, "", content)

with open('televault-desktop/src/screens/SettingsScreen.jsx', 'w') as f:
    f.write(content)
