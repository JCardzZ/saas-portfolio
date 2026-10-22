package dev.portfolio.infrastructure.adapter.in.web.controller;

import dev.portfolio.application.port.in.FeatureFlagUseCase;
import dev.portfolio.infrastructure.adapter.in.web.flags.CloudProviders;
import org.springframework.beans.factory.ObjectProvider;
import dev.portfolio.application.port.in.ArchitectureCopilotUseCase;
import dev.portfolio.domain.model.ArchitectureAdviceDomain;
import dev.portfolio.domain.model.CloudProviderDomain;
import dev.portfolio.model.ArchitectureAddition;
import dev.portfolio.model.ArchitectureCopilotRequest;
import dev.portfolio.model.ArchitectureCopilotResponse;
import dev.portfolio.model.ArchitectureRecommendation;
import dev.portfolio.api.AppliedAiRagApi;
import dev.portfolio.application.port.in.RAGIndexingUseCase;
import dev.portfolio.application.port.in.RAGUseCase;
import dev.portfolio.infrastructure.adapter.in.web.mapper.RagWebMapper;
import dev.portfolio.infrastructure.adapter.in.web.tenant.TenantResolver;
import dev.portfolio.model.AIQueryRequest;
import dev.portfolio.model.AIQueryResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
public class AiRagController implements AppliedAiRagApi {

    private final RAGUseCase ragUseCase;
    private final RAGIndexingUseCase ragIndexingUseCase;
    private final ArchitectureCopilotUseCase copilotUseCase;
    private final RagWebMapper mapper;
    private final TenantResolver tenantResolver;
    private final HttpServletRequest request;
    private final ObjectProvider<FeatureFlagUseCase> flags;

    public AiRagController(RAGUseCase ragUseCase,
                           RAGIndexingUseCase ragIndexingUseCase,
                           ArchitectureCopilotUseCase copilotUseCase,
                           RagWebMapper mapper,
                           TenantResolver tenantResolver,
                           HttpServletRequest request,
                           ObjectProvider<FeatureFlagUseCase> flags) {
        this.flags = flags;
        this.ragUseCase = ragUseCase;
        this.ragIndexingUseCase = ragIndexingUseCase;
        this.copilotUseCase = copilotUseCase;
        this.mapper = mapper;
        this.tenantResolver = tenantResolver;
        this.request = request;
    }

    @Override
    public ResponseEntity<AIQueryResponse> aiRagQueryPost(AIQueryRequest aiQueryRequest) {
        return ResponseEntity.ok(mapper.toDto(ragUseCase.query(
                mapper.toDomain(aiQueryRequest, tenantResolver.currentTenantId()), request.getRemoteAddr())));
    }

    @Override
    public ResponseEntity<ArchitectureCopilotResponse> aiArchitectureCopilotPost(ArchitectureCopilotRequest body) {
        ArchitectureAdviceDomain advice = copilotUseCase.advise(new ArchitectureCopilotUseCase.Question(
                tenantResolver.currentTenantId(), body.getPrompt(), CloudProviders.resolve(body.getCloudProvider().getValue(), flags),
                body.getNodes(), body.getConnections()), request.getRemoteAddr());
        return ResponseEntity.ok(new ArchitectureCopilotResponse()
                .answer(advice.answer())
                .recommendations(advice.recommendations().stream().map(recommendation -> new ArchitectureRecommendation()
                        .title(recommendation.title())
                        .pros(recommendation.pros())
                        .cons(recommendation.cons())
                        .snippetLanguage(recommendation.snippetLanguage())
                        .snippet(recommendation.snippet())
                        .additions(recommendation.additions().stream().map(addition -> new ArchitectureAddition()
                                .code(addition.code()).name(addition.name()).role(addition.role()).connectFrom(addition.connectFrom())).toList()))
                        .toList()));
    }

    // Termina dentro de la petición: en Cloud Run (CPU solo durante la petición) un trabajo que siguiera
    // tras responder se quedaría sin CPU y no acabaría nunca. Si falla, el error llega al administrador.
    @Override
    public ResponseEntity<Void> adminAiRagReindexPost() {
        String tenantId = tenantResolver.currentTenantId();
        int fragments = ragIndexingUseCase.reindex(tenantId);
        log.info("RAG reindex finished for tenant '{}': {} fragments", tenantId, fragments);
        return ResponseEntity.accepted().build();
    }
}
