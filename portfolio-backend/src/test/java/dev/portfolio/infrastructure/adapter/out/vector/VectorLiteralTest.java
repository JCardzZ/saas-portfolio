package dev.portfolio.infrastructure.adapter.out.vector;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class VectorLiteralTest {

    @Test
    void formatsAsPgvectorLiteral() {
        assertThat(VectorLiteral.format(new float[]{0.5f, -1.25f, 3f})).isEqualTo("[0.5,-1.25,3.0]");
    }

    @Test
    void parsesWhatPostgresReturns() {
        assertThat(VectorLiteral.parse("[0.5, -1.25,3,1.5E-4]")).containsExactly(0.5f, -1.25f, 3f, 1.5E-4f);
    }

    @Test
    void roundTripsWithoutLosingPrecision() {
        float[] vector = {0.123456789f, -9.87654321E-8f, 1f / 3f};

        assertThat(VectorLiteral.parse(VectorLiteral.format(vector))).containsExactly(vector);
    }
}
