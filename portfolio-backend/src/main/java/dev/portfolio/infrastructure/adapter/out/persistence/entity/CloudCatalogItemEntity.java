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

import java.math.BigDecimal;

@Entity
@Table(name = "cloud_catalog_items")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CloudCatalogItemEntity {

    @Id
    private String id;

    @Column(nullable = false, length = 16)
    private String provider;

    @Column(nullable = false, length = 48)
    private String code;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(nullable = false, length = 48)
    private String category;

    @Column(name = "default_monthly_cost", nullable = false, precision = 10, scale = 2)
    private BigDecimal defaultMonthlyCost;

    @Column(name = "is_enterprise", nullable = false)
    private boolean enterprise;
}
