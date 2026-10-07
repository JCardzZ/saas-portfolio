package dev.portfolio.infrastructure.adapter.in.web.mapper;

import dev.portfolio.domain.model.RAGAnswerDomain;
import dev.portfolio.domain.model.RAGQueryDomain;
import dev.portfolio.model.AIQueryRequest;
import dev.portfolio.model.AIQueryResponse;
import dev.portfolio.model.AIQueryResponseCitationsInner;
import org.mapstruct.Mapper;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface RagWebMapper {

    default RAGQueryDomain toDomain(AIQueryRequest request, String tenantId) {
        return RAGQueryDomain.of(tenantId, request.getPrompt());
    }

    AIQueryResponse toDto(RAGAnswerDomain answer);

    AIQueryResponseCitationsInner toDto(RAGAnswerDomain.Citation citation);
}
