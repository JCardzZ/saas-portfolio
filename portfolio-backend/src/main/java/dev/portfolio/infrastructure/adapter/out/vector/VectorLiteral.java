package dev.portfolio.infrastructure.adapter.out.vector;

/** Conversión entre {@code float[]} y el literal de texto de pgvector: {@code [0.1,0.2,0.3]}. */
final class VectorLiteral {

    private VectorLiteral() {
    }

    static String format(float[] vector) {
        StringBuilder literal = new StringBuilder(vector.length * 12).append('[');
        for (int i = 0; i < vector.length; i++) {
            if (i > 0) {
                literal.append(',');
            }
            literal.append(vector[i]);
        }
        return literal.append(']').toString();
    }

    static float[] parse(String literal) {
        String body = literal.strip();
        body = body.substring(1, body.length() - 1);
        if (body.isBlank()) {
            return new float[0];
        }
        String[] parts = body.split(",");
        float[] vector = new float[parts.length];
        for (int i = 0; i < parts.length; i++) {
            vector[i] = Float.parseFloat(parts[i].strip());
        }
        return vector;
    }
}
