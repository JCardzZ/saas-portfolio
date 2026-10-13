package dev.portfolio.testsupport;

import dev.portfolio.application.port.out.RefreshTokenRepositoryPort;
import dev.portfolio.application.port.out.UserRepositoryPort;
import dev.portfolio.domain.model.access.RefreshTokenDomain;
import dev.portfolio.domain.model.access.Role;
import dev.portfolio.domain.model.access.StoredUser;
import dev.portfolio.domain.model.access.UserAccountDomain;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Usuarios y tokens de refresco en memoria, para probar las reglas sin base de datos. */
public final class InMemoryAccess {

    private InMemoryAccess() {
    }

    public static final class Users implements UserRepositoryPort {
        public final Map<String, StoredUser> byId = new LinkedHashMap<>();

        @Override
        public List<UserAccountDomain> findAll() {
            return byId.values().stream().map(StoredUser::account).toList();
        }

        @Override
        public Optional<UserAccountDomain> findById(String id) {
            return Optional.ofNullable(byId.get(id)).map(StoredUser::account);
        }

        @Override
        public Optional<StoredUser> findByEmail(String email) {
            return byId.values().stream().filter(user -> user.account().email().equals(email)).findFirst();
        }

        @Override
        public boolean existsByEmail(String email) {
            return findByEmail(email).isPresent();
        }

        @Override
        public long count() {
            return byId.size();
        }

        @Override
        public long countActiveAdminsExcept(String exceptId) {
            return byId.values().stream().map(StoredUser::account)
                    .filter(account -> account.role() == Role.ADMIN && account.active() && !account.id().equals(exceptId)).count();
        }

        @Override
        public UserAccountDomain create(UserAccountDomain account, String passwordHash) {
            byId.put(account.id(), new StoredUser(account, passwordHash));
            return account;
        }

        @Override
        public UserAccountDomain update(UserAccountDomain account, String passwordHash) {
            byId.put(account.id(), new StoredUser(account, passwordHash == null ? byId.get(account.id()).passwordHash() : passwordHash));
            return account;
        }
    }

    public static final class Tokens implements RefreshTokenRepositoryPort {
        public final Map<String, RefreshTokenDomain> byHash = new LinkedHashMap<>();

        @Override
        public void save(RefreshTokenDomain token) {
            byHash.put(token.tokenHash(), token);
        }

        @Override
        public Optional<RefreshTokenDomain> findByHash(String tokenHash) {
            return Optional.ofNullable(byHash.get(tokenHash));
        }

        @Override
        public boolean revoke(String tokenHash, Instant at) {
            RefreshTokenDomain token = byHash.get(tokenHash);
            if (token == null || token.revoked()) {
                return false;
            }
            byHash.put(tokenHash, new RefreshTokenDomain(tokenHash, token.userId(), token.expiresAt(), at));
            return true;
        }

        @Override
        public void revokeAllOf(String userId, Instant at) {
            byHash.replaceAll((hash, token) -> token.userId().equals(userId) && !token.revoked()
                    ? new RefreshTokenDomain(hash, userId, token.expiresAt(), at) : token);
        }

        public long live(String userId) {
            return byHash.values().stream().filter(token -> token.userId().equals(userId) && !token.revoked()).count();
        }
    }
}
