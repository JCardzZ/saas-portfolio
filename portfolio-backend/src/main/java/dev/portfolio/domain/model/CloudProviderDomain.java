package dev.portfolio.domain.model;

import dev.portfolio.domain.exception.InvalidRequestException;

import java.util.Arrays;

/** Nubes para las que el Estudio de arquitectura sabe traducir un diagrama. */
public enum CloudProviderDomain {
    AWS("aws", "AWS", "VPC", "aws_vpc", "us-east-1"),
    GCP("gcp", "GCP", "VPC", "google_compute_network", "us-central1"),
    AZURE("azure", "Azure", "VNet", "azurerm_virtual_network", "eastus"),
    /** Oracle Cloud Infrastructure. Solo se admite con la flag {@code cloud.oracle} encendida. */
    OCI("oci", "OCI", "VCN", "oci_core_vcn", "us-ashburn-1");

    private final String code;
    private final String displayName;
    private final String network;
    private final String networkResource;
    private final String defaultRegion;

    CloudProviderDomain(String code, String displayName, String network, String networkResource, String defaultRegion) {
        this.code = code;
        this.displayName = displayName;
        this.network = network;
        this.networkResource = networkResource;
        this.defaultRegion = defaultRegion;
    }

    public String code() {
        return code;
    }

    public String displayName() {
        return displayName;
    }

    /** Nombre de la red privada en esa nube. */
    public String network() {
        return network;
    }

    /** Tipo de recurso de Terraform de la red privada. */
    public String networkResource() {
        return networkResource;
    }

    public String defaultRegion() {
        return defaultRegion;
    }

    public static CloudProviderDomain fromCode(String code) {
        return Arrays.stream(values()).filter(provider -> provider.code.equals(code)).findFirst()
                .orElseThrow(() -> new InvalidRequestException("Nube no admitida: '" + code + "'. Valores: aws, gcp, azure"));
    }
}
