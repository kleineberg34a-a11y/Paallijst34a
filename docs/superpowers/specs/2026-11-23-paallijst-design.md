# Paallijst Huize Kleineberg — ontwerp

Datum: 23 november 2026
Status: goedgekeurd in gesprek, wacht op review van dit document
Klikbare mockup: https://claude.ai/artifact/S6aMTbwZvEJ7kyZuX3GyZt

## 1. Doel

Een digitale paallijst op een vaste tablet in huis. Bewoners strepen wat ze drinken; gedoneerde kratten, statiegeld en voorraad worden bijgehouden. Aan het eind van een periode gaat de stand per mail (met CSV) naar een hoofdbewoner, die het verwerkt in de boekhouding. De app rekent **alleen aantallen**, geen euro's.

## 2. Context en randvoorwaarden

- Apparaat: Nokia T20 (model TA-1392), Android, 10,4", liggend, vast in huis, altijd aan, wifi.
- Gebruikers: alleen bewoners. Gasten strepen op naam van hun gastheer.
- Beheer (alles wat geen gewoon strepen is) zit achter een pincode.
- Gegevens moeten een tablet-reset overleven → back-up naar Google Sheet.
- Mail gaat vanaf een Gmail-account van het huis.

## 3. Aanpak

Een webapp (HTML/JavaScript, geen framework nodig) die offline werkt, gehost op GitHub Pages en op de tablet vanuit Chrome aan het startscherm toegevoegd. Een Google Apps Script in het huis-Gmailaccount ontvangt de handelingen, schrijft ze naar een Google Sheet en verstuurt de afsluitmail.

Afgewezen: native Android-app (veel meer werk, lastige updates, Gmail-wachtwoord op tablet) en AppSheet (werkt niet offline, traag).

## 4. Begrippen

| Begrip | Betekenis |
|---|---|
| Bewoner | Persoon op de lijst. Kan **hoofdbewoner** zijn (heeft mailadres, kan ontvanger zijn van de afsluitmail). |
| Product | Iets dat gestreept wordt, met eigen voorraad. Instellingen per product: krat-knop ja/nee, doneren ja/nee, standaard ja/nee (precies één standaard). |
| Krat | Altijd 24 stuks. |
| Periode | Loopt van de vorige afsluiting tot de volgende. |
| Vandaag | Van 06:00 tot 06:00 de volgende ochtend. |
| Statiegeld | Per bewoner een stand in kratten: +1 per gedoneerde krat, −n bij terugbrengen van lege kratten (op degene die het geld ontving). |

Startinhoud producten: **Pils** (standaard, krat-knop ja, doneren ja) en **Wijn** (krat-knop nee, doneren nee, telt in stuks).

## 5. Schermen

De mockup is leidend voor uiterlijk en indeling. Samenvatting:

### 5.1 Hoofdscherm (geen pincode)
- Bovenbalk: titel + periode-start, **productkeuze** (knoppen per product; het standaardproduct is geselecteerd), voorraad van het gekozen product (rood bij ≤ 6), knoppen *Overzicht*, *Krat bijzetten*, *Instellingen*.
- Links: raster met naamtegels van actieve bewoners; elke tegel toont vandaag/periode voor het gekozen product. Tik = +1 van het gekozen product in de bestellijst.
- Rechts: **bestellijst**. Regels per (bewoner, product) met aantal. Tik op regel = −1 (bij 0 verdwijnt de regel). Regels van een product met krat-knop hebben **+krat** (+24). Totaal per product. Knoppen *Wissen* en *Doorvoeren*.
- Na *Doorvoeren*: melding "Geboekt: …" met **Ongedaan maken**, 15 seconden aftellend. Productkeuze springt terug naar het standaardproduct.
- Na 30 seconden zonder aanraking: bestellijst gewist, terug naar het hoofdscherm, standaardproduct geselecteerd.

### 5.2 Krat bijzetten (geen pincode)
- Alleen voor producten met doneren = ja (nu alleen pils).
- Kies donateur en aantal kratten (1–10). Boekt per krat: +1 krat gedoneerd en +1 krat statiegeld op de donateur, voorraad +24.
- Daarna dezelfde 15-seconden-melding met ongedaan maken.

### 5.3 Overzicht (geen pincode, alleen lezen)
- Tabel per bewoner: per product *vandaag* en *periode*, kratten gedoneerd, statiegeld (kratten). Totaalregel. Bewoners die vertrekken staan erin met een label.

### 5.4 Pincode
- 4 cijfers, numeriek toetsenblok, *Wis* en *Annuleren*. Bij foute code: melding, opnieuw proberen. Na 5 foute pogingen 60 seconden wachten.

### 5.5 Instellingen (pincode)
Vergrendelt bij *Vergrendelen* en na 2 minuten zonder aanraking.
- **Bewoners**: toevoegen, hernoemen, hoofdbewoner aan/uit, mailadres. Verwijderen van een bewoner met boekingen in de lopende periode markeert hem als "vertrekt"; hij verdwijnt van het hoofdscherm maar blijft in overzicht en mail tot de afsluiting.
- **Producten**: toevoegen, hernoemen, krat-knop / doneren / standaard instellen, product deactiveren.
- **Voorraad**: per product de getelde voorraad invoeren (−/+, +24 bij krat-producten).
- **Statiegeld terugboeken**: persoon die het geld ontving + aantal lege kratten → −n kratten statiegeld op die persoon.
- **Correcties**: bewoner + product + aantal (+ of −); past de periode en de voorraad aan.
- **Logboek**: alle handelingen, nieuwste bovenaan, met labels voor correctie/donatie/ongedaan.
- **Afsluiten & mailen**: kies hoofdbewoner, voorbeeld van de mail, knop "Afsluiten, mailen en op 0 zetten".
- **Pincode & koppeling**: pincode wijzigen, script-URL en geheime sleutel invullen, syncstatus (laatste sync, aantal in wachtrij), *Herstellen vanuit Sheet*.

