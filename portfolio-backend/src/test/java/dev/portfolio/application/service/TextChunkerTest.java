package dev.portfolio.application.service;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

class TextChunkerTest {

    @Test
    void shortTextIsASingleChunkWithItsLineRange() {
        List<TextChunker.Chunk> chunks = TextChunker.chunk("uno\ndos\ntres");

        assertThat(chunks).containsExactly(new TextChunker.Chunk("uno\ndos\ntres", 1, 3));
        assertThat(chunks.get(0).lineRange()).isEqualTo("1-3");
    }

    @Test
    void splitsByLineCountWithContiguousRangesThatCoverEveryLine() {
        String text = IntStream.rangeClosed(1, 150).mapToObj(i -> "line " + i).collect(Collectors.joining("\n"));

        List<TextChunker.Chunk> chunks = TextChunker.chunk(text);

        assertThat(chunks).extracting(TextChunker.Chunk::lineRange).containsExactly("1-60", "61-120", "121-150");
        assertThat(chunks.stream().map(TextChunker.Chunk::content).collect(Collectors.joining("\n"))).isEqualTo(text);
    }

    @Test
    void splitsBeforeExceedingTheCharacterBudget() {
        String line = "x".repeat(700);

        List<TextChunker.Chunk> chunks = TextChunker.chunk(String.join("\n", line, line, line, line));

        assertThat(chunks).extracting(TextChunker.Chunk::lineRange).containsExactly("1-2", "3-4");
        assertThat(chunks).allSatisfy(chunk -> assertThat(chunk.content().length()).isLessThanOrEqualTo(TextChunker.MAX_CHARS));
    }

    @Test
    void hardSplitsALineLongerThanAChunk() {
        String text = "antes\n" + "y".repeat(TextChunker.MAX_CHARS + 10) + "\ndespués";

        List<TextChunker.Chunk> chunks = TextChunker.chunk(text);

        assertThat(chunks).extracting(TextChunker.Chunk::lineRange).containsExactly("1-1", "2-2", "2-2", "3-3");
        assertThat(chunks.get(2).content()).hasSize(10);
    }

    @Test
    void blankTextProducesNoChunks() {
        assertThat(TextChunker.chunk("\n   \n")).isEmpty();
    }
}
