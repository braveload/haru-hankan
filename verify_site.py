from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


SITE_DIR = Path(__file__).resolve().parent / "site"
EXPECTED_HTML_PAGES = 9
BUSINESS_EMAIL = "zxc1316@naver.com"
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
        parser = ReferenceParser()
        parser.feed(html)
        for reference in parser.references:
            target = local_target(page, reference)
            if target is not None:
                assert target.is_file(), f"Broken local reference in {page.name}: {reference}"

    assert BUSINESS_EMAIL in combined_html, "Business contact email is missing"
    assert not any(email in combined_html for email in OLD_EMAILS), (
        "Old personal contact email is still present"
    )


if __name__ == "__main__":
    verify()
    print("Static site verification passed.")