## 6. Gegevens

Opslag op de tablet in IndexedDB; de app vraagt `navigator.storage.persist()` aan.

### 6.1 Gebeurtenissen (kern)
Een logboek dat alleen aangroeit. Elke gebeurtenis:

| Veld | Inhoud |
|---|---|
| `id` | uniek (UUID) |
| `ts` | tijdstip (ISO) |
| `periodeId` | lopende periode |
| `type` | `streep`, `donatie`, `statiegeld_terug`, `correctie`, `voorraad`, `ongedaan`, `bewoner`, `product`, `afsluiting`, `periode_start` |
| `bewonerId`, `productId` | waar van toepassing |
| `aantal` | geheel getal (bij `voorraad`: nieuwe absolute stand) |
| `verwijst` | bij `ongedaan`: id('s) van de teruggedraaide gebeurtenissen |
| `synced` | of de Sheet hem al heeft |

Eén *Doorvoeren* levert één `streep`-gebeurtenis per regel van de bestellijst, met hetzelfde groepsnummer zodat *Ongedaan maken* de hele groep terugdraait.

### 6.2 Afgeleide standen
Tellers, voorraad, statiegeld en "vandaag" worden **altijd berekend** uit de gebeurtenissen van de lopende periode (voorraad: laatste `voorraad`-gebeurtenis plus alles daarna). Elke periode begint met een `periode_start` en per product een `voorraad`-gebeurtenis met de doorlopende stand. Er worden geen losse tellers opgeslagen. Overzicht, logboek, mail en CSV gebruiken dezelfde rekenfunctie.

### 6.3 Overige opslag
Bewoners, producten, periodes (`id`, start, eind, gemaild aan) en instellingen (pincode als hash, script-URL, sleutel).

## 7. Back-up naar Google Sheet

- Apps Script-webapp in het huisaccount, bereikbaar via een `POST` met JSON en een geheime sleutel. Verzoeken zonder juiste sleutel worden geweigerd.
- Sheet "Paallijst Kleineberg" met tabbladen *Gebeurtenissen* (één rij per gebeurtenis), *Bewoners*, *Producten*, *Afsluitingen*.
- De tablet stuurt niet-gesyncte gebeurtenissen in volgorde, direct na een handeling en verder elke 30 seconden bij verbinding. Het script negeert ids die het al heeft (geen dubbele rijen).
- **Herstellen vanuit Sheet** (pincode): het script levert bewoners, producten en de gebeurtenissen van de lopende periode; de tablet bouwt daarmee zijn opslag opnieuw op. Alleen bedoeld voor een lege of gereset tablet; vraagt eerst om bevestiging.

## 8. Afsluiten en mailen

1. Vereist verbinding; zonder wifi een duidelijke melding en er verandert niets.
2. De tablet synct eerst de wachtrij, en stuurt dan een afsluitverzoek: ontvanger, periode van/tot, stand per bewoner.
3. Het script verstuurt via Gmail vanaf het huisaccount:
   - Onderwerp: `Paallijst Huize Kleineberg – <van> t/m <tot>`
   - Tekst: per bewoner aantallen per product, kratten gedoneerd, statiegeld; totaal; voorraad.
   - Bijlage `paallijst_<datum>.csv`, puntkomma-gescheiden, UTF-8 met BOM, kolommen: `bewoner;<product 1>;<product 2>;…;kratten_gedoneerd;statiegeld_kratten;periode_van;periode_tot`.
   - Het script schrijft ook een rij in *Afsluitingen*.
4. Pas na een bevestiging van het script boekt de tablet een `afsluiting`, start een nieuwe periode (alles op 0; voorraad loopt door) en verwijdert bewoners met status "vertrekt".
5. Mislukt het, dan blijft de periode open en krijg je een foutmelding.

## 9. Hosting en inrichting

- Code op GitHub Pages (account van het huis). Geen geheimen in de code.
- Service worker voor offline gebruik.
- Tablet: Chrome → "Toevoegen aan startscherm", scherm altijd aan, Android "app vastzetten".
- Er komt een stappenplan (`docs/inrichten.md`) voor Apps Script, Sheet, GitHub Pages en tablet.

## 10. Foutafhandeling

- Geen wifi: strepen en beheer werken gewoon; syncstatus toont de wachtrij; alleen afsluiten en herstellen zijn geblokkeerd.
- Voorraad mag negatief worden (toont rood); het is een signaal om te tellen, geen blokkade.
- Ongedaan maken alleen binnen 15 seconden; daarna via correcties met pincode.

## 11. Testen

- Automatische tests voor de rekenfunctie (tellers, vandaag met 06:00-grens, ongedaan maken, donatie, statiegeld, correctie, voorraad, afsluiting) en voor de CSV-opbouw.
- Eén keer handmatig testen op de T20, inclusief testmail naar de hoofdbewoner en controle in de Sheet.

## 12. Buiten scope

Bedragen in euro's, strepen vanaf telefoons, meerdere tablets, gasten als aparte personen, automatisch periodiek afsluiten.
