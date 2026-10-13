package dev.portfolio.domain.model.access;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.EnumSet;

import static org.assertj.core.api.Assertions.assertThat;

class RoleTest {

    @Test
    void theAdministratorCanDoEverything() {
        assertThat(Role.ADMIN.permissions()).containsExactlyInAnyOrder(Permission.values());
    }

    @Test
    void theEditorWritesContentButCannotManageUsersFlagsOrInfrastructure() {
        assertThat(Role.EDITOR.permissions()).contains(Permission.CMS_WRITE, Permission.STUDIO_WRITE, Permission.PROFILE_WRITE)
                .doesNotContain(Permission.USERS_MANAGE, Permission.FLAGS_WRITE, Permission.INFRA_OPERATE);
    }

    @Test
    void theViewerOnlyReads() {
        assertThat(Role.VIEWER.permissions()).allSatisfy(permission -> assertThat(permission.code()).endsWith(":read"));
        assertThat(Role.EDITOR.permissions()).containsAll(Role.VIEWER.permissions());
    }

    @Test
    void everyPermissionHasAUniqueCodeAndIsGrantedToSomeone() {
        assertThat(Arrays.stream(Permission.values()).map(Permission::code)).doesNotHaveDuplicates()
                .allSatisfy(code -> assertThat(code).matches("[a-z]+:[a-z]+"));
        EnumSet<Permission> granted = EnumSet.noneOf(Permission.class);
        Arrays.stream(Role.values()).forEach(role -> granted.addAll(role.permissions()));
        assertThat(granted).containsExactlyInAnyOrder(Permission.values());
    }

    @Test
    void readsTheRoleFromTheTokenClaimAndIgnoresAnythingElse() {
        assertThat(Role.fromAuthority("ROLE_EDITOR")).contains(Role.EDITOR);
        assertThat(Role.fromAuthority("EDITOR")).isEmpty();
        assertThat(Role.fromAuthority("ROLE_ROOT")).isEmpty();
        assertThat(Role.EDITOR.authority()).isEqualTo("ROLE_EDITOR");
    }

    @Test
    void checksEmailsNamesAndPasswords() {
        assertThat(UserAccountDomain.normalizeEmail("  Ana.Perez+x@Example.COM ")).isEqualTo("ana.perez+x@example.com");
        assertThat(UserAccountDomain.normalizeName("  Ana  ")).isEqualTo("Ana");
        UserAccountDomain.checkPassword("doce-letras-");
    }
}
