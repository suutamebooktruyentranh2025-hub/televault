import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../config/app_config.dart';
import '../../models/supabase_session_record.dart';
import 'free_user_tier.dart';
import 'privilege_normalizer.dart';
import 'secure_session_store.dart';
import 'televault_entitlement_client.dart';

/// Google OAuth + `resolve-televault-access` — shared Supabase auth, TeleVault billing gate.
final class SupabaseAuthCoordinator extends ChangeNotifier {
  SupabaseAuthCoordinator({
    SupabaseClient? client,
    SecureSessionStore? sessionStore,
    TelevaultEntitlementClient? entitlementClient,
  })  : _client = client ?? Supabase.instance.client,
        _sessionStore = sessionStore ?? SecureSessionStore(),
        _entitlementClient = entitlementClient ?? TelevaultEntitlementClient();

  static const _hydrateMaxRetries = 3;
  static const _hydrateRetryDelay = Duration(milliseconds: 1500);
  static const _iosResumeRecoveryDelay = Duration(milliseconds: 900);
  static const _sessionRecoveryMaxRetries = 3;
  static const _sessionRecoveryRetryDelay = Duration(milliseconds: 1200);
  static const _offlineGracePeriodMs = 7 * 24 * 60 * 60 * 1000;

  static const _entitlementValidateThrottleMs = 10 * 60 * 1000;

  final SupabaseClient _client;
  final SecureSessionStore _sessionStore;
  final TelevaultEntitlementClient _entitlementClient;

  Completer<Session>? _oauthCompleter;
  StreamSubscription<AuthState>? _authSub;
  Timer? _accessTokenRefreshTimer;
  bool _isSigningOut = false;
  bool _sessionRecoveryInProgress = false;
  bool _hydrated = false;

  String? errorMessage;
  bool signingIn = false;
  bool hasLocalLogin = false;
  bool freeUserTrialExpiredDialogPending = false;
  SupabaseSessionRecord? activeSession;

  bool get hydrated => _hydrated;

  bool get isSignedIn => hasLocalLogin && activeSession != null;

  String? get email => activeSession?.email;

  Session? get currentSession => _client.auth.currentSession;

  void attach() {
    _authSub ??= _client.auth.onAuthStateChange.listen(_onAuthStateChange);
  }

  Future<void> hydrate() async {
    if (_hydrated) return;
    try {
      final session = _client.auth.currentSession;
      if (session != null) {
        await _hydrateWithRetry(session);
      } else {
        final cached = await _sessionStore.loadSession();
        if (cached != null && cached.refreshToken.isNotEmpty) {
          hasLocalLogin = true;
          if (_isWithinOfflineGrace(cached)) {
            _applyLocalSession(cached);
            await _restoreSupabaseFromCache(cached);
          } else {
            _applyLocalSession(cached);
            final refreshed = await _tryRefreshFromCachedSession(cached);
            if (!refreshed) {
              await _restoreSupabaseFromCache(cached);
            }
          }
        }
      }
    } catch (e, st) {
      try {
        final cached = await _sessionStore.loadSession();
        if (cached != null && cached.refreshToken.isNotEmpty) {
          hasLocalLogin = true;
          _applyLocalSession(cached);
        }
      } catch (_) {
        hasLocalLogin = false;
        activeSession = null;
      }
      if (kDebugMode) {
        debugPrint('Supabase hydrate failed: $e\n$st');
      }
    } finally {
      if (hasLocalLogin) {
        await _syncTelevaultEntitlement(
          force: activeSession?.needsTelevaultEntitlementRefresh ?? true,
        );
      }
      _hydrated = true;
      notifyListeners();
    }
  }

  Future<void> refreshSessionOnResume() async {
    if (_isSigningOut || !hasLocalLogin) return;

    final cached = await _loadCachedSessionWithFallback();
    if (cached == null || cached.refreshToken.isEmpty) return;

    _applyLocalSession(cached);

    if (_sessionRecoveryInProgress) return;
    _sessionRecoveryInProgress = true;
    try {
      if (_client.auth.currentSession != null) {
        _scheduleAccessTokenRefresh();
        await _syncTelevaultEntitlement(force: true);
        return;
      }

      if (Platform.isIOS) {
        await Future<void>.delayed(_iosResumeRecoveryDelay);
      }
      await _restoreSupabaseFromCache(cached);
      _scheduleAccessTokenRefresh();
      await _syncTelevaultEntitlement(force: true);
    } catch (e, st) {
      if (kDebugMode) {
        debugPrint('refreshSessionOnResume: $e\n$st');
      }
    } finally {
      _sessionRecoveryInProgress = false;
    }
  }

