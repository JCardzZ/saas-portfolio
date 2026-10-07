package dev.portfolio.infrastructure.adapter.out.cv;

import com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder.FontStyle;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import com.openhtmltopdf.svgsupport.BatikSVGDrawer;
import dev.portfolio.domain.model.CvContentDomain;
import dev.portfolio.domain.model.CvContentDomain.Block;
import dev.portfolio.domain.model.CvContentDomain.Kind;
import dev.portfolio.domain.model.CvContentDomain.Section;
import dev.portfolio.application.port.out.CvRendererPort.Portrait;
import dev.portfolio.domain.model.CvLanguage;
import dev.portfolio.domain.model.ProfilePhotoDomain;
import dev.portfolio.infrastructure.adapter.out.career.CareerProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import javax.imageio.ImageIO;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Variantes {@code short} y {@code full}: el CV maquetado a dos columnas. Se compone una página
 * HTML con la hoja de estilos {@code cv/cv.css} y se convierte a PDF con openhtmltopdf, en el
 * propio proceso: no hace falta un navegador en el servidor. El texto queda como texto (se
 * puede seleccionar y buscar), con la tipografía Inter incrustada.
 * <p>
 * Todo lo que se imprime sale del documento de trayectoria o de la configuración:
 * las tecnologías de la barra lateral son las que más se repiten en las entradas, y el contacto
 * solo aparece si se configura.
 */
@Component
@RequiredArgsConstructor
class StyledCvPdfWriter {

    private static final String RESOURCES = "cv/";
    private static final Pattern BOLD = Pattern.compile("\\*\\*(.+?)\\*\\*");
    private static final Pattern FIELD = Pattern.compile("^\\*\\*(.+?):?\\*\\*:?\\s*(.+)$");
    private static final Pattern HEADING_SEPARATOR = Pattern.compile("\\s+[—–]\\s+");
    /** Un dato con al menos este número de elementos separados por comas es una lista (de tecnologías). */
    private static final int LIST_FROM = 3;
    private static final int BADGES = 12;
    private static final int BADGES_COMPACT = 9;

    // Iconos de trazo propios (no son logos de marca), en un lienzo de 24 × 24.
    private static final String ICON_CONTACT = "M4 6h16v12H4z M4 7l8 6 8-6";
    private static final String ICON_STACK = "M12 3l9 5-9 5-9-5z M3 13l9 5 9-5 M3 17l9 5 9-5";
    private static final String ICON_ASIDE = "M3 9l9-5 9 5-9 5z M7 11.5v4.5c3 2.5 7 2.5 10 0v-4.5";

    private final CareerProperties properties;

