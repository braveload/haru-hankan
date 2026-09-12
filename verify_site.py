from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


SITE_DIR = Path(__file__).resolve().parent / "site"
EXPECTED_HTML_PAGES = 9
BUSINESS_EMAIL = "zxc1316@naver.com"
INSTAGRAM_URL = "https://www.instagram.com/haruhankan.official/"
LANDING_PAGE_PRICES = ("290,000", "490,000", "790,000")
OLD_EMAILS = ("ygham82@gmail.com", "ygham82%40gmail.com")


class ReferenceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.references: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for name, value in attrs:
            if name in {"href", "src"} and value:
                self.references.append(value)


def local_target(page: Path, reference: str) -> Path | None:
    parsed = urlsplit(reference)
    if parsed.scheme or parsed.netloc or not parsed.path:
        return None

    path = unquote(parsed.path)
    target = SITE_DIR / path.lstrip("/") if path.startswith("/") else page.parent / path
    resolved = target.resolve()
    resolved.relative_to(SITE_DIR.resolve())
    return resolved


def verify() -> None:
    html_pages = sorted(SITE_DIR.glob("*.html"))
    assert len(html_pages) == EXPECTED_HTML_PAGES, (
        f"Expected {EXPECTED_HTML_PAGES} HTML pages, found {len(html_pages)}"
    )

    combined_html = ""
    for page in html_pages:
        html = page.read_text(encoding="utf-8")
        combined_html += html
        assert 'href="./typography.css"' in html, (
            f"Korean typography stylesheet is missing in {page.name}"
        )
        parser = ReferenceParser()
        parser.feed(html)
        for reference in parser.references:
            target = local_target(page, reference)
            if target is not None:
                assert target.is_file(), f"Broken local reference in {page.name}: {reference}"

    assert BUSINESS_EMAIL in combined_html, "Business contact email is missing"
    assert INSTAGRAM_URL in combined_html, "Official Instagram link is missing"
    service_html = (SITE_DIR / "landing-page-service.html").read_text(encoding="utf-8")
    assert all(price in service_html for price in LANDING_PAGE_PRICES), (
        "Landing-page package pricing is incomplete"
    )
    assert 'id="pricing"' in service_html, "Pricing section anchor is missing"
    typography_css = (SITE_DIR / "typography.css").read_text(encoding="utf-8")
    compact_css = "".join(typography_css.split())
    assert "word-break:keep-all" in compact_css
    assert "overflow-wrap:break-word" in compact_css
    assert not any(email in combined_html for email in OLD_EMAILS), (
        "Old personal contact email is still present"
    )


if __name__ == "__main__":
    verify()
    print("Static site verification passed.")