  Future<Session> signInWithGoogle() async {
    if (!AppConfig.hasSupabaseCredentials) {
      throw StateError('supabase_missing_config');
    }

    errorMessage = null;
    signingIn = true;
    notifyListeners();

    final completer = Completer<Session>();
    _oauthCompleter = completer;

    try {
      final launched = await _client.auth.signInWithOAuth(
        OAuthProvider.google,
        redirectTo: AppConfig.oauthRedirectUrl,
        authScreenLaunchMode: LaunchMode.externalApplication,
      );
      if (!launched) {
        throw StateError('oauth_launch_failed');
      }
      final session = await completer.future.timeout(
        const Duration(minutes: 10),
        onTimeout: () => throw TimeoutException('oauth_wait'),
      );
      await _persistFromSupabaseSession(session);
      errorMessage = null;
      return session;
    } on TimeoutException {
      errorMessage = 'supabase_oauth_timeout';
      try {
        await _client.auth.signOut();
      } catch (_) {}
      rethrow;
    } on TelevaultEntitlementException catch (e) {
      errorMessage = e.message;
      await _client.auth.signOut();
      await _sessionStore.clearSession();
      hasLocalLogin = false;
      activeSession = null;
      rethrow;
    } finally {
      _oauthCompleter = null;
      signingIn = false;
      notifyListeners();
    }
  }

  Future<void> signOut() async {
    _isSigningOut = true;
    hasLocalLogin = false;
    activeSession = null;
    _accessTokenRefreshTimer?.cancel();
    errorMessage = null;
    notifyListeners();
    try {
      await _client.auth.signOut();
    } finally {
      _isSigningOut = false;
      await _sessionStore.clearSession();
      notifyListeners();
    }
  }

  void setError(String? message) {
    errorMessage = message;
    notifyListeners();
  }

  void clearFreeUserTrialExpiredDialog() {
    freeUserTrialExpiredDialogPending = false;
  }

  void markFreeUserTrialExpired() {
    if (!freeUserTrialExpiredDialogPending) {
      freeUserTrialExpiredDialogPending = true;
      notifyListeners();
    }
  }

  Future<void> updateRemainingTokens(int remainingTokens) async {
    final current = activeSession;
    if (current == null) return;
    final updated = current.copyWith(remainingTokens: remainingTokens);
    await _sessionStore.saveSession(updated);
    activeSession = updated;
    notifyListeners();
  }

  Future<void> disposeAsync() async {
    _accessTokenRefreshTimer?.cancel();
    await _authSub?.cancel();
    _authSub = null;
    _entitlementClient.dispose();
  }

  void _onAuthStateChange(AuthState state) {
    if (state.event == AuthChangeEvent.tokenRefreshed && state.session != null) {
      unawaited(_persistTokenRefresh(state.session!));
      return;
    }

    if (state.event == AuthChangeEvent.signedIn && state.session != null) {
      final pending = _oauthCompleter;
      if (pending != null && !pending.isCompleted) {
        pending.complete(state.session);
        return;
      }
      unawaited(_persistExternalSignIn(state.session!));
      return;
    }

    if (state.event == AuthChangeEvent.signedOut) {
      if (_isSigningOut) return;
      unawaited(_reattachLocalSession());
    }
  }

  Future<void> _persistExternalSignIn(Session session) async {
    try {
      await _persistFromSupabaseSession(session);
      errorMessage = null;
    } on TelevaultEntitlementException catch (e) {
      errorMessage = e.message;
      await _client.auth.signOut();
      await _sessionStore.clearSession();
      hasLocalLogin = false;
      activeSession = null;
    } catch (e, st) {
      if (kDebugMode) {
        debugPrint('External sign-in persist failed: $e\n$st');
      }
    } finally {
      notifyListeners();
    }
  }

