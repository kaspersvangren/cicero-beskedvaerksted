# Beskedværkstedet

Værktøj til Ciceros beskedskabeloner (FreeMarker). Man vælger en besked, retter teksten og sætter afsnit og felter sammen som et byggesæt, mens beskeden hele tiden vises, som låneren får den. Til sidst kopieres den færdige skabelon ind i Cicero.

Editoren taler ikke med Cicero. Den laver kun tekst, og alt gemmes i den browser, man bruger.

**Brug den:** https://kaspersvangren.github.io/cicero-beskedvaerksted/

**Avanceret editor (v0.2)**, som også kan læse eksisterende skabeloner ind: https://kaspersvangren.github.io/cicero-beskedvaerksted/v2/

**Skitser:**
- Skitse 1, frit lærred med klodser: https://kaspersvangren.github.io/cicero-beskedvaerksted/skitse/
- Skitse 2, byggesæt pr. besked: https://kaspersvangren.github.io/cicero-beskedvaerksted/skitse2/

## Indhold

| Fil | Hvad |
|---|---|
| `index.html` | Beskedværkstedet v0.3 i én fil (bygget) |
| `v2/index.html` | Den avancerede editor v0.2 (bygget) |
| `src/kit.js` | Byggesættet: beskeder, afsnit og brikker med valg, omsat til motorens model |
| `src/v3.js`, `src/v3.css` | Brugerfladen til v0.3 |
| `src/engine.js` | FreeMarker-fortolker til forhåndsvisning (den delmængde Cicero bruger) |
| `src/model.js` | Indlæsning af skabeloner til blokke/brikker og generering af FreeMarker |
| `src/catalog.js` | Beskedtyper, datafelter og testdata |
| `src/app.js`, `src/app.css` | Brugerfladen til v0.2 |
| `build/catalog.min.json` | Hvilke datafelter der findes i hvilke af de 44 notifikationer (Cicero 1.54.0) |
| `build/labels.py`, `build/apply_labels.py` | Editorens egne danske navne til felterne, og scriptet der lægger dem ind i kataloget |

## Feltnavne og testdata

Feltstierne (fx `data.loaner.name`) er Ciceros tekniske navne. Beskrivelserne af felterne er skrevet til denne editor, og alle testdata er opdigtede.

## Byg

```
python3 build/build.py      # skriver index.html
node test/run_roundtrip.js  # indlæs → generér → sammenlign output for alle .ftl i test/
node test/run_newmsg.js     # ny besked med alle bloktyper
node test/run_kit.js        # byggesættets beskeder for alle testlånere og protokoller
```

## Versioner

- **v0.1**: første udgave.
- **v0.2**: egne feltnavne og opdigtede testdata i stedet for Systematics beskrivelser og eksempler.
- **v0.3**: byggesæt med motoren under. To beskeder: påmindelse før afleveringsfrist og låner er ikke længere mindreårig. Brikker med valg (fornavn/efternavn, lånerens oplysninger, kontaktoplysninger fra filialen eller opsætningen, liste med lån), afsnit til alle/voksne/børn og opsætning af bibliotekets faste oplysninger. v0.2 er flyttet til /v2/.
