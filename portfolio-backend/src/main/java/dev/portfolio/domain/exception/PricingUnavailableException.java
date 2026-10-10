package dev.portfolio.domain.exception;

/**
 * El proveedor de precios no pudo dar una tarifa ahora mismo: no responde, limita las
 * peticiones, su circuito está abierto o contestó algo que no se entiende. Quien la recibe
 * decide el recurso (la última tarifa conocida o «precio desconocido»); nunca llega al cliente.
 */
public class PricingUnavailableException extends RuntimeException {

    public PricingUnavailableException(String message) {
        super(message);
    }

    public PricingUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