  Future<void> _hydrateWithRetry(Session session) async {
    for (var attempt = 0; attempt < _hydrateMaxRetries; attempt++) {
      if (attempt > 0) await Future<void>.delayed(_hydrateRetryDelay);
      try {
        await _persistFromSupabaseSession(session);
        return;
      } on TelevaultEntitlementException {
        await _client.auth.signOut();
        await _sessionStore.clearSession();
        hasLocalLogin = false;
        activeSession = null;
        return;
      } catch (e) {
        if (kDebugMode) {
          debugPrint('Hydrate retry ${attempt + 1}/$_hydrateMaxRetries failed: $e');
        }
      }
    }

    final cached = await _sessionStore.loadSession();
    if (cached != null && cached.refreshToken.isNotEmpty) {
      _applyLocalSession(cached);
    }
  }

  Future<void> _persistFromSupabaseSession(Session session) async {
    final entitlement = await _entitlementClient.resolveEntitlement(
      accessToken: session.accessToken,
      defaultTokens: AppConfig.freeUserTokenMax,
    );
    final refreshToken = session.refreshToken ?? '';
    if (refreshToken.isEmpty) {
      throw TelevaultEntitlementException('Supabase session missing refresh token');
    }

    final nowEpoch = DateTime.now().millisecondsSinceEpoch;
    final snapshot = SupabaseSessionRecord(
      email: entitlement.email,
      televaultTier: normalizeTelevaultTier(entitlement.televaultTierRaw),
      televaultImpliedFree: entitlement.televaultImpliedFree,
      accessToken: session.accessToken,
      refreshToken: refreshToken,
      expiresAtEpochMs: _sessionExpiryEpochMs(session),
      lastValidatedEpochMs: nowEpoch,
      savedAtIso: DateTime.now().toUtc().toIso8601String(),
      remainingTokens: entitlement.remainingTokens,
      televaultEntitlementCreatedAt: entitlement.televaultEntitlementCreatedAt,
    );
    await _sessionStore.saveSession(snapshot);
    hasLocalLogin = true;
    activeSession = snapshot;
    _scheduleAccessTokenRefresh();
    _checkFreeUserTrialExpiry(snapshot);
    notifyListeners();
  }

  Future<void> _syncTelevaultEntitlement({required bool force}) async {
    if (_isSigningOut || !hasLocalLogin) return;

    final cached = activeSession;
    if (cached == null) return;
    if (!force && !cached.needsTelevaultEntitlementRefresh) {
      final nowEpoch = DateTime.now().millisecondsSinceEpoch;
      if (nowEpoch - cached.lastValidatedEpochMs < _entitlementValidateThrottleMs) {
        return;
      }
    }

    final accessToken =
        _client.auth.currentSession?.accessToken ?? cached.accessToken;
    if (accessToken.isEmpty) return;

    try {
      final entitlement = await _entitlementClient.resolveEntitlement(
        accessToken: accessToken,
        defaultTokens: AppConfig.freeUserTokenMax,
      );
      final nowEpoch = DateTime.now().millisecondsSinceEpoch;
      final updated = cached.copyWith(
        email: entitlement.email,
        televaultTier: normalizeTelevaultTier(entitlement.televaultTierRaw),
        televaultImpliedFree: entitlement.televaultImpliedFree,
        remainingTokens: entitlement.remainingTokens,
        accessToken: accessToken,
        lastValidatedEpochMs: nowEpoch,
        televaultEntitlementCreatedAt: entitlement.televaultEntitlementCreatedAt,
        sessionSchemaVersion: SupabaseSessionRecord.currentSessionSchemaVersion,
      );
      await _sessionStore.saveSession(updated);
      activeSession = updated;
      _checkFreeUserTrialExpiry(updated);
      notifyListeners();
    } catch (e, st) {
      if (kDebugMode) {
        debugPrint('TeleVault entitlement sync failed: $e\n$st');
      }
    }
  }

  void _checkFreeUserTrialExpiry(SupabaseSessionRecord session) {
    if (isFreeTrialExpired(
      session: session,
      televaultEntitlementCreatedAt: session.televaultEntitlementCreatedAt,
    )) {
      freeUserTrialExpiredDialogPending = true;
    }
  }

  Future<void> _persistTokenRefresh(Session session) async {
    final current = activeSession;
    if (current == null) return;
    final refreshToken = session.refreshToken ?? current.refreshToken;
    final updated = current.copyWith(
      accessToken: session.accessToken,
      refreshToken: refreshToken,
      expiresAtEpochMs: _sessionExpiryEpochMs(session),
    );
    await _sessionStore.saveSession(updated);
    activeSession = updated;
    _scheduleAccessTokenRefresh();
    unawaited(_syncTelevaultEntitlement(force: true));
    notifyListeners();
  }

