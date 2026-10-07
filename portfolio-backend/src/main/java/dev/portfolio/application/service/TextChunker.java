package dev.portfolio.application.service;

import java.util.ArrayList;
import java.util.List;

/**
 * Trocea un texto por líneas completas, conservando el rango de líneas de cada fragmento
 * para poder citarlo.
 */
final class TextChunker {

    static final int MAX_CHARS = 1800;
    static final int MAX_LINES = 60;

    record Chunk(String content, int startLine, int endLine) {

        String lineRange() {
            return startLine + "-" + endLine;
        }
    }

    private TextChunker() {
    }

    static List<Chunk> chunk(String text) {
        List<Chunk> chunks = new ArrayList<>();
        String[] lines = text.split("\n", -1);
        StringBuilder current = new StringBuilder();
        int startLine = 1;
        int linesInChunk = 0;

        for (int i = 0; i < lines.length; i++) {
            int lineNumber = i + 1;
            String line = lines[i];

            // Una línea más larga que un fragmento entero (código minificado) se parte por caracteres.
            if (line.length() > MAX_CHARS) {
                flush(chunks, current, startLine, lineNumber - 1);
                for (int offset = 0; offset < line.length(); offset += MAX_CHARS) {
                    String piece = line.substring(offset, Math.min(offset + MAX_CHARS, line.length()));
                    chunks.add(new Chunk(piece, lineNumber, lineNumber));
                }
                startLine = lineNumber + 1;
                linesInChunk = 0;
                continue;
            }

            boolean full = linesInChunk >= MAX_LINES || current.length() + line.length() + 1 > MAX_CHARS;
            if (full && linesInChunk > 0) {
                flush(chunks, current, startLine, lineNumber - 1);
                startLine = lineNumber;
                linesInChunk = 0;
            }
            if (linesInChunk > 0) {
                current.append('\n');
            }
            current.append(line);
            linesInChunk++;
        }
        flush(chunks, current, startLine, lines.length);
        return chunks;
    }

    private static void flush(List<Chunk> chunks, StringBuilder current, int startLine, int endLine) {
        if (!current.toString().isBlank()) {
            chunks.add(new Chunk(current.toString(), startLine, endLine));
        }
        current.setLength(0);
    }
}
