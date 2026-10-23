"""Validación HTTP: estado, latencia y cadena de redirecciones."""
from __future__ import annotations

import time
from urllib.parse import urljoin, urlsplit

import httpx

from .config import Settings
from .models import HttpResult, QRStatus

_HEAD_UNSUPPORTED = {400, 403, 405, 406, 501}


def is_http_url(text: str) -> bool:
    parts = urlsplit(text.strip())
    return parts.scheme in ("http", "https") and bool(parts.netloc)


def _host(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower()
    return host.removeprefix("www.")


class UrlValidator:
    def __init__(self, settings: Settings):
        self._s = settings
        self._client = httpx.AsyncClient(
            follow_redirects=False,
            timeout=settings.http_timeout_s,
            headers={"User-Agent": settings.user_agent},
            limits=httpx.Limits(max_connections=settings.http_concurrency * 2),
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def check(self, url: str) -> HttpResult:
        url = url.strip()
        if not is_http_url(url):
            return HttpResult(QRStatus.INVALID_URL, detail="El QR no contiene una URL http(s)")
        started = time.perf_counter()
        try:
            return await self._follow(url, started)
        except httpx.TimeoutException:
            return HttpResult(QRStatus.TIMEOUT, response_ms=self._ms(started),
                              detail=f"Sin respuesta en {self._s.http_timeout_s:.0f}s")
        except httpx.HTTPError as exc:
            return HttpResult(QRStatus.CONNECTION_ERROR, response_ms=self._ms(started),
                              detail=type(exc).__name__ + (f": {exc}" if str(exc) else ""))

    async def _follow(self, url: str, started: float) -> HttpResult:
        seen = {url}
        current, hops, method = url, 0, "HEAD"
        while True:
            resp = await self._client.request(method, current)
            if method == "HEAD" and resp.status_code in _HEAD_UNSUPPORTED:
                method = "GET"
                continue
            if resp.is_redirect and "location" in resp.headers:
                hops += 1
                nxt = urljoin(current, resp.headers["location"])
                if hops > self._s.max_redirects or nxt in seen or not is_http_url(nxt):
                    reason = "Bucle de redirección" if nxt in seen else "Demasiadas redirecciones"
                    return HttpResult(QRStatus.REDIRECT_ERROR, resp.status_code, self._ms(started),
                                      nxt, hops, reason)
                seen.add(nxt)
                current = nxt
                continue
            return self._classify(url, current, resp.status_code, hops, self._ms(started))

    @staticmethod
    def _classify(origin: str, final: str, code: int, hops: int, ms: int) -> HttpResult:
        if code >= 400:
            return HttpResult(QRStatus.BROKEN, code, ms, final, hops, f"HTTP {code}")
        if _host(origin) != _host(final):
            return HttpResult(QRStatus.REDIRECT, code, ms, final, hops,
                              f"Termina en {_host(final)}")
        return HttpResult(QRStatus.OK, code, ms, final, hops)

    @staticmethod
    def _ms(started: float) -> int:
        return round((time.perf_counter() - started) * 1000)
