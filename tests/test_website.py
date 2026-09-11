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
    assert ".contact-card .btn.ghost { color:#14181c; border-color:#d7dde2; }" in home.text
    assert 'href="./landing-sample.html"' in home.text

    for path in (
        "/privacy.html",
        "/terms.html",
        "/landing-sample.html",
        "/styles.css",
        "/script.js",
        "/assets/brand/haru-hankan-symbol.svg",
        "/og.png",
    ):
        assert client.get(path).status_code == 200

    robots = client.get("/robots.txt")
    assert robots.status_code == 200
    assert "https://haru-hankan.onrender.com/sitemap.xml" in robots.text

    sitemap = client.get("/sitemap.xml")
    assert sitemap.status_code == 200
    assert "https://haru-hankan.onrender.com/privacy.html" in sitemap.text
    assert "https://haru-hankan.onrender.com/landing-sample.html" in sitemap.text
