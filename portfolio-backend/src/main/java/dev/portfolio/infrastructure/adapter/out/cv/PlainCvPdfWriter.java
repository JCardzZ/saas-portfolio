package dev.portfolio.infrastructure.adapter.out.cv;

import com.lowagie.text.Chunk;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.pdf.PdfWriter;
import com.lowagie.text.pdf.draw.LineSeparator;
import dev.portfolio.domain.model.CvContentDomain;
import dev.portfolio.domain.model.CvContentDomain.Block;
import dev.portfolio.domain.model.CvContentDomain.Section;
import dev.portfolio.infrastructure.adapter.out.career.CareerProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Variante {@code ats}: una columna de texto negro sin adornos, escrita con OpenPDF. Es lo que
 * los sistemas de selección extraen sin perder el orden ni las palabras clave.
 */
@Component
@RequiredArgsConstructor
class PlainCvPdfWriter {

    private static final Pattern BOLD = Pattern.compile("\\*\\*(.+?)\\*\\*");
    private static final Color ACCENT = new Color(0, 102, 204);

    private final CareerProperties properties;

    byte[] write(CvContentDomain content) {
        Style style = Style.plain();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document document = new Document(PageSize.A4, style.margin, style.margin, style.margin, style.margin);
        try {
            PdfWriter.getInstance(document, out);
            document.addTitle(content.name() + " - CV");
            document.addAuthor(content.name());
            document.open();

            document.add(paragraph(content.name(), style.name, 0, 2));
            if (StringUtils.hasText(content.headline())) {
                document.add(paragraph(content.headline(), style.headline, 0, 2));
            }
            if (StringUtils.hasText(properties.cvContact())) {
                document.add(paragraph(properties.cvContact(), style.meta, 0, 2));
            }

            for (Section section : content.sections()) {
                document.add(paragraph(style.upperCaseTitles ? section.title().toUpperCase() : section.title(),
                        style.section, style.sectionGap, 2));
                if (style.rules) {
                    document.add(new Chunk(new LineSeparator(0.6f, 100, ACCENT, Element.ALIGN_LEFT, -2)));
                }
                for (Block block : section.blocks()) {
                    document.add(switch (block.kind()) {
                        case HEADING -> paragraph(block.text(), style.entry, style.entryGap, 1);
                        case PARAGRAPH -> rich(block.text(), style, 3, 0);
                        case BULLET -> rich(style.bullet + block.text(), style, 1, 10);
                    });
                }
            }
            document.close();
        } catch (DocumentException e) {
            throw new IllegalStateException("No se pudo generar el CV en PDF", e);
        }
        return out.toByteArray();
    }

    private static Paragraph paragraph(String text, Font font, float before, float after) {
        Paragraph paragraph = new Paragraph(text, font);
        paragraph.setSpacingBefore(before);
        paragraph.setSpacingAfter(after);
        return paragraph;
    }

    /** Párrafo de cuerpo, con la negrita marcada con {@code **} convertida en fuente negrita. */
    private static Paragraph rich(String text, Style style, float before, float indent) {
        Paragraph paragraph = new Paragraph();
        paragraph.setLeading(style.body.getSize() * 1.35f);
        paragraph.setSpacingBefore(before);
        paragraph.setIndentationLeft(indent);
        paragraph.setFirstLineIndent(-indent);
        Matcher bold = BOLD.matcher(text);
        int from = 0;
        while (bold.find()) {
            paragraph.add(new Chunk(text.substring(from, bold.start()), style.body));
            paragraph.add(new Chunk(bold.group(1), style.bodyBold));
            from = bold.end();
        }
        paragraph.add(new Chunk(text.substring(from), style.body));
        return paragraph;
    }

    private record Style(float margin, Font name, Font headline, Font meta, Font section, Font entry, Font body, Font bodyBold,
                         float sectionGap, float entryGap, boolean rules, boolean upperCaseTitles, String bullet) {

        /** Sin color, sin líneas y con guiones normales: lo que mejor leen los sistemas de selección. */
        static Style plain() {
            Color black = Color.BLACK;
            return new Style(54,
                    font(14, Font.BOLD, black), font(11, Font.NORMAL, black), font(10.5f, Font.NORMAL, black),
                    font(11.5f, Font.BOLD, black), font(10.5f, Font.BOLD, black), font(10.5f, Font.NORMAL, black), font(10.5f, Font.BOLD, black),
                    14, 8, false, true, "- ");
        }

        private static Font font(float size, int weight, Color color) {
            return new Font(Font.HELVETICA, size, weight, color);
        }
    }
}
