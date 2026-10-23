"""Check JSON-LD against rendered-source content and local canonical assets."""
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit

SITE = Path(__file__).resolve().parent / 'site'
BASE = 'https://haru-hankan.onrender.com/'
PATTERN = re.compile(r'<script\b[^>]*type=[\x22\x27]application/ld\+json[\x22\x27][^>]*>(.*?)</script>', re.S | re.I)


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def verify():
    checked = 0
    for page in sorted(SITE.glob('*.html')):
        html = page.read_text(encoding='utf-8')
        visible = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', '', html, flags=re.S | re.I)
        visible = re.sub(r'<[^>]+>', ' ', visible)
        blocks = PATTERN.findall(html)
        ids = []
        for block in blocks:
            data = json.loads(block)
            assert data.get('@context') == 'https://schema.org', page.name
            for node in walk(data):
                if '@id' in node and '@type' in node:
                    ids.append(node['@id'])
                if 'price' in node:
                    assert node.get('priceCurrency') == 'KRW', page.name
                    price = int(node['price'])
                    assert format(price, ',') in visible, f'{page.name}: price absent from visible content: {price}'
                if node.get('@type') == 'BreadcrumbList':
                    items = node['itemListElement']
                    assert len(items) >= 2, page.name
                    assert [i['position'] for i in items] == list(range(1, len(items)+1)), page.name
                    assert all(i['name'] and i['item'].startswith(BASE) for i in items), page.name
                if node.get('@type') == 'WebPage' or isinstance(node.get('@type'), list) and 'WebPage' in node['@type']:
                    canonical = re.search(r'<link rel="canonical" href="([^"]+)"', html)[1]
                    assert node['url'] == canonical, page.name
                if node.get('@type') == 'Organization' and isinstance(node.get('logo'), dict):
                    logo = node['logo']
                    assert logo['width'] >= 112 and logo['height'] >= 112, page.name
                    asset = SITE / urlsplit(logo['url']).path.lstrip('/')
                    root = ET.parse(asset).getroot()
                    assert int(root.attrib['width']) == logo['width'], page.name
                    assert int(root.attrib['height']) == logo['height'], page.name
        assert len(ids) == len(set(ids)), f'Duplicate typed IDs: {page.name}'
        checked += len(blocks)
    home = json.loads(PATTERN.search((SITE/'index.html').read_text(encoding='utf-8'))[1])
    org = next(n for n in home['@graph'] if n['@type'] == 'Organization')
    urls = {o['itemOffered']['url'] for o in org['hasOfferCatalog']['itemListElement']}
    assert BASE+'system-development.html' in urls
    print(f'Schema verification passed: {checked} JSON-LD blocks; visible prices, breadcrumbs, canonical URLs, logo dimensions and service catalog checked.')


if __name__ == '__main__':
    verify()
