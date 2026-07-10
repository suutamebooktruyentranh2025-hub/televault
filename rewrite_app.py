import re

# Update App.jsx
with open('televault-desktop/src/App.jsx', 'r') as f:
    app_content = f.read()

# Remove imports
app_content = re.sub(r"import \{ FreeUserTrialExpiredModal \} from '\./components/FreeUserTrialExpiredModal';\n", "", app_content)
app_content = re.sub(r"import \{ SupabaseAuthScreen \} from '\./screens/SupabaseAuthScreen';\n", "", app_content)

# Update useSession destructuring
app_content = re.sub(
    r"  const \{ state, signInGoogle, saveTelegramApi, submitPhone, submitEmail, submitEmailCode, submitRegistration, submitCode, submitPassword, signOut, forceLogoutExpiredTrial \} =",
    r"  const { state, saveTelegramApi, submitPhone, submitEmail, submitEmailCode, submitRegistration, submitCode, submitPassword, signOut } =",
    app_content
)

# Remove trialExpiredBusy state
app_content = re.sub(r"  const \[trialExpiredBusy, setTrialExpiredBusy\] = useState\(false\);\n\n", "", app_content)
app_content = re.sub(r"  const handleTrialExpiredConfirm = useCallback\(async \(\) => \{.*?\n  \}, \[forceLogoutExpiredTrial\]\);\n\n", "", app_content, flags=re.DOTALL)

# Remove supabaseAuth branch
app_content = re.sub(r"  \} else if \(state\.phase === 'supabaseAuth'\) \{.*?    \);\n", "", app_content, flags=re.DOTALL)

# Remove FreeUserTrialExpiredModal component
app_content = re.sub(r"      <FreeUserTrialExpiredModal.*?\/>\n", "", app_content, flags=re.DOTALL)

# Modify VaultShell account prop
target_account = r"""      <VaultShell
        account=\{\{
          email: state\.supabaseEmail,
          televaultTier: state\.supabaseTelevaultTier,
          createdAt: state\.televaultEntitlementCreatedAt,
          freeRemainingTokens: state\.freeRemainingTokens,
          isFreeTier: state\.isFreeTier,
        \}\}"""
replacement_account = r"""      <VaultShell
        account={{}}"""
app_content = re.sub(target_account, replacement_account, app_content)

with open('televault-desktop/src/App.jsx', 'w') as f:
    f.write(app_content)


# Update useSession.js
with open('televault-desktop/src/hooks/useSession.js', 'r') as f:
    session_content = f.read()

# Remove default state properties
session_content = re.sub(r"  signingIn: false,\n", "", session_content)
session_content = re.sub(r"  supabaseEmail: null,\n", "", session_content)
session_content = re.sub(r"  supabaseTelevaultTier: null,\n", "", session_content)
session_content = re.sub(r"  televaultEntitlementCreatedAt: null,\n", "", session_content)
session_content = re.sub(r"  isFreeTier: false,\n", "", session_content)
session_content = re.sub(r"  freeRemainingTokens: null,\n", "", session_content)

# Remove signInGoogle function
session_content = re.sub(r"  const signInGoogle = useCallback\(async \(\) => \{.*?\n  \}, \[applyState\]\);\n\n", "", session_content, flags=re.DOTALL)

# Remove forceLogoutExpiredTrial function
session_content = re.sub(r"  const forceLogoutExpiredTrial = useCallback\(async \(\) => \{.*?\n  \}, \[applyState\]\);\n\n", "", session_content, flags=re.DOTALL)

# Update return statement
session_content = re.sub(r"    signInGoogle,\n", "", session_content)
session_content = re.sub(r"    forceLogoutExpiredTrial,\n", "", session_content)

with open('televault-desktop/src/hooks/useSession.js', 'w') as f:
    f.write(session_content)
