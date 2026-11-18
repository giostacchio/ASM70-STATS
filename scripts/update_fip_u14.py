#!/usr/bin/env python3
"""Aggiorna classifica e risultati ufficiali FIP del girone U14 I."""
import html
import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

URL = ('https://fip.it/risultati/?group=campionati-regionali&regione_codice=LO'
       '&comitato_codice=PBG&sesso=M&codice_campionato=U14S/M'
       '&codice_fase=1&codice_girone=85648&codice_ar=0&giornata=5')
OUT = Path(__file__).resolve().parents[1] / 'U14' / 'classifica-fip.json'
MATCH_OUT = OUT.with_name('risultati-girone-fip.json')


def clean(value):
    return ' '.join(html.unescape(re.sub(r'<[^>]*>', ' ', value)).split())


def scrape(source):
    match = re.search(r'<div\s+class="results-tab results-ranking-full"[^>]*>(.*?)</table>', source, re.S | re.I)
    if not match:
        raise ValueError('Tabella classifica FIP non trovata')
    body = re.search(r'<tbody[^>]*>(.*?)</tbody>', match.group(1), re.S | re.I)
    if not body:
        raise ValueError('Righe classifica FIP non trovate')
    teams = []
    for row in re.findall(r'<tr(?:\s[^>]*)?>(.*?)</tr>', body.group(1), re.S | re.I):
        cells = re.findall(r'<td(?:\s[^>]*)?>(.*?)</td>', row, re.S | re.I)
        if len(cells) != 8:
            continue  # Ignora righe espandibili con recapiti societari.
        values = [clean(cell) for cell in cells]
        if not values[0].isdigit() or not all(x.isdigit() for x in values[2:]):
            continue
        team = dict(zip(('posizione', 'squadra', 'punti', 'giocate', 'vinte', 'perse', 'pf', 'ps'), values))
        for key in ('posizione', 'punti', 'giocate', 'vinte', 'perse', 'pf', 'ps'):
            team[key] = int(team[key])
        teams.append(team)
    if len(teams) != 5 or not any('MORBEGNO 70' in t['squadra'].upper() for t in teams):
        raise ValueError('Classifica incompleta o girone non corrispondente: ' + str(len(teams)))
    return teams


def fetch(url):
    request = Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; ASM70-results/1.0)'})
    with urlopen(request, timeout=40) as response:
        return response.read().decode('utf-8')


def scrape_matches(source, round_number, leg):
    matches = []
    for segment in source.split('<div class="results-matches__match">')[1:]:
        summary = segment.split('<div class="results-matches__match__moreinfo">')[0]
        names = [clean(s) for s in re.findall(r'<div class="team__name"[^>]*>(.*?)</div>', summary, re.S)]
        scores = [clean(s) for s in re.findall(r'<div class="team__points"[^>]*>(.*?)</div>', summary, re.S)]
        dates = re.findall(r'<div class="date"[^>]*>(.*?)</div>', summary, re.S)
        times = re.findall(r'<div class="time"[^>]*>(.*?)</div>', summary, re.S)
        codes = re.findall(r'<div class="ref"[^>]*>(.*?)</div>', summary, re.S)
        if len(names) != 2 or len(scores) != 2 or not dates or not codes:
            continue
        code = clean(codes[0])
        if not re.fullmatch(r'\d{5,8}', code):
            continue
        completed = all(re.fullmatch(r'\d+', s) for s in scores)
        matches.append({'id': code, 'fase': leg, 'giornata': round_number,
                        'data': clean(dates[0]), 'ora': clean(times[0]) if times else '',
                        'casa': names[0], 'ospite': names[1],
                        'punti_casa': int(scores[0]) if completed else None,
                        'punti_ospite': int(scores[1]) if completed else None,
                        'giocata': bool(completed)})
    if not matches:
        raise ValueError(f'Nessuna gara trovata: {leg} giornata {round_number}')
    return matches


def save_if_changed(path, payload, comparison_key):
    if path.exists():
        previous = json.loads(path.read_text(encoding='utf-8'))
        if previous.get(comparison_key) == payload.get(comparison_key):
            print(path.name, 'invariato')
            return
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(path.name, 'aggiornato')


def main():
    page = fetch(URL)
    standings = scrape(page)
    tasks = [(round_number, leg, URL.replace('codice_ar=0&giornata=5', f'codice_ar={ar}&giornata={round_number}'))
             for ar, leg in ((1, 'Andata'), (0, 'Ritorno')) for round_number in range(1, 6)]

    def collect(task):
        round_number, leg, address = task
        source = page if (leg == 'Ritorno' and round_number == 5) else fetch(address)
        return scrape_matches(source, round_number, leg)

    with ThreadPoolExecutor(max_workers=5) as pool:
        batches = list(pool.map(collect, tasks))
    matches = [match for batch in batches for match in batch]
    if len(matches) != 20 or len({match['id'] for match in matches}) != 20:
        raise ValueError(f'Calendario FIP incompleto/duplicato ({len(matches)} gare)')
    updated_at = datetime.now(timezone.utc).isoformat(timespec='seconds')
    payload = {'source': 'FIP', 'girone': 'Under 14 Maschile Regionale - Girone I',
               'url': URL, 'updated_at': updated_at,
               'teams': standings}
    save_if_changed(OUT, payload, 'teams')
    save_if_changed(MATCH_OUT, {'source': 'FIP', 'girone': payload['girone'],
                               'url': URL, 'updated_at': updated_at, 'matches': matches}, 'matches')


if __name__ == '__main__':
    main()
