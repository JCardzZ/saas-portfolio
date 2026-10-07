package dev.portfolio.infrastructure.adapter.out.cv;

import dev.portfolio.application.port.out.CvRendererPort;
import dev.portfolio.domain.model.CvContentDomain;
import dev.portfolio.domain.model.CvLanguage;
import dev.portfolio.domain.model.CvType;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Elige la maqueta según la variante: la diseñada a dos columnas o la plana para ATS. */
@Component
@RequiredArgsConstructor
public class CvRendererAdapter implements CvRendererPort {

    private final StyledCvPdfWriter styled;
    private final PlainCvPdfWriter plain;

    @Override
    public byte[] render(CvContentDomain content, CvType type, CvLanguage language, Portrait portrait) {
        return type == CvType.ATS ? plain.write(content) : styled.write(content, type == CvType.SHORT, language, portrait);
    }
}
