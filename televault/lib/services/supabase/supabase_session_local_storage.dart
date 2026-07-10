import 'package:supabase_flutter/supabase_flutter.dart';

/// Supabase session persistence is handled by [SecureSessionStore] (Keychain).
///
/// [EmptyLocalStorage] prevents Supabase from writing to SharedPreferences and
/// from clearing credentials when it emits a spurious [AuthChangeEvent.signedOut]
/// after a failed token refresh on iOS resume.
const EmptyLocalStorage supabaseSessionLocalStorage = EmptyLocalStorage();
