import 'dart:async';

import 'package:flutter/foundation.dart';

import '../app_bootstrap.dart';
import '../config/app_config.dart';
import '../services/index_db.dart';
import '../services/supabase/supabase_auth_coordinator.dart';
import '../services/supabase/televault_entitlement_client.dart';
import '../services/supabase/free_user_credit_client.dart';
import '../services/supabase/free_user_tier.dart';
import '../services/telegram/auth_service.dart' as tg;
import '../services/telegram/channel_service.dart';
import '../services/telegram/telegram_api_credentials_store.dart';
import '../services/transfer_service.dart';
import '../services/vault_service.dart';

enum SessionPhase {
  booting,
  supabaseAuth,
  telegramApiSetup,
  telegramBooting,
  auth,
  syncing,
  ready,
}

class SessionProvider extends ChangeNotifier {
  SessionPhase phase = SessionPhase.booting;
  tg.AuthState authState = tg.AuthState.starting;
  String? authError;
  String? bootError;
  String? syncError;
  String? telegramApiError;
  String? supabaseEmail;
  int scannedCount = 0;

  late Bootstrap boot;
  VaultService? vault;
  ChannelService? channel;
  final queue = TransferQueue();
  final void Function(IndexDb db)? onSettingsReady;

  final SupabaseAuthCoordinator supabaseAuth = SupabaseAuthCoordinator();
  final TelegramApiCredentialsStore _credentialsStore = TelegramApiCredentialsStore();
  final FreeUserCreditClient _creditClient = FreeUserCreditClient();
  TransferStatusCallback? _vaultTransferStatusHandler;

  SessionProvider({this.onSettingsReady});

  int _syncGeneration = 0;
  StreamSubscription<void>? _changesSub;

  Future<void> start() async {
    supabaseAuth.attach();
    if (AppConfig.hasSupabaseCredentials) {
      await supabaseAuth.hydrate();
    }
    try {
      if (AppConfig.hasSupabaseCredentials && supabaseAuth.isSignedIn) {
        await _continueAfterSupabaseLogin();
        return;
      }

      final devCreds = compileTimeTelegramCredentials();
      if (devCreds != null) {
        await _bootstrapTelegram(apiId: devCreds.apiId, apiHash: devCreds.apiHash);
        return;
      }

      phase = SessionPhase.supabaseAuth;
      notifyListeners();
    } catch (e) {
      bootError = e.toString();
      phase = AppConfig.hasSupabaseCredentials
          ? SessionPhase.supabaseAuth
          : SessionPhase.auth;
      notifyListeners();
    }
  }

  Future<void> signInWithGoogle() async {
    try {
      supabaseAuth.setError(null);
      await supabaseAuth.signInWithGoogle();
      await _continueAfterSupabaseLogin();
    } on TimeoutException {
      // error already set on coordinator
    } on TelevaultEntitlementException catch (e) {
      supabaseAuth.setError(e.message);
    } on StateError catch (e) {
      supabaseAuth.setError(e.message);
    } catch (e) {
      supabaseAuth.setError(e.toString());
    }
    notifyListeners();
  }

  Future<void> submitTelegramApiCredentials({
    required int apiId,
    required String apiHash,
  }) async {
    telegramApiError = null;
    if (apiId <= 0 || apiHash.isEmpty) {
      telegramApiError = 'telegram_api_invalid';
      notifyListeners();
      return;
    }

    final userId = supabaseAuth.currentSession?.user.id;
    if (userId == null || userId.isEmpty) {
      phase = SessionPhase.supabaseAuth;
      notifyListeners();
      return;
    }

    try {
      await _credentialsStore.save(userId: userId, apiId: apiId, apiHash: apiHash);
      await _bootstrapTelegram(apiId: apiId, apiHash: apiHash);
    } catch (e) {
      telegramApiError = e.toString();
      notifyListeners();
    }
  }

  Future<void> _continueAfterSupabaseLogin() async {
    if (!supabaseAuth.isSignedIn) {
      phase = SessionPhase.supabaseAuth;
      notifyListeners();
      return;
    }

    if (supabaseAuth.freeUserTrialExpiredDialogPending) {
      supabaseEmail = supabaseAuth.email;
      phase = SessionPhase.supabaseAuth;
      notifyListeners();
      return;
    }

    supabaseEmail = supabaseAuth.email;
    final userId = supabaseAuth.currentSession?.user.id ?? '';
    if (userId.isEmpty) {
      phase = SessionPhase.supabaseAuth;
      notifyListeners();
      return;
    }

    final stored = await _credentialsStore.load(userId: userId);
    if (stored != null) {
      await _bootstrapTelegram(apiId: stored.apiId, apiHash: stored.apiHash);
      return;
    }

    phase = SessionPhase.telegramApiSetup;
    telegramApiError = null;
    notifyListeners();
  }

  Future<void> _bootstrapTelegram({
    required int apiId,
    required String apiHash,
  }) async {
    phase = SessionPhase.telegramBooting;
    bootError = null;
    telegramApiError = null;
    notifyListeners();

    boot = await bootstrap(apiId: apiId, apiHash: apiHash);
    onSettingsReady?.call(boot.db);
    boot.auth.states.listen(_onAuth);
    phase = SessionPhase.auth;
    notifyListeners();
    if (boot.auth.current != tg.AuthState.starting) {
      await _onAuth(boot.auth.current);
    }
  }

