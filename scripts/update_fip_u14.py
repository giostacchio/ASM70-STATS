#!/usr/bin/env python3
"""Aggiorna esclusivamente la classifica ufficiale FIP del girone U14 I."""
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

URL = ('https://fip.it/risultati/?group=campionati-regionali&regione_codice=LO'
       '&comitato_codice=PBG&sesso=M&codice_campionato=U14S/M'
       '&codice_fase=1&codice_girone=85648&codice_ar=0&giornata=5')
OUT = Path(__file__).resolve().parents[1] / 'U14' / 'classifica-fip.json'


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


def main():
    request = Request(URL, headers={'User-Agent': 'Mozilla/5.0 (compatible; ASM70-standings/1.0)'})
    with urlopen(request, timeout=35) as response:
        page = response.read().decode('utf-8')
    standings = scrape(page)
    payload = {'source': 'FIP', 'girone': 'Under 14 Maschile Regionale - Girone I',
               'url': URL, 'updated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
               'teams': standings}
    new_json = json.dumps(payload, ensure_ascii=False, indent=2) + '\n'
    # Non generare commit se la classifica non è variata: mantieni la data dell'ultimo cambio.
    if OUT.exists():
        previous = json.loads(OUT.read_text(encoding='utf-8'))
        if previous.get('teams') == standings:
            print('Classifica invariata')
            return
    OUT.write_text(new_json, encoding='utf-8')
    print('Classifica aggiornata:', ', '.join(f"{t['squadra']} {t['punti']}" for t in standings))


if __name__ == '__main__':
    main()
