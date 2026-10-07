package dev.portfolio.infrastructure.adapter.out.source;

import dev.portfolio.domain.model.SourceDocumentDomain;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class FileSystemCodeSourceAdapterTest {

    @TempDir
    Path root;

    @Test
    void loadsOnlyAllowedSourceFilesWithRelativePaths() throws IOException {
        write("portfolio-backend/src/main/java/Foo.java", "class Foo {}");
        write("portfolio-frontend/src/app/app.component.ts", "export class AppComponent {}");
        write("README.md", "# Portfolio");
        // Nada de lo siguiente debe indexarse.
        write(".env", "JWT_SECRET=super-secret");
        write(".git/config", "[core]");
        write("node_modules/lib/index.ts", "export {}");
        write("portfolio-backend/build/generated/Api.java", "interface Api {}");
        write("portfolio-backend/src/main/resources/application.yml", "password: postgres");
        write("portfolio-frontend/src/app/core/api/api.ts", "export class Generated {}");
        write("infra/terraform/prod.tfvars", "db_password = \"x\"");
        write("infra/terraform/secrets.tf", "variable \"x\" {}");
        write("notes/passwords.md", "admin / hunter2");
        write("package-lock.json", "{}");
        write("empty.md", "   ");
        write("docs/career/CAREER_STORY.md", "<!-- rag:skip -->\n# Trayectoria\n[COMPLETAR]");
        Files.write(root.resolve("huge.md"), new byte[(int) FileSystemCodeSourceAdapter.MAX_FILE_BYTES + 1]);

        var documents = new FileSystemCodeSourceAdapter(new CodeSourceProperties(root.toString())).loadDocuments();

        assertThat(documents).extracting(SourceDocumentDomain::sourceId).containsExactlyInAnyOrder(
                "portfolio-backend/src/main/java/Foo.java",
                "portfolio-frontend/src/app/app.component.ts",
                "README.md");
        assertThat(documents).extracting(SourceDocumentDomain::content).noneMatch(content -> content.contains("secret"));
    }

    @Test
    void returnsNothingWhenNoCodeRootIsConfigured() {
        assertThat(new FileSystemCodeSourceAdapter(new CodeSourceProperties("")).loadDocuments()).isEmpty();
        assertThat(new FileSystemCodeSourceAdapter(new CodeSourceProperties(null)).loadDocuments()).isEmpty();
    }

    @Test
    void returnsNothingWhenCodeRootDoesNotExist() {
        var adapter = new FileSystemCodeSourceAdapter(new CodeSourceProperties(root.resolve("missing").toString()));

        assertThat(adapter.loadDocuments()).isEmpty();
    }

    private void write(String relativePath, String content) throws IOException {
        Path file = root.resolve(relativePath);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content);
    }
}