  Future<void> _onAuth(tg.AuthState s) async {
    authState = s;
    if (s == tg.AuthState.loggedOut) {
      _syncGeneration++;
      await channel?.dispose();
      _changesSub?.cancel();
      _changesSub = null;
      channel = null;
      vault = null;
      scannedCount = 0;
      syncError = null;
      phase = SessionPhase.auth;
      notifyListeners();
      return;
    }
    if (s == tg.AuthState.ready) {
      final gen = ++_syncGeneration;
      await channel?.dispose();
      _changesSub?.cancel();
      _changesSub = null;
      channel = null;
      vault = null;
      scannedCount = 0;
      syncError = null;
      phase = SessionPhase.syncing;
      notifyListeners();
      try {
        final ch = ChannelService(boot.td, boot.db);
        final chatId = await ch.resolveVaultChatId();
        if (gen != _syncGeneration) return;
        ch.listenUpdates(chatId);
        await boot.db.deleteTemporaryMessageIds();
        if (gen != _syncGeneration) return;
        await ch.scanHistory(chatId, onProgress: (n) {
          if (gen != _syncGeneration) return;
          scannedCount = n;
          notifyListeners();
        });
        if (gen != _syncGeneration) return;
        channel = ch;
        vault = VaultService(
            td: boot.td,
            db: boot.db,
            channel: ch,
            queue: queue,
            chatId: chatId,
            legacyTdApi: boot.legacyTdApi);
        _attachUploadCreditHooks();
        await vault!.resumePendingJournal();
        if (gen != _syncGeneration) return;
        await vault!.resolveConflictsNow();
        if (gen != _syncGeneration) return;
        final autoResume = await boot.db.getAutoResumeTransfers();
        await vault!.restorePendingTransfers(autoStart: autoResume);
        if (gen != _syncGeneration) return;
        _changesSub = ch.changes.stream.listen((_) {
          vault?.resolveConflictsNow();
        });
        phase = SessionPhase.ready;
      } catch (e, st) {
        if (gen != _syncGeneration) return;
        syncError = e.toString();
        phase = SessionPhase.auth;
        debugPrint('TeleVault sync failed: $e\n$st');
      }
    }
    notifyListeners();
  }

  Future<void> _guard(Future<void> Function() f) async {
    try {
      authError = null;
      await f();
    } catch (e) {
      authError = _formatAuthError(e);
    }
    notifyListeners();
  }

  String _formatAuthError(Object e) {
    final s = e.toString();
    if (s.contains('406') && s.toUpperCase().contains('UPDATE_APP')) {
      return 'TDLib quá cũ — Telegram không cho đăng nhập.\n'
          'Chạy trong terminal:\n'
          './tool/build_tdlib_macos.sh\n'
          './tool/run_dev.sh';
    }
    return s;
  }

  Future<void> submitPhone(String v) => _guard(() => boot.auth.submitPhone(v));
  Future<void> submitCode(String v) => _guard(() => boot.auth.submitCode(v));
  Future<void> submitPassword(String v) => _guard(() => boot.auth.submitPassword(v));

  /// Returns false when free trial expired (dialog will show).
  Future<bool> guardUpload(String destPath) async {
    if (!AppConfig.hasSupabaseCredentials) return true;
    final session = supabaseAuth.activeSession;
    if (!isFreeUserTokenTier(session)) return true;

    final createdAt = session?.televaultEntitlementCreatedAt;
    if (isFreeTrialExpired(
      session: session!,
      televaultEntitlementCreatedAt: createdAt,
    )) {
      supabaseAuth.markFreeUserTrialExpired();
      return false;
    }

    final ensure = await _creditClient.ensureCredits(session);
    if (!ensure.ok) return false;
    if (ensure.skipped) return true;

    final remaining = ensure.remainingTokens ?? session.remainingTokens ?? 0;
    await supabaseAuth.updateRemainingTokens(remaining);
    if (remaining <= 0) {
      supabaseAuth.markFreeUserTrialExpired();
      return false;
    }
    return true;
  }

  void _attachUploadCreditHooks() {
    _vaultTransferStatusHandler = queue.onStatusChange;
    queue.onStatusChange = (task) {
      _vaultTransferStatusHandler?.call(task);
      if (task.kind == TransferKind.upload &&
          task.status == TransferStatus.done &&
          task.destPath != null) {
        unawaited(_onUploadSucceeded(task.destPath!));
      }
    };
  }

  Future<void> _onUploadSucceeded(String destPath) async {
    if (!AppConfig.hasSupabaseCredentials) return;
    final session = supabaseAuth.activeSession;
    if (!isFreeUserTokenTier(session)) return;

    final consumed = await _creditClient.consumeUploadCredit(
      session,
      destPath: destPath,
    );
    if (consumed.skipped) return;

    if (consumed.ok && consumed.remainingTokens != null) {
      await supabaseAuth.updateRemainingTokens(consumed.remainingTokens!);
      if (consumed.remainingTokens! <= 0) {
        supabaseAuth.markFreeUserTrialExpired();
      }
      return;
    }

    if (consumed.needLogin || (consumed.remainingTokens ?? 1) <= 0) {
      supabaseAuth.markFreeUserTrialExpired();
    }
  }

  Future<void> forceLogoutExpiredTrial() async {
    supabaseAuth.clearFreeUserTrialExpiredDialog();
    await signOutAll();
  }

  Future<void> signOutAll() async {
    try {
      if (phase == SessionPhase.ready || phase == SessionPhase.syncing) {
        await boot.auth.logOut();
      }
    } catch (_) {}
    await supabaseAuth.signOut();
    phase = SessionPhase.supabaseAuth;
    supabaseEmail = null;
    notifyListeners();
  }

  int? get freeRemainingTokens {
    final session = supabaseAuth.activeSession;
    if (!isFreeUserTokenTier(session)) return null;
    return session?.remainingTokens;
  }

  @override
  void dispose() {
    _creditClient.dispose();
    unawaited(supabaseAuth.disposeAsync());
    super.dispose();
  }
}
