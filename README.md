# Beskedværkstedet

Editor til Ciceros beskedskabeloner (FreeMarker). Datafelter står som brikker, lister og betingelser som blokke, og der kan laves varianter pr. sprog, lånergruppe eller alder. Der er forhåndsvisning med testdata og en knap, der kopierer den færdige skabelon, så den kan sættes ind i Cicero.

Editoren taler ikke med Cicero. Den laver kun tekst, og alt gemmes i den browser, man bruger.

**Brug den:** https://kaspersvangren.github.io/cicero-beskedvaerksted/

**Skitser af den kommende brugerflade:**
- Skitse 1, frit lærred med klodser: https://kaspersvangren.github.io/cicero-beskedvaerksted/skitse/
- Skitse 2, byggesæt pr. besked: https://kaspersvangren.github.io/cicero-beskedvaerksted/skitse2/

## Indhold

| Fil | Hvad |
|---|---|
| `index.html` | Hele editoren i én fil (bygget) |
| `src/engine.js` | FreeMarker-fortolker til forhåndsvisning (den delmængde Cicero bruger) |
| `src/model.js` | Indlæsning af skabeloner til blokke/brikker og generering af FreeMarker |
| `src/catalog.js` | Beskedtyper, datafelter og testdata |
| `src/app.js`, `src/app.css` | Brugerfladen |
| `build/catalog.min.json` | Hvilke datafelter der findes i hvilke af de 44 notifikationer (Cicero 1.54.0) |
| `build/labels.py`, `build/apply_labels.py` | Editorens egne danske navne til felterne, og scriptet der lægger dem ind i kataloget |

## Feltnavne og testdata

Feltstierne (fx `data.loaner.name`) er Ciceros tekniske navne. Beskrivelserne af felterne er skrevet til denne editor, og alle testdata er opdigtede.

## Byg

```
python3 build/build.py      # skriver index.html
node test/run_roundtrip.js  # indlæs → generér → sammenlign output for alle .ftl i test/
node test/run_newmsg.js     # ny besked med alle bloktyper
```

## Versioner

- **v0.1**: første udgave.
- **v0.2**: egne feltnavne og opdigtede testdata i stedet for Systematics beskrivelser og eksempler.
