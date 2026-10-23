"""Modelos de dominio compartidos por todas las capas."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from urllib.parse import urlsplit


class QRStatus(str, Enum):
    OK = "ok"
    REDIRECT = "redirect"            # funciona, pero termina en otro dominio
    ILLEGIBLE = "illegible"          # QR detectado pero no decodificable
    NO_QR = "no_qr"                  # la página no contiene QR
    INVALID_URL = "invalid_url"      # el QR no contiene una URL http(s)
    BROKEN = "broken"                # HTTP 4xx/5xx
    TIMEOUT = "timeout"
    REDIRECT_ERROR = "redirect_error"  # bucle o demasiados saltos
    CONNECTION_ERROR = "connection_error"  # DNS, TLS, conexión rechazada

    @property
    def is_success(self) -> bool:
        return self in (QRStatus.OK, QRStatus.REDIRECT)

    @property
    def is_broken_link(self) -> bool:
        return self in (QRStatus.BROKEN, QRStatus.TIMEOUT, QRStatus.REDIRECT_ERROR,
                        QRStatus.CONNECTION_ERROR)


STATUS_LABELS = {
    QRStatus.OK: "Correcto",
    QRStatus.REDIRECT: "Redirige a otro dominio",
    QRStatus.ILLEGIBLE: "QR ilegible",
    QRStatus.NO_QR: "Sin QR",
    QRStatus.INVALID_URL: "Contenido no es URL",
    QRStatus.BROKEN: "URL rota",
    QRStatus.TIMEOUT: "Tiempo agotado",
    QRStatus.REDIRECT_ERROR: "Error de redirección",
    QRStatus.CONNECTION_ERROR: "Error de conexión",
}


# (tono, titular, qué hacer) en lenguaje no técnico para el dashboard.
STATUS_HELP = {
    QRStatus.OK: ("good", "Funciona", "El QR se lee y abre la página correctamente."),
    QRStatus.REDIRECT: ("good", "Funciona", "El QR se lee y abre la página correctamente."),
    QRStatus.ILLEGIBLE: ("bad", "No se puede leer",
                         "El código está dañado o es muy pequeño. Revisa el margen blanco, el contraste y el tamaño."),
    QRStatus.NO_QR: ("bad", "No se encontró el QR",
                     "Esta página no tiene ningún QR. Revisa que no se haya perdido en el diseño."),
    QRStatus.INVALID_URL: ("bad", "No lleva a una página web",
                           "El QR contiene texto que no es un enlace. Vuelve a generarlo con la dirección web."),
    QRStatus.BROKEN: ("bad", "El enlace está roto",
                      "La página no existe o no está disponible. Pide el enlace correcto y regenera el QR."),
    QRStatus.TIMEOUT: ("bad", "La página no responde",
                       "Tardó demasiado en abrir. Vuelve a auditar en unos minutos."),
    QRStatus.REDIRECT_ERROR: ("bad", "El enlace da vueltas",
                              "Redirige en círculo. Avisa a quien administra el enlace."),
    QRStatus.CONNECTION_ERROR: ("bad", "No se pudo conectar",
                                "La dirección no existe o el sitio está caído. Revisa que esté bien escrita."),
}


@dataclass(frozen=True)
class PageImage:
    page: int          # 1-based
    piece: str         # nombre de la pieza/página
    png: bytes


@dataclass(frozen=True)
class QRRead:
    """Resultado del decodificador para una página."""
    page: int
    piece: str
    payloads: tuple[str, ...]   # contenidos decodificados
    undecoded: int              # QR detectados pero ilegibles


@dataclass(frozen=True)
class HttpResult:
    status: QRStatus
    http_status: int | None = None
    response_ms: int | None = None
    final_url: str = ""
    redirects: int = 0
    detail: str = ""


@dataclass
class AuditRow:
    piece: str
    page: int
    url: str
    qr_status: QRStatus
    http_status: int | None = None
    response_ms: int | None = None
    final_url: str = ""
    redirects: int = 0
    detail: str = ""

    def to_dict(self) -> dict:
        d = asdict(self)
        d["qr_status"] = self.qr_status.value
        d["label"] = STATUS_LABELS[self.qr_status]
        d["tone"], d["headline"], d["advice"] = STATUS_HELP[self.qr_status]
        d["destination"] = self._destination()
        return d


    def _destination(self) -> str:
        """Dominio al que lleva el QR; nunca vacío."""
        target = self.final_url or self.url
        host = urlsplit(target).hostname if target else None
        return (host or "—").removeprefix("www.").lower() if host else "Sin destino"


@dataclass
class Summary:
    total_pages: int = 0
    total_qr: int = 0
    ok: int = 0
    errors: int = 0
    broken_links: int = 0
    elapsed_s: float = 0.0
    by_status: dict[str, int] = field(default_factory=dict)
