"""Build content-derived JSON-LD; validate local or deployed static pages."""
import argparse
import copy
import html as html_module
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).parent / 'site'
BASE = 'https://haru-hankan.onrender.com/'
LD = re.compile(r'<script\s+type="application/ld\+json">.*?</script>', re.S)
EXCLUDED = {'404.html', 'inquiries.html', 'inquiry-complete.html', 'system-admin-check.html'}

class Element:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []
    def find(self, tag=None, cls=None, ident=None):
        found = []
        for child in self.children:
            if isinstance(child, Element):
                if (not tag or child.tag == tag) and (not cls or cls in child.attrs.get('class', '').split()) and (not ident or child.attrs.get('id') == ident):
                    found.append(child)
                found.extend(child.find(tag, cls, ident))
        return found
    def text(self):
        return ' '.join(' '.join(c.text() if isinstance(c, Element) else c for c in self.children).split())

class Document(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.root = Element(); self.stack = [self.root]; self.feed(source)
    def handle_starttag(self, tag, attrs):
        e = Element(tag, attrs); self.stack[-1].children.append(e)
        if tag not in {'meta','link','img','input','br','hr','source','wbr','area','base','embed','param','track','col'}:
            self.stack.append(e)
    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Element(tag, attrs))
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]; break
    def handle_data(self, text):
        if self.stack[-1].tag not in {'script','style'}: self.stack[-1].children.append(text)

def ref(ident): return {'@id': ident}
def canonical(name): return BASE if name == 'index.html' else BASE + name
def build(name, source):
    dom = Document(source).root; url = canonical(name)
    previous = [json.loads(m.group()).get('@graph', []) for m in re.finditer(r'(?<=<script type="application/ld\+json">).*?(?=</script>)', source, re.S)]
    old = previous[0] if previous else []
    org = next((copy.deepcopy(x) for x in old if x['@type']=='Organization'), {'@type':'Organization','name':'하루한칸','url':BASE})
    org['@id'] = BASE+'#organization'
    site = {'@type':'WebSite','@id':BASE+'#website','name':'하루한칸','url':BASE,'inLanguage':'ko-KR','publisher':ref(org['@id'])}
    title = dom.find('title')[0].text()
    desc = next(e.attrs['content'] for e in dom.find('meta') if e.attrs.get('name')=='description')
    page = {'@type':'WebPage','@id':url+'#webpage','url':url,'name':title,'description':desc,'inLanguage':'ko-KR','isPartOf':ref(site['@id']),'publisher':ref(org['@id'])}
    graph = [org, site, page]
    # Reuse only breadcrumbs present in the rendered page; avoid duplicate microdata.
    crumbs = dom.find('nav', cls='breadcrumbs')
    if crumbs:
        items = []
        for position, a in enumerate(crumbs[0].find('a'), 1):
            items.append({'@type':'ListItem','position':position,'name':a.text(),'item':BASE if position==1 else url})
        breadcrumb = {'@type':'BreadcrumbList','@id':url+'#breadcrumb','itemListElement':items}
        graph.append(breadcrumb); page['breadcrumb'] = ref(breadcrumb['@id'])
    if name in {'landing-page-service.html','logo-design-service.html'}:
        service = next(copy.deepcopy(n) for n in old if n['@type']=='Service')
        service.pop('areaServed', None)
        pricing = dom.find(ident='pricing')[0].find(cls='plan')
        for offer, plan in zip(service['offers']['offers'], pricing, strict=True):
            offer['description'] = plan.text()
        graph.append(service); page['mainEntity'] = ref(service['@id'])
        if name=='landing-page-service.html':
            groups=[]
            for ident, label in [('one-off','건별 수정 · 부가세 포함'),('maintenance','월 유지보수 · 부가세 포함')]:
                offers=[]
                for plan in dom.find(ident=ident)[0].find(cls='plan'):
                    price=plan.find(cls='price')[0].text(); amount=re.search(r'[\d,]+',price)[0].replace(',','')
                    plan_name=plan.find(cls='plan-label')[0].text()
                    item={'@type':'Offer','name':plan_name,'price':amount,'priceCurrency':'KRW','url':url+'#'+ident,'description':plan.text(),'seller':ref(org['@id']),'itemOffered':{'@type':'Service','name':plan_name,'provider':ref(org['@id'])}}
                    offers.append(item)
                    if ident=='maintenance':
                        annual=plan.find(cls='annual-price')[0].text()
                        annual_amount=re.search(r'[\d,]+원',annual)[0][:-1].replace(',','')
                        annual_offer=copy.deepcopy(item);annual_offer.update(name=plan_name+' · 연간 선결제',price=annual_amount,description=annual+' · 유지보수 범위와 이용 기준은 페이지 안내에 따릅니다.')
                        offers.append(annual_offer)
                groups.append({'@type':'OfferCatalog','name':label,'itemListElement':offers})
            service['hasOfferCatalog']={'@type':'OfferCatalog','name':'선택형 운영·수정 서비스','itemListElement':groups}
    elif name=='system-development.html':
        service={'@type':'Service','@id':url+'#service','name':'맞춤형 시스템 개발','serviceType':'기업 업무용 맞춤형 시스템 개발','url':url,'description':desc,'provider':ref(org['@id']),'mainEntityOfPage':ref(page['@id'])}
        graph.append(service);page['mainEntity']=ref(service['@id'])
    elif name=='logo-samples.html':
        page['@type']=['WebPage','CollectionPage']
        works=[]
        for i, card in enumerate(dom.find('figure',cls='social-card')+dom.find('article',cls='card'),1):
            heading=card.find('strong') or card.find('h2')
            if not heading: raise ValueError('Missing sample name')
            work={'@type':'CreativeWork','@id':url+f'#sample-{i}','name':heading[0].text(),'description':'포트폴리오용 가상 브랜드 로고 샘플. 실제 고객 프로젝트가 아닙니다.','creator':ref(org['@id'])}
            imgs=card.find('img')
            if imgs:work['image']=BASE+imgs[0].attrs['src'].removeprefix('./')
            works.append({'@type':'ListItem','position':i,'item':work})
        assert len(works)==15, len(works)
        listing={'@type':'ItemList','@id':url+'#collection','name':'가상 브랜드 로고 샘플 15종','numberOfItems':len(works),'itemListElement':works}
        graph.append(listing);page['mainEntity']=ref(listing['@id'])
    elif name.startswith('landing-sample'):
        work={'@type':'CreativeWork','@id':url+'#sample','name':title,'description':desc+' 포트폴리오용 가상 브랜드 샘플이며 실제 고객 프로젝트나 실제 예약 서비스가 아닙니다.','creator':ref(org['@id'])}
        graph.append(work);page['mainEntity']=ref(work['@id'])
    elif name=='cardpilot-landing.html':
        # The page explicitly says beta preparation: no SoftwareApplication offer or availability claim.
        page['description']=desc+' 베타 준비 단계로 기능과 운영 정책은 출시 전 변경될 수 있습니다.'
    return {'@context':'https://schema.org','@graph':graph}

