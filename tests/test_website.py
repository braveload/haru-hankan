from fastapi.testclient import TestClient

from app import main


def test_website_pages_assets_and_search_files(monkeypatch):
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://haru-hankan.onrender.com")
    client = TestClient(main.app)

    home = client.get("/")
    assert home.status_code == 200
    assert "하루한칸" in home.text
    assert "{{BASE_URL}}" not in home.text
    assert "https://haru-hankan.onrender.com/" in home.text
    assert 'action="mailto:' not in home.text
    assert "mailto:" not in home.text
    assert "https://mail.google.com/mail/?view=cm" in home.text
    assert "https://mail.naver.com/v2/new?to=" in home.text
    assert "zxc1316%40naver.com" in home.text
    assert "ygham82@gmail.com" not in home.text
    assert "word-break:keep-all" in home.text
    assert "--meta-text:#8a93a0" in home.text
    assert ".contact-card .btn.ghost { color:var(--paper); border-color:currentColor; }" in home.text
    assert 'href="./landing-sample.html"' in home.text
    assert 'href="./landing-sample-2.html"' in home.text
    assert 'href="./landing-sample-3.html"' in home.text
    assert 'href="./logo-samples.html"' in home.text
    assert 'href="./landing-page-service.html"' in home.text
    assert 'href="./logo-design-service.html"' in home.text
    assert 'type="application/ld+json"' in home.text
    assert "haru-hankan-og.png" in home.text

    for path in (
        "/privacy.html",
        "/terms.html",
        "/landing-sample.html",
        "/landing-sample-2.html",
        "/landing-sample-3.html",
        "/logo-samples.html",
        "/landing-page-service.html",
        "/logo-design-service.html",
        "/styles.css",
        "/script.js",
        "/assets/brand/haru-hankan-symbol.svg",
        "/assets/brand/haru-hankan-og.png",
        "/og.png",
    ):
        assert client.get(path).status_code == 200

    for path in ("/landing-page-service.html", "/logo-design-service.html"):
        service_page = client.get(path)
        assert "mail.google.com/mail/?view=cm" in service_page.text
        assert "mail.naver.com/v2/new?to=" in service_page.text
        assert "zxc1316%40naver.com" in service_page.text
        assert "ygham82%40gmail.com" not in service_page.text

    robots = client.get("/robots.txt")
    assert robots.status_code == 200
    assert "https://haru-hankan.onrender.com/sitemap.xml" in robots.text

    sitemap = client.get("/sitemap.xml")
    assert sitemap.status_code == 200
    assert "https://haru-hankan.onrender.com/privacy.html" in sitemap.text
    assert "https://haru-hankan.onrender.com/landing-sample.html" in sitemap.text
    assert "https://haru-hankan.onrender.com/landing-sample-2.html" in sitemap.text
    assert "https://haru-hankan.onrender.com/landing-sample-3.html" in sitemap.text
    assert "https://haru-hankan.onrender.com/logo-samples.html" in sitemap.text
    assert "https://haru-hankan.onrender.com/landing-page-service.html" in sitemap.text
    assert "https://haru-hankan.onrender.com/logo-design-service.html" in sitemap.text