  int _sessionExpiryEpochMs(Session session) {
    final expiresAt = session.expiresAt;
    if (expiresAt != null) {
      return expiresAt * 1000;
    }
    return DateTime.now().add(const Duration(minutes: 55)).millisecondsSinceEpoch;
  }

  void _applyLocalSession(SupabaseSessionRecord session) {
    activeSession = session;
    hasLocalLogin = true;
    _scheduleAccessTokenRefresh();
    notifyListeners();
  }

  void _scheduleAccessTokenRefresh() {
    _accessTokenRefreshTimer?.cancel();
    final session = activeSession;
    if (session == null || !hasLocalLogin) return;

    const refreshLeadMs = 5 * 60 * 1000;
    final refreshAtMs = session.expiresAtEpochMs - refreshLeadMs;
    final delayMs = refreshAtMs - DateTime.now().millisecondsSinceEpoch;

    if (delayMs <= 0) {
      unawaited(_refreshActiveSessionToken());
      return;
    }

    _accessTokenRefreshTimer = Timer(Duration(milliseconds: delayMs), () {
      unawaited(_refreshActiveSessionToken());
    });
  }

  Future<void> _refreshActiveSessionToken() async {
    final cached = await _loadCachedSessionWithFallback();
    if (cached == null || cached.refreshToken.isEmpty) return;
    await _tryRefreshFromCachedSession(cached);
    _scheduleAccessTokenRefresh();
  }

  Future<SupabaseSessionRecord?> _loadCachedSessionWithFallback() async {
    return await _sessionStore.loadSession() ?? activeSession;
  }

  bool _cachedAccessTokenStillValid(SupabaseSessionRecord cached) {
    const marginMs = 60 * 1000;
    return cached.expiresAtEpochMs >
        DateTime.now().millisecondsSinceEpoch + marginMs;
  }

  bool _isWithinOfflineGrace(SupabaseSessionRecord cached) {
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    final isExpired = cached.expiresAtEpochMs <= nowMs;
    return !isExpired ||
        (nowMs - cached.expiresAtEpochMs) < _offlineGracePeriodMs;
  }

  Future<bool> _restoreSupabaseFromCache(SupabaseSessionRecord cached) async {
    if (cached.refreshToken.isEmpty) return false;

    if (_cachedAccessTokenStillValid(cached)) {
      try {
        final response = await _client.auth.setSession(
          cached.refreshToken,
          accessToken: cached.accessToken,
        );
        if (response.session != null) {
          await _persistTokenRefresh(response.session!);
          return true;
        }
      } catch (e) {
        if (kDebugMode) {
          debugPrint('setSession fast restore failed: $e');
        }
      }
    }

    return _tryRefreshFromCachedSession(cached);
  }

  Future<bool> _tryRefreshFromCachedSession(SupabaseSessionRecord cached) async {
    if (cached.refreshToken.isEmpty) return false;

    for (var attempt = 0; attempt < _sessionRecoveryMaxRetries; attempt++) {
      if (attempt > 0) {
        await Future<void>.delayed(_sessionRecoveryRetryDelay);
      }
      try {
        final response = await _client.auth.refreshSession(cached.refreshToken);
        if (response.session != null) {
          await _persistTokenRefresh(response.session!);
          return true;
        }
      } catch (e) {
        if (kDebugMode) {
          debugPrint(
            'Session refresh attempt ${attempt + 1}/$_sessionRecoveryMaxRetries failed: $e',
          );
        }
      }
    }
    return false;
  }

  Future<void> _reattachLocalSession() async {
    if (_isSigningOut || !hasLocalLogin) return;

    for (var attempt = 0; attempt < _sessionRecoveryMaxRetries; attempt++) {
      if (attempt > 0) {
        await Future<void>.delayed(_sessionRecoveryRetryDelay);
      }
      final cached = await _sessionStore.loadSession();
      if (cached != null && cached.refreshToken.isNotEmpty) {
        _applyLocalSession(cached);
        if (Platform.isIOS) {
          await Future<void>.delayed(_iosResumeRecoveryDelay);
        }
        unawaited(_restoreSupabaseFromCache(cached));
        return;
      }
    }
    notifyListeners();
  }
}