def generate():
    for path in sorted(ROOT.glob('*.html')):
        source=path.read_text(encoding='utf-8')
        if path.name in EXCLUDED: continue
        schema=build(path.name,source)
        source=LD.sub('',source)
        source=re.sub(r'\s+(?:itemscope|itemtype|itemid|itemprop)(?:="[^"]*")?', '', source)
        if not dom_has_canonical(source):
            source=source.replace('</head>',f'<link rel="canonical" href="{canonical(path.name)}">\n</head>')
        block='<script type="application/ld+json">\n'+json.dumps(schema,ensure_ascii=False,indent=2).replace('</','<\\/')+'\n</script>\n'
        source=source.replace('</head>',block+'</head>')
        path.write_text(source,encoding='utf-8')

def walk(value):
    if isinstance(value,dict):
        yield value
        for v in value.values():yield from walk(v)
    elif isinstance(value,list):
        for v in value:yield from walk(v)

def dom_has_canonical(source):
    return any(e.attrs.get('rel')=='canonical' for e in Document(source).root.find('link'))

def validate(live=False):
    rows=[]; all_ids=set(); all_refs=set()
    for path in sorted(ROOT.glob('*.html')):
        local=path.read_text(encoding='utf-8')
        source=local
        if live:
            try:
                source=urlopen(canonical(path.name),timeout=30).read().decode('utf-8')
            except HTTPError as error:
                if path.name!='404.html' or error.code!=404:raise
                source=error.read().decode('utf-8')
        blocks=LD.findall(source)
        if path.name in EXCLUDED:
            assert not blocks and 'noindex' in source,path.name
            rows.append({'page':path.name,'status':'noindex; schema intentionally omitted'});continue
        assert len(blocks)==1,path.name
        schema=json.loads(re.search(r'>(.*)</script>',blocks[0],re.S)[1])
        if live:
            assert schema==json.loads(re.search(r'>(.*)</script>',LD.findall(local)[0],re.S)[1]),path.name
        graph=schema['@graph'];ids=[n['@id'] for n in graph]
        assert len(ids)==len(set(ids)),path.name
        assert not re.search(r'\sitemscope',source),path.name
        canonical_tag=re.search(r'<link rel="canonical" href="([^"]+)"',source)[1]
        assert canonical_tag==canonical(path.name),path.name
        dom=Document(source).root;text=dom.text()
        for node in walk(schema):
            if set(node)=={'@id'}:all_refs.add(node['@id'])
            elif '@id' in node:all_ids.add(node['@id'])
            assert not any(k in node for k in ['aggregateRating','review','address','telephone','priceValidUntil']),path.name
            if set(node)=={'@id'}: assert node['@id'] in ids or node['@id'].startswith(BASE),node
            if node.get('@type')=='Offer' and 'price' in node:
                assert node['priceCurrency']=='KRW' and format(int(node['price']),',') in text,node
            if node.get('@type')=='Service' and path.name=='system-development.html':assert 'offers' not in node
            if node.get('@type')=='CreativeWork':assert '가상' in node['description']
        if path.name=='logo-samples.html':assert next(n for n in graph if n['@type']=='ItemList')['numberOfItems']==15
        rows.append({'page':path.name,'status':'pass','types':[n['@type'] for n in graph]})
    assert not all_refs-all_ids, sorted(all_refs-all_ids)
    print(json.dumps({'mode':'live' if live else 'local','pages':len(rows),'results':rows},ensure_ascii=False,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--write',action='store_true');parser.add_argument('--live',action='store_true');args=parser.parse_args()
    if args.write:generate()
    validate(args.live)
