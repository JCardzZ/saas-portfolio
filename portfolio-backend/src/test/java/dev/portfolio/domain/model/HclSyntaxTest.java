package dev.portfolio.domain.model;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class HclSyntaxTest {

    /** Todo lo que el generador escribe para los casos de referencia está bien formado. */
    @Test
    void acceptsEveryGoldenFileTheGeneratorWrites() throws IOException, URISyntaxException {
        Path golden = Path.of(getClass().getResource("/architecture/golden").toURI());
        try (Stream<Path> files = Files.list(golden)) {
            List<Path> terraform = files.filter(file -> file.toString().endsWith(".tf")).toList();
            assertThat(terraform).hasSizeGreaterThanOrEqualTo(40);
            for (Path file : terraform) {
                assertThat(HclSyntax.errors(Files.readString(file))).as(file.getFileName().toString()).isEmpty();
            }
        }
    }

    @Test
    void acceptsTheConstructsOfASkeleton() {
        assertThat(HclSyntax.errors("""
                # comentario con { llaves } y "comillas
                terraform {
                  required_providers {
                    aws = { source = "hashicorp/aws" }
                  }
                }

                provider "aws" {
                  region = var.region
                }

                resource "aws_ecs_service" "api" {
                  # API · con "comillas" en el comentario
                  depends_on = [aws_db_instance.postgres, aws_lb.lb]
                }

                variable "api_env" {
                  type = map(string)
                  default = {
                    RUTA = "$${HOME} \\"x\\" {sin cerrar"
                    VACIA = ""
                  }
                }
                """)).isEmpty();
        assertThat(HclSyntax.errors("")).isEmpty();
    }

    @Test
    void reportsWhatWouldBreakTheFileWithItsLine() {
        assertThat(HclSyntax.errors("resource \"a\" \"b\" {\n  x = 1\n")).containsExactly("falta cerrar «{»");
        assertThat(HclSyntax.errors("resource \"a\" \"b\" {\n}\n}\n")).containsExactly("línea 3: «}» sin abrir");
        assertThat(HclSyntax.errors("variable \"x\" {\n  default = \"sin cerrar\n}\n")).contains("línea 2: cadena sin cerrar");
        assertThat(HclSyntax.errors("resource \"a\" \"b\" {\n  depends_on = [a.b\n}\n")).contains("línea 3: «}» sin abrir");
        assertThat(HclSyntax.errors("resource \"a\" \"b\" \"c\" {\n}\n")).containsExactly("línea 1: no es un bloque ni un atributo");
        assertThat(HclSyntax.errors("resource \"a\" \"b\" {\n  esto no es hcl\n}\n")).containsExactly("línea 2: no es un bloque ni un atributo");
        assertThat(HclSyntax.errors(null)).containsExactly("no hay texto que comprobar");
    }

    /** Lo que escribe un visitante (nombre de un nodo, valor de una variable) no puede abrir ni cerrar bloques. */
    @Test
    void doesNotCountBracesInsideStringsOrComments() {
        assertThat(HclSyntax.errors("variable \"x\" {\n  default = \"}}}{{{\" # }}}\n}\n")).isEmpty();
        assertThat(HclSyntax.errors("// }\nvariable \"x\" {\n}\n")).isEmpty();
    }
}