    byte[] write(CvContentDomain content, boolean compact, CvLanguage language, Portrait portrait) {
        String html = html(content, compact, language, portrait);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useFastMode();
            builder.useFont(() -> resource("fonts/Inter-Regular.ttf"), "Inter", 400, FontStyle.NORMAL, true);
            builder.useFont(() -> resource("fonts/Inter-SemiBold.ttf"), "Inter", 600, FontStyle.NORMAL, true);
            builder.useFont(() -> resource("fonts/Inter-Bold.ttf"), "Inter", 700, FontStyle.NORMAL, true);
            builder.useSVGDrawer(new BatikSVGDrawer());
            builder.withProducer("saas-portfolio");
            builder.withHtmlContent(html, null);
            builder.toStream(out);
            builder.run();
        } catch (IOException e) {
            throw new UncheckedIOException("No se pudo generar el CV en PDF", e);
        }
        return out.toByteArray();
    }

    /** La página, como XHTML bien formado (lo exige el conversor). */
    String html(CvContentDomain content, boolean compact, CvLanguage language, Portrait portrait) {
        StringBuilder html = new StringBuilder("<html><head><title>").append(escape(content.name())).append(" - CV</title>")
                .append("<meta name=\"author\" content=\"").append(escape(content.name())).append("\"/>")
                .append("<style>").append(stylesheet()).append("</style></head>")
                .append("<body class=\"").append(compact ? "compact" : "full").append("\">");

        html.append("<div class=\"header\"><div class=\"name\">").append(escape(content.name())).append("</div>");
        if (StringUtils.hasText(content.headline())) {
            html.append("<div class=\"headline\">").append(escape(content.headline())).append("</div>");
        }
        html.append("</div><div class=\"accent\"></div><div class=\"page\">");

        html.append("<div class=\"side\">");
        if (portrait.shown()) {
            html.append("<div class=\"portrait\">").append(portrait(portrait, content.name())).append("</div>");
        }
        html.append("<div class=\"card\">");
        List<String> contact = contactLines();
        if (!contact.isEmpty()) {
            html.append("<div class=\"block\">").append(sideTitle(ICON_CONTACT, language == CvLanguage.ES ? "Contacto" : "Contact"));
            contact.forEach(line -> html.append("<p>").append(escape(line)).append("</p>"));
            html.append("</div>");
        }
        List<String> badges = topTechnologies(content, compact ? BADGES_COMPACT : BADGES);
        if (!badges.isEmpty()) {
            html.append("<div class=\"block\">").append(sideTitle(ICON_STACK, "Stack"));
            badges.forEach(badge -> html.append("<span class=\"badge\">").append(escape(badge)).append("</span> "));
            html.append("</div>");
        }
        for (Section section : content.sections()) {
            if (section.aside()) {
                html.append("<div class=\"block\">").append(sideTitle(ICON_ASIDE, section.title()));
                section.blocks().forEach(block -> html.append("<p>").append(rich(block.text())).append("</p>"));
                html.append("</div>");
            }
        }
        html.append("</div></div><div class=\"main\">");
        content.sections().stream().filter(section -> !section.aside()).forEach(section -> html.append(mainSection(section)));
        return html.append("</div></div></body></html>").toString();
    }

    /**
     * Marco de la foto: un cuadrado de esquinas muy redondeadas con borde fino, sobre una copia
     * desplazada y más oscura que hace de sombra. Dentro, la foto recortada al marco o, si no
     * hay foto (o no se puede leer), las iniciales sobre un degradado.
     */
    static String portrait(Portrait portrait, String name) {
        return portrait.photo().flatMap(StyledCvPdfWriter::framedPhoto)
                .map(png -> "<img width=\"104\" height=\"108\" alt=\"\" src=\"data:image/png;base64," + png + "\"/>")
                .orElseGet(() -> avatar(name));
    }

    /** Avatar vectorial: las iniciales sobre un degradado, en el mismo marco que la foto. */
    private static String avatar(String name) {
        return "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"104\" height=\"108\" viewBox=\"0 0 104 108\"><defs>"
                + "<linearGradient id=\"neon\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">"
                + "<stop offset=\"0\" stop-color=\"#22D3EE\"/><stop offset=\"0.55\" stop-color=\"#3B82F6\"/><stop offset=\"1\" stop-color=\"#A855F7\"/>"
                + "</linearGradient></defs>"
                + "<rect x=\"4\" y=\"7\" width=\"96\" height=\"99\" rx=\"26\" ry=\"26\" fill=\"#0F172A\" fill-opacity=\"0.18\"/>"
                + "<rect x=\"2\" y=\"2\" width=\"100\" height=\"100\" rx=\"26\" ry=\"26\" fill=\"url(#neon)\"/>"
                + "<text x=\"52\" y=\"65\" text-anchor=\"middle\" font-family=\"Helvetica, Arial, sans-serif\" font-size=\"38\" font-weight=\"bold\" fill=\"#FFFFFF\">"
                + escape(initials(name)) + "</text>"
                + "<rect x=\"2\" y=\"2\" width=\"100\" height=\"100\" rx=\"26\" ry=\"26\" fill=\"none\" stroke=\"#1E293B\" stroke-width=\"1.5\"/></svg>";
    }

    /**
     * La foto ya recortada al marco, como PNG con transparencia en Base64: centrada, cubriendo
     * todo el cuadrado, con la sombra y el borde dibujados. Se compone al triple de tamaño para
     * que se imprima nítida.
     */
    private static Optional<String> framedPhoto(ProfilePhotoDomain photo) {
        try {
            BufferedImage source = ImageIO.read(new ByteArrayInputStream(photo.content()));
            if (source == null) {
                return Optional.empty();
            }
            int scale = 3;
            BufferedImage framed = new BufferedImage(104 * scale, 108 * scale, BufferedImage.TYPE_INT_ARGB);
            Graphics2D canvas = framed.createGraphics();
            canvas.scale(scale, scale);
            canvas.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            canvas.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            canvas.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);

            canvas.setColor(new Color(15, 23, 42, 46));
            canvas.fill(new RoundRectangle2D.Double(4, 7, 96, 99, 52, 52));

            RoundRectangle2D frame = new RoundRectangle2D.Double(2, 2, 100, 100, 52, 52);
            canvas.setClip(frame);
            double cover = Math.max(100.0 / source.getWidth(), 100.0 / source.getHeight());
            double width = source.getWidth() * cover;
            double height = source.getHeight() * cover;
            canvas.drawImage(source, (int) Math.round(2 + (100 - width) / 2), (int) Math.round(2 + (100 - height) / 2),
                    (int) Math.round(width), (int) Math.round(height), null);
            canvas.setClip(null);
            canvas.setColor(new Color(0x1E293B));
            canvas.setStroke(new BasicStroke(1.5f));
            canvas.draw(frame);
            canvas.dispose();

            ByteArrayOutputStream png = new ByteArrayOutputStream();
            ImageIO.write(framed, "png", png);
            return Optional.of(Base64.getEncoder().encodeToString(png.toByteArray()));
        } catch (IOException e) {
            return Optional.empty();
        }
    }

    /** Inicial del nombre y del primer apellido: con dos nombres y dos apellidos, la primera y la tercera palabra. */
    static String initials(String name) {
        List<String> words = Arrays.stream(name.strip().split("\\s+"))
                .filter(word -> !word.isEmpty() && Character.isUpperCase(word.charAt(0))).toList();
        if (words.isEmpty()) {
            return "";
        }
        String first = words.get(0).substring(0, 1);
        return words.size() == 1 ? first : first + words.get(words.size() >= 4 ? 2 : 1).charAt(0);
    }

    private static String sideTitle(String iconPath, String title) {
        return "<h2><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"11\" height=\"11\" viewBox=\"0 0 24 24\">"
                + "<path d=\"" + iconPath + "\" fill=\"none\" stroke=\"#93C5FD\" stroke-width=\"2\" stroke-linejoin=\"round\"/></svg>"
                + escape(title) + "</h2>";
    }

    /** Una sección de la columna principal: lo que precede a la primera entrada va suelto; cada entrada, en la línea de tiempo. */
    private static String mainSection(Section section) {
        StringBuilder html = new StringBuilder("<div class=\"section\"><h2>").append(escape(section.title())).append("</h2>");
        List<List<Block>> entries = new ArrayList<>();
        List<Block> loose = new ArrayList<>();
        for (Block block : section.blocks()) {
            if (block.kind() == Kind.HEADING) {
                entries.add(new ArrayList<>(List.of(block)));
            } else if (entries.isEmpty()) {
                loose.add(block);
            } else {
                entries.get(entries.size() - 1).add(block);
            }
        }
        html.append(body(loose));
        for (int index = 0; index < entries.size(); index++) {
            html.append(entry(entries.get(index), index == entries.size() - 1));
        }
        return html.append("</div>").toString();
    }

    private static String entry(List<Block> blocks, boolean last) {
        String[] heading = HEADING_SEPARATOR.split(blocks.get(0).text(), 2);
        List<String> meta = new ArrayList<>();
        List<String> chips = new ArrayList<>();
        List<Block> rest = new ArrayList<>();
        for (Block block : blocks.subList(1, blocks.size())) {
            Matcher field = block.kind() == Kind.BULLET ? FIELD.matcher(block.text()) : null;
            if (field == null || !field.matches()) {
                rest.add(block);
            } else if (items(field.group(2)).size() >= LIST_FROM) {
                chips.addAll(items(field.group(2)));
            } else {
                meta.add(field.group(2));
            }
        }

        StringBuilder html = new StringBuilder("<div class=\"entry").append(last ? " last" : "").append("\"><div class=\"dot\"></div>");
        if (heading.length == 2) {
            html.append("<div class=\"period\">").append(escape(heading[0])).append("</div>");
        }
        html.append("<div class=\"title\">").append(escape(heading[heading.length - 1])).append("</div>");
        if (!meta.isEmpty()) {
            html.append("<div class=\"meta\">").append(escape(String.join("  ·  ", meta))).append("</div>");
        }
        html.append(body(rest));
        if (!chips.isEmpty()) {
            html.append("<div class=\"chips\">");
            chips.forEach(chip -> html.append("<span class=\"chip\">").append(escape(chip)).append("</span> "));
            html.append("</div>");
        }
        return html.append("</div>").toString();
    }

    private static String body(List<Block> blocks) {
        StringBuilder html = new StringBuilder();
        boolean list = false;
        for (Block block : blocks) {
            boolean bullet = block.kind() == Kind.BULLET;
            if (bullet != list) {
                html.append(bullet ? "<ul>" : "</ul>");
                list = bullet;
            }
            html.append(bullet ? "<li>" : "<p>").append(rich(block.text())).append(bullet ? "</li>" : "</p>");
        }
        return html.append(list ? "</ul>" : "").toString();
    }

    /** Las tecnologías que más se repiten en las entradas; a igualdad, por orden de aparición. */
    static List<String> topTechnologies(CvContentDomain content, int limit) {
        Map<String, Integer> count = new LinkedHashMap<>();
        content.sections().stream().flatMap(section -> section.blocks().stream())
                .filter(block -> block.kind() == Kind.BULLET)
                .map(block -> FIELD.matcher(block.text()))
                .filter(Matcher::matches)
                .map(field -> items(field.group(2)))
                .filter(items -> items.size() >= LIST_FROM)
                .forEach(items -> items.forEach(item -> count.merge(item, 1, Integer::sum)));
        return count.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue(Comparator.reverseOrder()))
                .limit(limit).map(Map.Entry::getKey).toList();
    }

    private static List<String> items(String value) {
        return Arrays.stream(value.split(",")).map(String::strip).filter(item -> !item.isEmpty()).toList();
    }

    /** `CV_CONTACT` admite varios datos separados por «|» o «·»: cada uno ocupa una línea. */
    private List<String> contactLines() {
        return StringUtils.hasText(properties.cvContact())
                ? Arrays.stream(properties.cvContact().split("[|·]")).map(String::strip).filter(line -> !line.isEmpty()).toList()
                : List.of();
    }

    private static String rich(String text) {
        return BOLD.matcher(escape(text)).replaceAll("<strong>$1</strong>");
    }

    private static String escape(String text) {
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private static String stylesheet() {
        try (InputStream css = resource("cv.css")) {
            return new String(css.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static InputStream resource(String name) {
        InputStream stream = StyledCvPdfWriter.class.getClassLoader().getResourceAsStream(RESOURCES + name);
        if (stream == null) {
            throw new IllegalStateException("Falta el recurso del CV: " + RESOURCES + name);
        }
        return stream;
    }
}
