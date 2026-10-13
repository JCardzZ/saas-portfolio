package dev.portfolio.infrastructure.adapter.out.persistence.repository;

import dev.portfolio.infrastructure.adapter.out.persistence.entity.RefreshTokenEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

public interface RefreshTokenJpaRepository extends JpaRepository<RefreshTokenEntity, String> {

    /** Solo cambia la fila si el token seguía vivo: así dos usos simultáneos no ganan los dos. */
    @Modifying
    @Query("update RefreshTokenEntity t set t.revokedAt = :at where t.tokenHash = :hash and t.revokedAt is null")
    int revoke(@Param("hash") String hash, @Param("at") Instant at);

    @Modifying
    @Query("update RefreshTokenEntity t set t.revokedAt = :at where t.userId = :userId and t.revokedAt is null")
    int revokeAllOf(@Param("userId") String userId, @Param("at") Instant at);
}
