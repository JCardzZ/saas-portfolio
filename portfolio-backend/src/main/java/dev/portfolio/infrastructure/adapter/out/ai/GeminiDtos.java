package dev.portfolio.infrastructure.adapter.out.ai;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/** Cuerpos JSON de la API REST de Gemini (solo los campos que usa el adaptador). */
final class GeminiDtos {

    private GeminiDtos() {
    }

    record Part(String text) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Content(String role, List<Part> parts) {

        static Content ofText(String text) {
            return new Content(null, List.of(new Part(text)));
        }

        static Content ofUserText(String text) {
            return new Content("user", List.of(new Part(text)));
        }
    }

    record EmbedRequest(String model, Content content,
                        @JsonProperty("output_dimensionality") int outputDimensionality) {
    }

    record BatchEmbedRequest(List<EmbedRequest> requests) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Embedding(float[] values) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record BatchEmbedResponse(List<Embedding> embeddings) {
    }

    /** @param responseMimeType {@code application/json} para pedir la respuesta como JSON; {@code null} para texto */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    record GenerationConfig(double temperature, int maxOutputTokens, String responseMimeType) {
        GenerationConfig(double temperature, int maxOutputTokens) {
            this(temperature, maxOutputTokens, null);
        }
    }

    /** Forma del JSON que se le pide al modelo en el copiloto de arquitectura. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record AdviceJson(String answer, List<RecommendationJson> recommendations) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record RecommendationJson(String title, List<String> pros, List<String> cons, String snippetLanguage, String snippet,
                              List<AdditionJson> additions) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record AdditionJson(String code, String name, String role, String connectFrom) {
    }

    record GenerateRequest(Content systemInstruction, List<Content> contents, GenerationConfig generationConfig) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Candidate(Content content, String finishReason) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record GenerateResponse(List<Candidate> candidates) {
    }
}
