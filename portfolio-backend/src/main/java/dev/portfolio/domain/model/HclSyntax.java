package dev.portfolio.domain.model;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Comprobación de sintaxis del HCL que genera la plataforma, en proceso y sin Terraform. No es
 * un analizador completo de HCL: cubre lo que el generador escribe (bloques, atributos, cadenas
 * con interpolaciones escapadas, comentarios de línea) y detecta lo que lo rompería: llaves,
 * corchetes o cadenas sin cerrar, y cabeceras de bloque mal formadas.
 * <p>
 * Que pase no significa que el archivo se pueda aplicar: el generador escribe esqueletos sin los
 * argumentos de cada recurso. La CI pasa además los casos de referencia por el analizador real
 * de Terraform.
 */
public final class HclSyntax {

    /** Cabecera de bloque, con sus cadenas ya vaciadas: {@code resource "" "" \{}, {@code provider "" \{}, {@code terraform \{}, y el bloque vacío {@code features \{\}}. */
    private static final Pattern BLOCK_HEADER = Pattern.compile("^[a-z_][a-z0-9_]*(\\s+\"\"){0,2}\\s*\\{(\\s*})?$");
    /** {@code nombre = valor}; el valor puede abrir un mapa o una lista. */
    private static final Pattern ATTRIBUTE = Pattern.compile("^[A-Za-z_][A-Za-z0-9_-]*\\s*=\\s*\\S.*$");

    private HclSyntax() {
    }

    /** @return los errores de sintaxis, con su número de línea; vacío si el texto está bien formado */
    public static List<String> errors(String hcl) {
        List<String> errors = new ArrayList<>();
        if (hcl == null) {
            return List.of("no hay texto que comprobar");
        }
        Deque<Character> open = new ArrayDeque<>();
        String[] lines = hcl.split("\n", -1);
        for (int index = 0; index < lines.length; index++) {
            int number = index + 1;
            String code = withoutCommentOrStrings(lines[index], number, errors).strip();
            if (code.isEmpty()) {
                continue;
            }
            for (char symbol : code.toCharArray()) {
                if (symbol == '{' || symbol == '[' || symbol == '(') {
                    open.push(symbol);
                } else if (symbol == '}' || symbol == ']' || symbol == ')') {
                    char expected = symbol == '}' ? '{' : symbol == ']' ? '[' : '(';
                    if (open.isEmpty() || open.pop() != expected) {
                        errors.add("línea %d: «%s» sin abrir".formatted(number, symbol));
                        return errors;
                    }
                }
            }
            boolean closing = code.matches("^[}\\])]+,?$");
            boolean insideCollection = !open.isEmpty() && (open.peek() == '[' || open.peek() == '(');
            if (!closing && !insideCollection && !BLOCK_HEADER.matcher(code).matches() && !ATTRIBUTE.matcher(code).matches()) {
                errors.add("línea %d: no es un bloque ni un atributo".formatted(number));
            }
        }
        if (!open.isEmpty()) {
            errors.add("falta cerrar «%s»".formatted(open.peek()));
        }
        return errors;
    }

    /**
     * La línea sin su comentario y con cada cadena sustituida por {@code ""}, para poder contar
     * llaves sin que cuenten las de dentro de una cadena. Una cadena sin cerrar es un error.
     */
    private static String withoutCommentOrStrings(String line, int number, List<String> errors) {
        StringBuilder code = new StringBuilder();
        boolean inString = false;
        for (int index = 0; index < line.length(); index++) {
            char symbol = line.charAt(index);
            if (inString) {
                if (symbol == '\\') {
                    index++; // el carácter escapado no cierra la cadena
                } else if (symbol == '"') {
                    inString = false;
                    code.append("\"\"");
                }
            } else if (symbol == '"') {
                inString = true;
            } else if (symbol == '#' || (symbol == '/' && index + 1 < line.length() && line.charAt(index + 1) == '/')) {
                break;
            } else {
                code.append(symbol);
            }
        }
        if (inString) {
            errors.add("línea %d: cadena sin cerrar".formatted(number));
        }
        return code.toString();
    }
}
