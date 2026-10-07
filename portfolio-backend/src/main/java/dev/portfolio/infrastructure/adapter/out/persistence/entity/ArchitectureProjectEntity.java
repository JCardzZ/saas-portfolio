package dev.portfolio.infrastructure.adapter.out.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "architecture_projects")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ArchitectureProjectEntity {

    @Id
    private String id;

    @Column(nullable = false, length = 120)
    private String title;

    @Column(length = 500)
    private String description;

    @Column(name = "cloud_provider", nullable = false, length = 16)
    private String cloudProvider;

    @Column(name = "nodes_json", nullable = false, columnDefinition = "TEXT")
    private String nodesJson;

    @Column(name = "connections_json", nullable = false, columnDefinition = "TEXT")
    private String connectionsJson;

    @Column(name = "zones_json", nullable = false, columnDefinition = "TEXT")
    private String zonesJson;

    @Column(name = "is_preset", nullable = false)
    private boolean preset;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
