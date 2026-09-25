from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


SITE_DIR = Path(__file__).resolve().parent / "site"
EXPECTED_HTML_PAGES = 11
BUSINESS_EMAIL = "zxc1316@naver.com"
BUSINESS_REGISTRATION_NUMBER = "860-19-02571"
MAIL_ORDER_REPORT_NUMBER = "2026-서울금천-1899"
INSTAGRAM_URL = "https://www.instagram.com/haruhankan.official/"
LANDING_PAGE_PRICES = ("290,000", "490,000", "790,000")
LOGO_DESIGN_PRICES = ("90,000", "190,000", "390,000")
OLD_EMAILS = ("ygham82@gmail.com", "ygham82%40gmail.com")
INQUIRY_ENDPOINT = "https://hvnoylwqzpbxxhmnqbzb.supabase.co/functions/v1/submit-haru-hankan-inquiry"


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
    for page in html_pages:
        if page.name != "inquiries.html":
            assert BUSINESS_REGISTRATION_NUMBER in page.read_text(encoding="utf-8"), (
                f"Business registration number is missing in {page.name}"
            )
            assert MAIL_ORDER_REPORT_NUMBER in page.read_text(encoding="utf-8"), (
                f"Mail-order report number is missing in {page.name}"
            )
    assert INSTAGRAM_URL in combined_html, "Official Instagram link is missing"
    service_html = (SITE_DIR / "landing-page-service.html").read_text(encoding="utf-8")
    assert all(price in service_html for price in LANDING_PAGE_PRICES), (
        "Landing-page package pricing is incomplete"
    )
    assert 'id="pricing"' in service_html, "Pricing section anchor is missing"
    logo_service_html = (SITE_DIR / "logo-design-service.html").read_text(encoding="utf-8")
    assert all(price in logo_service_html for price in LOGO_DESIGN_PRICES), (
        "Logo-design package pricing is incomplete"
    )
    assert 'id="pricing"' in logo_service_html, "Logo pricing section anchor is missing"
    typography_css = (SITE_DIR / "typography.css").read_text(encoding="utf-8")
    compact_css = "".join(typography_css.split())
    assert "word-break:keep-all" in compact_css
    assert "overflow-wrap:break-word" in compact_css
    assert not any(email in combined_html for email in OLD_EMAILS), (
        "Old personal contact email is still present"
    )
    home_html = (SITE_DIR / "index.html").read_text(encoding="utf-8")
    assert 'data-inquiry-form' in home_html, "Homepage inquiry form is missing"
    assert INQUIRY_ENDPOINT in home_html, "Inquiry API endpoint is missing"
    assert 'href="https://braveload.github.io/cardpilot/"' in home_html, "CardPilot site link is missing"
    cardpilot_html = (SITE_DIR / "cardpilot-landing.html").read_text(encoding="utf-8")
    assert "베타 준비 단계" in cardpilot_html, "CardPilot beta-status notice is missing"
    assert 'href="./index.html#contact"' in cardpilot_html, "CardPilot inquiry link is missing"
    for field in ('name="name"', 'name="contact"', 'name="inquiry_type"', 'name="privacy_consent"'):
        assert field in home_html, f"Inquiry form field is missing: {field}"
    privacy_html = (SITE_DIR / "privacy.html").read_text(encoding="utf-8")
    assert "상담 종료 후 6개월" in privacy_html, "Inquiry retention notice is missing"
    inquiry_admin_html = (SITE_DIR / "inquiries.html").read_text(encoding="utf-8")
    assert 'noindex,nofollow,noarchive' in inquiry_admin_html, "Inquiry admin should not be indexed"
    assert "PUBLISHABLE_KEY" in inquiry_admin_html, "Inquiry admin sign-in setup is missing"
    assert "SUPABASE_SERVICE_ROLE_KEY" not in inquiry_admin_html, "Server-only key leaked into the public page"
    assert 'Disallow: /inquiries.html' in (SITE_DIR / "robots.txt").read_text(encoding="utf-8")


if __name__ == "__main__":
    verify()
    print("Static site verification passed.")
